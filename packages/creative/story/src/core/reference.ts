/**
 * Read-only lookup in the workspace analysis library named by the book's registration table.
 *
 * Hits are reference material. They are not book facts. The walk skips `原文/`
 * and chapter-summary rollups, including files larger than 512 KiB.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { firstTable, markdownHeading, sectionRange, textLines } from './markdown-scan.ts'
import { atomicWriteText } from './tracking/store.ts'

/** Schema of {@link lookupReference}. */
export const REFERENCE_LOOKUP_SCHEMA = 'story-reference-lookup/v1'
/** Bytes read from one reference file. */
const REFERENCE_FILE_MAX_BYTES = 512 * 1024

/** The reference library cannot be read. */
export class ReferenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferenceError'
  }
}

/** One reference excerpt. `source` is `reference` so a caller does not treat it as a book fact. */
export interface ReferenceHit {
  readonly source: 'reference'
  readonly path: string
  readonly title: string
  readonly match: 'exact' | 'keyword'
  readonly excerpt: string
  readonly line_start: number
}

/**
 * Search `拆文库/<主对标>/` for a query.
 * @param workspace - the workspace that holds `拆文库/`.
 * @param project - the book directory, used to read `设定/题材定位.md`.
 * @param query - literal text or the contents of a file.
 * @param options - page size. `limit` defaults to 8 and cannot exceed 20.
 */
export function lookupReference(workspace: string, project: string, query: string, options: { readonly limit?: number } = {}): {
  schema: typeof REFERENCE_LOOKUP_SCHEMA
  source: 'reference'
  library: string | null
  title: string | null
  items: readonly ReferenceHit[]
  omitted: number
} {
  const limit = options.limit ?? 8
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ReferenceError('--limit must be from 1 to 20')
  const title = referenceTitle(project)
  if (title === undefined) return { schema: REFERENCE_LOOKUP_SCHEMA, source: 'reference', library: null, title: null, items: [], omitted: 0 }
  const root = join(workspace, '拆文库', title)
  if (!existsSync(root)) return { schema: REFERENCE_LOOKUP_SCHEMA, source: 'reference', library: null, title, items: [], omitted: 0 }
  const files = referenceFiles(root)
  const terms = queryTerms(query)
  const ranked: { hit: ReferenceHit; score: number }[] = []
  for (const file of files) {
    const hit = scoreFile(root, file, query, terms)
    if (hit !== undefined) ranked.push(hit)
  }
  ranked.sort((left, right) => right.score - left.score || left.hit.path.localeCompare(right.hit.path, 'zh'))
  return {
    schema: REFERENCE_LOOKUP_SCHEMA,
    source: 'reference',
    library: `拆文库/${title}/`,
    title,
    items: ranked.slice(0, limit).map(item => item.hit),
    omitted: Math.max(0, ranked.length - limit),
  }
}

/**
 * Build a rhythm card from plot-unit files and write it under `节奏卡/`.
 * @param workspace - the workspace that holds `拆文库/`.
 * @param title - the analysis-library title.
 * @param from - the first chapter.
 * @param to - the last chapter.
 */
export function writeRhythmCard(workspace: string, title: string, from: number, to: number): {
  schema: 'story-rhythm-card/v1'
  path: string
  bytes: number
  omitted: number
  baseline: { readonly max_no_payoff: number; readonly min_peak_gap: number; readonly max_peak_gap: number; readonly source: string }
} {
  if (title.trim() === '' || title.includes('/') || title.includes('..')) throw new ReferenceError('--title must name one analysis library')
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) throw new ReferenceError('--chapters must be a positive range')
  const root = join(workspace, '拆文库', title.trim())
  const directory = join(root, '剧情')
  if (!existsSync(directory)) throw new ReferenceError(`analysis plot directory does not exist: 拆文库/${title}/剧情`)
  const parts: string[] = [`# ${title} 节奏卡 第${String(from)}-${String(to)}章`, '']
  let omitted = 0
  const names = readdirSync(directory).filter(name => name.startsWith('剧情单元_') && name.endsWith('.md')).sort((left, right) => left.localeCompare(right, 'zh'))
  for (const name of names) {
    const text = readFileSync(join(directory, name), 'utf8')
    const lines = textLines(text)
    const range = lines.map(line => rangePair(line.text)).find(item => item !== undefined)
    if (range !== undefined && (range[1] < from || range[0] > to)) continue
    const block = ['', `## ${name.replace(/\.md$/u, '')}`]
    for (const heading of ['结构分布', '桥段标签', '核心冲突']) {
      const section = sectionRange(lines, heading)
      if (section === undefined) continue
      block.push(`### ${heading}`, ...lines.slice(section.start, section.end).map(line => line.text).filter(line => line.trim() !== ''))
    }
    if (block.length === 2) continue
    const next = `${parts.join('\n')}${block.join('\n')}\n`
    if (Buffer.byteLength(next, 'utf8') > 2048) {
      omitted += 1
      continue
    }
    parts.push(...block)
  }
  const baseline = baselineOf(root)
  parts.push('', '## 节奏基准', `- max_no_payoff：${String(baseline.max_no_payoff)}`, `- min_peak_gap：${String(baseline.min_peak_gap)}`, `- max_peak_gap：${String(baseline.max_peak_gap)}`, `- source：${baseline.source}`, '')
  let card = `${parts.join('\n').trim()}\n`
  if (Buffer.byteLength(card, 'utf8') > 2048) {
    card = `${card.slice(0, 800)}\n`
    omitted += 1
  }
  const relative = `拆文库/${title.trim()}/节奏卡/第${String(from)}-${String(to)}章.md`
  atomicWriteText(join(workspace, relative), card)
  return { schema: 'story-rhythm-card/v1', path: relative, bytes: Buffer.byteLength(card, 'utf8'), omitted, baseline }
}

