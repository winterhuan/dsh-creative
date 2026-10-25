/**
 * Sidecar fact ledger at `追踪/事实账本.json`.
 *
 * Entries stay in this sidecar. Tracking schema 6 stores only a summary link.
 * Each book entry keeps the body hash of the chapter that introduced it.
 * A reference entry keeps the hash of its source file. A later change appends
 * a `changes` row and leaves the original attributes in place. Reads are
 * lock-free. `recordFacts` uses the same tracking write lock as a chapter commit.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { findChapterFile } from './wordcount.ts'
import { atomicWriteText, jsonPayload, loadState, statePath, trackingRoot, withProjectWriteLock } from './tracking/store.ts'
import { factsDiffMode } from './writing-check.ts'

/** Schema of the ledger file and of {@link recordFacts} results. */
export const FACTS_SCHEMA = 'story-facts/v1'
/** Kinds a ledger entry may use. */
export const FACT_KINDS = ['场地', '伤情', '账目', '物件', '能力', '年代', '指令', '对标'] as const
/** Largest `facts` section inside `project context`, before the shared 16 KiB trim. */
export const FACTS_CONTEXT_MAX_BYTES = 2048
/** Book-relative ledger path. */
export const FACTS_RELATIVE = '追踪/事实账本.json'

const SHA256_RE = /^[0-9a-f]{64}$/u
const HEALED = new Set(['已愈', '痊愈', '愈合'])

/** A fact ledger file is missing, unreadable, or inconsistent with the chapter it names. */
export class FactsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FactsError'
  }
}

/** One of {@link FACT_KINDS}. */
export type FactKind = typeof FACT_KINDS[number]

/** Body identity stored on an entry or a change. */
export interface FactSource {
  readonly chapter: number
  readonly line?: number
  readonly body_sha256: string
  /** `reference` is an explicit benchmark excerpt. Absence means a book fact. */
  readonly origin?: 'book' | 'reference'
  /** Workspace-relative path of the benchmark file. Set only when `origin` is `reference`. */
  readonly reference_path?: string
}

/** An appended correction. `attrs` is the full effective set after this change. */
export interface FactChange {
  readonly chapter: number
  readonly reason: string
  readonly attrs?: Readonly<Record<string, string | number>>
  readonly source?: FactSource
}

/** One ledger row. `attrs` is the original set; later values live in `changes`. */
export interface FactEntry {
  readonly id: string
  readonly kind: FactKind
  readonly subject?: string
  readonly attrs: Readonly<Record<string, string | number>>
  readonly since: number
  readonly source: FactSource
  readonly changes: readonly FactChange[]
}

/** The on-disk ledger. */
export interface FactsLedger {
  readonly schema: typeof FACTS_SCHEMA
  readonly entries: readonly FactEntry[]
  readonly covered_chapters: readonly number[]
}

/** One row {@link buildContext} may attach. */
export interface FactView {
  readonly id: string
  readonly kind: FactKind
  readonly subject?: string
  readonly since: number
  readonly attrs: Readonly<Record<string, string | number>>
  readonly stale: boolean
}

/** A claim that disagrees with the effective ledger value and has no change for this chapter. */
export interface FactConflict {
  readonly id: string
  readonly attr: string
  readonly ledger: string | number | null
  readonly claim: string | number
  readonly message: string
}

interface MutableLedger {
  schema: typeof FACTS_SCHEMA
  entries: FactEntry[]
  covered_chapters: number[]
}

/**
 * Absolute path of the ledger.
 * @param project - the book directory.
 */
export function factsPath(project: string): string {
  return join(trackingRoot(project), '事实账本.json')
}

/**
 * Book-relative claims path used when `facts_diff` is `required`.
 * @param chapter - the 1-based chapter number.
 */
export function claimsRelativePath(chapter: number): string {
  const width = Math.max(3, String(chapter).length)
  return `草稿/事实/第${String(chapter).padStart(width, '0')}章.claims.json`
}

/**
 * Attributes after every appended change.
 * @param entry - one ledger row.
 */
