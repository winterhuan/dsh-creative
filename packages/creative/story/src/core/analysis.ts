/**
 * Inspect bounded source ranges and persist verified chapter cards into the
 * workspace analysis library (`拆文库/{title}/章节/`).
 *
 * Port of `tests/reference/analysis_cards.py`. `inspectAnalysis` never writes;
 * `writeAnalysisCards` publishes each valid card independently and only while
 * the source identity captured by the inspection still holds.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'

const PLOT_TYPES = new Set(['转折点', '信息揭示', '冲突', '解决', '铺垫', '行动', '对话', '状态变化'])
const TONES = new Set(['紧张', '轻松', '悲伤', '热血', '爽', '甜', '温馨', '恐怖', '压抑', '其他'])
// Python `str.split()` whitespace: ASCII separators, the C1 NEL and the Unicode space separators.
const PYTHON_WHITESPACE = /[\t\n\v\f\r \x1c-\x1f\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu

/** Expected validation failure of an analysis request. */
export class AnalysisError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnalysisError'
  }
}

type JsonObject = Readonly<Record<string, unknown>>

interface InspectedChapter {
  readonly chapter: number
  readonly title: string
  readonly start_line: number
  readonly end_line: number
  readonly path: string
  readonly exists: boolean
}

/** The inspected source identity and chapter ranges. */
export interface AnalysisInspection {
  readonly source: string
  readonly source_sha256: string
  readonly source_version: readonly string[]
  readonly output_dir: string
  readonly chapters: readonly InspectedChapter[]
  readonly replace: readonly number[]
}

/** The outcome of publishing one batch of cards. */
export interface AnalysisWriteResult {
  readonly written: readonly { readonly chapter: number; readonly path: string; readonly bytes: number }[]
  readonly failed: readonly { readonly chapter: number; readonly path: string; readonly reason: string }[]
  readonly skipped: readonly { readonly chapter: number; readonly path: string; readonly reason: string }[]
}

function version(path: string): string[] {
  const stat = statSync(path, { bigint: true })
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(part => part.toString())
}

function readSource(path: string): { readonly digest: string; readonly version: string[]; readonly lines: string[] } {
  if (!isAbsolute(path) || statSync(path, { throwIfNoEntry: false })?.isFile() !== true) throw new AnalysisError('source must be an absolute path to a file')
  const before = version(path)
  const data = readFileSync(path)
  if (version(path).some((part, index) => part !== before[index])) throw new AnalysisError('source changed while reading; run analysis inspect again')
  // Match native read's LF boundaries; Unicode separators remain inside a line.
  let text = data.toString('utf8')
  if (text.startsWith('﻿')) text = text.slice(1)
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return { digest: createHash('sha256').update(data).digest('hex'), version: before, lines: lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line) }
}

function isRealDirectory(path: string): boolean {
  const info = lstatSync(path, { throwIfNoEntry: false })
  if (info === undefined) return true
  return !info.isSymbolicLink() && info.isDirectory()
}

function outputDirectory(workspace: string, title: unknown): string {
  if (!isAbsolute(workspace) || statSync(workspace, { throwIfNoEntry: false })?.isDirectory() !== true) throw new AnalysisError('workspace must be an absolute directory')
  if (typeof title !== 'string' || title.trim() === '' || title !== title.trim() || title === '.' || title === '..' || /[\\/:\x00]/.test(title)) {
    throw new AnalysisError('title must be a single source title')
  }
  const output = join(realpathSync(workspace), '拆文库', title)
  for (const path of [dirname(output), output, join(output, '章节')]) {
    if (!isRealDirectory(path)) throw new AnalysisError(`analysis output must be a real directory: ${path}`)
  }
  return output
}

function text(value: unknown, name: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim() === '' || Array.from(value.trim()).length > maximum) {
    throw new AnalysisError(`${name} must be nonempty text of at most ${String(maximum)} characters`)
  }
  return value.split(PYTHON_WHITESPACE).filter(part => part !== '').join(' ')
}

function isRegularFileOrMissing(path: string): boolean {
  const info = lstatSync(path, { throwIfNoEntry: false })
  return info === undefined || (!info.isSymbolicLink() && info.isFile())
}

