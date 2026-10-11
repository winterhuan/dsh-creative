/**
 * Export a sharded book into one citable novel text.
 *
 * Port of `tests/reference/export_novel_txt.py`. Adaptation analysis in the other
 * domains reads a single `原著.txt` plus `章节映射.json`, whose zero-based
 * `[start, end)` line spans map every emitted line back to its chapter file,
 * so an analysis span always resolves to a source file and hash. Only the
 * canonical long-form layout is accepted: every `正文/*.md` name opens with
 * `第<arabic>章`, numbers are unique, and each file's first non-empty line
 * opens a chapter heading.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

const CHAPTER_FILE_RE = /^第(\d+)章/
// A short standalone chapter heading, mirroring the novel_index.py contract:
// leading whitespace allowed, then 第 plus a number.
const HEADING_RE = /^[ \t　]*第/
const ARABIC_HEADING_RE = /^[ \t　]*第\s*([0-9]+)/
const MAP_VERSION = 1

/** Expected export failure, reported with the offending file named. */
export class ExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportError'
  }
}

/** What one export produced. */
export interface ExportSummary {
  readonly chapters: number
  readonly lines: number
  readonly novel: string
  readonly map: string
}

function readChapter(path: string): string[] {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    throw new ExportError(`cannot read chapter file: ${basename(path)}`)
  }
  if (text.startsWith('﻿')) text = text.slice(1)
  return text.replaceAll('\r\n', '\n').split('\n')
}

function collectChapters(storyRoot: string): { readonly number: number; readonly path: string }[] {
  const textRoot = join(storyRoot, '正文')
  if (statSync(textRoot, { throwIfNoEntry: false })?.isDirectory() !== true) throw new ExportError(`story workspace has no 正文/ directory: ${storyRoot}`)
  const numbered = new Map<number, string>()
  const unmatched: string[] = []
  const skipped: string[] = []
  for (const name of readdirSync(textRoot).sort()) {
    const path = join(textRoot, name)
    if (statSync(path).isDirectory()) { skipped.push(`${name}/`); continue }
    if (extname(name).toLowerCase() !== '.md') { skipped.push(name); continue }
    // Fullwidth digits fold to ASCII so 手写稿 numbering still matches.
    const match = CHAPTER_FILE_RE.exec(name.normalize('NFKC'))
    if (match === null) { unmatched.push(name); continue }
    const number = Number(match[1])
    const existing = numbered.get(number)
    if (existing !== undefined) throw new ExportError(`duplicate chapter number ${String(number)}: ${basename(existing)} and ${name}`)
    numbered.set(number, path)
  }
  if (unmatched.length > 0) {
    throw new ExportError(`story workspace has non-chapter files that would merge into the wrong span: ${unmatched.join(', ')}; move them aside or rename them to 第NNN章`)
  }
  if (skipped.length > 0) {
    throw new ExportError(`story workspace has non-text entries the export would silently drop, breaking coverage: ${skipped.join(', ')}`)
  }
  return [...numbered.keys()].sort((a, b) => a - b).map(number => ({ number, path: numbered.get(number) ?? '' }))
}

/**
 * Write `原著.txt` and `章节映射.json` for a book.
 * @param storyRoot - the book directory holding `正文/`.
 * @param outDir - the export destination.
 * @returns the chapter and line counts with both output paths.
 * @throws ExportError for a layout the indexer could misread.
 */
export function exportNovel(storyRoot: string, outDir: string): ExportSummary {
  const chapters = collectChapters(storyRoot)
  if (chapters.length === 0) throw new ExportError(`story workspace has no numbered chapters: ${storyRoot}`)
  const emitted: string[] = []
  const records: Record<string, unknown>[] = []
  chapters.forEach(({ number, path }, index) => {
    const position = index + 1
    const lines = readChapter(path)
    const first = lines.find(line => line.trim() !== '') ?? ''
    if (!HEADING_RE.test(first)) throw new ExportError(`${basename(path)} does not open with a chapter heading; the indexer would merge it into the previous chapter`)
    const arabic = ARABIC_HEADING_RE.exec(first)
    if (arabic !== null && Number(arabic[1]) !== number) throw new ExportError(`${basename(path)} opens with a different chapter number; rename the file or fix the heading`)
    const block = `${lines.join('\n').replace(/\n+$/, '')}\n`
    const start = emitted.length
    emitted.push(...block.split('\n').slice(0, -1))
    const end = emitted.length
    if (position < chapters.length) emitted.push('')
    records.push({
      index: position,
      number,
      title: basename(path, extname(path)),
      file: `正文/${basename(path)}`,
      start_line: start,
      end_line: end,
      sha256: createHash('sha256').update(block, 'utf8').digest('hex'),
    })
  })
  const novelText = `${emitted.join('\n')}\n`
  const mapping = { map_version: MAP_VERSION, line_unit: 'zero_based_end_exclusive', novel_file: '原著.txt', chapters: records }
  mkdirSync(outDir, { recursive: true })
  const novelPath = join(outDir, '原著.txt')
  const mapPath = join(outDir, '章节映射.json')
  for (const [target, content] of [[novelPath, novelText], [mapPath, `${JSON.stringify(mapping, null, 2)}\n`]] as const) {
    const temporary = `${target}.tmp`
    writeFileSync(temporary, content, 'utf8')
    renameSync(temporary, target)
  }
  return { chapters: records.length, lines: emitted.length, novel: novelPath, map: mapPath }
}