export function effectiveAttrs(entry: FactEntry): Record<string, string | number> {
  const attrs: Record<string, string | number> = { ...entry.attrs }
  for (const change of entry.changes) {
    if (change.attrs === undefined) continue
    for (const [key, value] of Object.entries(change.attrs)) attrs[key] = value
  }
  return attrs
}

/**
 * Read the ledger. A missing file is an empty ledger and does not create one.
 * @param project - the book directory.
 * @throws FactsError when the file exists but is not a `story-facts/v1` ledger.
 */
export function loadFacts(project: string): FactsLedger & { readonly present: boolean } {
  const path = factsPath(project)
  if (!existsSync(path)) return { schema: FACTS_SCHEMA, entries: [], covered_chapters: [], present: false }
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new FactsError(`unable to read fact ledger: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { ...normalizeLedger(value), present: true }
}

/**
 * Append facts for one committed chapter.
 * @param project - the book directory.
 * @param chapter - the committed chapter.
 * @param input - `{ entries: [...] }`. An empty list still marks the chapter covered.
 * @throws FactsError when the chapter is uncommitted, the body hash disagrees with the wordcount record, or an entry is invalid.
 */
export function recordFacts(project: string, chapter: number, input: unknown, options: { readonly allowReference?: boolean } = {}): { schema: typeof FACTS_SCHEMA; chapter: number; added: number; changed: number; covered_chapters: readonly number[]; skipped_reference: number } {
  const rows = inputEntries(input)
  const allowReference = options.allowReference === true
  return withProjectWriteLock(project, () => {
    const bookRows = rows.filter(row => row.origin !== 'reference')
    const referenceRows = rows.filter(row => row.origin === 'reference')
    if (referenceRows.length > 0 && !allowReference) {
      // Explicit `lookup --record` or `facts record --allow-reference` is the only writer.
    }
    const accepted = allowReference ? rows : bookRows
    if (accepted.length === 0 && rows.length > 0) {
      const existing = loadFacts(project)
      return { schema: FACTS_SCHEMA, chapter, added: 0, changed: 0, covered_chapters: existing.covered_chapters, skipped_reference: referenceRows.length }
    }
    const hash = bookRows.length > 0 || rows.length === 0 ? committedBodyHash(project, chapter) : ''
    const ledger = mutableLedger(loadFacts(project))
    let added = 0
    let changed = 0
    for (const row of accepted) {
      const outcome = applyEntry(project, ledger, row, chapter, hash)
      if (outcome === 'added') added += 1
      if (outcome === 'changed') changed += 1
    }
    if (bookRows.length > 0 || rows.length === 0) {
      if (!ledger.covered_chapters.includes(chapter)) ledger.covered_chapters.push(chapter)
      ledger.covered_chapters.sort((left, right) => left - right)
    }
    writeLedger(project, ledger)
    return { schema: FACTS_SCHEMA, chapter, added, changed, covered_chapters: ledger.covered_chapters, skipped_reference: allowReference ? 0 : referenceRows.length }
  })
}

/**
 * Write lookup hits into the ledger. This does not mark a chapter covered.
 * @param project - the book directory. The workspace is its parent.
 * @param hits - excerpts already marked `source: reference`.
 * @param libraryPrefix - `拆文库/<title>/`, joined to each hit path.
 */
export function recordReferenceFacts(project: string, hits: readonly { readonly path: string; readonly title: string; readonly excerpt: string; readonly line_start: number }[], libraryPrefix: string): { schema: typeof FACTS_SCHEMA; recorded: number; ids: readonly string[] } {
  return withProjectWriteLock(project, () => {
    const ledger = mutableLedger(loadFacts(project))
    const ids: string[] = []
    for (const hit of hits) {
      const referencePath = `${libraryPrefix}${hit.path}`.replace(/\/{2,}/gu, '/')
      const row: InputEntry = {
        id: `REF-${createHash('sha256').update(`${referencePath}:${String(hit.line_start)}`).digest('hex').slice(0, 12)}`,
        kind: '对标',
        subject: hit.title.slice(0, 40) || '对标',
        attrs: { 标题: (hit.title || '对标').slice(0, 80), 摘录: (hit.excerpt.trim() || '（空）').slice(0, 200) },
        origin: 'reference',
        reference_path: referencePath,
        since: 1,
        line: hit.line_start,
        reason: '对标摘录',
      }
      applyEntry(project, ledger, row, 0, '')
      ids.push(row.id)
    }
    writeLedger(project, ledger)
    return { schema: FACTS_SCHEMA, recorded: ids.length, ids }
  })
}

/**
 * List ledger rows, optionally filtered by kind and subject.
 * @param project - the book directory.
 * @param options - exact kind and a subject substring.
 */
export function queryFacts(project: string, options: { readonly kind?: string; readonly subject?: string } = {}): {
  schema: 'story-facts-query/v1'
  present: boolean
  total: number
  items: readonly (FactEntry & { readonly effective_attrs: Readonly<Record<string, string | number>> })[]
} {
  const ledger = loadFacts(project)
  const kind = options.kind?.trim() ?? ''
  const subject = options.subject?.trim() ?? ''
  if (kind !== '' && !(FACT_KINDS as readonly string[]).includes(kind)) throw new FactsError(`unknown fact kind: ${kind}`)
  const items = ledger.entries.filter(entry => (kind === '' || entry.kind === kind) && (subject === '' || (entry.subject ?? '').includes(subject)))
    .map(entry => ({ ...entry, effective_attrs: effectiveAttrs(entry) }))
  return { schema: 'story-facts-query/v1', present: ledger.present, total: items.length, items }
}

/**
 * Compare extracted claims with effective ledger values.
 * @param project - the book directory.
 * @param chapter - the chapter the claims belong to.
 * @param input - `{ claims: [{ id, attrs }] }`.
 * @returns conflicts and claims whose id is not in the ledger.
 */
export function diffFacts(project: string, chapter: number, input: unknown): {
  schema: 'story-facts-diff/v1'
  chapter: number
  ok: boolean
  conflicts: readonly FactConflict[]
  unmatched: readonly { readonly id: string; readonly attrs: Readonly<Record<string, string | number>> }[]
} {
  if (!Number.isInteger(chapter) || chapter < 1) throw new FactsError('--chapter must be positive')
  const claims = claimRows(input)
  const ledger = loadFacts(project)
  const byId = new Map(ledger.entries.map(entry => [entry.id, entry]))
  const conflicts: FactConflict[] = []
  const unmatched: { id: string; attrs: Record<string, string | number> }[] = []
  for (const claim of claims) {
    const entry = byId.get(claim.id)
    if (entry === undefined) {
      unmatched.push(claim)
      continue
    }
    const effective = effectiveAttrs(entry)
    for (const [attr, value] of Object.entries(claim.attrs)) {
      const current = effective[attr]
      if (current === value) continue
      const accounted = entry.changes.some(change => change.chapter === chapter && change.attrs?.[attr] === value)
      if (accounted) continue
      const shown = current === undefined ? null : current
      conflicts.push({
        id: claim.id,
        attr,
        ledger: shown,
        claim: value,
        message: `第${String(chapter)}章主张 ${claim.id}.${attr}=${formatValue(value)}，账本有效值是 ${shown === null ? '（无此属性）' : formatValue(shown)}，且没有本章的 change`,
      })
    }
  }
  return { schema: 'story-facts-diff/v1', chapter, ok: conflicts.length === 0, conflicts, unmatched }
}

/**
 * Entries whose source chapter body no longer matches the stored hash, and committed chapters the ledger does not cover.
 * @param project - the book directory.
 */
export function staleFacts(project: string): {
  schema: 'story-facts-stale/v1'
  present: boolean
  stale: readonly { readonly id: string; readonly chapter: number; readonly source_body_sha256: string; readonly current_body_sha256: string | null }[]
  missing_chapters: readonly number[]
} {
  const ledger = loadFacts(project)
  if (!ledger.present) return { schema: 'story-facts-stale/v1', present: false, stale: [], missing_chapters: [] }
  const state = existsSync(statePath(project)) ? loadState(project) : undefined
  const stale = ledger.entries.flatMap(entry => {
    if (entry.source.origin === 'reference') {
      const current = referenceFileHash(project, entry.source.reference_path)
      return current === entry.source.body_sha256 ? [] : [{ id: entry.id, chapter: entry.source.chapter, source_body_sha256: entry.source.body_sha256, current_body_sha256: current }]
    }
    const current = readBodyHash(project, entry.source.chapter)
    const wordcount = state?.wordcount_records[String(entry.source.chapter)]?.body_sha256
    const drifted = current !== entry.source.body_sha256 || (wordcount !== undefined && wordcount !== entry.source.body_sha256)
    return drifted ? [{ id: entry.id, chapter: entry.source.chapter, source_body_sha256: entry.source.body_sha256, current_body_sha256: current }] : []
  })
  const covered = new Set(ledger.covered_chapters)
  const missing = Object.keys(state?.wordcount_records ?? {})
    .map(key => Number(key))
    .filter(chapter => Number.isInteger(chapter) && !covered.has(chapter))
    .sort((left, right) => left - right)
  return { schema: 'story-facts-stale/v1', present: true, stale, missing_chapters: missing }
}

/**
 * Facts for one writing context: era rows, unhealed injuries of active characters, then subjects named in the text.
 * @param project - the book directory.
 * @param options - the chapter being written, the outline or draft, and active character names.
 */
export function contextFacts(project: string, options: { readonly chapter: number; readonly text?: string; readonly activeNames: readonly string[] }): { items: FactView[]; omitted: number } {
  const ledger = loadFacts(project)
  if (!ledger.present) return { items: [], omitted: 0 }
  const text = options.text ?? ''
  const active = new Set(options.activeNames)
  const chosen: FactEntry[] = []
  const seen = new Set<string>()
  const take = (entry: FactEntry): void => {
    if (seen.has(entry.id)) return
    seen.add(entry.id)
    chosen.push(entry)
  }
  for (const entry of ledger.entries) if (entry.kind === '年代' && entry.source.origin !== 'reference') take(entry)
  for (const entry of ledger.entries) {
    if (entry.source.origin === 'reference' || entry.kind !== '伤情' || entry.subject === undefined || !active.has(entry.subject)) continue
    const healed = effectiveAttrs(entry)
    const mark = healed['愈'] ?? healed['状态']
    if (typeof mark === 'string' && HEALED.has(mark)) continue
    take(entry)
  }
  for (const entry of ledger.entries) {
    if (entry.source.origin !== 'reference' && text !== '' && namesEntry(entry, text)) take(entry)
  }
  const items: FactView[] = []
  let omitted = 0
  for (const entry of chosen) {
    const view = toView(project, entry)
    const next = [...items, view]
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > FACTS_CONTEXT_MAX_BYTES) {
      omitted += 1
      continue
    }
    items.push(view)
  }
  return { items, omitted }
}

/**
 * Hint when a chapter before `since` already uses an ability token.
 * @param project - the book directory.
 * @param chapter - the chapter of the body.
 * @param bodyText - the body text.
 */
export function earlySkillHits(project: string, chapter: number, bodyText: string): readonly { readonly id: string; readonly message: string; readonly line: number }[] {
  const ledger = loadFacts(project)
  if (!ledger.present) return []
  const hits: { id: string; message: string; line: number }[] = []
  for (const entry of ledger.entries) {
    if (entry.source.origin === 'reference' || entry.kind !== '能力' || chapter >= entry.since) continue
    const token = skillToken(entry)
    if (token === undefined) continue
    const at = bodyText.indexOf(token)
    if (at < 0) continue
    hits.push({
      id: `skill:${entry.id}`,
      message: `能力「${token}」早于账本起始章 ${String(entry.since)}，出现在第 ${String(lineAt(bodyText, at))} 行`,
      line: lineAt(bodyText, at),
    })
  }
  return hits
}

/**
 * Refuse a commit when `facts_diff` is `required` and the default claims file is missing or conflicted.
 * @param project - the book directory.
 * @param chapter - the chapter being committed.
 * @throws FactsError when the gate fails.
 * @throws WritingCheckError when the writing-check file is invalid.
 */
export function assertFactsDiffForCommit(project: string, chapter: number): void {
  if (factsDiffMode(project) !== 'required') return
  const relative = claimsRelativePath(chapter)
  const path = join(project, relative)
  if (!existsSync(path)) throw new FactsError(`facts_diff is required and ${relative} is missing`)
  let input: unknown
  try {
    input = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new FactsError(`unable to read ${relative}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const diff = diffFacts(project, chapter, input)
  if (!diff.ok) throw new FactsError(diff.conflicts.map(item => item.message).join('；'))
}

function namesEntry(entry: FactEntry, text: string): boolean {
  if (entry.subject !== undefined && entry.subject.length >= 2 && text.includes(entry.subject)) return true
  const token = skillToken(entry)
  return token !== undefined && text.includes(token)
}

function skillToken(entry: FactEntry): string | undefined {
  const subject = entry.subject ?? ''
  const parts = entry.id.split('-').filter(part => part.length >= 2 && part !== subject && !(FACT_KINDS as readonly string[]).includes(part))
  const named = effectiveAttrs(entry)['名称']
  if (typeof named === 'string' && named.length >= 2) return named
  return parts.at(-1)
}

function toView(project: string, entry: FactEntry): FactView {
  const current = readBodyHash(project, entry.source.chapter)
  return {
    id: entry.id,
    kind: entry.kind,
    ...(entry.subject === undefined ? {} : { subject: entry.subject }),
    since: entry.since,
    attrs: effectiveAttrs(entry),
    stale: current !== entry.source.body_sha256,
  }
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) if (text[cursor] === '\n') line += 1
  return line
}

function formatValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : value
}

function committedBodyHash(project: string, chapter: number): string {
  if (!existsSync(statePath(project))) throw new FactsError('tracking state is missing; run init first')
  const state = loadState(project)
  if (chapter > state.last_committed_chapter) throw new FactsError(`chapter ${String(chapter)} is not committed`)
  const record = state.wordcount_records[String(chapter)]
  if (record === undefined) throw new FactsError(`chapter ${String(chapter)} has no wordcount record`)
  const current = readBodyHash(project, chapter)
  if (current !== record.body_sha256) throw new FactsError(`chapter ${String(chapter)} body hash does not match the wordcount record`)
  return record.body_sha256
}

function readBodyHash(project: string, chapter: number): string | null {
  let path: string
  try {
    path = findChapterFile(join(project, '正文'), chapter, { outline: false, allowMissing: true })
  } catch {
    return null
  }
  if (!existsSync(path)) return null
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function writeLedger(project: string, ledger: MutableLedger): void {
  atomicWriteText(factsPath(project), jsonPayload(ledger))
}

function mutableLedger(ledger: FactsLedger): MutableLedger {
  return {
    schema: FACTS_SCHEMA,
    entries: ledger.entries.map(entry => ({ ...entry, attrs: { ...entry.attrs }, changes: entry.changes.map(change => ({ ...change })) })),
    covered_chapters: [...ledger.covered_chapters],
  }
}

function applyEntry(project: string, ledger: MutableLedger, row: InputEntry, chapter: number, hash: string): 'added' | 'changed' | 'same' {
  const referenceHash = row.origin === 'reference' ? referenceFileHash(project, row.reference_path) : undefined
  if (row.origin === 'reference' && referenceHash === null) throw new FactsError(`reference file is missing: ${row.reference_path ?? ''}`)
  const source: FactSource = row.origin === 'reference'
    ? { chapter: 0, ...(row.line === undefined ? {} : { line: row.line }), body_sha256: referenceHash ?? '', origin: 'reference', reference_path: row.reference_path }
    : { chapter, ...(row.line === undefined ? {} : { line: row.line }), body_sha256: hash, ...(row.origin === 'book' ? { origin: 'book' as const } : {}) }
  const existing = ledger.entries.find(entry => entry.id === row.id)
  if (existing === undefined) {
    ledger.entries.push({
      id: row.id,
      kind: row.kind,
      ...(row.subject === undefined ? {} : { subject: row.subject }),
      attrs: row.attrs,
      since: row.since ?? chapter,
      source,
      changes: [],
    })
    return 'added'
  }
  if (existing.kind !== row.kind) throw new FactsError(`${row.id} kind is ${existing.kind}; a record cannot replace it`)
  const effective = effectiveAttrs(existing)
  if (sameAttrs(effective, row.attrs)) return 'same'
  if (row.reason.trim() === '') throw new FactsError(`${row.id} changes an existing entry and needs reason`)
  const changes = [...existing.changes, { chapter, reason: row.reason, attrs: row.attrs, source }]
  const index = ledger.entries.indexOf(existing)
  ledger.entries[index] = { ...existing, changes }
  return 'changed'
}

function sameAttrs(left: Readonly<Record<string, string | number>>, right: Readonly<Record<string, string | number>>): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) if (left[key] !== right[key]) return false
  return true
}