function chapterRanges(document: unknown, lineCount: number, output: string): { readonly chapters: InspectedChapter[]; readonly replace: number[] } {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) throw new AnalysisError('input must be a JSON object')
  const root = document as JsonObject
  const chapters = root.chapters
  if (!Array.isArray(chapters) || chapters.length < 1 || chapters.length > 4) throw new AnalysisError('a batch requires 1 to 4 chapters')
  const result: InspectedChapter[] = []
  const seen = new Set<number>()
  for (const item of chapters as readonly unknown[]) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) throw new AnalysisError('each chapter must provide a number, title and source line range')
    const entry = item as JsonObject
    const [number, start, end] = [entry.chapter, entry.start_line, entry.end_line]
    if (![number, start, end].every(value => typeof value === 'number' && Number.isInteger(value))
      || (number as number) < 1 || !(1 <= (start as number) && (start as number) <= (end as number) && (end as number) <= lineCount)) {
      throw new AnalysisError('chapter numbers and source line ranges must be positive and within the source')
    }
    const chapter = number as number
    const startLine = start as number
    const endLine = end as number
    if (seen.has(chapter) || result.some(previous => startLine <= previous.end_line && endLine >= previous.start_line)) {
      throw new AnalysisError('chapter numbers and source line ranges must not overlap')
    }
    const title = text(entry.title, 'chapter title', 160)
    seen.add(chapter)
    const path = join(output, '章节', `第${String(chapter).padStart(3, '0')}章_摘要.md`)
    if (!isRegularFileOrMissing(path)) throw new AnalysisError(`chapter output must be a regular file: ${path}`)
    result.push({ chapter, title, start_line: startLine, end_line: endLine, path, exists: existsSync(path) })
  }
  const replace = Object.hasOwn(root, 'replace') ? root.replace : []
  if (!Array.isArray(replace) || (replace as readonly unknown[]).some(number => typeof number !== 'number' || !Number.isInteger(number) || !seen.has(number))) {
    throw new AnalysisError('replace must name chapters in this batch')
  }
  return { chapters: result, replace: replace as number[] }
}

/**
 * Return the actual source identity, validated ranges and existing outputs; never writes.
 * @param workspace - the absolute workspace directory.
 * @param title - the source title under `拆文库/`.
 * @param source - the absolute source text path.
 * @param document - the batch selection JSON.
 * @returns the inspection.
 */
export function inspectAnalysis(workspace: string, title: string, source: string, document: unknown): AnalysisInspection {
  const output = outputDirectory(workspace, title)
  const read = readSource(source)
  const { chapters, replace } = chapterRanges(document, read.lines.length, output)
  return { source, source_sha256: read.digest, source_version: read.version, output_dir: output, chapters, replace }
}

function render(card: unknown, chapter: InspectedChapter, lines: readonly string[]): Buffer {
  if (typeof card !== 'object' || card === null || Array.isArray(card) || (card as JsonObject).chapter !== chapter.chapter) throw new AnalysisError('card must identify this chapter')
  const record = card as JsonObject
  const title = text(record.title, 'card title', 160)
  if (title !== chapter.title) throw new AnalysisError('card title differs from the inspected chapter')
  const summary = text(record.summary, 'summary', 300)
  if (Array.from(summary).length < 100) throw new AnalysisError('summary must be 100 to 300 characters')
  const [events, characters, points] = [record.key_events, record.characters, record.turning_points]
  if (!Array.isArray(events) || events.length > 5) throw new AnalysisError('key_events must contain at most 5 actual events')
  if (!Array.isArray(characters) || characters.length > 30) throw new AnalysisError('characters must contain at most 30 appearing people')
  if (!Array.isArray(points) || points.length > 8) throw new AnalysisError('turning_points must contain at most 8 actual anchors')
  const body = [`## 第${String(chapter.chapter)}章 ${title}`, '', `**概要**：${summary}`, '', '**关键事件**：']
  ;(events as readonly unknown[]).forEach((event, index) => body.push(`${String(index + 1)}. ${text(event, 'event', 500)}`))
  if (events.length === 0) body.push('无独立事件。')
  body.push('', '**出场人物**：')
  for (const person of characters as readonly unknown[]) {
    if (typeof person !== 'object' || person === null || !['major', 'supporting', 'minor'].includes(String((person as JsonObject).importance))) {
      throw new AnalysisError('characters must name appearing people and their importance')
    }
    body.push(`- ${text((person as JsonObject).name, 'character name', 80)}（${String((person as JsonObject).importance)}）`)
  }
  if (characters.length === 0) body.push('无出场人物。')
  body.push('', '**转折锚点**：')
  const excerpt = lines.slice(chapter.start_line - 1, chapter.end_line).join('\n')
  ;(points as readonly unknown[]).forEach((point, index) => {
    if (typeof point !== 'object' || point === null || !PLOT_TYPES.has(String((point as JsonObject).type)) || !TONES.has(String((point as JsonObject).tone))) {
      throw new AnalysisError('a turning point requires a plot type and tone')
    }
    const anchor = point as JsonObject
    const locator = text(anchor.locator, 'locator', 500)
    const location = /^L(\d+)(?:-L?(\d+))?$/.exec(locator)
    let located: boolean
    if (location !== null) {
      const first = Number(location[1])
      const last = Number(location[2] ?? location[1])
      located = chapter.start_line <= first && first <= last && last <= chapter.end_line
    } else {
      located = excerpt.includes(String(anchor.locator).trim())
    }
    if (!located) throw new AnalysisError('anchor locator must quote this chapter or name lines within its inspected range')
    body.push(`${String(index + 1)}. **${text(anchor.title, 'anchor title', 15)}**：类型${String(anchor.type)} | `
      + `${text(anchor.event, 'anchor event', 500)} | 基调：${String(anchor.tone)} | 原文定位：${locator}`)
  })
  if (points.length === 0) body.push('无转折锚点。')
  return Buffer.from(`${body.join('\n')}\n`, 'utf8')
}

