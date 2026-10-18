/**
 * Chapter rule extraction and the deterministic scans that share its IDs.
 *
 * `chapter rules` reads the outline, the volume plan, and the book's setting
 * files, and returns a stable list a writer can follow before prose exists.
 * The same scans run inside chapter check once a body exists. `blocking`
 * hits fail that check. `hint` hits are reported and do not.
 *
 * Source paths and headings come from `设定/写作检查.json` `rule_sources`.
 * When that key is absent, {@link DEFAULT_RULE_SOURCES} is used. A present
 * key replaces the default list. Missing files and headings become warnings.
 * The command still returns; it does not fail the book for an absent section.
 *
 * Phase 1b can reuse `rules`, `rules_sha256`, and `scan` without a second parser.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { declaredAliases } from './settings-lookup.ts'
import { normalizeState, type TrackingState } from './tracking/schema.ts'
import { statePath } from './tracking/store.ts'
import { findChapterFile } from './wordcount.ts'
import { readWritingCheck, WritingCheckError, type WritingCheckFile } from './writing-check.ts'

/** Schema of {@link extractChapterRules} results. */
export const CHAPTER_RULES_SCHEMA = 'story-chapter-rules/v1'
/** Largest encoded result, including the trailing newline the CLI writes. */
export const RULES_MAX_BYTES = 16_384
/** Bytes read from one oversized source. */
const SOURCE_MAX_BYTES = 512 * 1024
/** Hits kept for one forbidden pattern or era term. */
const HITS_PER_PATTERN = 20

/** One configured source. `heading` may name several sections in that file. */
export interface RuleSource {
  readonly file: string
  readonly heading: string | readonly string[]
  readonly prefix: string
}

/**
 * Sources used when a book does not set `rule_sources`.
 * `{chapter}` selects the chapter outline. `第X卷` selects the volume plan whose unit covers the chapter.
 */
export const DEFAULT_RULE_SOURCES: readonly RuleSource[] = [
  { file: '大纲/细纲_第{chapter}章.md', heading: '执行边界', prefix: 'OUT-P' },
  { file: '大纲/细纲_第{chapter}章.md', heading: '本章禁止提前释放', prefix: 'OUT-NR' },
  { file: '大纲/细纲_第{chapter}章.md', heading: '出场顺序', prefix: 'OUT-CAST' },
  { file: '大纲/卷纲_第X卷.md', heading: '禁止提前释放', prefix: 'VOL-NR' },
  { file: '大纲/卷纲_第X卷.md', heading: '终局底牌边界', prefix: 'VOL-BAN' },
  { file: '大纲/卷纲_第X卷.md', heading: '本卷禁碰的终局底牌', prefix: 'VOL-BAN' },
  { file: '大纲/卷纲_第X卷.md', heading: '必须删掉或后置的旧设计', prefix: 'VOL-OLD' },
  { file: '设定/核心设定.md', heading: '本次必须修掉的旧稿病根', prefix: 'CORE' },
  { file: '设定/题材正文提示卡.md', heading: ['禁止漂移', '问种边界'], prefix: 'CARD' },
  { file: '设定/文风.md', heading: '禁止', prefix: 'STYLE' },
  { file: '追踪/_tracking-state.json', heading: 'long_term_constraints', prefix: 'STATE' },
]

const PREFIXES = new Set(['OUT-P', 'OUT-NR', 'OUT-CAST', 'VOL-NR', 'VOL-BAN', 'VOL-OLD', 'CORE', 'CARD', 'STYLE', 'STATE'])

/** One extracted obligation. `source.line` is 1-based. */
export interface ExtractedRule {
  readonly id: string
  readonly text: string
  readonly source: { readonly path: string; readonly line: number }
}

/** A skipped file or heading. The command still succeeds. */
export interface RuleWarning {
  readonly message: string
  readonly path?: string
  readonly heading?: string
}

/** One deterministic hit. `hint` does not fail chapter check. */
export interface RuleScanHit {
  readonly id: string
  readonly severity: 'blocking' | 'hint'
  readonly kind: 'forbidden' | 'era' | 'cast' | 'void-term'
  readonly message: string
  readonly path?: string
  readonly line?: number
  readonly rule?: string
}

/** The bounded `chapter rules` payload. `rules_sha256` covers every extracted rule, including ones left in `omitted`. */
export interface ChapterRules {
  readonly schema: string
  readonly chapter: number
  readonly rules: readonly ExtractedRule[]
  readonly scan: readonly RuleScanHit[]
  readonly warnings: readonly RuleWarning[]
  readonly rules_sha256: string
  readonly omitted: number
  readonly state_revision: number | null
}

interface ForbiddenSpec {
  readonly id: string
  readonly pattern: string
  readonly severity: 'blocking' | 'hint'
  readonly rule?: string
}

interface NormalizedConfig {
  readonly sources: readonly RuleSource[]
  readonly forbidden: readonly ForbiddenSpec[]
  readonly deny: readonly string[]
  readonly allow: readonly string[]
  readonly voidTerms: readonly string[]
  readonly eraEnabled: boolean
  readonly voidEnabled: boolean
}

