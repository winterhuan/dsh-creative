/**
 * Promise table and outline rhythm checks.
 *
 * Thresholds come from `设定/写作检查.json` `rhythm` when that object is
 * present. Missing fields use the long-form defaults below. The command does
 * not read a prose rhythm essay; a rhythm card can supply numbers to copy.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fieldValue, firstTable, sectionRange, textLines } from './markdown-scan.ts'
import { readWritingCheck, type WritingCheckFile } from './writing-check.ts'
import { findChapterFile } from './wordcount.ts'

/** Schema of {@link checkRhythm}. */
export const RHYTHM_SCHEMA = 'story-rhythm/v1'

/** Defaults used when `rhythm` omits a field. */
export const DEFAULT_RHYTHM = {
  max_no_payoff: 1,
  min_peak_gap: 5,
  max_peak_gap: 8,
  peak_intensity: 8,
  max_same_position: 2,
  source: '拆文库/龙蛇演义/剧情/节奏.md#全书情绪节奏总览',
} as const

/** One rhythm or promise finding. */
export interface RhythmFinding {
  readonly severity: 'hint'
  readonly chapter?: number
  readonly category: string
  readonly message: string
}

interface PromiseRow {
  readonly name: string
  readonly first: number
  readonly due: number | undefined
  readonly interval: number
  readonly methods: readonly string[]
  readonly line: number
}

interface RhythmConfig {
  readonly max_no_payoff: number
  readonly min_peak_gap: number
  readonly max_peak_gap: number
  readonly peak_intensity: number
  readonly max_same_position: number
  readonly source: string
}

/**
 * Scan outlines and the promise table from chapter `from` through `to`.
 * @param project - the book directory.
 * @param from - the first chapter.
 * @param to - the last chapter.
 * @throws WritingCheckError when `rhythm` is present but invalid. `readWritingCheck` reports that.
 */
export function checkRhythm(project: string, from: number, to: number): {
  schema: typeof RHYTHM_SCHEMA
  from: number
  to: number
  applicable: boolean
  ok: boolean
  source: string
  findings: readonly RhythmFinding[]
} {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) throw new RangeError('--from and --to must be positive and from <= to')
  const file = readWritingCheck(project)
  const config = rhythmConfig(file)
  const promises = promiseRows(readOptional(join(project, '设定', '题材定位.md')))
  const peaks = emotionRows(project)
  const findings: RhythmFinding[] = []
  let sawPayoff = false
  let streak = 0
  const positions: { chapter: number; position: string }[] = []
  for (let chapter = from; chapter <= to; chapter += 1) {
    const outline = readChapter(project, chapter, true)
    const payoff = outline === undefined ? undefined : fieldValue(textLines(outline), '爽点')
    if (payoff === undefined) streak = 0
    else {
      sawPayoff = true
      if (isEmptyPayoff(payoff.value)) streak += 1
      else streak = 0
      if (streak > config.max_no_payoff) {
        findings.push({ severity: 'hint', chapter, category: 'no-payoff', message: `爽点连续 ${String(streak)} 章为「无」或空，超过 ${String(config.max_no_payoff)}` })
      }
    }
    const position = outline === undefined ? undefined : fieldValue(textLines(outline), '章节定位')?.value
    if (position !== undefined && position.trim() !== '' && position !== '无') positions.push({ chapter, position: position.trim() })
  }
  let run = 1
  for (let index = 1; index < positions.length; index += 1) {
    const current = positions[index]
    const previous = positions[index - 1]
    if (current === undefined || previous === undefined) continue
    if (current.position === previous.position && current.chapter === previous.chapter + 1) run += 1
    else run = 1
    if (run > config.max_same_position) {
      findings.push({ severity: 'hint', chapter: current.chapter, category: 'same-position', message: `章节定位「${current.position}」连续 ${String(run)} 章，超过 ${String(config.max_same_position)}` })
    }
  }
  const peakChapters = peaks.filter(row => row.intensity >= config.peak_intensity).sort((left, right) => left.chapter - right.chapter)
  for (let index = 1; index < peakChapters.length; index += 1) {
    const current = peakChapters[index]
    const previous = peakChapters[index - 1]
    if (current === undefined || previous === undefined || current.chapter < from || current.chapter > to) continue
    const gap = current.chapter - previous.chapter
    if (gap > config.max_peak_gap) findings.push({ severity: 'hint', chapter: current.chapter, category: 'peak-gap', message: `强度不低于 ${String(config.peak_intensity)} 的两章相隔 ${String(gap)} 章，超过 ${String(config.max_peak_gap)}` })
    if (gap > 0 && gap < config.min_peak_gap) findings.push({ severity: 'hint', chapter: current.chapter, category: 'peak-gap', message: `强度不低于 ${String(config.peak_intensity)} 的两章相隔 ${String(gap)} 章，小于 ${String(config.min_peak_gap)}` })
  }
  for (const promise of promises) findings.push(...promiseFindings(project, promise, from, to))
  const applicable = promises.length > 0 || sawPayoff || peakChapters.length > 0 || positions.length > 0
  return { schema: RHYTHM_SCHEMA, from, to, applicable, ok: findings.length === 0, source: config.source, findings }
}