function baselineOf(root: string): { max_no_payoff: number; min_peak_gap: number; max_peak_gap: number; source: string } {
  const path = join(root, '剧情', '节奏.md')
  const fallback = { max_no_payoff: 1, min_peak_gap: 5, max_peak_gap: 8, source: 'default' }
  if (!existsSync(path)) return fallback
  const lines = textLines(readFileSync(path, 'utf8'))
  const section = sectionRange(lines, '节奏基准')
  if (section === undefined) return fallback
  const text = lines.slice(section.start, section.end).map(line => line.text).join('\n')
  return {
    max_no_payoff: labeledNumber(text, 'max_no_payoff') ?? fallback.max_no_payoff,
    min_peak_gap: labeledNumber(text, 'min_peak_gap') ?? fallback.min_peak_gap,
    max_peak_gap: labeledNumber(text, 'max_peak_gap') ?? fallback.max_peak_gap,
    source: `拆文库/${basename(root)}/剧情/节奏.md#节奏基准`,
  }
}

function labeledNumber(text: string, name: string): number | undefined {
  const matched = new RegExp(`${name}\\s*[:：]\\s*(\\d+)`, 'u').exec(text)
  return matched?.[1] === undefined ? undefined : Number(matched[1])
}

function referenceTitle(project: string): string | undefined {
  const path = join(project, '设定', '题材定位.md')
  if (!existsSync(path)) return undefined
  const lines = textLines(readFileSync(path, 'utf8'))
  const section = sectionRange(lines, '对标登记') ?? sectionRange(lines, '创作参考登记')
  if (section === undefined) return undefined
  const table = firstTable(lines, section.start, section.end)
  if (table === undefined) return undefined
  const column = table.headers.findIndex(header => header.includes('主对标'))
  if (column < 0) return undefined
  const cell = table.rows.map(row => row.cells[column]?.trim() ?? '').find(value => value !== '' && value !== '无')
  return cell
}

function referenceFiles(root: string): string[] {
  const files: string[] = []
  const collect = (directory: string, plotOnly: boolean): void => {
    if (!existsSync(directory)) return
    for (const name of readdirSync(directory).sort((left, right) => left.localeCompare(right, 'zh'))) {
      if (name.startsWith('.')) continue
      const path = join(directory, name)
      const info = statSync(path)
      if (info.isDirectory()) {
        if (name === '原文') continue
        collect(path, plotOnly)
        continue
      }
      if (!info.isFile() || !name.endsWith('.md')) continue
      if (name.includes('章节摘要汇总') || info.size > REFERENCE_FILE_MAX_BYTES) continue
      if (plotOnly && !name.startsWith('剧情单元_')) continue
      files.push(path)
    }
  }
  collect(join(root, '角色'), false)
  collect(join(root, '设定'), false)
  collect(join(root, '剧情'), true)
  return files
}

function scoreFile(root: string, path: string, query: string, terms: readonly string[]): { hit: ReferenceHit; score: number } | undefined {
  const text = readFileSync(path, 'utf8').slice(0, REFERENCE_FILE_MAX_BYTES)
  const title = markdownHeading(textLines(text)[0]?.text ?? '')?.text ?? basename(path, '.md')
  const stem = basename(path, '.md')
  const exact = query.trim() !== '' && (query.includes(stem) || query.includes(title) || stem.includes(query.trim()) || title === query.trim())
  let score = exact ? 100 : 0
  for (const term of terms) {
    if (text.includes(term)) score += 1
  }
  if (score === 0) return undefined
  const line = textLines(text).find(item => terms.some(term => item.text.includes(term))) ?? textLines(text)[0]
  return {
    score,
    hit: {
      source: 'reference',
      path: relative(root, path).split(sep).join('/'),
      title,
      match: exact ? 'exact' : 'keyword',
      excerpt: (line?.text ?? '').trim().slice(0, 240),
      line_start: line?.number ?? 1,
    },
  }
}

function queryTerms(query: string): string[] {
  const found = query.match(/[\u4e00-\u9fff]{2,4}/gu) ?? []
  return [...new Set(found)].slice(0, 24)
}

function rangePair(line: string): [number, number] | undefined {
  const matched = /(\d+)\s*[-–—~～到至]+\s*(\d+)/u.exec(line)
  if (!/章节/u.test(line) || matched?.[1] === undefined || matched[2] === undefined) return undefined
  return [Number(matched[1]), Number(matched[2])]
}
