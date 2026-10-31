/**
 * Deterministic style measures: paragraph length, dashes, anadiplosis,
 * a fixed metaphor list, and blank lines.
 *
 * Numbers come from `设定/写作检查.json` `style`. A missing key scans nothing.
 * The same measure over `streak` consecutive chapters becomes blocking.
 * Blank lines are blocking on the chapter that contains them.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readWritingCheck, type StyleConfig } from './writing-check.ts'
import { findChapterFile } from './wordcount.ts'

/** Schema of {@link measureStyleBaseline}. */
export const STYLE_BASELINE_SCHEMA = 'story-style-baseline/v1'

/** One style finding for chapter check or book audit. */
export interface StyleFinding {
  readonly metric: string
  readonly severity: 'blocking' | 'hint'
  readonly chapter: number
  readonly message: string
}

/** The style file cannot be measured or written. */
export class StyleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StyleError'
  }
}

interface Measure {
  readonly paragraphMedian: number
  readonly dashPerKilo: number
  readonly anadiplosisPerKilo: number
  readonly metaphorCount: number
  readonly blankLines: number
  readonly chars: number
}

/**
 * Findings for one chapter, including a blocking streak that reaches this chapter.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @param bodyText - the chapter body. When omitted, the chapter file is read.
 */
export function styleFindings(project: string, chapter: number, bodyText?: string): readonly StyleFinding[] {
  const config = readWritingCheck(project)?.style
  if (config === undefined) return []
  const text = bodyText ?? readBody(project, chapter)
  if (text === undefined) return []
  const current = breaches(measure(text, config.metaphors ?? []), config)
  const streak = config.streak ?? 3
  const findings: StyleFinding[] = []
  for (const breach of current) {
    const blocking = breach.metric === 'blank-lines' || streakReached(project, chapter, breach.metric, streak, config)
    findings.push({
      metric: breach.metric,
      severity: blocking ? 'blocking' : 'hint',
      chapter,
      message: breach.message,
    })
  }
  return findings
}

/**
 * Measure accepted chapters and return a `style` object that contains them.
 * @param project - the book directory.
 * @param from - the first chapter.
 * @param to - the last chapter.
 * @param apply - write the object into `设定/写作检查.json` when true.
 */
export function measureStyleBaseline(project: string, from: number, to: number, apply = false): {
  schema: typeof STYLE_BASELINE_SCHEMA
  from: number
  to: number
  chapters: number
  style: StyleConfig
  applied: boolean
} {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) throw new StyleError('--chapters must be a positive range')
  const samples: Measure[] = []
  for (let chapter = from; chapter <= to; chapter += 1) {
    const text = readBody(project, chapter)
    if (text !== undefined) samples.push(measure(text, []))
  }
  if (samples.length === 0) throw new StyleError('style baseline found no chapter bodies')
  const medians = samples.map(item => item.paragraphMedian).sort((left, right) => left - right)
  const style: StyleConfig = {
    paragraph_median: [medians[0] ?? 0, medians.at(-1) ?? 0],
    dash_per_kilo: Math.max(...samples.map(item => Math.ceil(item.dashPerKilo))),
    anadiplosis_per_kilo: Math.max(...samples.map(item => Math.ceil(item.anadiplosisPerKilo))),
    metaphor_limit: Math.max(...samples.map(item => item.metaphorCount)),
    metaphors: [],
    forbid_blank_lines: samples.every(item => item.blankLines === 0),
    streak: 3,
  }
  if (apply) writeStyle(project, style)
  return { schema: STYLE_BASELINE_SCHEMA, from, to, chapters: samples.length, style, applied: apply }
}

/**
 * Quality rows for `chapter check`. Blank lines and a completed streak are blocking.
 * @param project - the book directory.
 * @param chapter - the chapter number.
 * @param bodyPath - the body path stored on the row.
 * @param bodyText - the body already read by the caller.
 */
export function styleQualityRows(project: string, chapter: number, bodyPath: string, bodyText: string): { source: string; type: string; severity: 'blocking' | 'hint'; file: string; message: string; id: string }[] {
  return styleFindings(project, chapter, bodyText).map(finding => ({
    source: 'style',
    type: 'STYLE',
    severity: finding.severity,
    file: bodyPath,
    message: finding.message,
    id: finding.metric,
  }))
}