function promiseFindings(project: string, promise: PromiseRow, from: number, to: number): RhythmFinding[] {
  const touches: number[] = []
  for (let chapter = 1; chapter <= to; chapter += 1) {
    const outline = readChapter(project, chapter, true) ?? ''
    const body = readChapter(project, chapter, false) ?? ''
    const haystack = `${outline}\n${body}`
    if (haystack.includes(promise.name) || promise.methods.some(method => method.length >= 2 && haystack.includes(method))) touches.push(chapter)
  }
  const findings: RhythmFinding[] = []
  if (touches.length === 0 && to >= promise.first + promise.interval && to >= from) {
    findings.push({ severity: 'hint', chapter: to, category: 'promise', message: `卖点「${promise.name}」在提醒间隔 ${String(promise.interval)} 章内没有触达` })
    return findings
  }
  const marks = touches
  for (let index = 1; index < marks.length; index += 1) {
    const current = marks[index]
    const previous = marks[index - 1]
    if (current === undefined || previous === undefined || current < from) continue
    if (current - previous > promise.interval) {
      findings.push({ severity: 'hint', chapter: current, category: 'promise', message: `卖点「${promise.name}」距上次触达 ${String(current - previous)} 章，超过提醒间隔 ${String(promise.interval)}` })
    }
  }
  const last = marks.at(-1)
  if (last !== undefined && to - last > promise.interval && to >= from) {
    findings.push({ severity: 'hint', chapter: to, category: 'promise', message: `卖点「${promise.name}」距第 ${String(last)} 章已有 ${String(to - last)} 章，超过提醒间隔 ${String(promise.interval)}` })
  }
  return findings
}

function promiseRows(text: string | undefined): PromiseRow[] {
  if (text === undefined) return []
  const lines = textLines(text)
  const section = sectionRange(lines, '卖点承诺')
  if (section === undefined) return []
  const table = firstTable(lines, section.start, section.end)
  if (table === undefined) return []
  const column = (name: string): number => table.headers.findIndex(header => header.includes(name))
  const name = column('承诺')
  const first = column('首次')
  const due = column('兑现')
  const interval = column('间隔')
  const method = column('触达')
  if (name < 0 || interval < 0) return []
  const rows: PromiseRow[] = []
  for (const row of table.rows) {
    const label = row.cells[name]?.trim() ?? ''
    const gap = firstNumber(row.cells[interval] ?? '')
    const start = firstNumber(row.cells[first] ?? '')
    if (label === '' || gap === undefined || start === undefined) continue
    const methods = (row.cells[method] ?? '').split(/[、，,]/u).map(part => part.trim()).filter(part => part.length >= 2)
    rows.push({ name: label, first: start, due: due < 0 ? undefined : firstNumber(row.cells[due] ?? ''), interval: gap, methods, line: row.line })
  }
  return rows
}

function emotionRows(project: string): { chapter: number; intensity: number }[] {
  const directory = join(project, '大纲')
  if (!existsSync(directory)) return []
  const rows: { chapter: number; intensity: number }[] = []
  for (const name of readdirSync(directory).filter(item => item.startsWith('卷纲') && item.endsWith('.md')).sort((left, right) => left.localeCompare(right, 'zh'))) {
    const text = readOptional(join(directory, name))
    if (text === undefined) continue
    const lines = textLines(text)
    const section = sectionRange(lines, '情绪弧线')
    if (section === undefined) continue
    const table = firstTable(lines, section.start, section.end)
    if (table === undefined) continue
    const chapterColumn = table.headers.findIndex(header => header.includes('章'))
    const intensityColumn = table.headers.findIndex(header => header.includes('强度'))
    if (chapterColumn < 0 || intensityColumn < 0) continue
    for (const row of table.rows) {
      const chapter = firstNumber(row.cells[chapterColumn] ?? '')
      const intensity = firstNumber(row.cells[intensityColumn] ?? '')
      if (chapter === undefined || intensity === undefined) continue
      rows.push({ chapter, intensity })
    }
  }
  return rows
}

export function rhythmConfig(file: WritingCheckFile | undefined): RhythmConfig {
  const value = file?.value.rhythm
  const record = typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    max_no_payoff: numberOr(record.max_no_payoff, DEFAULT_RHYTHM.max_no_payoff),
    min_peak_gap: numberOr(record.min_peak_gap, DEFAULT_RHYTHM.min_peak_gap),
    max_peak_gap: numberOr(record.max_peak_gap, DEFAULT_RHYTHM.max_peak_gap),
    peak_intensity: numberOr(record.peak_intensity, DEFAULT_RHYTHM.peak_intensity),
    max_same_position: numberOr(record.max_same_position, DEFAULT_RHYTHM.max_same_position),
    source: typeof record.source === 'string' && record.source.trim() !== '' ? record.source : DEFAULT_RHYTHM.source,
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback
}

function isEmptyPayoff(value: string): boolean {
  const text = value.trim()
  return text === '' || text === '无' || text === '没有' || text === '空'
}

function firstNumber(value: string): number | undefined {
  const matched = /(\d+)/u.exec(value)
  if (matched?.[1] === undefined) return undefined
  return Number(matched[1])
}

function readChapter(project: string, chapter: number, outline: boolean): string | undefined {
  try {
    const path = findChapterFile(join(project, outline ? '大纲' : '正文'), chapter, { outline, allowMissing: true })
    if (!existsSync(path)) return undefined
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function readOptional(path: string): string | undefined {
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}