interface Line {
  readonly number: number
  readonly text: string
}

interface UnitSpan {
  readonly id: string
  readonly start: number
  readonly end: number
  readonly from: number
  readonly to: number
}

interface Person {
  readonly names: readonly string[]
}

function encoded(value: unknown): number {
  return Buffer.byteLength(`${JSON.stringify(value)}\n`, 'utf8')
}

function chapterLabel(chapter: number): string {
  return String(chapter).padStart(3, '0')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function headingsOf(source: RuleSource): string[] {
  return typeof source.heading === 'string' ? [source.heading] : [...source.heading]
}

function stripMarks(value: string): string {
  return value.replace(/\*\*/gu, '').trim()
}

function isPlaceholder(value: string): boolean {
  const text = value.trim().replace(/^[“"「『]|[”"」』]$/gu, '')
  return text === '' || text === '无' || text === '没有' || text === '无。'
    || /^\[待补充\]$/u.test(text)
    || /^\{[^}]+\}$/u.test(text)
    || text.startsWith('没有就写')
}

function splitList(value: string): string[] {
  return value.split(/[、；;]/u).map(part => part.trim()).filter(part => !isPlaceholder(part))
}

function splitSentences(value: string): string[] {
  return value.split(/[。；;]/u).map(part => part.trim()).filter(part => !isPlaceholder(part))
}

function indexedId(base: string, index: number, total: number): string {
  return total === 1 ? base : `${base}-${String(index)}`
}

function matchField(line: string, heading: string): string | undefined {
  const text = stripMarks(line.trim().replace(/^[-*+]\s+/u, ''))
  const matched = new RegExp(`^${escapeRegExp(heading)}\\s*[:：]\\s*(.*)$`, 'u').exec(text)
  return matched?.[1]?.trim()
}

function markdownHeading(line: string): { level: number; text: string } | undefined {
  const matched = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line.trim())
  if (matched?.[1] === undefined || matched[2] === undefined) return undefined
  return { level: matched[1].length, text: stripMarks(matched[2]) }
}

function toLines(text: string): Line[] {
  const parts = text.split(/\n/u)
  return parts.map((part, index) => ({ number: index + 1, text: part.replace(/\r$/u, '') }))
}

function sectionSpan(lines: readonly Line[], heading: string): { start: number; end: number } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined) continue
    const headingLine = markdownHeading(line.text)
    const bold = /^\*\*(.+)\*\*$/u.exec(line.text.trim())
    const title = headingLine?.text ?? (bold?.[1] === undefined ? undefined : stripMarks(bold[1]))
    if (title !== heading) continue
    const level = headingLine?.level ?? 7
    let end = lines.length
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next]
      if (candidate === undefined) continue
      const nextHeading = markdownHeading(candidate.text)
      if (nextHeading !== undefined && nextHeading.level <= level) {
        end = next
        break
      }
      if (level === 7 && /^\*\*(.+)\*\*$/u.test(candidate.text.trim())) {
        end = next
        break
      }
    }
    return { start: index + 1, end }
  }
  return undefined
}

function listItems(lines: readonly Line[], start: number, end: number): { text: string; line: number }[] {
  const items: { text: string; line: number }[] = []
  for (const line of lines.slice(start, end)) {
    if (line.text.trim().startsWith('|')) continue
    const matched = /^\s*(?:[-*+]|\d+[、.．])\s+(.+)$/u.exec(line.text)
    const text = matched?.[1]
    if (text === undefined) continue
    const cleaned = stripMarks(text)
    if (!isPlaceholder(cleaned)) items.push({ text: cleaned, line: line.number })
  }
  return items
}

function tableRows(lines: readonly Line[], heading: string): { cells: string[]; line: number; column: number }[] {
  const rows: { cells: string[]; line: number; column: number }[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]
    if (header === undefined || !header.text.includes('|')) continue
    const headers = cellsOf(header.text)
    const column = headers.findIndex(cell => cell === heading)
    const separator = lines[index + 1]
    if (column < 0 || separator === undefined || !/^\s*\|?\s*:?-{3,}/u.test(separator.text)) continue
    for (let row = index + 2; row < lines.length; row += 1) {
      const line = lines[row]
      if (line === undefined || !line.text.trim().startsWith('|')) break
      rows.push({ cells: cellsOf(line.text), line: line.number, column })
    }
    if (rows.length > 0 || column >= 0) return rows
  }
  return rows
}

function cellsOf(line: string): string[] {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map(cell => stripMarks(cell))
}

function rangeOnLine(line: string): [number, number] | undefined {
  const labeled = /章节范围\s*[:：]\s*(.*)$/u.exec(stripMarks(line.trim().replace(/^[-*+]\s+/u, '')))
  const target = labeled?.[1] ?? ''
  const range = /第\s*(\d+)\s*章?\s*[-–—~～到至]\s*第?\s*(\d+)\s*章/u.exec(target)
  if (range?.[1] !== undefined && range[2] !== undefined) return [Number(range[1]), Number(range[2])]
  const single = /第\s*(\d+)\s*章/u.exec(target)
  if (single?.[1] === undefined) return undefined
  const chapter = Number(single[1])
  return [chapter, chapter]
}