interface InputEntry {
  readonly id: string
  readonly kind: FactKind
  readonly subject?: string
  readonly attrs: Record<string, string | number>
  readonly since?: number
  readonly line?: number
  readonly reason: string
  readonly origin?: 'book' | 'reference'
  readonly reference_path?: string
}

function inputEntries(input: unknown): InputEntry[] {
  const root = asObject(input, 'fact record')
  const rows = root.entries
  if (!Array.isArray(rows)) throw new FactsError('fact record entries must be an array')
  return rows.map((row, index) => parseEntry(row, `entries[${String(index)}]`))
}

function claimRows(input: unknown): { id: string; attrs: Record<string, string | number> }[] {
  const root = asObject(input, 'fact claims')
  const rows = root.claims ?? root.entries
  if (!Array.isArray(rows)) throw new FactsError('fact claims require a claims array')
  return rows.map((row, index) => {
    const record = asObject(row, `claims[${String(index)}]`)
    return { id: requireId(record.id, `claims[${String(index)}].id`), attrs: requireAttrs(record.attrs, `claims[${String(index)}].attrs`) }
  })
}

function parseEntry(value: unknown, label: string): InputEntry {
  const row = asObject(value, label)
  const kind = row.kind
  if (typeof kind !== 'string' || !(FACT_KINDS as readonly string[]).includes(kind)) throw new FactsError(`${label}.kind must be one of ${FACT_KINDS.join('、')}`)
  const since = row.since === undefined ? undefined : requireChapter(row.since, `${label}.since`)
  const line = row.line === undefined ? undefined : requireChapter(row.line, `${label}.line`)
  const subject = row.subject === undefined ? undefined : requireText(row.subject, `${label}.subject`)
  const origin = row.origin === undefined ? undefined : row.origin === 'book' || row.origin === 'reference' ? row.origin : undefined
  if (row.origin !== undefined && origin === undefined) throw new FactsError(`${label}.origin must be "book" or "reference"`)
  const referencePath = row.reference_path === undefined ? undefined : requireText(row.reference_path, `${label}.reference_path`)
  if (origin === 'reference' && referencePath === undefined) throw new FactsError(`${label}.reference_path is required when origin is reference`)
  return {
    id: requireId(row.id, `${label}.id`),
    kind: kind as FactKind,
    ...(subject === undefined ? {} : { subject }),
    attrs: requireAttrs(row.attrs ?? {}, `${label}.attrs`),
    ...(since === undefined ? {} : { since }),
    ...(line === undefined ? {} : { line }),
    reason: row.reason === undefined ? '' : requireText(row.reason, `${label}.reason`),
    ...(origin === undefined ? {} : { origin }),
    ...(referencePath === undefined ? {} : { reference_path: referencePath }),
  }
}

