/**
 * Read-only lookup over a book's `设定/` Markdown.
 *
 * Exact file names, first-level titles and declared aliases win. Other hits are
 * ranked with Okapi BM25 over a dictionary plus character bigrams and trigrams,
 * so Chinese text matches without spaces. Nothing here writes, and the tracking
 * state is not read.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

/** Invalid lookup input or a library that changed while it was read. */
export class SettingsLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettingsLookupError'
  }
}

/** Schema of {@link lookupSettings} results. */
export const LOOKUP_SCHEMA = 'story-project-lookup/v1'
/** Largest encoded lookup result, including the trailing newline the CLI writes. */
export const LOOKUP_MAX_BYTES = 16_384
/** Default page size. */
export const LOOKUP_DEFAULT_LIMIT = 8
/** Largest accepted `--limit`. */
export const LOOKUP_MAX_LIMIT = 20
/** Default excerpt length in characters. */
export const LOOKUP_EXCERPT_MAX_CHARS = 600
/** Lines kept in one excerpt. */
export const LOOKUP_EXCERPT_MAX_LINES = 12
/** Excerpts `project context` keeps before the rest are omitted. */
export const CONTEXT_SETTINGS_LIMIT = 4
/** Shorter excerpt used inside the shared context budget. */
export const CONTEXT_SETTINGS_EXCERPT_CHARS = 320
/** Largest query text. */
const QUERY_MAX_BYTES = 256 * 1024
/** Bytes indexed from one oversized Markdown file. */
const FILE_MAX_BYTES = 512 * 1024
/** Alias declarations are read only from the file head. */
const HEADER_LINE_LIMIT = 40
/** Aliases kept per file. */
const ALIAS_LIMIT = 12
/** Query terms that participate in BM25, rarest first. */
const QUERY_TERM_LIMIT = 32
const BM25_K1 = 1.2
const BM25_B = 0.75
/** Two-character section labels that occur in ordinary outlines. They stay searchable through distinctive body terms. */
const GENERIC_TERMS = new Set([
  '关系', '文风', '设定', '角色', '题材', '势力', '大纲', '正文', '章节', '细纲', '内容', '人物', '故事', '情节',
])
/** Function bigrams. They are not index terms. */
const FUNCTION_BIGRAMS = new Set([
  '一个', '这个', '那个', '什么', '我们', '他们', '自己', '已经', '可以', '不是', '没有', '因为', '所以',
  '如果', '但是', '然后', '还是', '就是', '不会', '不能', '只是', '以及', '或者', '并且', '的人', '了一',
])

/** How a document was selected. */
export type LookupMatch = 'exact' | 'alias' | 'keyword'

/** One setting excerpt. `source` is project-relative. */
export interface LookupHit {
  readonly source: string
  readonly title: string
  readonly match: LookupMatch
  readonly matched: readonly string[]
  readonly score: number
  readonly line_start: number
  readonly line_end: number
  readonly excerpt: string
  readonly ambiguous?: boolean
  readonly file_truncated?: boolean
}

/** Options of {@link lookupSettings}. */
export interface LookupOptions {
  readonly offset?: number
  readonly limit?: number
  /** Previous `index_sha256`. A different library refuses the page. */
  readonly expectedIndex?: string
  /** Excerpt character cap. Defaults to {@link LOOKUP_EXCERPT_MAX_CHARS}. */
  readonly excerptChars?: number
}

/** One page of setting excerpts. */
export interface LookupResult {
  readonly schema: typeof LOOKUP_SCHEMA
  readonly source: '设定/'
  readonly book: string
  readonly settings_present: boolean
  readonly indexed_files: number
  readonly index_sha256: string
  readonly query_chars: number
  readonly total: number
  readonly offset: number
  readonly limit: number
  readonly items: readonly LookupHit[]
  readonly omitted: number
  readonly next_offset: number | null
  readonly unreadable: readonly string[]
}

interface Owner {
  path: string
  kind: 'exact' | 'alias'
}