function unitToken(value: string): string {
  const cleaned = value.trim().replace(/\s+/gu, '').replace(/[^\p{L}\p{N}_.-]/gu, '')
  return cleaned === '' ? 'unit' : cleaned.slice(0, 40)
}

function unitsIn(lines: readonly Line[]): UnitSpan[] {
  const marks: number[] = []
  lines.forEach((line, index) => {
    const heading = markdownHeading(line.text)
    if (heading?.text.includes('剧情单元') === true) marks.push(index)
  })
  const units: UnitSpan[] = []
  for (let index = 0; index < marks.length; index += 1) {
    const start = marks[index] ?? 0
    const end = marks[index + 1] ?? lines.length
    const slice = lines.slice(start, end)
    const heading = markdownHeading(lines[start]?.text ?? '')
    const idField = slice.map(line => matchField(line.text, '单元ID')).find(value => value !== undefined)
    const rangeLine = slice.find(line => /章节范围/u.test(line.text))
    const range = rangeLine === undefined ? undefined : rangeOnLine(rangeLine.text)
    if (range === undefined) continue
    units.push({
      id: unitToken(idField ?? heading?.text.replace(/^剧情单元/u, '') ?? ''),
      start, end, from: range[0], to: range[1],
    })
  }
  return units
}

function currentUnit(lines: readonly Line[], chapter: number): UnitSpan | undefined {
  const matches = unitsIn(lines).filter(unit => chapter >= unit.from && chapter <= unit.to)
  matches.sort((left, right) => (left.to - left.from) - (right.to - right.from) || left.start - right.start)
  return matches[0]
}

function posixRelative(project: string, path: string): string {
  const rel = relative(project, path)
  if (rel.startsWith('..') || rel === '') return path.split(sep).join('/')
  return rel.split(sep).join('/')
}

function insideProject(project: string, path: string): boolean {
  try {
    const root = realpathSync(project)
    const target = existsSync(path) ? realpathSync(path) : join(existsSync(dirname(path)) ? realpathSync(dirname(path)) : root, basename(path))
    return target === root || target.startsWith(root + sep)
  } catch {
    return false
  }
}

function resolveInside(project: string, rel: string): string | undefined {
  const parts = rel.split(/[\\/]/u).filter(part => part !== '')
  if (parts.length === 0 || parts.some(part => part === '..')) return undefined
  const path = join(project, ...parts)
  return insideProject(project, path) ? path : undefined
}

function readSource(path: string): { text: string; truncated: boolean } | undefined {
  try {
    const info = statSync(path)
    if (!info.isFile()) return undefined
    if (info.size <= SOURCE_MAX_BYTES) return { text: readFileSync(path, 'utf8'), truncated: false }
    return { text: readFileSync(path).subarray(0, SOURCE_MAX_BYTES).toString('utf8'), truncated: true }
  } catch {
    return undefined
  }
}

function warn(warnings: RuleWarning[], message: string, path?: string, heading?: string): void {
  if (warnings.some(item => item.message === message && item.path === path && item.heading === heading)) return
  warnings.push({ message, ...(path === undefined ? {} : { path }), ...(heading === undefined ? {} : { heading }) })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSources(value: unknown, warnings: RuleWarning[]): readonly RuleSource[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    warn(warnings, 'rule_sources 不是数组，已改用默认来源')
    return undefined
  }
  const sources: RuleSource[] = []
  for (const item of value) {
    if (!isRecord(item) || typeof item.file !== 'string' || item.file.trim() === '' || typeof item.prefix !== 'string') {
      warn(warnings, 'rule_sources 中有无法识别的项，已跳过')
      continue
    }
    const heading = item.heading
    const headings = typeof heading === 'string'
      ? [heading]
      : Array.isArray(heading) && heading.every(part => typeof part === 'string' && part.trim() !== '')
        ? heading
        : undefined
    if (headings === undefined || headings.length === 0) {
      warn(warnings, `rule_sources 项 ${item.prefix} 缺少标题，已跳过`)
      continue
    }
    if (!PREFIXES.has(item.prefix)) {
      warn(warnings, `未知规则前缀 ${item.prefix}，已跳过`, item.file)
      continue
    }
    sources.push({ file: item.file, heading: headings.length === 1 ? headings[0] ?? '' : headings, prefix: item.prefix })
  }
  return sources
}

function stringList(value: unknown, label: string, warnings: RuleWarning[]): string[] {
  if (!Array.isArray(value)) {
    warn(warnings, `${label} 不是数组，已跳过`)
    return []
  }
  const items: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      warn(warnings, `${label} 含有空项，已跳过`)
      continue
    }
    items.push(item)
  }
  return items
}

