/**
 * Deterministic claims for one chapter, written to the default claims path.
 *
 * Lines are taken from the outline, the body, and the chapter-rule texts.
 * A line counts only when it starts with one of the seven fact kinds.
 * Reference-library hits are not a source. `recordFacts` is unchanged:
 * it still requires a committed chapter and a matching body hash.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { claimsRelativePath, FACT_KINDS, type FactKind } from './facts.ts'
import { stripMarks, textLines } from './markdown-scan.ts'
import { extractChapterRules } from './rules.ts'
import { jsonPayload, atomicWriteText } from './tracking/store.ts'
import { findChapterFile } from './wordcount.ts'

/** Schema of the file {@link extractFacts} writes. */
export const CLAIMS_SCHEMA = 'story-facts-claims/v1'
/** Schema of {@link extractFacts} results. */
export const FACTS_EXTRACT_SCHEMA = 'story-facts-extract/v1'

/** Stable id prefix for each {@link FACT_KINDS} value. */
export const FACT_ID_PREFIX = {
  场地: 'VENUE',
  伤情: 'INJ',
  账目: 'ACCT',
  物件: 'OBJ',
  能力: 'SKILL',
  年代: 'ERA',
  指令: 'ORD',
  对标: 'REF',
} as const satisfies Record<FactKind, string>

const KIND_LINE = /^(场地|伤情|账目|物件|能力|年代|指令)\s*[:：]\s*(.+)$/u
const FIELD = /^([^:：]{1,40})\s*[:：]\s*(.+)$/u
const SUBJECT_KEYS = new Set(['主体', '对象', '人物', '角色'])
const EMPTY = new Set(['无', '无。', '暂无', '待补充', '[待补充]', '（无）', '(无)'])

/** Where {@link extractFacts} reads. */
export type ExtractFrom = 'outline' | 'body' | 'both'

/** One row stored for `facts record`. */
export interface ExtractedEntry {
  readonly id: string
  readonly kind: FactKind
  readonly subject?: string
  readonly attrs: Readonly<Record<string, string | number>>
  readonly line?: number
}

/** One row stored for `facts diff`. */
export interface ExtractedClaim {
  readonly id: string
  readonly attrs: Readonly<Record<string, string | number>>
}

/**
 * Scan labeled fact lines and write `草稿/事实/第NNN章.claims.json`.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @param options - `from` defaults to `both`. `dryRun` returns the rows and does not write.
 * @returns the claims document plus whether a file was written. An empty list is a valid file.
 * @throws WordcountError when the chapter number is invalid or more than one outline or body matches.
 */