/**
 * Write each valid card independently; require the inspected source identity and explicit replacements.
 * @param workspace - the absolute workspace directory.
 * @param title - the source title under `拆文库/`.
 * @param source - the absolute source text path.
 * @param document - the cards JSON returned by the batch workflow.
 * @returns written, failed and skipped chapters.
 */
export function writeAnalysisCards(workspace: string, title: string, source: string, document: unknown): AnalysisWriteResult {
  const output = outputDirectory(workspace, title)
  const read = readSource(source)
  const { chapters, replace } = chapterRanges(document, read.lines.length, output)
  const root = document as JsonObject
  const declaredSource = Object.hasOwn(root, 'source') ? root.source : source
  const sameVersion = Array.isArray(root.source_version) && (root.source_version as readonly unknown[]).length === read.version.length
    && (root.source_version as readonly unknown[]).every((part, index) => part === read.version[index])
  if (declaredSource !== source || root.source_sha256 !== read.digest || !sameVersion) throw new AnalysisError('source identity changed or is missing; run analysis inspect again')
  const cards = root.cards
  if (!Array.isArray(cards) || cards.length > 4) throw new AnalysisError('cards must contain at most 4 extracted chapter cards')
  const numbers = (cards as readonly unknown[]).map(card => typeof card === 'object' && card !== null && !Array.isArray(card) ? (card as JsonObject).chapter : null)
  const expected = new Set(chapters.map(chapter => chapter.chapter))
  if (numbers.some(number => typeof number !== 'number' || !Number.isInteger(number) || !expected.has(number)) || new Set(numbers).size !== numbers.length) {
    throw new AnalysisError('cards must identify unique chapters from the inspected batch')
  }
  const byNumber = new Map((cards as readonly unknown[]).map((card, index) => [numbers[index] as number, card]))
  const failed = Object.hasOwn(root, 'failed') ? root.failed : []
  if (!Array.isArray(failed) || (failed as readonly unknown[]).some(item => typeof item !== 'object' || item === null
    || typeof (item as JsonObject).chapter !== 'number' || !Number.isInteger((item as JsonObject).chapter)
    || !expected.has((item as JsonObject).chapter as number) || typeof (item as JsonObject).reason !== 'string')) {
    throw new AnalysisError('failed must list chapter numbers and extraction failure reasons')
  }
  const failures = new Map((failed as readonly JsonObject[]).map(item => [item.chapter as number, item.reason as string]))
  const result: { written: { chapter: number; path: string; bytes: number }[]; failed: { chapter: number; path: string; reason: string }[]; skipped: { chapter: number; path: string; reason: string }[] } = { written: [], failed: [], skipped: [] }
  for (const chapter of [...chapters].sort((a, b) => a.chapter - b.chapter)) {
    const { chapter: number, path } = chapter
    const item = { chapter: number, path }
    let temporary: string | undefined
    try {
      if (existsSync(path) && !replace.includes(number)) {
        result.skipped.push({ ...item, reason: 'existing file is not in replace' })
        continue
      }
      const card = byNumber.get(number)
      if (card === undefined) throw new AnalysisError(failures.get(number) ?? 'no extracted card for this chapter')
      const content = render(card, chapter, read.lines)
      outputDirectory(workspace, title)
      mkdirSync(dirname(path), { recursive: true })
      temporary = join(dirname(path), `.story-card-${process.pid.toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
      const descriptor = openSync(temporary, 'wx', 0o600)
      try {
        writeSync(descriptor, content)
        fsyncSync(descriptor)
      } finally {
        closeSync(descriptor)
      }
      const current = readSource(source)
      if (current.digest !== read.digest || current.version.some((part, index) => part !== read.version[index])) {
        throw new AnalysisError('source changed before publication; run analysis inspect again')
      }
      outputDirectory(workspace, title)
      if (!isRegularFileOrMissing(path)) throw new AnalysisError('chapter output must be a regular file')
      if (replace.includes(number)) renameSync(temporary, path)
      else {
        // Atomic publication refuses a file created since inspection.
        try {
          linkSync(temporary, path)
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
            result.skipped.push({ ...item, reason: 'existing file is not in replace' })
            continue
          }
          throw error
        }
      }
      if (!readFileSync(path).equals(content)) throw new AnalysisError('published card changed before verification')
      result.written.push({ ...item, bytes: content.byteLength })
    } catch (error) {
      if (!(error instanceof AnalysisError) && !(error instanceof Error && 'code' in error)) throw error
      result.failed.push({ ...item, reason: error.message })
    } finally {
      if (temporary !== undefined && existsSync(temporary)) unlinkSync(temporary)
    }
  }
  return result
}