function normalizeConfig(file: WritingCheckFile | undefined, warnings: RuleWarning[]): NormalizedConfig {
  const value = file?.value
  const sources = normalizeSources(value?.rule_sources, warnings) ?? DEFAULT_RULE_SOURCES
  const forbidden: ForbiddenSpec[] = []
  if (value?.forbidden !== undefined) {
    if (!Array.isArray(value.forbidden)) warn(warnings, 'forbidden 不是数组，已跳过')
    else {
      for (const item of value.forbidden) {
        if (!isRecord(item) || typeof item.id !== 'string' || typeof item.pattern !== 'string'
          || (item.severity !== 'blocking' && item.severity !== 'hint')) {
          warn(warnings, 'forbidden 中有无法识别的项，已跳过')
          continue
        }
        if (item.pattern.trim() === '' || item.pattern.length > 200) {
          warn(warnings, `forbidden ${item.id} 的 pattern 为空或超过 200 字，已跳过`)
          continue
        }
        forbidden.push({
          id: item.id,
          pattern: item.pattern,
          severity: item.severity,
          ...(typeof item.rule === 'string' ? { rule: item.rule } : {}),
        })
      }
    }
  }
  let deny: string[] = []
  let allow: string[] = []
  const eraEnabled = value?.era !== undefined
  if (eraEnabled) {
    if (!isRecord(value.era)) warn(warnings, 'era 不是对象，已跳过')
    else {
      deny = stringList(value.era.deny ?? [], 'era.deny', warnings)
      allow = stringList(value.era.allow ?? [], 'era.allow', warnings)
    }
  }
  const voidEnabled = value?.void_terms !== undefined
  const voidTerms = voidEnabled ? stringList(value.void_terms, 'void_terms', warnings) : []
  return { sources, forbidden, deny, allow, voidTerms, eraEnabled, voidEnabled }
}

function locateOutline(project: string, chapter: number, warnings: RuleWarning[]): string | undefined {
  try {
    const path = findChapterFile(join(project, '大纲'), chapter, { outline: true, allowMissing: true })
    if (existsSync(path) && insideProject(project, path)) return path
  } catch (error) {
    warn(warnings, `细纲无法定位：${error instanceof Error ? error.message : String(error)}`, '大纲')
    return undefined
  }
  warn(warnings, `缺少第 ${String(chapter)} 章细纲`, `大纲/细纲_第${chapterLabel(chapter)}章.md`)
  return undefined
}

function locateBody(project: string, chapter: number): string | undefined {
  try {
    const path = findChapterFile(join(project, '正文'), chapter, { outline: false, allowMissing: true })
    return existsSync(path) && insideProject(project, path) ? path : undefined
  } catch {
    return undefined
  }
}

function locateVolume(project: string, chapter: number, warnings: RuleWarning[]): string | undefined {
  const directory = join(project, '大纲')
  if (!existsSync(directory)) {
    warn(warnings, '缺少卷纲目录', '大纲')
    return undefined
  }
  const files = readdirSync(directory)
    .filter(name => name.startsWith('卷纲') && name.endsWith('.md'))
    .sort((left, right) => left.localeCompare(right, 'zh'))
    .map(name => join(directory, name))
    .filter(path => insideProject(project, path))
  const ranked: { path: string; width: number }[] = []
  for (const path of files) {
    const loaded = readSource(path)
    if (loaded === undefined) continue
    const unit = currentUnit(toLines(loaded.text), chapter)
    if (unit !== undefined) ranked.push({ path, width: unit.to - unit.from })
  }
  ranked.sort((left, right) => left.width - right.width || left.path.localeCompare(right.path, 'zh'))
  const selected = ranked[0]?.path
  if (selected !== undefined) return selected
  warn(warnings, `第 ${String(chapter)} 章不在任何卷纲剧情单元的章节范围内`, '大纲')
  return undefined
}

function locateFile(project: string, pattern: string, chapter: number, warnings: RuleWarning[], outline: string | undefined, volume: string | undefined): string | undefined {
  if (pattern.includes('{chapter}') || pattern.includes('细纲_第')) return outline
  if (pattern.includes('第X卷') || pattern.includes('{volume}')) return volume
  const path = resolveInside(project, pattern.replaceAll('{chapter}', String(chapter)))
  if (path !== undefined && existsSync(path)) return path
  warn(warnings, `缺少规则来源文件`, pattern)
  return undefined
}

function fieldIn(lines: readonly Line[], start: number, end: number, heading: string): { text: string; line: number } | undefined {
  for (const line of lines.slice(start, end)) {
    const text = matchField(line.text, heading)
    if (text !== undefined) return { text, line: line.number }
  }
  return undefined
}

function pushFragments(
  rules: ExtractedRule[],
  base: string,
  fragments: readonly string[],
  path: string,
  line: number,
): void {
  fragments.forEach((text, index) => {
    rules.push({ id: indexedId(base, index + 1, fragments.length), text, source: { path, line } })
  })
}