function normalizeLedger(value: unknown): FactsLedger {
  const root = asObject(value, 'fact ledger')
  if (root.schema !== FACTS_SCHEMA) throw new FactsError(`fact ledger schema must be ${FACTS_SCHEMA}`)
  if (!Array.isArray(root.entries)) throw new FactsError('fact ledger entries must be an array')
  const covered = Array.isArray(root.covered_chapters) ? root.covered_chapters.map((item, index) => requireChapter(item, `covered_chapters[${String(index)}]`)) : []
  const entries = root.entries.map((item, index) => normalizeEntry(item, index))
  const ids = entries.map(entry => entry.id)
  if (new Set(ids).size !== ids.length) throw new FactsError('fact ledger contains a duplicate id')
  return { schema: FACTS_SCHEMA, entries, covered_chapters: [...new Set(covered)].sort((left, right) => left - right) }
}

function normalizeEntry(value: unknown, index: number): FactEntry {
  const row = asObject(value, `entries[${String(index)}]`)
  const parsed = parseEntry({ ...row, reason: 'stored' }, `entries[${String(index)}]`)
  if (!Array.isArray(row.changes)) throw new FactsError(`entries[${String(index)}].changes must be an array`)
  return {
    id: parsed.id,
    kind: parsed.kind,
    ...(parsed.subject === undefined ? {} : { subject: parsed.subject }),
    attrs: parsed.attrs,
    since: parsed.since ?? requireChapter(row.since, `entries[${String(index)}].since`),
    source: normalizeSource(row.source, `entries[${String(index)}].source`),
    changes: row.changes.map((change, changeIndex) => normalizeChange(change, `entries[${String(index)}].changes[${String(changeIndex)}]`)),
  }
}

