/**
 * Tracking store: paths, atomic writes, the per-project commit lock and the
 * commit protocol (delta → derived views → `_tracking-state.json` last).
 *
 * Port of the persistence half of `tests/reference/tracking_commit.py`. The lock is a
 * directory under `追踪/` instead of an advisory `flock`, which Node lacks: a
 * holder records its PID, a stale holder (dead PID or older than one minute)
 * is reclaimed, and the directory is removed when the commit finishes.
 */
import {
  chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, statSync, unlinkSync, writeSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { looseRealpath } from '../fs-path.ts'
import { paddedChapterNumber } from '../chapter-names.ts'
import { requireChapterSourcesUnchanged } from '../wordcount.ts'
import {
  DELTA_MAX_BYTES, FACTS_LINK_PATH, FACTS_LINK_SCHEMA, TrackingError, asInt, emptyFactsLink, mergeTransaction,
  normalizeInitialDocument, normalizeState, normalizeTransaction, require, wordcountValue, type FactsLink, type TrackingState,
} from './schema.ts'
import { renderDelta, renderViews, sizeWarnings, type TrackingViews } from './render.ts'

const LOCK_NAME = '.tracking-commit.lock'
const LOCK_TIMEOUT_MS = 10_000
const LOCK_POLL_MS = 50
/** A live holder refreshes nothing, so a holder this old is treated as abandoned. */
const LOCK_STALE_MS = 60_000

/** The outcome of a state-changing operation: the new state and soft-limit warnings for stderr. */
export interface TrackingWrite {
  readonly state: TrackingState
  readonly warnings: readonly string[]
}

/**
 * The `追踪/` directory of a book, following symlinks like the Python reference; the book may not exist yet.
 * @param project - the book directory.
 * @returns the tracking directory.
 */
export function trackingRoot(project: string): string {
  return join(looseRealpath(project), '追踪')
}

/**
 * The authoritative state file of a book.
 * @param project - the book directory.
 * @returns the state path.
 */
export function statePath(project: string): string {
  return join(trackingRoot(project), '_tracking-state.json')
}

/**
 * The chapter record path, zero-padded to at least three digits.
 * @param tracking - the tracking directory (any base, e.g. `追踪` for a relative path).
 * @param chapter - the chapter number.
 * @returns the record path.
 */
export function deltaPath(tracking: string, chapter: number): string {
  return join(tracking, '逐章记录', `第${paddedChapterNumber(chapter)}章.md`)
}

/**
 * Read a JSON file.
 * @param path - the file.
 * @returns the parsed value.
 * @throws TrackingError when unreadable or not JSON.
 */
export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new TrackingError(`unable to read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value === 'object' && value !== null) {
    const record = value as Readonly<Record<string, unknown>>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, sortKeys(record[key])]))
  }
  return value
}

/**
 * Serialize a document the way the state file is stored: two-space indent, sorted keys, trailing newline.
 * @param document - the value.
 * @returns the JSON text.
 */
export function jsonPayload(document: unknown): string {
  return `${JSON.stringify(sortKeys(document), null, 2)}\n`
}

/**
 * Write text through a temporary file, fsync and rename, keeping the target's mode.
 * @param path - the destination.
 * @param payload - the text.
 */
export function atomicWriteText(path: string, payload: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const existing = statSync(path, { throwIfNoEntry: false })
  const mode = existing === undefined ? 0o644 : existing.mode & 0o777
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid.toString(36)}${Date.now().toString(36)}.tmp`)
  try {
    const descriptor = openSync(temporary, 'wx', 0o600)
    try {
      writeSync(descriptor, payload, null, 'utf8')
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    chmodSync(temporary, mode)
    renameSync(temporary, path)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

/**
 * Write text only when the file's content differs.
 * @param path - the destination.
 * @param payload - the text.
 */
export function writeIfChanged(path: string, payload: string): void {
  try {
    if (readFileSync(path, 'utf8') === payload) return
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  atomicWriteText(path, payload)
}

function sleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

/** Whether the lock directory belongs to a holder that is still running. */
function lockHeld(lockDirectory: string): boolean {
  const info = statSync(lockDirectory, { throwIfNoEntry: false })
  if (info === undefined || !info.isDirectory()) return false
  let holder: string
  try { holder = readFileSync(join(lockDirectory, 'pid'), 'utf8') }
  catch { return false } // A lock directory without its PID file never finished acquisition.
  const [pidText = '', startedText = ''] = holder.split('\n')
  const pid = Number(pidText)
  const started = Number(startedText)
  if (!Number.isInteger(pid) || pid <= 0 || !Number.isFinite(started)) return false
  return processAlive(pid) && Date.now() - started < LOCK_STALE_MS
}

/**
 * Probe without creating or changing files; an idle or stale lock is not a writer.
 * @param project - the book directory.
 * @returns whether a commit is in progress.
 */
export function projectCommitInProgress(project: string): boolean {
  return lockHeld(join(trackingRoot(project), LOCK_NAME))
}

/**
 * Hold the per-project write lock while running an operation.
 * @param project - the book directory.
 * @param operation - the work to serialize.
 * @returns the operation's result.
 * @throws TrackingError when another commit holds the lock for ten seconds.
 */
export function withProjectWriteLock<T>(project: string, operation: () => T): T {
  const tracking = trackingRoot(project)
  mkdirSync(tracking, { recursive: true })
  const lockDirectory = join(tracking, LOCK_NAME)
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    const legacy = statSync(lockDirectory, { throwIfNoEntry: false })
    // The Python reference kept a persistent lock file; it carries no holder and is replaced by the directory.
    if (legacy !== undefined && !legacy.isDirectory()) unlinkSync(lockDirectory)
    try {
      mkdirSync(lockDirectory)
      break
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      if (!lockHeld(lockDirectory)) {
        rmSync(lockDirectory, { recursive: true, force: true })
        continue
      }
      if (Date.now() >= deadline) throw new TrackingError('tracking commit is in progress; retry after it finishes')
      sleep(LOCK_POLL_MS)
    }
  }
  try {
    atomicWriteText(join(lockDirectory, 'pid'), `${String(process.pid)}\n${String(Date.now())}\n`)
    return operation()
  } finally {
    rmSync(lockDirectory, { recursive: true, force: true })
  }
}

/**
 * Load and validate the current state.
 * @param project - the book directory.
 * @returns the state.
 * @throws TrackingError when the state is missing or invalid.
 */
export function loadState(project: string): TrackingState {
  const path = statePath(project)
  require(existsSync(path), 'tracking state is missing; run init first')
  return normalizeState(readJson(path))
}

/**
 * Write every derived view and prune character cards the state no longer holds.
 * @param tracking - the tracking directory.
 * @param views - rendered views.
 */
export function writeViews(tracking: string, views: TrackingViews): void {
  // 上下文携带 next revision，先写它；任何后续失败都会让 hook/check 发现
  // 上下文 revision 与最后提交的 _tracking-state.json 不一致。
  writeIfChanged(join(tracking, '上下文.md'), views['上下文.md'] ?? '')
  for (const relative of Object.keys(views).filter(path => path !== '上下文.md').sort()) {
    writeIfChanged(join(tracking, relative), views[relative] ?? '')
  }
  const expected = new Set(Object.keys(views).filter(relative => relative.startsWith('角色状态/')).map(relative => basename(relative)))
  const characterDirectory = join(tracking, '角色状态')
  mkdirSync(characterDirectory, { recursive: true })
  for (const name of readdirSync(characterDirectory)) {
    if (name.endsWith('.md') && !expected.has(name)) unlinkSync(join(characterDirectory, name))
  }
}

/**
 * Create the tracking state of a new book; never overwrites an existing state.
 * @param project - the book directory.
 * @param document - the init JSON.
 * @returns the initial state and size warnings.
 */
export function initialize(project: string, document: unknown): TrackingWrite {
  return withProjectWriteLock(project, () => {
    const tracking = trackingRoot(project)
    require(!existsSync(statePath(project)), 'tracking state already exists; init never overwrites project state')
    const drafted = normalizeInitialDocument(document)
    const state = { ...drafted, facts: readFactsLink(project) }
    const views = renderViews(state)
    const payload = jsonPayload(state)
    for (const directory of ['逐章记录', '角色状态', '时间线']) mkdirSync(join(tracking, directory), { recursive: true })
    writeViews(tracking, views)
    atomicWriteText(statePath(project), payload)
    return { state, warnings: sizeWarnings(views) }
  })
}

/**
 * Apply one chapter transaction: validate, merge, render, then commit the state file last.
 * @param project - the book directory.
 * @param document - the transaction JSON.
 * @returns the next state and size warnings.
 */
export function applyTransaction(project: string, document: unknown): TrackingWrite {
  return withProjectWriteLock(project, () => {
    const tracking = trackingRoot(project)
    const state = loadState(project)
    const transaction = normalizeTransaction(project, state, document)
    const next = { ...mergeTransaction(state, transaction), facts: readFactsLink(project) }
    const deltaPayload = renderDelta(
      transaction.chapter,
      transaction.title,
      transaction.delta,
      // 本章退役的角色在 next_state 里已被删除，但本章记录里仍应标为核心。
      new Set([...Object.keys(next.characters), ...transaction.delta.retired_characters]),
      transaction.acceptedFindings,
    )
    const views = renderViews(next)
    const nextPayload = jsonPayload(next)
    const path = deltaPath(tracking, transaction.chapter)
    if (transaction.mode === 'append' && existsSync(path)) {
      require(readFileSync(path, 'utf8') === deltaPayload, `chapter delta ${String(transaction.chapter)} already exists with different content`)
    }
    if (transaction.source_snapshot !== null) {
      const snapshot = transaction.source_snapshot
      wordcountValue(() => requireChapterSourcesUnchanged(project, transaction.chapter, snapshot))
    }
    writeIfChanged(path, deltaPayload)
    writeViews(tracking, views)
    // 唯一权威文件最后落盘；在此之前失败可用同一事务直接重跑。
    atomicWriteText(statePath(project), nextPayload)
    return { state: next, warnings: sizeWarnings(views, deltaPayload) }
  })
}

/**
 * Read the sidecar ledger into a schema-6 summary. Does not create or rewrite the ledger.
 * @param project - the book directory.
 */
export function readFactsLink(project: string): FactsLink {
  const path = join(project, '追踪', '事实账本.json')
  if (!existsSync(path)) return emptyFactsLink()
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as { schema?: unknown; entries?: unknown; covered_chapters?: unknown }
    if (value.schema !== FACTS_LINK_SCHEMA || !Array.isArray(value.entries) || !Array.isArray(value.covered_chapters)) {
      return { ...emptyFactsLink(), unreadable: true }
    }
    const covered: number[] = []
    for (const item of value.covered_chapters) {
      if (typeof item !== 'number' || !Number.isInteger(item) || item < 1 || covered.includes(item)) return { ...emptyFactsLink(), unreadable: true }
      covered.push(item)
    }
    covered.sort((left, right) => left - right)
    return { ledger_path: FACTS_LINK_PATH, ledger_schema: FACTS_LINK_SCHEMA, covered_chapters: covered, entry_count: value.entries.length }
  } catch {
    return { ...emptyFactsLink(), unreadable: true }
  }
}

/**
 * Move a tracking file between schema 5 and schema 6 without touching the ledger or `state_revision`.
 * Schema 6 stores only {@link readFactsLink}. Schema 5 drops that key. Versions 4 and 5 both upgrade to 6.
 * @param project - the book directory.
 * @param target - `6` writes the link; `5` removes it.
 */
export function migrateTracking(project: string, target: 5 | 6 = 6): {
  schema: 'story-tracking-migrate/v1'
  from: number
  to: 5 | 6
  state_revision: number
  ledger_kept: true
} {
  return withProjectWriteLock(project, () => {
    const path = statePath(project)
    require(existsSync(path), 'tracking state is missing; run init first')
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { schema_version?: unknown }
    const from = typeof raw.schema_version === 'number' ? raw.schema_version : -1
    const loaded = loadState(project)
    const ledgerPath = join(project, '追踪', '事实账本.json')
    const ledgerBefore = existsSync(ledgerPath) ? readFileSync(ledgerPath) : null
    if (target === 6) atomicWriteText(path, jsonPayload({ ...loaded, schema_version: 6, facts: readFactsLink(project) }))
    else {
      const { facts: _facts, ...rest } = loaded
      atomicWriteText(path, jsonPayload({ ...rest, schema_version: 5 }))
    }
    if (ledgerBefore === null) require(!existsSync(ledgerPath), 'migrate must not create a fact ledger')
    else require(readFileSync(ledgerPath).equals(ledgerBefore), 'migrate must not rewrite the fact ledger')
    return { schema: 'story-tracking-migrate/v1', from, to: target, state_revision: loaded.state_revision, ledger_kept: true }
  })
}

/**
 * Verify that every chapter record and derived view agrees with the state file.
 * @param project - the book directory.
 * @returns the validated state.
 * @throws TrackingError on any missing, stale or non-canonical artifact.
 */
export function checkProject(project: string): TrackingState {
  const tracking = trackingRoot(project)
  const state = loadState(project)
  const lastChapter = state.last_committed_chapter
  for (let chapter = state.imported_through_chapter + 1; chapter <= lastChapter; chapter += 1) {
    require(existsSync(deltaPath(tracking, chapter)), `chapter delta ${String(chapter)} is missing`)
  }
  const recordDirectory = join(tracking, '逐章记录')
  const names = existsSync(recordDirectory) ? readdirSync(recordDirectory).filter(name => name.startsWith('第') && name.endsWith('章.md')) : []
  for (const name of names) {
    const match = /^第(\d+)章\.md$/.exec(name)
    require(match !== null, `chapter delta has an invalid filename: ${name}`)
    const chapter = asInt(Number(match[1]), `chapter delta ${name}`, 1)
    require(join(recordDirectory, name) === deltaPath(tracking, chapter), `chapter delta ${String(chapter)} filename is not canonical`)
    require(chapter <= lastChapter, `chapter delta ${String(chapter)} exceeds last_committed_chapter`)
    require(statSync(join(recordDirectory, name)).size <= DELTA_MAX_BYTES, `chapter delta ${String(chapter)} exceeds ${String(DELTA_MAX_BYTES)} bytes`)
  }
  const expectedViews = renderViews(state)
  for (const [relative, expected] of Object.entries(expectedViews)) {
    const path = join(tracking, relative)
    require(existsSync(path), `derived view is missing: ${relative}`)
    require(readFileSync(path, 'utf8') === expected, `derived view differs from _tracking-state.json: ${relative}`)
  }
  const expectedCharacterFiles = new Set(Object.keys(expectedViews).filter(relative => relative.startsWith('角色状态/')).map(relative => basename(relative)))
  const characterDirectory = join(tracking, '角色状态')
  const actual = new Set(existsSync(characterDirectory) ? readdirSync(characterDirectory).filter(name => name.endsWith('.md')) : [])
  require(actual.size === expectedCharacterFiles.size && [...actual].every(name => expectedCharacterFiles.has(name)), 'character snapshot files differ from tracking state')
  return state
}