function extractPrefix(
  prefix: string,
  heading: string,
  lines: readonly Line[],
  path: string,
  chapter: number,
  warnings: RuleWarning[],
  state: TrackingState | undefined,
  stateText: string,
): ExtractedRule[] {
  const rules: ExtractedRule[] = []
  const label = chapterLabel(chapter)
  if (prefix === 'OUT-P') {
    const rows = tableRows(lines, heading)
    if (rows.length === 0) {
      warn(warnings, `未找到「${heading}」列`, path, heading)
      return rules
    }
    for (const row of rows) {
      const text = row.cells[row.column] ?? ''
      if (isPlaceholder(text)) continue
      const number = row.cells[0]
      const point = number !== undefined && /^\d+$/u.test(number) ? number : String(rules.length + 1)
      rules.push({ id: `OUT-${label}-P${point}`, text, source: { path, line: row.line } })
    }
    return rules
  }
  if (prefix === 'OUT-NR' || prefix === 'OUT-CAST') {
    const field = fieldIn(lines, 0, lines.length, heading)
    if (field === undefined) {
      warn(warnings, `未找到「${heading}」`, path, heading)
      return rules
    }
    if (prefix === 'OUT-CAST') {
      if (!isPlaceholder(field.text)) rules.push({ id: `OUT-${label}-CAST`, text: field.text, source: { path, line: field.line } })
      return rules
    }
    pushFragments(rules, `OUT-${label}-NR`, splitList(field.text), path, field.line)
    return rules
  }
  if (prefix === 'VOL-NR' || prefix === 'VOL-BAN') {
    const unit = currentUnit(lines, chapter)
    const volumeLevel = heading.startsWith('本卷')
    if (!volumeLevel && unit === undefined) {
      warn(warnings, `第 ${String(chapter)} 章没有对应的剧情单元，已跳过「${heading}」`, path, heading)
      return rules
    }
    const field = fieldIn(lines, volumeLevel ? 0 : unit?.start ?? 0, volumeLevel ? lines.length : unit?.end ?? lines.length, heading)
    if (field === undefined) {
      warn(warnings, `未找到「${heading}」`, path, heading)
      return rules
    }
    const base = volumeLevel ? 'VOL-BAN' : prefix === 'VOL-NR' ? `VOL-${unit?.id ?? 'unit'}-NR` : `VOL-${unit?.id ?? 'unit'}-BAN`
    pushFragments(rules, base, splitList(field.text), path, field.line)
    return rules
  }
  if (prefix === 'VOL-OLD' || prefix === 'CORE' || prefix === 'STYLE' || prefix === 'CARD') {
    const span = sectionSpan(lines, heading)
    const field = span === undefined ? fieldIn(lines, 0, lines.length, heading) : undefined
    if (span === undefined && field === undefined) {
      warn(warnings, `未找到「${heading}」`, path, heading)
      return rules
    }
    if (prefix === 'VOL-OLD' && span !== undefined) {
      const table = tableRowsIn(lines, span.start, span.end)
      if (table.length > 0) {
        for (const row of table) {
          const text = row.cells.filter(cell => cell !== '' && !isPlaceholder(cell)).join('；')
          if (text === '') continue
          rules.push({ id: `VOL-OLD-${String(rules.length + 1)}`, text, source: { path, line: row.line } })
        }
        return rules
      }
      listItems(lines, span.start, span.end).forEach((item, index) => {
        rules.push({ id: `VOL-OLD-${String(index + 1)}`, text: item.text, source: { path, line: item.line } })
      })
      return rules
    }
    if (prefix === 'CORE') {
      const items = span === undefined ? [] : numberedItems(lines, span.start, span.end)
      if (items.length === 0 && field !== undefined) pushFragments(rules, 'CORE', splitList(field.text), path, field.line)
      else items.forEach(item => rules.push({ id: `CORE-${String(item.number)}`, text: item.text, source: { path, line: item.line } }))
      return rules
    }
    if (prefix === 'STYLE') {
      const items = span === undefined ? [] : listItems(lines, span.start, span.end)
      if (items.length === 0 && field !== undefined) pushFragments(rules, 'STYLE', splitList(field.text), path, field.line)
      else items.forEach((item, index) => rules.push({ id: `STYLE-${String(index + 1)}`, text: item.text, source: { path, line: item.line } }))
      return rules
    }
    const slug = heading.replace(/\s+/gu, '')
    const body = span === undefined
      ? field?.text ?? ''
      : lines.slice(span.start, span.end).map(line => line.text).join('')
    const line = span === undefined ? field?.line ?? 1 : (lines[span.start]?.number ?? 1)
    splitSentences(body).forEach((text, index) => {
      rules.push({ id: `CARD-${slug}-${String(index + 1)}`, text, source: { path, line } })
    })
    return rules
  }
  if (prefix === 'STATE') {
    if (heading !== 'long_term_constraints') {
      warn(warnings, `STATE 只读取 long_term_constraints，已跳过「${heading}」`, path, heading)
      return rules
    }
    if (state === undefined) return rules
    state.context.long_term_constraints.forEach((text, index) => {
      rules.push({ id: `STATE-${String(index + 1)}`, text, source: { path, line: lineOfText(stateText, JSON.stringify(text)) } })
    })
    return rules
  }
  warn(warnings, `未知规则前缀 ${prefix}`, path)
  return rules
}