function normalizeChange(value: unknown, label: string): FactChange {
  const row = asObject(value, label)
  return {
    chapter: requireChapter(row.chapter, `${label}.chapter`),
    reason: requireText(row.reason, `${label}.reason`),
    ...(row.attrs === undefined ? {} : { attrs: requireAttrs(row.attrs, `${label}.attrs`) }),
    ...(row.source === undefined ? {} : { source: normalizeSource(row.source, `${label}.source`) }),
  }
}

function normalizeSource(value: unknown, label: string): FactSource {
  const row = asObject(value, label)
  const hash = row.body_sha256
  if (typeof hash !== 'string' || !SHA256_RE.test(hash)) throw new FactsError(`${label}.body_sha256 must be 64 hex characters`)
  const origin = row.origin === undefined ? undefined : row.origin === 'book' || row.origin === 'reference' ? row.origin : undefined
  if (row.origin !== undefined && origin === undefined) throw new FactsError(`${label}.origin must be "book" or "reference"`)
  const referencePath = row.reference_path === undefined ? undefined : requireText(row.reference_path, `${label}.reference_path`)
  if (origin === 'reference' && (referencePath === undefined || referencePath.includes('..') || referencePath.startsWith('/'))) {
    throw new FactsError(`${label}.reference_path must stay inside the workspace`)
  }
  const line = row.line === undefined ? undefined : requireChapter(row.line, `${label}.line`)
  const chapter = origin === 'reference' ? requireNonNegative(row.chapter, `${label}.chapter`) : requireChapter(row.chapter, `${label}.chapter`)
  return {
    chapter, ...(line === undefined ? {} : { line }), body_sha256: hash,
    ...(origin === undefined ? {} : { origin }),
    ...(referencePath === undefined ? {} : { reference_path: referencePath }),
  }
}