function streakReached(project: string, chapter: number, metric: string, streak: number, config: StyleConfig): boolean {
  if (streak <= 1) return true
  let count = 1
  for (let earlier = chapter - 1; earlier >= 1 && count < streak; earlier -= 1) {
    const text = readBody(project, earlier)
    if (text === undefined) break
    if (!breaches(measure(text, config.metaphors ?? []), config).some(item => item.metric === metric)) break
    count += 1
  }
  return count >= streak
}

function breaches(value: Measure, config: StyleConfig): { metric: string; message: string }[] {
  const found: { metric: string; message: string }[] = []
  const band = config.paragraph_median
  if (band !== undefined && (value.paragraphMedian < band[0] || value.paragraphMedian > band[1])) {
    found.push({ metric: 'paragraph-median', message: `段长中位数 ${String(value.paragraphMedian)} 不在 ${String(band[0])}-${String(band[1])}` })
  }
  if (config.dash_per_kilo !== undefined && value.dashPerKilo > config.dash_per_kilo) {
    found.push({ metric: 'dash', message: `破折号每千字 ${value.dashPerKilo.toFixed(1)}，上限 ${String(config.dash_per_kilo)}` })
  }
  if (config.anadiplosis_per_kilo !== undefined && value.anadiplosisPerKilo > config.anadiplosis_per_kilo) {
    found.push({ metric: 'anadiplosis', message: `顶针每千字 ${value.anadiplosisPerKilo.toFixed(1)}，上限 ${String(config.anadiplosis_per_kilo)}` })
  }
  if (config.metaphor_limit !== undefined && value.metaphorCount > config.metaphor_limit) {
    found.push({ metric: 'metaphor', message: `固定比喻 ${String(value.metaphorCount)} 处，上限 ${String(config.metaphor_limit)}` })
  }
  if (config.forbid_blank_lines === true && value.blankLines > 0) {
    found.push({ metric: 'blank-lines', message: `正文有 ${String(value.blankLines)} 处空行` })
  }
  return found
}

function measure(text: string, metaphors: readonly string[]): Measure {
  const chars = [...text].filter(character => !/\s/u.test(character)).length
  const paragraphs = text.split(/\n\s*\n/u).map(part => [...part].filter(character => !/\s/u.test(character)).length).filter(length => length > 0)
  const paragraphMedian = median(paragraphs.length === 0 ? [chars] : paragraphs)
  const dashes = (text.match(/—|——|--/gu) ?? []).length
  const anadiplosis = countAnadiplosis(text)
  const perKilo = chars === 0 ? 0 : 1000 / chars
  return {
    paragraphMedian,
    dashPerKilo: dashes * perKilo,
    anadiplosisPerKilo: anadiplosis * perKilo,
    metaphorCount: measureWithMetaphors(text, metaphors),
    blankLines: (text.match(/\n[ \t]*\n/gu) ?? []).length,
    chars,
  }
}

function countAnadiplosis(text: string): number {
  const sentences = text.split(/[。！？!?]/u).map(part => part.replace(/\s+/gu, '')).filter(part => part.length >= 2)
  let count = 0
  for (let index = 1; index < sentences.length; index += 1) {
    const previous = sentences[index - 1] ?? ''
    const current = sentences[index] ?? ''
    for (const size of [4, 3, 2]) {
      if (previous.length < size) continue
      if (current.startsWith(previous.slice(-size))) {
        count += 1
        break
      }
    }
  }
  return count
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
}

function readBody(project: string, chapter: number): string | undefined {
  try {
    const path = findChapterFile(join(project, '正文'), chapter, { outline: false, allowMissing: true })
    if (!existsSync(path)) return undefined
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function writeStyle(project: string, style: StyleConfig): void {
  const path = join(project, '设定', '写作检查.json')
  let current: Record<string, unknown> = {}
  if (existsSync(path)) {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new StyleError('写作检查.json must be an object')
    current = parsed as Record<string, unknown>
  }
  current.style = style
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  readWritingCheck(project)
}

export function measureWithMetaphors(text: string, metaphors: readonly string[]): number {
  return metaphors.reduce((sum, phrase) => sum + (phrase === '' ? 0 : countOf(text, phrase)), 0)
}

function countOf(text: string, phrase: string): number {
  let count = 0
  let from = 0
  while (from < text.length) {
    const at = text.indexOf(phrase, from)
    if (at < 0) break
    count += 1
    from = at + phrase.length
  }
  return count
}