interface Prepared {
  readonly source: string
  readonly title: string
  readonly exact: readonly string[]
  readonly aliases: readonly string[]
  readonly text: string
  readonly body: string
  readonly truncated: boolean
  readonly bytes: Buffer
}

interface IndexedDoc extends Prepared {
  readonly tokens: readonly string[]
  readonly tf: ReadonlyMap<string, number>
}

/** Resolve symlinks as far as the path exists. */
function looseRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(looseRealpath(parent), basename(path))
  }
}

function contained(root: string, path: string): boolean {
  const resolved = looseRealpath(path)
  return resolved === root || resolved.startsWith(root + sep)
}

function posixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

function encoded(value: unknown): number {
  return Buffer.byteLength(`${JSON.stringify(value)}\n`, 'utf8')
}

function requireLookup(condition: boolean, message: string): asserts condition {
  if (!condition) throw new SettingsLookupError(message)
}

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return trimmed
  const first = trimmed[0]
  const last = trimmed[trimmed.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1).trim()
  return trimmed
}

function splitAliasList(value: string): string[] {
  return value.split(/[、,，;；\s]+/u).map(part => stripQuotes(part)).filter(part => part !== '')
}

function parseFrontMatterAliases(yaml: string): string[] {
  const found: string[] = []
  let collecting = false
  for (const line of yaml.split(/\r?\n/u)) {
    if (line.trim() === '' || /^\s*#/u.test(line)) {
      if (line.trim() === '') collecting = false
      continue
    }
    const key = /^(?:aliases|别名)\s*:\s*(.*)$/u.exec(line)
    if (key) {
      collecting = false
      const rest = (key[1] ?? '').trim()
      if (rest === '') {
        collecting = true
        continue
      }
      const inline = rest.startsWith('[') ? rest.replace(/^\[/u, '').replace(/\]$/u, '') : rest
      found.push(...splitAliasList(inline))
      continue
    }
    if (!collecting) continue
    const item = /^\s*-\s*(.*)$/u.exec(line)
    if (item?.[1] === undefined) {
      collecting = false
      continue
    }
    found.push(...splitAliasList(item[1]))
  }
  return found
}

function splitFrontMatter(text: string): { body: string; aliases: string[]; startLine: number } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(text)
  if (match === null || match.index !== 0) return { body: text, aliases: [], startLine: 1 }
  return {
    body: text.slice(match[0].length),
    aliases: parseFrontMatterAliases(match[1] ?? ''),
    startLine: match[0].split(/\r?\n/u).length,
  }
}

function headerAliases(body: string, startLine: number): string[] {
  const found: string[] = []
  const lines = body.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    if (startLine + index > HEADER_LINE_LIMIT) break
    const line = lines[index] ?? ''
    if (/^#{2,}\s/u.test(line)) break
    const alias = /^别名\s*[:：]\s*(.*)$/u.exec(line.trim())
    if (alias?.[1]) found.push(...splitAliasList(alias[1]))
  }
  return found
}

function usableForm(form: string): boolean {
  const trimmed = form.trim()
  return trimmed.length >= 2 && trimmed.length <= 80 && /[\p{L}\p{N}]/u.test(trimmed) && !GENERIC_TERMS.has(trimmed)
}

function takeAliases(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const alias = value.trim()
    if (!usableForm(alias) || seen.has(alias)) continue
    seen.add(alias)
    result.push(alias)
    if (result.length === ALIAS_LIMIT) break
  }
  return result
}