export function extractFacts(project: string, chapter: number, options: { readonly from?: ExtractFrom; readonly dryRun?: boolean } = {}): {
  schema: typeof FACTS_EXTRACT_SCHEMA
  chapter: number
  from: ExtractFrom
  path: string
  wrote: boolean
  replaced: boolean
  dry_run: boolean
  claims: readonly ExtractedClaim[]
  entries: readonly ExtractedEntry[]
  warnings: readonly string[]
} {
  const from = options.from ?? 'both'
  const dryRun = options.dryRun === true
  const warnings: string[] = []
  const found: ExtractedEntry[] = []
  const seen = new Map<string, ExtractedEntry>()
  const take = (row: ExtractedEntry): void => {
    const previous = seen.get(row.id)
    if (previous !== undefined) {
      if (!sameAttrs(previous.attrs, row.attrs) || previous.kind !== row.kind) warnings.push(`重复 id ${row.id}，保留先出现的一行`)
      return
    }
    seen.set(row.id, row)
    found.push(row)
  }
  if (from !== 'body') {
    const outline = chapterText(project, chapter, true)
    if (outline === undefined) warnings.push('细纲不存在，未从细纲抽取')
    else for (const row of scanLabeled(outline)) take(row)
    try {
      for (const rule of extractChapterRules(project, chapter).rules) {
        for (const row of scanLabeled(rule.text, rule.source.line)) take(row)
      }
    } catch (error) {
      warnings.push(`规则清单未能读取：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (from !== 'outline') {
    const body = chapterText(project, chapter, false)
    if (body === undefined) warnings.push('正文不存在，未从正文抽取')
    else for (const row of scanLabeled(body)) take(row)
  }
  found.sort((left, right) => left.id.localeCompare(right.id, 'zh') || (left.line ?? 0) - (right.line ?? 0))
  const claims = found.map(entry => ({ id: entry.id, attrs: entry.attrs }))
  const relative = claimsRelativePath(chapter)
  const target = join(project, relative)
  const existed = existsSync(target)
  if (!dryRun) {
    atomicWriteText(target, jsonPayload({ schema: CLAIMS_SCHEMA, chapter, from, claims, entries: found }))
  }
  return {
    schema: FACTS_EXTRACT_SCHEMA,
    chapter,
    from,
    path: relative,
    wrote: !dryRun,
    replaced: !dryRun && existed,
    dry_run: dryRun,
    claims,
    entries: found,
    warnings,
  }
}

function chapterText(project: string, chapter: number, outline: boolean): string | undefined {
  const path = findChapterFile(join(project, outline ? '大纲' : '正文'), chapter, { outline, allowMissing: true })
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}

function scanLabeled(text: string, forcedLine?: number): ExtractedEntry[] {
  const rows: ExtractedEntry[] = []
  const lines = textLines(text)
  for (const line of lines) {
    const stripped = stripMarks(line.text.trim().replace(/^[-*+]\s+/u, ''))
    const matched = KIND_LINE.exec(stripped)
    if (matched?.[1] === undefined || matched[2] === undefined) continue
    const kind = matched[1] as FactKind
    if (!(FACT_KINDS as readonly string[]).includes(kind)) continue
    const parts = matched[2].split(/\s*[|｜]\s*/u).map(part => part.trim()).filter(part => part !== '')
    const token = parts[0]
    if (token === undefined || isEmpty(token)) continue
    const attrs: Record<string, string | number> = {}
    let subject: string | undefined
    for (const part of parts.slice(1)) {
      const field = FIELD.exec(part)
      if (field?.[1] === undefined || field[2] === undefined) continue
      const key = field[1].trim()
      const value = field[2].trim()
      if (key === '' || isEmpty(value)) continue
      if (SUBJECT_KEYS.has(key)) {
        subject = value
        continue
      }
      attrs[key] = /^-?\d{1,12}$/u.test(value) ? Number(value) : value
    }
    const id = stableId(kind, token)
    if (id === undefined) continue
    const keys = Object.keys(attrs).sort((left, right) => left.localeCompare(right, 'zh'))
    const ordered: Record<string, string | number> = {}
    for (const key of keys) {
      const value = attrs[key]
      if (value !== undefined) ordered[key] = value
    }
    rows.push({
      id,
      kind,
      ...(subject === undefined ? {} : { subject }),
      attrs: ordered,
      line: forcedLine ?? line.number,
    })
  }
  return rows
}

function stableId(kind: FactKind, token: string): string | undefined {
  const prefix = FACT_ID_PREFIX[kind]
  const cleaned = token.replace(/\s+/gu, '').replace(/[／/、，,；;]+/gu, '-')
  const safe = cleaned.replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/gu, '-').replace(/^-|-$/gu, '')
  if (safe === '') return undefined
  const id = safe.startsWith(`${prefix}-`) ? safe : `${prefix}-${safe}`
  return id.length > 80 ? id.slice(0, 80).replace(/-$/u, '') : id
}

function isEmpty(value: string): boolean {
  return EMPTY.has(value.trim())
}

function sameAttrs(left: Readonly<Record<string, string | number>>, right: Readonly<Record<string, string | number>>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) if (left[key] !== right[key]) return false
  return true
}