function tableRowsIn(lines: readonly Line[], start: number, end: number): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = []
  for (let index = start; index < end; index += 1) {
    const header = lines[index]
    const separator = lines[index + 1]
    if (header === undefined || separator === undefined || !header.text.includes('|')) continue
    if (!/^\s*\|?\s*:?-{3,}/u.test(separator.text)) continue
    for (let row = index + 2; row < end; row += 1) {
      const line = lines[row]
      if (line === undefined || !line.text.trim().startsWith('|')) break
      rows.push({ cells: cellsOf(line.text), line: line.number })
    }
    return rows
  }
  return rows
}

function numberedItems(lines: readonly Line[], start: number, end: number): { number: number; text: string; line: number }[] {
  const items: { number: number; text: string; line: number }[] = []
  for (const line of lines.slice(start, end)) {
    const matched = /^\s*(\d+)\s*[、.．]\s+(.+)$/u.exec(line.text)
    const text = matched?.[2]
    if (matched?.[1] === undefined || text === undefined || isPlaceholder(text)) continue
    items.push({ number: Number(matched[1]), text: stripMarks(text), line: line.number })
  }
  if (items.length > 0) return items
  return listItems(lines, start, end).map((item, index) => ({ number: index + 1, text: item.text, line: item.line }))
}

function lineOfText(text: string, needle: string): number {
  const lines = text.split(/\n/u)
  const index = lines.findIndex(line => line.includes(needle))
  return index < 0 ? 1 : index + 1
}

function readState(project: string, warnings: RuleWarning[], required: boolean): { state: TrackingState | undefined; text: string } {
  const path = statePath(project)
  if (!existsSync(path)) {
    if (required) warn(warnings, '缺少追踪状态，已跳过长期约束', '追踪/_tracking-state.json')
    return { state: undefined, text: '' }
  }
  try {
    const text = readFileSync(path, 'utf8')
    return { state: normalizeState(JSON.parse(text)), text }
  } catch (error) {
    if (required) warn(warnings, `追踪状态无法读取，已跳过长期约束：${error instanceof Error ? error.message : String(error)}`, '追踪/_tracking-state.json')
    return { state: undefined, text: '' }
  }
}

function castHeading(sources: readonly RuleSource[]): string {
  const source = sources.find(item => item.prefix === 'OUT-CAST')
  return source === undefined ? '出场顺序' : headingsOf(source)[0] ?? '出场顺序'
}

function peopleIn(project: string, state: TrackingState | undefined): Person[] {
  const groups = new Map<string, Set<string>>()
  const add = (key: string, name: string): void => {
    const cleaned = name.trim()
    if (cleaned.length < 2) return
    const bucket = groups.get(key) ?? new Set<string>()
    bucket.add(cleaned)
    groups.set(key, bucket)
  }
  const directory = join(project, '设定', '角色')
  if (existsSync(directory) && statSync(directory).isDirectory()) {
    const files: string[] = []
    const walk = (current: string): void => {
      for (const name of readdirSync(current).sort((left, right) => left.localeCompare(right, 'zh'))) {
        if (name.startsWith('.')) continue
        const path = join(current, name)
        if (!insideProject(project, path)) continue
        const info = statSync(path)
        if (info.isDirectory()) walk(path)
        else if (info.isFile() && name.endsWith('.md')) files.push(path)
      }
    }
    walk(directory)
    for (const path of files) {
      const stem = basename(path, '.md')
      const loaded = readSource(path)
      add(stem, stem)
      if (loaded === undefined) continue
      for (const alias of declaredAliases(loaded.text)) add(stem, alias)
    }
  }
  for (const name of Object.keys(state?.characters ?? {})) add(existingKey(groups, name) ?? name, name)
  for (const name of state?.context.active_character_names ?? []) add(existingKey(groups, name) ?? name, name)
  return [...groups.values()].map(names => ({ names: [...names].sort((left, right) => right.length - left.length || left.localeCompare(right, 'zh')) }))
}

function existingKey(groups: ReadonlyMap<string, Set<string>>, name: string): string | undefined {
  for (const [key, names] of groups) if (key === name || names.has(name)) return key
  return undefined
}

function castTokens(text: string): Set<string> {
  const stripped = text.replace(/（[^）]*）/gu, ' ').replace(/\([^)]*\)/gu, ' ')
  return new Set(stripped.split(/[、，,；;／/|·]+/u).flatMap(part => part.split(/\s+/u)).map(part => part.trim()).filter(part => part.length >= 2))
}

function lineNumberAt(text: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) if (text[cursor] === '\n') line += 1
  return line
}

function termHits(text: string, term: string, allows: readonly string[]): number[] {
  if (term.trim() === '') return []
  const indexes: number[] = []
  let from = 0
  while (from < text.length && indexes.length < HITS_PER_PATTERN) {
    const at = text.indexOf(term, from)
    if (at < 0) break
    const end = at + term.length
    const allowed = allows.some(allow => allow.length >= term.length && text.lastIndexOf(allow, at) >= 0 && text.lastIndexOf(allow, at) <= at && text.lastIndexOf(allow, at) + allow.length >= end)
    if (!allowed) indexes.push(at)
    from = at + term.length
  }
  return indexes
}

