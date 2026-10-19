/**
 * Volume-plan continuity and the short volume slice used by `project context`.
 *
 * A plan check reads `大纲/卷纲*.md` and `设定/题材定位.md`. It does not write.
 * The context slice is capped before it joins the 16 KiB bundle.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fieldValue, firstTable, markdownHeading, sectionRange, textLines, type TextLine } from './markdown-scan.ts'

/** Schema of {@link checkPlan}. */
export const PLAN_SCHEMA = 'story-plan-check/v1'
/** Largest volume slice, in bytes, before the shared context trim. */
export const VOLUME_CONTEXT_MAX_BYTES = 1536
/** Chapters before a volume ends when the next volume must already be ready. */
export const VOLUME_READY_WINDOW = 10

/** The plan range or the registration table cannot be checked. */
export class PlanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlanError'
  }
}

/** One plan finding. Blocking rows fail `project plan check` and the book-audit plan check. */
export interface PlanFinding {
  readonly severity: 'blocking' | 'hint'
  readonly category: string
  readonly message: string
  readonly chapter?: number
}

interface VolumeSpan {
  readonly path: string
  readonly title: string
  readonly from: number
  readonly to: number
  readonly text: string
}

/**
 * Check that volume ranges meet and that the next volume is ready near a volume end.
 * @param project - the book directory.
 * @param chapter - the chapter used for the ready-window. Defaults to 1 when omitted by the caller.
 */
export function checkPlan(project: string, chapter: number): {
  schema: typeof PLAN_SCHEMA
  chapter: number
  applicable: boolean
  ok: boolean
  findings: readonly PlanFinding[]
} {
  if (!Number.isInteger(chapter) || chapter < 1) throw new PlanError('--chapter must be positive')
  const volumes = volumeSpans(project)
  if (volumes.length === 0) return { schema: PLAN_SCHEMA, chapter, applicable: false, ok: true, findings: [] }
  const findings: PlanFinding[] = []
  const ordered = [...volumes].sort((left, right) => left.from - right.from || left.path.localeCompare(right.path, 'zh'))
  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index]
    const previous = ordered[index - 1]
    if (current === undefined || previous === undefined) continue
    if (current.from !== previous.to + 1) {
      findings.push({ severity: 'blocking', category: 'volume-gap', message: `${previous.title} 止于第 ${String(previous.to)} 章，${current.title} 起于第 ${String(current.from)} 章，卷纲范围不连续` })
    }
  }
  const current = ordered.find(span => chapter >= span.from && chapter <= span.to)
  if (current !== undefined && current.to - chapter <= VOLUME_READY_WINDOW) {
    const next = ordered.find(span => span.from === current.to + 1)
    if (next === undefined) {
      findings.push({ severity: 'blocking', chapter, category: 'next-volume', message: `第 ${String(chapter)} 章离${current.title}卷末不超过 ${String(VOLUME_READY_WINDOW)} 章，下一卷卷纲不存在` })
    } else {
      const status = nextRegistration(project, next.title)
      if (status === undefined || status === '') {
        findings.push({ severity: 'blocking', chapter, category: 'reference-status', message: '题材定位的创作参考登记没有下一卷主对标' })
      } else if (status.includes('扩卷前核实')) {
        findings.push({ severity: 'blocking', chapter, category: 'reference-status', message: `下一卷主对标状态仍是「${status}」` })
      }
    }
  }
  return { schema: PLAN_SCHEMA, chapter, applicable: true, ok: findings.every(item => item.severity !== 'blocking'), findings }
}

/**
 * Volume contract, current unit card, and forbidden endgame cards for one chapter.
 * @param project - the book directory.
 * @param chapter - the chapter being written.
 * @returns `null` when no volume plan covers the chapter.
 */
export function volumeSlice(project: string, chapter: number): { path: string; text: string } | null {
  const span = volumeSpans(project).find(item => chapter >= item.from && chapter <= item.to)
  if (span === undefined) return null
  const lines = textLines(span.text)
  const parts: string[] = [`# ${span.title}`, '']
  const contract = sectionRange(lines, '卷契约') ?? sectionRange(lines, '卷契约与终局储备')
  if (contract !== undefined) parts.push(...lines.slice(contract.start, contract.end).map(line => line.text), '')
  const banned = fieldValue(lines, '本卷禁碰的终局底牌')
  if (banned !== undefined) parts.push(`- 本卷禁碰的终局底牌：${banned.value}`, '')
  const unit = unitBlock(lines, chapter)
  if (unit !== undefined) parts.push(...unit, '')
  const card = siblingRhythmCard(project, chapter)
  if (card !== undefined) parts.push(card)
  return { path: bookRelative(project, span.path), text: capBytes(parts.join('\n').trim() + '\n', VOLUME_CONTEXT_MAX_BYTES) }
}