function referenceFileHash(project: string, relativePath: string | undefined): string | null {
  if (relativePath === undefined || relativePath.includes('..') || relativePath.startsWith('/') || relativePath.includes('\\')) return null
  const root = dirname(project)
  const file = join(root, ...relativePath.split('/').filter(part => part !== ''))
  if (file !== root && !file.startsWith(root + sep)) return null
  if (!existsSync(file)) return null
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function requireNonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new FactsError(`${label} must be a non-negative integer`)
  return value
}

function requireAttrs(value: unknown, label: string): Record<string, string | number> {
  const row = asObject(value, label)
  const attrs: Record<string, string | number> = {}
  for (const [key, item] of Object.entries(row)) {
    if (key.trim() === '' || key.length > 40) throw new FactsError(`${label} has an invalid attribute name`)
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new FactsError(`${label}.${key} must be a finite number`)
      attrs[key] = item
      continue
    }
    if (typeof item !== 'string' || item.trim() === '' || item.length > 200) throw new FactsError(`${label}.${key} must be a short string or a finite number`)
    attrs[key] = item
  }
  return attrs
}

function requireId(value: unknown, label: string): string {
  const text = requireText(value, label)
  if (/\s/u.test(text) || text.length > 80) throw new FactsError(`${label} must be a single token of at most 80 characters`)
  return text
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new FactsError(`${label} must be a non-empty string`)
  return value.trim()
}

function requireChapter(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw new FactsError(`${label} must be a positive integer`)
  return value
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new FactsError(`${label} must be an object`)
  return value as Record<string, unknown>
}