function scanManuscript(
  project: string,
  config: NormalizedConfig,
  cast: { id: string; text: string } | undefined,
  state: TrackingState | undefined,
  bodyPath: string | undefined,
  bodyText: string | undefined,
): RuleScanHit[] {
  const hits: RuleScanHit[] = []
  if (bodyText !== undefined && bodyPath !== undefined) {
    const relativeBody = posixRelative(project, bodyPath)
    for (const spec of config.forbidden) {
      let expression: RegExp
      try {
        expression = new RegExp(spec.pattern, 'u')
      } catch {
        continue
      }
      const lines = bodyText.split(/\n/u)
      let count = 0
      for (let index = 0; index < lines.length && count < HITS_PER_PATTERN; index += 1) {
        const line = lines[index]?.replace(/\r$/u, '') ?? ''
        if (!expression.test(line)) continue
        count += 1
        hits.push({
          id: count === 1 ? spec.id : `${spec.id}#${String(count)}`,
          severity: spec.severity,
          kind: 'forbidden',
          message: `固定写法「${spec.id}」命中第 ${String(index + 1)} 行`,
          path: relativeBody,
          line: index + 1,
          ...(spec.rule === undefined ? {} : { rule: spec.rule }),
        })
      }
    }
    if (config.eraEnabled) {
      for (const term of config.deny) {
        const found = termHits(bodyText, term, config.allow)
        found.forEach((index, offset) => {
          hits.push({
            id: offset === 0 ? `era:${term}` : `era:${term}#${String(offset + 1)}`,
            severity: 'blocking',
            kind: 'era',
            message: `年代禁用词「${term}」命中第 ${String(lineNumberAt(bodyText, index))} 行`,
            path: relativeBody,
            line: lineNumberAt(bodyText, index),
          })
        })
      }
    }
    if (cast !== undefined) {
      const tokens = castTokens(cast.text)
      const occupied: [number, number][] = []
      const reported = new Set<Person>()
      const candidates = peopleIn(project, state)
        .flatMap(person => person.names.map(name => ({ person, name, listed: person.names.some(item => tokens.has(item)) })))
        .sort((left, right) => right.name.length - left.name.length || left.name.localeCompare(right.name, 'zh'))
      for (const candidate of candidates) {
        let from = 0
        while (from < bodyText.length) {
          const at = bodyText.indexOf(candidate.name, from)
          if (at < 0) break
          const end = at + candidate.name.length
          if (!occupied.some(([start, stop]) => at < stop && end > start)) {
            occupied.push([at, end])
            if (!candidate.listed && !reported.has(candidate.person)) {
              reported.add(candidate.person)
              hits.push({
                id: `cast:${candidate.name}`,
                severity: 'hint',
                kind: 'cast',
                message: `出场顺序未列「${candidate.name}」，正文已出现`,
                path: relativeBody,
                line: lineNumberAt(bodyText, at),
                rule: cast.id,
              })
            }
          }
          from = end
        }
      }
    }
  }
  if (config.voidEnabled && state !== undefined) {
    const fields = [
      ['long_term_constraints', state.context.long_term_constraints],
      ['continuity_risks', state.context.continuity_risks],
    ] as const
    for (const term of config.voidTerms) {
      for (const [field, entries] of fields) {
        for (const entry of entries) {
          if (!entry.includes(term)) continue
          hits.push({
            id: `void:${field}:${term}`,
            severity: 'hint',
            kind: 'void-term',
            message: `作废条目仍在：「${term}」命中 ${field}「${entry}」`,
            path: '追踪/_tracking-state.json',
          })
        }
      }
    }
  }
  return hits
}