function headingTitle(text: string, fallback: string): { title: string; forms: string[] } {
  const match = /^#\s+(.+)$/mu.exec(text)
  const raw = match?.[1]?.replace(/\s+#+\s*$/u, '').trim() ?? ''
  const title = (raw === '' ? fallback : raw).slice(0, 80)
  const forms: string[] = []
  if (usableForm(title)) forms.push(title)
  const segment = title.split(/[|｜]/u)[0]?.trim() ?? ''
  if (segment !== title && usableForm(segment)) forms.push(segment)
  if (usableForm(fallback)) forms.push(fallback)
  return { title, forms }
}

function headingRuns(text: string): string[] {
  const runs: string[] = []
  for (const line of text.split(/\r?\n/u)) {
    if (!/^#{1,6}\s/u.test(line)) continue
    for (const run of line.match(/[\u3400-\u9fff]{2,8}/gu) ?? []) {
      if (usableForm(run)) runs.push(run)
    }
  }
  return runs
}

function readText(path: string, size: number): { text: string; bytes: Buffer; truncated: boolean } {
  if (size <= FILE_MAX_BYTES) {
    const bytes = readFileSync(path)
    return { text: bytes.toString('utf8'), bytes, truncated: false }
  }
  const handle = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(FILE_MAX_BYTES)
    const read = readSync(handle, buffer, 0, FILE_MAX_BYTES, 0)
    const bytes = utf8Prefix(buffer, read)
    return { text: bytes.toString('utf8'), bytes, truncated: true }
  } finally {
    closeSync(handle)
  }
}

/** Drop a trailing partial UTF-8 sequence without removing a character that ended exactly at the cap. */
function utf8Prefix(buffer: Buffer, read: number): Buffer {
  let end = read
  if (end === 0 || (buffer[end - 1] ?? 0) < 0x80) return buffer.subarray(0, end)
  let start = end - 1
  while (start > 0 && (buffer[start] ?? 0) >= 0x80 && (buffer[start] ?? 0) < 0xc0) start -= 1
  const lead = buffer[start] ?? 0
  const expected = lead >= 0xf0 && lead < 0xf8 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 0
  if (expected === 0 || start + expected > end) end = start
  return buffer.subarray(0, end)
}

function collectFiles(project: string): { files: string[]; unreadable: string[] } {
  const root = looseRealpath(project)
  const settings = join(project, '设定')
  if (!existsSync(settings)) return { files: [], unreadable: [] }
  requireLookup(statSync(settings).isDirectory(), '设定 is not a directory')
  const files: string[] = []
  const unreadable: string[] = []
  const seen = new Set<string>()
  const walk = (directory: string): void => {
    const real = looseRealpath(directory)
    if (seen.has(real)) return
    seen.add(real)
    requireLookup(contained(root, directory), `source leaves selected project: ${posixRelative(project, directory)}`)
    for (const name of readdirSync(directory).sort()) {
      if (name.startsWith('.')) continue
      const path = join(directory, name)
      requireLookup(contained(root, path), `source leaves selected project: ${posixRelative(project, path)}`)
      const info = statSync(path)
      if (info.isDirectory()) walk(path)
      else if (info.isFile() && name.endsWith('.md')) files.push(path)
    }
  }
  walk(settings)
  requireLookup(files.length <= 2000, 'settings library exceeds 2000 markdown files')
  return { files, unreadable }
}

function prepare(project: string, path: string, unreadable: string[]): Prepared | undefined {
  const source = posixRelative(project, path)
  try {
    const info = statSync(path)
    const loaded = readText(path, info.size)
    const stem = basename(path, '.md')
    const matter = splitFrontMatter(loaded.text)
    const aliases = takeAliases([...matter.aliases, ...headerAliases(matter.body, matter.startLine)])
    const titled = headingTitle(matter.body, stem)
    return {
      source, title: titled.title, exact: titled.forms, aliases, text: loaded.text, body: matter.body,
      truncated: loaded.truncated, bytes: loaded.bytes,
    }
  } catch (error) {
    // One unreadable Markdown file stays out of the index. The path is reported and lookup continues.
    if (error instanceof SettingsLookupError) throw error
    unreadable.push(source)
    return undefined
  }
}

function emitNgrams(chunk: string, tokens: string[]): void {
  if (chunk.length < 2) return
  for (let size = 2; size <= 3 && size <= chunk.length; size += 1) {
    for (let index = 0; index + size <= chunk.length; index += 1) {
      const token = chunk.slice(index, index + size)
      if (!FUNCTION_BIGRAMS.has(token) && !GENERIC_TERMS.has(token)) tokens.push(token)
    }
  }
}

function tokenize(text: string, dictionary: readonly string[]): string[] {
  const tokens: string[] = []
  const occupied = new Uint8Array(text.length)
  const forms = [...dictionary].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
  for (const form of forms) {
    let from = 0
    while (from <= text.length - form.length) {
      const index = text.indexOf(form, from)
      if (index < 0) break
      let blocked = false
      for (let cursor = index; cursor < index + form.length; cursor += 1) {
        if (occupied[cursor] === 1) { blocked = true; break }
      }
      if (blocked) {
        from = index + 1
        continue
      }
      tokens.push(form)
      for (let cursor = index; cursor < index + form.length; cursor += 1) occupied[cursor] = 1
      from = index + form.length
    }
  }
  let chunk = ''
  let word = ''
  const flushChunk = (): void => {
    if (chunk !== '') emitNgrams(chunk, tokens)
    chunk = ''
  }
  const flushWord = (): void => {
    if (word.length >= 2) tokens.push(word.toLowerCase())
    word = ''
  }
  for (let index = 0; index < text.length; index += 1) {
    if (occupied[index] === 1) {
      flushChunk()
      flushWord()
      continue
    }
    const character = text[index] ?? ''
    if (/[\u3400-\u9fff]/u.test(character)) {
      flushWord()
      chunk += character
      continue
    }
    flushChunk()
    if (/[A-Za-z0-9]/u.test(character)) word += character
    else flushWord()
  }
  flushChunk()
  flushWord()
  return tokens
}

function frequencies(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
  return counts
}

function lineOf(text: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

function clipLine(line: string, focus: string, maxChars: number): string {
  if (line.length <= maxChars) return line
  const at = focus === '' ? 0 : line.indexOf(focus)
  const start = at < 0 ? 0 : Math.max(0, at - Math.floor(maxChars / 4))
  return line.slice(start, start + maxChars)
}

function excerptAt(text: string, focusLine: number, focus: string, maxChars: number): { line_start: number; line_end: number; excerpt: string } {
  const lines = text.split(/\r?\n/u)
  const last = Math.max(lines.length, 1)
  const focusIndex = Math.min(Math.max(focusLine, 1), last)
  const focusText = clipLine(lines[focusIndex - 1] ?? '', focus, maxChars)
  const parts: { line: number; text: string }[] = [{ line: focusIndex, text: focusText }]
  let chars = focusText.length
  let heading = 0
  for (let line = focusIndex - 1; line >= Math.max(1, focusIndex - LOOKUP_EXCERPT_MAX_LINES + 1); line -= 1) {
    if (/^#{1,6}\s/u.test(lines[line - 1] ?? '')) { heading = line; break }
  }
  if (heading > 0) {
    const head = lines[heading - 1] ?? ''
    const between: { line: number; text: string }[] = []
    let extra = head.length + 1
    let fits = chars + extra <= maxChars && between.length + 2 <= LOOKUP_EXCERPT_MAX_LINES
    for (let line = heading + 1; fits && line < focusIndex; line += 1) {
      const row = lines[line - 1] ?? ''
      if (between.length + 2 > LOOKUP_EXCERPT_MAX_LINES || chars + extra + row.length + 1 > maxChars) fits = false
      else {
        between.push({ line, text: row })
        extra += row.length + 1
      }
    }
    if (fits) {
      parts.unshift(...between)
      parts.unshift({ line: heading, text: head })
      chars += extra
    }
  }
  for (let line = focusIndex + 1; line <= last && parts.length < LOOKUP_EXCERPT_MAX_LINES; line += 1) {
    const row = lines[line - 1] ?? ''
    if (chars + row.length + 1 > maxChars) break
    parts.push({ line, text: row })
    chars += row.length + 1
  }
  return {
    line_start: parts[0]?.line ?? focusIndex,
    line_end: parts[parts.length - 1]?.line ?? focusIndex,
    excerpt: parts.map(part => part.text).join('\n'),
  }
}

function addOwner(surfaces: Map<string, Owner[]>, form: string, owner: Owner): void {
  if (!usableForm(form)) return
  const owners = surfaces.get(form) ?? []
  const existing = owners.find(item => item.path === owner.path)
  if (existing) {
    if (owner.kind === 'exact') existing.kind = 'exact'
  } else {
    owners.push({ ...owner })
    surfaces.set(form, owners)
  }
}

interface Ranked {
  readonly doc: IndexedDoc
  readonly match: LookupMatch
  readonly matched: readonly string[]
  readonly score: number
  readonly first: number
  readonly ambiguous: boolean
  readonly focusLine: number
  readonly focus: string
}

function rank(docs: readonly IndexedDoc[], text: string): Ranked[] {
  const surfaces = new Map<string, Owner[]>()
  const dictionary = new Set<string>()
  for (const doc of docs) {
    for (const form of doc.exact) addOwner(surfaces, form, { path: doc.source, kind: 'exact' })
    for (const form of doc.aliases) addOwner(surfaces, form, { path: doc.source, kind: 'alias' })
    for (const form of [...doc.exact, ...doc.aliases, ...headingRuns(doc.text)]) {
      if (usableForm(form)) dictionary.add(form)
    }
  }
  const dictionaryList = [...dictionary]
  const indexed = docs.map(doc => {
    const tokens = tokenize(doc.body, dictionaryList)
    return { ...doc, tokens, tf: frequencies(tokens) }
  })
  const occupied = new Uint8Array(text.length)
  const seenForms = new Map<string, number>()
  const forms = [...surfaces.keys()].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
  for (const form of forms) {
    let from = 0
    while (from <= text.length - form.length) {
      const index = text.indexOf(form, from)
      if (index < 0) break
      let blocked = false
      for (let cursor = index; cursor < index + form.length; cursor += 1) {
        if (occupied[cursor] === 1) { blocked = true; break }
      }
      if (blocked) {
        from = index + 1
        continue
      }
      if (!seenForms.has(form)) seenForms.set(form, index)
      for (let cursor = index; cursor < index + form.length; cursor += 1) occupied[cursor] = 1
      from = index + form.length
    }
  }
  const byPath = new Map<string, { match: LookupMatch; matched: { form: string; index: number }[]; first: number; ambiguous: boolean }>()
  for (const [form, index] of seenForms) {
    const owners = surfaces.get(form) ?? []
    const ambiguous = owners.length > 1
    for (const owner of owners) {
      const current = byPath.get(owner.path)
      const kind = owner.kind
      if (current === undefined) {
        byPath.set(owner.path, { match: kind, matched: [{ form, index }], first: index, ambiguous })
        continue
      }
      if (index < current.first) current.first = index
      if (!current.matched.some(item => item.form === form)) current.matched.push({ form, index })
      if (ambiguous) current.ambiguous = true
      if (current.match !== 'exact' && kind === 'exact') current.match = 'exact'
    }
  }
  const documentFrequency = new Map<string, number>()
  for (const doc of indexed) {
    for (const term of new Set(doc.tokens)) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
  }
  const docCount = indexed.length
  const averageLength = indexed.reduce((sum, doc) => sum + doc.tokens.length, 0) / Math.max(docCount, 1) || 1
  const weight = (term: string): number => {
    const documents = documentFrequency.get(term) ?? 0
    if (documents === 0) return 0
    return Math.log(1 + (docCount - documents + 0.5) / (documents + 0.5))
  }
  const queryTerms = [...new Set(tokenize(text, dictionaryList))]
    .map(term => ({ term, idf: weight(term) }))
    .filter(item => item.idf > 0)
    .sort((a, b) => b.idf - a.idf || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0))
    .slice(0, QUERY_TERM_LIMIT)
  const rareLimit = Math.max(1, Math.floor(docCount * 0.34))
  const ranked: Ranked[] = []
  for (const doc of indexed) {
    const linked = byPath.get(doc.source)
    if (linked !== undefined) {
      const ordered = [...linked.matched].sort((a, b) => a.index - b.index).slice(0, 8)
      const focus = ordered[0]?.form ?? ''
      const at = focus === '' ? -1 : doc.text.indexOf(focus)
      ranked.push({
        doc, match: linked.match, matched: ordered.map(item => item.form), score: ordered.length,
        first: linked.first, ambiguous: linked.ambiguous, focusLine: at < 0 ? 1 : lineOf(doc.text, at), focus,
      })
      continue
    }
    let score = 0
    const hits: { term: string; idf: number; df: number }[] = []
    const length = doc.tokens.length || 1
    for (const item of queryTerms) {
      const freq = doc.tf.get(item.term) ?? 0
      if (freq === 0) continue
      const denominator = freq + BM25_K1 * (1 - BM25_B + BM25_B * length / averageLength)
      score += item.idf * (freq * (BM25_K1 + 1)) / denominator
      hits.push({ term: item.term, idf: item.idf, df: documentFrequency.get(item.term) ?? 0 })
    }
    if (score < 0.2 || !hits.some(hit => hit.term.length >= 3 || hit.df <= rareLimit)) continue
    const shown = [...hits].sort((a, b) => b.term.length - a.term.length || b.idf - a.idf).slice(0, 6)
    let focusLine = 1
    let best = -1
    const lines = doc.text.split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? ''
      const lineScore = hits.reduce((sum, hit) => sum + (line.includes(hit.term) ? hit.idf : 0), 0)
      if (lineScore > best) { best = lineScore; focusLine = index + 1 }
    }
    ranked.push({
      doc, match: 'keyword', matched: shown.map(hit => hit.term), score: Math.round(score * 1000) / 1000,
      first: Number.MAX_SAFE_INTEGER, ambiguous: false, focusLine, focus: shown[0]?.term ?? '',
    })
  }
  ranked.sort((a, b) => {
    const tier = (match: LookupMatch): number => match === 'exact' ? 0 : match === 'alias' ? 1 : 2
    return tier(a.match) - tier(b.match)
      || (a.match === 'keyword' ? b.score - a.score : a.first - b.first)
      || (a.doc.source < b.doc.source ? -1 : a.doc.source > b.doc.source ? 1 : 0)
  })
  return ranked
}

function fingerprint(docs: readonly Prepared[], unreadable: readonly string[]): string {
  const hash = createHash('sha256')
  for (const doc of docs) {
    hash.update(doc.source)
    hash.update('\0')
    hash.update(doc.truncated ? '1' : '0')
    hash.update('\0')
    hash.update(doc.bytes)
    hash.update('\0')
  }
  for (const path of unreadable) {
    hash.update('unreadable\0')
    hash.update(path)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function loadLibrary(project: string): { docs: Prepared[]; unreadable: string[]; index: string } {
  const collected = collectFiles(project)
  const docs: Prepared[] = []
  for (const path of collected.files) {
    const doc = prepare(project, path, collected.unreadable)
    if (doc !== undefined) docs.push(doc)
  }
  docs.sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : 0)
  collected.unreadable.sort()
  return { docs, unreadable: collected.unreadable, index: fingerprint(docs, collected.unreadable) }
}

function libraryResult(project: string, text: string, offset: number, limit: number, loaded: { docs: readonly Prepared[]; unreadable: readonly string[]; index: string }): LookupResult {
  return {
    schema: LOOKUP_SCHEMA, source: '设定/', book: basename(project), settings_present: loaded.docs.length > 0,
    indexed_files: loaded.docs.length, index_sha256: loaded.index, query_chars: [...text].length, total: 0, offset, limit,
    items: [], omitted: 0, next_offset: null, unreadable: loaded.unreadable,
  }
}

/**
 * Find setting excerpts for one outline or draft.
 * @param project - the book directory.
 * @param text - the outline or draft text. An empty string matches nothing.
 * @param options - pagination, the previous index hash, and the excerpt cap.
 * @returns one page within {@link LOOKUP_MAX_BYTES}. `omitted` counts every match not on this page.
 * @throws SettingsLookupError for a missing project, an escaped path, a changed library, or a single excerpt over the byte budget.
 */
export function lookupSettings(project: string, text: string, options: LookupOptions = {}): LookupResult {
  requireLookup(statSync(project, { throwIfNoEntry: false })?.isDirectory() === true, 'project directory does not exist')
  const offset = options.offset ?? 0
  const limit = options.limit ?? LOOKUP_DEFAULT_LIMIT
  requireLookup(offset >= 0 && limit >= 1 && limit <= LOOKUP_MAX_LIMIT, `offset must be nonnegative and limit must be 1..${String(LOOKUP_MAX_LIMIT)}`)
  requireLookup(Buffer.byteLength(text, 'utf8') <= QUERY_MAX_BYTES, 'lookup query exceeds 256 KiB; pass a chapter outline or draft')
  const excerptChars = Math.min(LOOKUP_EXCERPT_MAX_CHARS, Math.max(80, options.excerptChars ?? LOOKUP_EXCERPT_MAX_CHARS))
  const loaded = loadLibrary(project)
  requireLookup(options.expectedIndex === undefined || options.expectedIndex === loaded.index, 'settings changed; restart the lookup from offset 0')
  const query = text.trim()
  if (loaded.docs.length === 0 || query === '') {
    const again = loadLibrary(project)
    requireLookup(again.index === loaded.index, 'settings changed during lookup; retry')
    return libraryResult(project, text, offset, limit, loaded)
  }
  const indexed: IndexedDoc[] = loaded.docs.map(doc => ({ ...doc, tokens: [], tf: new Map() }))
  const ranked = rank(indexed, query)
  const hits = ranked.map((item): LookupHit => {
    const window = excerptAt(item.doc.text, item.focusLine, item.focus, excerptChars)
    return {
      source: item.doc.source,
      title: item.doc.title,
      match: item.match,
      matched: item.matched,
      score: item.score,
      line_start: window.line_start,
      line_end: window.line_end,
      excerpt: window.excerpt,
      ...(item.ambiguous ? { ambiguous: true } : {}),
      ...(item.doc.truncated ? { file_truncated: true } : {}),
    }
  })
  const result: LookupResult = {
    schema: LOOKUP_SCHEMA,
    source: '设定/',
    book: basename(project),
    settings_present: true,
    indexed_files: loaded.docs.length,
    index_sha256: loaded.index,
    query_chars: [...text].length,
    total: hits.length,
    offset,
    limit,
    items: [],
    omitted: hits.length,
    next_offset: null,
    unreadable: loaded.unreadable,
  }
  const items: LookupHit[] = []
  for (const hit of hits.slice(offset, offset + limit)) {
    items.push(hit)
    const page = { ...result, items, omitted: hits.length - items.length, next_offset: offset + items.length < hits.length ? offset + items.length : null }
    if (encoded(page) > LOOKUP_MAX_BYTES) {
      items.pop()
      requireLookup(items.length > 0, 'one result exceeds lookup byte budget; read its source directly')
      break
    }
  }
  const page = {
    ...result,
    items,
    omitted: hits.length - items.length,
    next_offset: offset + items.length < hits.length ? offset + items.length : null,
  }
  requireLookup(encoded(page) <= LOOKUP_MAX_BYTES, 'lookup exceeds byte budget; narrow its scope')
  const again = loadLibrary(project)
  requireLookup(again.index === loaded.index, 'settings changed during lookup; retry')
  return page
}