function siblingRhythmCard(project: string, chapter: number): string | undefined {
  const title = registeredTitle(project)
  if (title === undefined) return undefined
  const directory = join(dirname(project), '拆文库', title, '节奏卡')
  if (!existsSync(directory)) return undefined
  const names = readdirSync(directory).filter(name => name.endsWith('.md')).sort((left, right) => left.localeCompare(right, 'zh'))
  for (const name of names) {
    const matched = /第(\d+)-(\d+)章/u.exec(name)
    if (matched?.[1] === undefined || matched[2] === undefined) continue
    const from = Number(matched[1])
    const to = Number(matched[2])
    if (chapter < from || chapter > to) continue
    const text = readFileSync(join(directory, name), 'utf8').trim()
    return text.length > 600 ? `${text.slice(0, 600)}…` : text
  }
  return undefined
}

function registeredTitle(project: string): string | undefined {
  const path = join(project, '设定', '题材定位.md')
  if (!existsSync(path)) return undefined
  const lines = textLines(readFileSync(path, 'utf8'))
  const section = sectionRange(lines, '对标登记') ?? sectionRange(lines, '创作参考登记')
  if (section === undefined) return undefined
  const table = firstTable(lines, section.start, section.end)
  if (table === undefined) return undefined
  const column = table.headers.findIndex(header => header.includes('主对标'))
  if (column < 0) return undefined
  return table.rows.map(row => row.cells[column]?.trim() ?? '').find(value => value !== '' && value !== '无')
}

function unitBlock(lines: readonly TextLine[], chapter: number): string[] | undefined {
  const headings: number[] = []
  lines.forEach((line, index) => {
    if (markdownHeading(line.text)?.text.includes('剧情单元') === true) headings.push(index)
  })
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index] ?? 0
    const end = headings[index + 1] ?? lines.length
    const range = lines.slice(start, end).map(line => rangePair(line.text)).find(item => item !== undefined)
    if (range === undefined || chapter < range[0] || chapter > range[1]) continue
    return lines.slice(start, end).map(line => line.text)
  }
  return undefined
}

function volumeSpans(project: string): VolumeSpan[] {
  const directory = join(project, '大纲')
  if (!existsSync(directory)) return []
  const spans: VolumeSpan[] = []
  for (const name of readdirSync(directory).filter(item => item.startsWith('卷纲') && item.endsWith('.md')).sort((left, right) => left.localeCompare(right, 'zh'))) {
    const path = join(directory, name)
    let text: string
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const lines = textLines(text)
    const title = markdownHeading(lines[0]?.text ?? '')?.text ?? name.replace(/\.md$/u, '')
    const top = lines.slice(0, unitStart(lines))
    const labeled = top.map(line => rangePair(line.text)).find(item => item !== undefined)
    const ranges = lines.map(line => rangePair(line.text)).filter((item): item is [number, number] => item !== undefined)
    const from = labeled?.[0] ?? ranges.reduce<number | undefined>((min, item) => min === undefined || item[0] < min ? item[0] : min, undefined)
    const to = labeled?.[1] ?? ranges.reduce<number | undefined>((max, item) => max === undefined || item[1] > max ? item[1] : max, undefined)
    if (from === undefined || to === undefined || from > to) continue
    spans.push({ path, title, from, to, text })
  }
  return spans
}

function unitStart(lines: readonly TextLine[]): number {
  const index = lines.findIndex(line => markdownHeading(line.text)?.text.includes('剧情单元') === true)
  return index < 0 ? lines.length : index
}

function nextRegistration(project: string, nextTitle: string | undefined): string | undefined {
  const path = join(project, '设定', '题材定位.md')
  if (!existsSync(path)) return undefined
  const lines = textLines(readFileSync(path, 'utf8'))
  const section = sectionRange(lines, '创作参考登记') ?? sectionRange(lines, '对标登记')
  if (section === undefined) return undefined
  const table = firstTable(lines, section.start, section.end)
  if (table === undefined) return undefined
  const volume = table.headers.findIndex(header => header.includes('卷'))
  const status = table.headers.findIndex(header => header.includes('状态'))
  if (status < 0) return undefined
  const row = nextTitle === undefined
    ? undefined
    : table.rows.find(item => volume >= 0 && (item.cells[volume] ?? '').includes(volumeToken(nextTitle)))
  if (row === undefined) return undefined
  return row.cells[status]?.trim() ?? ''
}

function volumeToken(title: string): string {
  const matched = /第.+卷/u.exec(title)
  return matched?.[0] ?? title
}

function rangePair(line: string): [number, number] | undefined {
  if (!/章节范围|章节：|章节:/u.test(line)) return undefined
  const matched = /(\d+)\s*[-–—~～到至]+\s*(\d+)/u.exec(line)
  if (matched?.[1] === undefined || matched[2] === undefined) return undefined
  return [Number(matched[1]), Number(matched[2])]
}

function capBytes(text: string, max: number): string {
  if (Buffer.byteLength(text, 'utf8') <= max) return text
  let kept = text
  while (kept.length > 0 && Buffer.byteLength(kept, 'utf8') > max - 1) kept = kept.slice(0, -1)
  return `${kept}…`
}

function bookRelative(project: string, path: string): string {
  const value = relative(project, path)
  return value.split(sep).join('/')
}