function rulesSha256(rules: readonly ExtractedRule[]): string {
  const canonical = rules.map(rule => ({ id: rule.id, text: rule.text, source: { path: rule.source.path, line: rule.source.line } }))
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function fit(chapter: number, rules: readonly ExtractedRule[], scan: readonly RuleScanHit[], warnings: readonly RuleWarning[], hash: string, revision: number | null): ChapterRules {
  let keptRules = [...rules]
  let keptScan = [...scan]
  let keptWarnings = [...warnings]
  let omitted = 0
  const payload = (): ChapterRules => ({
    schema: CHAPTER_RULES_SCHEMA,
    chapter,
    rules: keptRules,
    scan: keptScan,
    warnings: keptWarnings,
    rules_sha256: hash,
    omitted,
    state_revision: revision,
  })
  while (encoded(payload()) > RULES_MAX_BYTES && keptRules.length > 0) {
    keptRules = keptRules.slice(0, -1)
    omitted += 1
  }
  while (encoded(payload()) > RULES_MAX_BYTES && keptScan.length > 0) {
    keptScan = keptScan.slice(0, -1)
    omitted += 1
  }
  while (encoded(payload()) > RULES_MAX_BYTES && keptWarnings.length > 0) {
    keptWarnings = keptWarnings.slice(0, -1)
    omitted += 1
  }
  return payload()
}

interface Collected {
  readonly rules: ExtractedRule[]
  readonly warnings: RuleWarning[]
  readonly config: NormalizedConfig
  readonly state: TrackingState | undefined
  readonly bodyPath: string | undefined
}

function collect(project: string, chapter: number, file: WritingCheckFile | undefined): Collected {
  const warnings: RuleWarning[] = []
  const config = normalizeConfig(file, warnings)
  const needsState = config.sources.some(source => source.prefix === 'STATE') || config.voidEnabled
  const { state, text: stateText } = readState(project, warnings, needsState)
  const outline = locateOutline(project, chapter, warnings)
  const volume = config.sources.some(source => source.prefix.startsWith('VOL-'))
    ? locateVolume(project, chapter, warnings)
    : undefined
  const rules: ExtractedRule[] = []
  const seenFiles = new Set<string>()
  for (const source of config.sources) {
    if (source.prefix === 'STATE') {
      const path = '追踪/_tracking-state.json'
      for (const heading of headingsOf(source)) {
        rules.push(...extractPrefix(source.prefix, heading, [], path, chapter, warnings, state, stateText))
      }
      continue
    }
    const path = locateFile(project, source.file, chapter, warnings, outline, volume)
    if (path === undefined) continue
    if (!seenFiles.has(path)) {
      seenFiles.add(path)
      const loaded = readSource(path)
      if (loaded === undefined) {
        warn(warnings, '规则来源无法读取', posixRelative(project, path))
        continue
      }
      if (loaded.truncated) warn(warnings, '规则来源超过读取上限，只使用了前 512 KiB', posixRelative(project, path))
    }
    const loaded = readSource(path)
    if (loaded === undefined) continue
    const relativePath = posixRelative(project, path)
    const lines = toLines(loaded.text)
    for (const heading of headingsOf(source)) {
      rules.push(...extractPrefix(source.prefix, heading, lines, relativePath, chapter, warnings, state, stateText))
    }
  }
  return { rules, warnings, config, state, bodyPath: locateBody(project, chapter) }
}

/**
 * Extract the rules that apply to one chapter and scan a body when it already exists.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @returns rules, scan hits, warnings and the hash of the full rule list.
 * @throws WritingCheckError when `设定/写作检查.json` exists but is not a valid writing-check file.
 */
export function extractChapterRules(project: string, chapter: number): ChapterRules {
  const file = readWritingCheck(project)
  const collected = collect(project, chapter, file)
  const bodyText = collected.bodyPath === undefined ? undefined : readSource(collected.bodyPath)?.text
  const castRule = collected.rules.find(rule => rule.id.endsWith('-CAST'))
  const scan = scanManuscript(
    project,
    collected.config,
    castRule === undefined ? undefined : { id: castRule.id, text: castRule.text },
    collected.state,
    collected.bodyPath,
    bodyText,
  )
  const invalidPatterns = collected.config.forbidden.flatMap(spec => {
    try {
      new RegExp(spec.pattern, 'u')
      return []
    } catch {
      return [spec.id]
    }
  })
  for (const id of invalidPatterns) warn(collected.warnings, `forbidden ${id} 的 pattern 不是合法正则，已跳过`)
  return fit(chapter, collected.rules, scan, collected.warnings, rulesSha256(collected.rules), collected.state?.state_revision ?? null)
}

/**
 * Scan one chapter body for configured blocking and hint hits.
 * A missing or broken writing-check file contributes no configured hits; cast
 * still uses the outline's `出场顺序` field when that field is present.
 * @param project - the book directory.
 * @param outlinePath - the chapter outline.
 * @param bodyPath - the chapter body.
 * @param bodyText - the body text already read by the caller.
 * @returns hits in source order. Config errors are left to the punctuation check.
 */
export function scanChapterQuality(project: string, outlinePath: string, bodyPath: string, bodyText: string): readonly RuleScanHit[] {
  let file: WritingCheckFile | undefined
  try {
    file = readWritingCheck(project)
  } catch (error) {
    if (error instanceof WritingCheckError) file = undefined
    else throw error
  }
  const warnings: RuleWarning[] = []
  const config = normalizeConfig(file, warnings)
  const outline = readSource(outlinePath)?.text ?? ''
  const heading = castHeading(config.sources)
  const field = toLines(outline).map(line => matchField(line.text, heading)).find(value => value !== undefined)
  const chapter = /细纲_第0*(\d+)章/u.exec(basename(outlinePath))
  const cast = field === undefined || isPlaceholder(field)
    ? undefined
    : { id: `OUT-${chapterLabel(chapter?.[1] === undefined ? 0 : Number(chapter[1]))}-CAST`, text: field }
  const state = readState(project, [], config.voidEnabled || cast !== undefined).state
  return scanManuscript(project, config, cast, state, bodyPath, bodyText)
}
