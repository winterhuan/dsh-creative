/**
 * Tracking state schema: validation of the model's semantic JSON and the
 * in-memory merge of one chapter transaction.
 *
 * Port of the validation half of `tests/reference/tracking_commit.py`. Every label,
 * message and field name matches the Python reference so the CLI and the
 * persisted state stay byte-compatible; `renderViews` and the store own the
 * derived Markdown and the commit protocol.
 */
import {
  type ChapterSourceSnapshot, type WordcountRecord, WordcountError,
  chapterSourceDigests, chapterSourceSnapshot, normalizeWordcountRecord,
  validateCurrentWordcountRecord, validateExpectedSourceDigests,
} from '../wordcount.ts'

/** Schema version of init and transaction input documents. */
export const INPUT_SCHEMA_VERSION = 1
/** Schema version written to `_tracking-state.json`; version 4 is still readable. */
export const TRACKING_SCHEMA_VERSION = 5
/** Soft and hard byte budgets of the derived views. */
export const DELTA_TARGET_BYTES = 1536
export const DELTA_MAX_BYTES = 3072
export const CONTEXT_TARGET_BYTES = 8192
export const CONTEXT_MAX_BYTES = 12288
export const SNAPSHOT_TARGET_BYTES = 4096
export const SNAPSHOT_MAX_BYTES = 8192

/** The seven sections of the hot context card, in order. */
export const CONTEXT_HEADINGS = [
  '## 当前位置', '## 长期约束', '## 核心角色状态', '## 活跃伏笔', '## 近三章速记', '## 下一章承诺', '## 连贯性风险',
] as const
/** Foreshadow lifecycle states. */
export const FORESHADOW_STATUSES = ['已埋', '已回收', '已过期', '放弃'] as const
/** Foreshadow importance levels, most important first. */
export const FORESHADOW_IMPORTANCE = ['高', '中', '低'] as const
/** Timeline reveal states. */
export const REVEAL_STATUSES = ['未揭示', '部分揭示', '已揭示'] as const

/** One foreshadow lifecycle state. */
export type ForeshadowStatus = typeof FORESHADOW_STATUSES[number]
/** One foreshadow importance level. */
export type ForeshadowImportance = typeof FORESHADOW_IMPORTANCE[number]
/** One timeline reveal state. */
export type RevealStatus = typeof REVEAL_STATUSES[number]

const INVALID_FILE_CHARS = /[<>:"/\\|?*\x00-\x1f]/
const FORESHADOW_ID = /^F\d{3,}$/
const EVENT_ID = /^E\d{3,}$/
const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  ...Array.from({ length: 9 }, (_, index) => `COM${String(index + 1)}`),
  ...Array.from({ length: 9 }, (_, index) => `LPT${String(index + 1)}`),
])
// Python `str.split()` whitespace: ASCII separators, the C1 NEL and the Unicode space separators.
const PYTHON_WHITESPACE = /[\t\n\v\f\r \x1c-\x1f\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu

/** Expected validation or tracking-state error. */
export class TrackingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrackingError'
  }
}

/**
 * Raise a {@link TrackingError} when a contract condition fails.
 * @param condition - the condition that must hold.
 * @param message - the failure reported to the caller.
 */
export function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new TrackingError(message)
}

/**
 * Run a wordcount operation, reporting its failures as tracking errors.
 * @param operation - the wordcount call.
 * @returns the operation's result.
 */
export function wordcountValue<T>(operation: () => T): T {
  try {
    return operation()
  } catch (error) {
    if (error instanceof WordcountError) throw new TrackingError(error.message)
    throw error
  }
}

/** A JSON object as the model supplied it. */
export type JsonObject = Readonly<Record<string, unknown>>

/** Read a field like Python's `dict.get(key, fallback)`: an explicit JSON null is kept, only absence falls back. */
function optional(mapping: JsonObject, key: string, fallback: unknown): unknown {
  return Object.hasOwn(mapping, key) ? mapping[key] : fallback
}

function pythonTuple(values: readonly string[]): string {
  return `(${values.map(value => `'${value}'`).join(', ')})`
}

/**
 * Require a JSON object.
 * @param value - the raw value.
 * @param label - the field path reported on failure.
 * @returns the object.
 */
export function asMapping(value: unknown, label: string): JsonObject {
  require(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be a JSON object`)
  return value as JsonObject
}

/**
 * Require a JSON array.
 * @param value - the raw value.
 * @param label - the field path reported on failure.
 * @returns the array.
 */
export function asList(value: unknown, label: string): readonly unknown[] {
  require(Array.isArray(value), `${label} must be a JSON array`)
  return value as readonly unknown[]
}

/**
 * Require an integer at or above a minimum.
 * @param value - the raw value.
 * @param label - the field path reported on failure.
 * @param minimum - the smallest accepted value.
 * @returns the integer.
 */
export function asInt(value: unknown, label: string, minimum = 0): number {
  require(typeof value === 'number' && Number.isInteger(value), `${label} must be an integer`)
  require(value >= minimum, `${label} must be >= ${String(minimum)}`)
  return value
}

/**
 * Reject fields outside the allowed set.
 * @param mapping - the object to inspect.
 * @param allowed - the accepted field names.
 * @param label - the field path reported on failure.
 */
export function requireKnownKeys(mapping: JsonObject, allowed: ReadonlySet<string>, label: string): void {
  const unknown = Object.keys(mapping).filter(key => !allowed.has(key)).sort()
  require(unknown.length === 0, `${label} contains unsupported fields: ${unknown.join(', ')}`)
}

/**
 * Normalize free text: collapse whitespace, replace table pipes, bound the byte size.
 * @param value - the raw value.
 * @param label - the field path reported on failure.
 * @param options - whether empty text is allowed and the byte cap.
 * @returns the cleaned text.
 */
export function cleanText(value: unknown, label: string, options: { readonly allowEmpty?: boolean; readonly maxBytes?: number } = {}): string {
  require(typeof value === 'string', `${label} must be a string`)
  const cleaned = value.replaceAll('|', '｜').split(PYTHON_WHITESPACE).filter(part => part !== '').join(' ')
  require(options.allowEmpty === true || cleaned !== '', `${label} must not be empty`)
  const maxBytes = options.maxBytes ?? 768
  require(Buffer.byteLength(cleaned, 'utf8') <= maxBytes, `${label} exceeds ${String(maxBytes)} bytes`)
  return cleaned
}

/**
 * Normalize a list of free-text items.
 * @param value - the raw value.
 * @param label - the field path reported on failure.
 * @param options - the item cap and per-item byte cap.
 * @returns the cleaned items.
 */
export function cleanStringList(value: unknown, label: string, options: { readonly maximum?: number; readonly itemMaxBytes?: number } = {}): string[] {
  const values = asList(value, label)
  if (options.maximum !== undefined) require(values.length <= options.maximum, `${label} may contain at most ${String(options.maximum)} items`)
  return values.map((item, index) => cleanText(item, `${label}[${String(index)}]`, { maxBytes: options.itemMaxBytes ?? 384 }))
}

/**
 * Normalize a name that becomes a file name under `追踪/角色状态/`.
 * @param value - the raw value.
 * @param label - the field path reported on failure.
 * @returns the NFC-normalized safe name.
 */
export function safeFileComponent(value: unknown, label: string): string {
  const name = cleanText(value, label, { maxBytes: 180 }).normalize('NFC')
  require(!INVALID_FILE_CHARS.test(name), `${label} contains an invalid filename character`)
  require(name !== '.' && name !== '..' && !name.endsWith('.') && !name.endsWith(' '), `${label} is not a safe filename`)
  require(!WINDOWS_RESERVED_NAMES.has((name.split('.')[0] ?? '').toUpperCase()), `${label} is reserved on Windows`)
  return name
}

/**
 * Case-insensitive, normalization-insensitive identity of a character name.
 * @param name - a character name.
 * @returns the portable key.
 */
export function portableNameKey(name: string): string {
  return name.normalize('NFC').toUpperCase().toLowerCase()
}

/**
 * UTF-8 byte size of text.
 * @param text - the text.
 * @returns the byte count.
 */
export function byteSize(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/** The current writing position. */
export interface Position {
  readonly volume: string
  readonly volume_start_chapter: number
  readonly story_time: string
  readonly scene: string
}

/** One core character's current snapshot. */
export interface CharacterSnapshot {
  readonly identity: string
  readonly location: string
  readonly goal: string
  readonly state: string
  readonly abilities_resources: readonly string[]
  readonly relationships: readonly string[]
  readonly knowledge: readonly string[]
  readonly open_threads: readonly string[]
}

/** One foreshadow's current state. */
export interface ForeshadowRow {
  readonly id: string
  readonly summary: string
  readonly planted_chapter: number
  readonly planned_resolution_chapter: number | null
  readonly status: ForeshadowStatus
  readonly importance: ForeshadowImportance
  readonly updated_chapter: number
}

/** One timeline event's current state. */
export interface TimelineRow {
  readonly id: string
  readonly story_time: string
  readonly objective_fact: string
  readonly reader_knowledge: string
  readonly reveal_status: RevealStatus
  readonly reveal_chapter: number | null
  readonly characters: readonly string[]
  readonly first_recorded_chapter: number
  readonly updated_chapter: number
}

/** The continuity card fields. */
export interface TrackingContext {
  readonly position: Position
  readonly long_term_constraints: readonly string[]
  readonly active_character_names: readonly string[]
  readonly continuity_risks: readonly string[]
  readonly recent_chapters: readonly { readonly chapter: number; readonly summary: string }[]
  readonly next_chapter_commitments: readonly string[]
}

/** The context fields a transaction may change; recent chapters and commitments come from the delta. */
export type TransactionContext = Pick<TrackingContext, 'position' | 'long_term_constraints' | 'active_character_names' | 'continuity_risks'>

/** The authoritative tracking state (`追踪/_tracking-state.json`). */
export interface TrackingState {
  readonly schema_version: number
  readonly book_title: string
  readonly last_committed_chapter: number
  readonly imported_through_chapter: number
  readonly state_revision: number
  readonly context: TrackingContext
  readonly characters: Record<string, CharacterSnapshot>
  readonly foreshadow: Record<string, ForeshadowRow>
  readonly timeline: Record<string, TimelineRow>
  readonly wordcount_records: Record<string, WordcountRecord>
  /** Historical review data, preserved without interpreting it as current approval. */
  readonly reader_value_records?: unknown
}

/** One foreshadow change inside a delta. */
export type ForeshadowChange =
  | { readonly action: 'delete'; readonly id: string }
  | { readonly action: 'upsert'; readonly id: string; readonly summary: string; readonly planted_chapter: number; readonly planned_resolution_chapter: number | null; readonly status: ForeshadowStatus; readonly importance: ForeshadowImportance }

/** One timeline change inside a delta. */
export type TimelineChange =
  | { readonly action: 'delete'; readonly id: string }
  | { readonly action: 'upsert'; readonly id: string; readonly story_time: string; readonly objective_fact: string; readonly reader_knowledge: string; readonly reveal_status: RevealStatus; readonly reveal_chapter: number | null; readonly characters: readonly string[] }

/** The per-chapter record of what changed. */
export interface TrackingDelta {
  readonly result: string
  readonly character_changes: readonly { readonly name: string; readonly change: string }[]
  readonly foreshadow_changes: readonly ForeshadowChange[]
  readonly timeline_events: readonly TimelineChange[]
  readonly constraints: readonly string[]
  readonly next_chapter_commitments: readonly string[]
  /** Rewritten by the merge to the items actually dropped. */
  retired_context_items: readonly string[]
  readonly retired_characters: readonly string[]
}

/** An author-accepted rule-audit exception. It is recorded on the chapter Markdown and is not part of the state file. */
export interface AcceptedFinding {
  readonly rule_id: string
  readonly reason: string
}

/** A validated transaction, ready to merge. `acceptedFindings` is not copied into {@link TrackingState}. */
export interface TrackingTransaction {
  readonly mode: 'append' | 'revision'
  readonly chapter: number
  readonly title: string
  readonly delta: TrackingDelta
  readonly context: TransactionContext
  readonly snapshots: Record<string, CharacterSnapshot>
  readonly wordcount: WordcountRecord | null
  readonly source_snapshot: ChapterSourceSnapshot | null
  readonly acceptedFindings: readonly AcceptedFinding[]
}

function validatePosition(value: unknown, label = 'context.position'): Position {
  const position = asMapping(value, label)
  requireKnownKeys(position, new Set(['volume', 'volume_start_chapter', 'story_time', 'scene']), label)
  return {
    volume: safeFileComponent(position.volume, `${label}.volume`),
    volume_start_chapter: asInt(position.volume_start_chapter, `${label}.volume_start_chapter`, 1),
    story_time: cleanText(position.story_time, `${label}.story_time`, { maxBytes: 240 }),
    scene: cleanText(position.scene, `${label}.scene`, { maxBytes: 240 }),
  }
}

function normalizeSnapshot(value: unknown, label: string): CharacterSnapshot {
  const snapshot = asMapping(value, label)
  requireKnownKeys(snapshot, new Set(['identity', 'location', 'goal', 'state', 'abilities_resources', 'relationships', 'knowledge', 'open_threads']), label)
  return {
    identity: cleanText(snapshot.identity, `${label}.identity`, { maxBytes: 240 }),
    location: cleanText(snapshot.location, `${label}.location`, { maxBytes: 240 }),
    goal: cleanText(snapshot.goal, `${label}.goal`, { maxBytes: 300 }),
    state: cleanText(snapshot.state, `${label}.state`, { maxBytes: 300 }),
    abilities_resources: cleanStringList(optional(snapshot, 'abilities_resources', []), `${label}.abilities_resources`),
    relationships: cleanStringList(optional(snapshot, 'relationships', []), `${label}.relationships`),
    knowledge: cleanStringList(optional(snapshot, 'knowledge', []), `${label}.knowledge`),
    open_threads: cleanStringList(optional(snapshot, 'open_threads', []), `${label}.open_threads`),
  }
}

/**
 * Normalize a map of character snapshots keyed by safe name.
 * @param value - the raw map.
 * @param label - the field path reported on failure.
 * @returns the normalized snapshots in input order.
 */
export function normalizeSnapshots(value: unknown, label = 'character_snapshots'): Record<string, CharacterSnapshot> {
  const snapshots = asMapping(value, label)
  const normalized: Record<string, CharacterSnapshot> = {}
  const portableNames = new Set<string>()
  for (const [rawName, rawSnapshot] of Object.entries(snapshots)) {
    const name = safeFileComponent(rawName, `${label} character name`)
    const key = portableNameKey(name)
    require(!portableNames.has(key), `${label} contains a cross-platform duplicate character ${name}`)
    portableNames.add(key)
    normalized[name] = normalizeSnapshot(rawSnapshot, `${label}.${name}`)
  }
  return normalized
}

function normalizeForeshadowChange(value: unknown, label: string, allowDelete: boolean, throughChapter: number): ForeshadowChange {
  const row = asMapping(value, label)
  requireKnownKeys(row, new Set(['action', 'id', 'summary', 'planted_chapter', 'planned_resolution_chapter', 'status', 'importance']), label)
  const action = cleanText(optional(row, 'action', 'upsert'), `${label}.action`, { maxBytes: 24 })
  require(action === 'upsert' || (allowDelete && action === 'delete'), `${label}.action is invalid`)
  const identifier = cleanText(row.id, `${label}.id`, { maxBytes: 24 })
  require(FORESHADOW_ID.test(identifier), `${label}.id must look like F001`)
  if (action === 'delete') return { action: 'delete', id: identifier }
  const plantedChapter = asInt(row.planted_chapter, `${label}.planted_chapter`, 1)
  require(plantedChapter <= throughChapter, `${label}.planted_chapter cannot be in the future`)
  const plannedRaw = row.planned_resolution_chapter
  const plannedChapter = plannedRaw === null || plannedRaw === undefined ? null : asInt(plannedRaw, `${label}.planned_resolution_chapter`, 1)
  require(plannedChapter === null || plannedChapter >= plantedChapter, `${label}.planned_resolution_chapter cannot precede planted_chapter`)
  const status = cleanText(row.status, `${label}.status`, { maxBytes: 24 })
  const importance = cleanText(row.importance, `${label}.importance`, { maxBytes: 12 })
  require((FORESHADOW_STATUSES as readonly string[]).includes(status), `${label}.status must be one of ${pythonTuple(FORESHADOW_STATUSES)}`)
  require((FORESHADOW_IMPORTANCE as readonly string[]).includes(importance), `${label}.importance must be one of ${pythonTuple(FORESHADOW_IMPORTANCE)}`)
  return {
    action: 'upsert',
    id: identifier,
    summary: cleanText(row.summary, `${label}.summary`, { maxBytes: 360 }),
    planted_chapter: plantedChapter,
    planned_resolution_chapter: plannedChapter,
    status: status as ForeshadowStatus,
    importance: importance as ForeshadowImportance,
  }
}

function withoutUpdates(row: JsonObject, keys: readonly string[]): JsonObject {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)))
}

function normalizeForeshadowState(value: unknown, lastChapter: number): Record<string, ForeshadowRow> {
  const rows = asMapping(value, 'tracking state.foreshadow')
  const normalized: Record<string, ForeshadowRow> = {}
  for (const [rawIdentifier, rawRow] of Object.entries(rows)) {
    const identifier = cleanText(rawIdentifier, 'tracking state.foreshadow ID', { maxBytes: 24 })
    const label = `tracking state.foreshadow.${identifier}`
    const row = asMapping(rawRow, label)
    requireKnownKeys(row, new Set(['id', 'summary', 'planted_chapter', 'planned_resolution_chapter', 'status', 'importance', 'updated_chapter']), label)
    require(row.id === identifier, `${label}.id does not match its key`)
    const change = normalizeForeshadowChange({ action: 'upsert', ...withoutUpdates(row, ['updated_chapter']) }, label, false, lastChapter)
    const updated = asInt(row.updated_chapter, `${label}.updated_chapter`, 1)
    require(updated <= lastChapter, `foreshadow ${identifier} updates after current chapter`)
    if (change.action !== 'upsert') throw new TrackingError(`${label}.action is invalid`)
    const { action: _action, ...fields } = change
    normalized[identifier] = { ...fields, updated_chapter: updated }
  }
  return normalized
}

function normalizeTimelineChange(value: unknown, label: string, allowDelete: boolean, throughChapter: number): TimelineChange {
  const event = asMapping(value, label)
  requireKnownKeys(event, new Set(['action', 'id', 'story_time', 'objective_fact', 'reader_knowledge', 'reveal_status', 'reveal_chapter', 'characters']), label)
  const action = cleanText(optional(event, 'action', 'upsert'), `${label}.action`, { maxBytes: 24 })
  require(action === 'upsert' || (allowDelete && action === 'delete'), `${label}.action is invalid`)
  const identifier = cleanText(event.id, `${label}.id`, { maxBytes: 24 })
  require(EVENT_ID.test(identifier), `${label}.id must look like E001`)
  if (action === 'delete') return { action: 'delete', id: identifier }
  const revealStatus = cleanText(event.reveal_status, `${label}.reveal_status`, { maxBytes: 24 })
  require((REVEAL_STATUSES as readonly string[]).includes(revealStatus), `${label}.reveal_status must be one of ${pythonTuple(REVEAL_STATUSES)}`)
  const revealRaw = event.reveal_chapter
  const revealChapter = revealRaw === null || revealRaw === undefined ? null : asInt(revealRaw, `${label}.reveal_chapter`, 1)
  if (revealStatus === '未揭示') {
    require(revealChapter === null, `${label} must not put a future reveal chapter in established timeline facts`)
  } else {
    require(revealChapter !== null, `${label}.reveal_chapter is required once revealed`)
    require(revealChapter <= throughChapter, `${label}.reveal_chapter cannot be in the future`)
  }
  return {
    action: 'upsert',
    id: identifier,
    story_time: cleanText(event.story_time, `${label}.story_time`, { maxBytes: 240 }),
    objective_fact: cleanText(event.objective_fact, `${label}.objective_fact`, { maxBytes: 480 }),
    reader_knowledge: cleanText(event.reader_knowledge, `${label}.reader_knowledge`, { maxBytes: 480 }),
    reveal_status: revealStatus as RevealStatus,
    reveal_chapter: revealChapter,
    characters: cleanStringList(optional(event, 'characters', []), `${label}.characters`, { maximum: 12, itemMaxBytes: 120 }),
  }
}

function normalizeTimelineState(value: unknown, lastChapter: number): Record<string, TimelineRow> {
  const events = asMapping(value, 'tracking state.timeline')
  const normalized: Record<string, TimelineRow> = {}
  for (const [rawIdentifier, rawEvent] of Object.entries(events)) {
    const identifier = cleanText(rawIdentifier, 'tracking state.timeline ID', { maxBytes: 24 })
    const label = `tracking state.timeline.${identifier}`
    const event = asMapping(rawEvent, label)
    requireKnownKeys(event, new Set(['id', 'story_time', 'objective_fact', 'reader_knowledge', 'reveal_status', 'reveal_chapter', 'characters', 'first_recorded_chapter', 'updated_chapter']), label)
    require(event.id === identifier, `${label}.id does not match its key`)
    const change = normalizeTimelineChange({ action: 'upsert', ...withoutUpdates(event, ['first_recorded_chapter', 'updated_chapter']) }, label, false, lastChapter)
    const first = asInt(event.first_recorded_chapter, `${label}.first_recorded_chapter`, 1)
    const updated = asInt(event.updated_chapter, `${label}.updated_chapter`, 1)
    require(first <= lastChapter, `timeline event ${identifier} starts after current chapter`)
    require(updated <= lastChapter, `timeline event ${identifier} updates after current chapter`)
    if (change.action !== 'upsert') throw new TrackingError(`${label}.action is invalid`)
    const { action: _action, ...fields } = change
    normalized[identifier] = { ...fields, first_recorded_chapter: first, updated_chapter: updated }
  }
  return normalized
}

function validateContextInput(value: unknown, includeInitialFields: true): TrackingContext
function validateContextInput(value: unknown, includeInitialFields: false): TransactionContext
function validateContextInput(value: unknown, includeInitialFields: boolean): TrackingContext | TransactionContext {
  const context = asMapping(value, 'context')
  const allowed = new Set(['position', 'long_term_constraints', 'active_character_names', 'continuity_risks'])
  if (includeInitialFields) { allowed.add('recent_chapters'); allowed.add('next_chapter_commitments') }
  requireKnownKeys(context, allowed, 'context')
  const activeNames = asList(optional(context, 'active_character_names', []), 'context.active_character_names')
    .map((name, index) => safeFileComponent(name, `context.active_character_names[${String(index)}]`))
  const normalized: TransactionContext = {
    position: validatePosition(context.position),
    long_term_constraints: cleanStringList(optional(context, 'long_term_constraints', []), 'context.long_term_constraints', { maximum: 6 }),
    active_character_names: activeNames,
    continuity_risks: cleanStringList(optional(context, 'continuity_risks', []), 'context.continuity_risks', { maximum: 5 }),
  }
  require(activeNames.length <= 6, 'context.active_character_names may contain at most 6 names')
  require(new Set(activeNames.map(portableNameKey)).size === activeNames.length, 'context.active_character_names contains cross-platform duplicates')
  if (!includeInitialFields) return normalized
  const recent = asList(optional(context, 'recent_chapters', []), 'context.recent_chapters').map((rawItem, index) => {
    const label = `context.recent_chapters[${String(index)}]`
    const item = asMapping(rawItem, label)
    requireKnownKeys(item, new Set(['chapter', 'summary']), label)
    return { chapter: asInt(item.chapter, `${label}.chapter`, 1), summary: cleanText(item.summary, `${label}.summary`, { maxBytes: 360 }) }
  })
  require(recent.length <= 3, 'context.recent_chapters may contain at most 3 items')
  return {
    ...normalized,
    recent_chapters: recent,
    next_chapter_commitments: cleanStringList(optional(context, 'next_chapter_commitments', []), 'context.next_chapter_commitments', { maximum: 5 }),
  }
}

function normalizeAcceptedFindings(value: unknown): AcceptedFinding[] {
  const items = asList(value, 'accepted_findings')
  require(items.length <= 12, 'accepted_findings may contain at most 12 items')
  const seen = new Set<string>()
  return items.map((raw, index) => {
    const label = `accepted_findings[${String(index)}]`
    const item = asMapping(raw, label)
    requireKnownKeys(item, new Set(['rule_id', 'reason']), label)
    const ruleId = cleanText(item.rule_id, `${label}.rule_id`, { maxBytes: 120 })
    const reason = cleanText(item.reason, `${label}.reason`, { maxBytes: 240 })
    require(!seen.has(ruleId), `accepted_findings contains duplicate rule_id ${ruleId}`)
    seen.add(ruleId)
    return { rule_id: ruleId, reason }
  })
}

/**
 * Read optional author acceptances from a transaction document.
 * @param document - the raw transaction JSON.
 * @returns the cleaned list. Absence and an empty array are both empty.
 * @throws TrackingError when the field is present but not the expected list.
 */
export function acceptedFindingsOf(document: unknown): readonly AcceptedFinding[] {
  const root = asMapping(document, 'transaction')
  if (!Object.hasOwn(root, 'accepted_findings') || root.accepted_findings === undefined) return []
  return normalizeAcceptedFindings(root.accepted_findings)
}

function normalizeDelta(value: unknown, throughChapter: number, snapshots: Record<string, CharacterSnapshot>, existingCoreNames: ReadonlyMap<string, string>): TrackingDelta {
  const delta = asMapping(value, 'delta')
  requireKnownKeys(delta, new Set(['result', 'character_changes', 'foreshadow_changes', 'timeline_events', 'constraints', 'next_chapter_commitments', 'retired_context_items', 'retired_characters']), 'delta')
  const retiredCharacters = asList(optional(delta, 'retired_characters', []), 'delta.retired_characters')
    .map((name, index) => safeFileComponent(name, `delta.retired_characters[${String(index)}]`))
  const retiredKeys = retiredCharacters.map(portableNameKey)
  require(retiredKeys.length === new Set(retiredKeys).size, 'delta.retired_characters contains duplicate characters')
  const retiring = new Set(retiredKeys)
  const characterChanges = asList(optional(delta, 'character_changes', []), 'delta.character_changes').map((rawChange, index) => {
    const label = `delta.character_changes[${String(index)}]`
    const change = asMapping(rawChange, label)
    requireKnownKeys(change, new Set(['name', 'change']), label)
    const name = safeFileComponent(change.name, `${label}.name`)
    const existing = existingCoreNames.get(portableNameKey(name))
    const isCore = Object.hasOwn(snapshots, name) || existing !== undefined
    // 本章退役的角色记录最后一次变化即可，不必再交一份马上要删的快照。
    require(!isCore || Object.hasOwn(snapshots, name) || retiring.has(portableNameKey(name)), `core character ${name} changed but has no current snapshot`)
    return { name, change: cleanText(change.change, `${label}.change`, { maxBytes: 360 }) }
  })
  const characterKeys = characterChanges.map(item => portableNameKey(item.name))
  require(characterKeys.length === new Set(characterKeys).size, 'delta.character_changes contains duplicate characters')
  const foreshadowChanges = asList(optional(delta, 'foreshadow_changes', []), 'delta.foreshadow_changes')
    .map((raw, index) => normalizeForeshadowChange(raw, `delta.foreshadow_changes[${String(index)}]`, true, throughChapter))
  const timelineEvents = asList(optional(delta, 'timeline_events', []), 'delta.timeline_events')
    .map((raw, index) => normalizeTimelineChange(raw, `delta.timeline_events[${String(index)}]`, true, throughChapter))
  require(new Set(foreshadowChanges.map(item => item.id)).size === foreshadowChanges.length, 'delta.foreshadow_changes contains duplicate IDs')
  require(new Set(timelineEvents.map(item => item.id)).size === timelineEvents.length, 'delta.timeline_events contains duplicate IDs')
  const changedNames = new Set(characterChanges.map(item => item.name))
  require(Object.keys(snapshots).every(name => changedNames.has(name)), 'character_snapshots must contain exactly the core characters changed by this transaction')
  return {
    result: cleanText(delta.result, 'delta.result', { maxBytes: 480 }),
    character_changes: characterChanges,
    foreshadow_changes: foreshadowChanges,
    timeline_events: timelineEvents,
    constraints: cleanStringList(optional(delta, 'constraints', []), 'delta.constraints', { maximum: 6 }),
    next_chapter_commitments: cleanStringList(optional(delta, 'next_chapter_commitments', []), 'delta.next_chapter_commitments', { maximum: 5 }),
    retired_context_items: cleanStringList(optional(delta, 'retired_context_items', []), 'delta.retired_context_items', { maximum: 11 }),
    retired_characters: retiredCharacters,
  }
}

function normalizeWordcountRecords(value: unknown, lastChapter: number): Record<string, WordcountRecord> {
  const records = asMapping(value, 'tracking state.wordcount_records')
  const normalized: Record<string, WordcountRecord> = {}
  for (const [rawChapter, rawRecord] of Object.entries(records)) {
    require(/^[1-9]\d*$/.test(rawChapter), 'wordcount record chapter key is invalid')
    require(Number(rawChapter) <= lastChapter, 'wordcount record exceeds last committed chapter')
    normalized[rawChapter] = wordcountValue(() => normalizeWordcountRecord(rawRecord))
  }
  return normalized
}

/**
 * Validate a complete tracking state document.
 * @param document - the raw JSON document.
 * @returns the normalized state.
 * @throws TrackingError for any schema or consistency violation.
 */
export function normalizeState(document: unknown): TrackingState {
  const root = asMapping(document, 'tracking state')
  requireKnownKeys(root, new Set(['schema_version', 'book_title', 'last_committed_chapter', 'imported_through_chapter', 'state_revision', 'context', 'characters', 'foreshadow', 'timeline', 'wordcount_records', 'reader_value_records']), 'tracking state')
  require(root.schema_version === 4 || root.schema_version === TRACKING_SCHEMA_VERSION, 'tracking state schema is unsupported')
  const lastChapter = asInt(root.last_committed_chapter, 'tracking state.last_committed_chapter')
  const importedThrough = asInt(root.imported_through_chapter, 'tracking state.imported_through_chapter')
  require(importedThrough <= lastChapter, 'imported chapter cutoff exceeds current chapter')
  const context = validateContextInput(root.context, true)
  require(context.position.volume_start_chapter <= Math.max(1, lastChapter), 'context.position.volume_start_chapter is after the current writing position')
  const recentNumbers = context.recent_chapters.map(item => item.chapter)
  require(recentNumbers.every((chapter, index) => index === 0 || (recentNumbers[index - 1] ?? 0) <= chapter), 'context.recent_chapters must be ordered')
  require(new Set(recentNumbers).size === recentNumbers.length, 'context.recent_chapters contains duplicates')
  require(recentNumbers.every(chapter => chapter <= lastChapter), 'context.recent_chapters cannot include future chapters')
  const characters = normalizeSnapshots(optional(root, 'characters', {}), 'tracking state.characters')
  for (const name of context.active_character_names) {
    require(Object.hasOwn(characters, name), `active core character ${name} has no current snapshot`)
  }
  const foreshadow = normalizeForeshadowState(optional(root, 'foreshadow', {}), lastChapter)
  const timeline = normalizeTimelineState(optional(root, 'timeline', {}), lastChapter)
  if (lastChapter === 0) {
    require(Object.keys(foreshadow).length === 0, 'a chapter-0 project cannot have planted foreshadow facts')
    require(Object.keys(timeline).length === 0, 'a chapter-0 project cannot have established timeline facts')
  }
  const stateRevision = asInt(root.state_revision, 'tracking state.state_revision')
  const wordcountRecords = normalizeWordcountRecords(optional(root, 'wordcount_records', {}), lastChapter)
  return {
    schema_version: TRACKING_SCHEMA_VERSION,
    book_title: cleanText(root.book_title, 'tracking state.book_title', { maxBytes: 240 }),
    last_committed_chapter: lastChapter,
    imported_through_chapter: importedThrough,
    state_revision: stateRevision,
    context,
    characters,
    foreshadow,
    timeline,
    wordcount_records: wordcountRecords,
    // Preserve historical review data without interpreting it as current approval.
    ...(Object.hasOwn(root, 'reader_value_records') ? { reader_value_records: root.reader_value_records } : {}),
  }
}

/**
 * Build the initial tracking state from an init document.
 * @param document - the raw init JSON.
 * @returns the normalized state at revision 0.
 */
export function normalizeInitialDocument(document: unknown): TrackingState {
  const root = asMapping(document, 'init input')
  requireKnownKeys(root, new Set(['schema_version', 'book_title', 'last_chapter', 'context', 'character_snapshots', 'foreshadow', 'timeline_events']), 'init input')
  require(root.schema_version === INPUT_SCHEMA_VERSION, 'init input schema_version is unsupported')
  const lastChapter = asInt(root.last_chapter, 'last_chapter')
  const context = validateContextInput(root.context, true)
  const snapshots = normalizeSnapshots(optional(root, 'character_snapshots', {}))
  const foreshadow: Record<string, ForeshadowRow> = {}
  asList(optional(root, 'foreshadow', []), 'foreshadow').forEach((rawRow, index) => {
    const change = normalizeForeshadowChange(rawRow, `foreshadow[${String(index)}]`, false, lastChapter)
    require(!Object.hasOwn(foreshadow, change.id), `duplicate foreshadow ID ${change.id}`)
    if (change.action !== 'upsert') throw new TrackingError(`foreshadow[${String(index)}].action is invalid`)
    const { action: _action, ...fields } = change
    foreshadow[change.id] = { ...fields, updated_chapter: Math.max(1, lastChapter) }
  })
  const timeline: Record<string, TimelineRow> = {}
  asList(optional(root, 'timeline_events', []), 'timeline_events').forEach((rawEvent, index) => {
    const change = normalizeTimelineChange(rawEvent, `timeline_events[${String(index)}]`, false, lastChapter)
    require(!Object.hasOwn(timeline, change.id), `duplicate timeline event ID ${change.id}`)
    if (change.action !== 'upsert') throw new TrackingError(`timeline_events[${String(index)}].action is invalid`)
    const { action: _action, ...fields } = change
    timeline[change.id] = { ...fields, first_recorded_chapter: Math.max(1, lastChapter), updated_chapter: Math.max(1, lastChapter) }
  })
  return normalizeState({
    schema_version: TRACKING_SCHEMA_VERSION,
    book_title: cleanText(root.book_title, 'book_title', { maxBytes: 240 }),
    last_committed_chapter: lastChapter,
    imported_through_chapter: lastChapter,
    state_revision: 0,
    context,
    characters: snapshots,
    foreshadow,
    timeline,
    wordcount_records: {},
  })
}

/**
 * Validate a chapter transaction against the current state and the chapter files on disk.
 * @param project - the book directory.
 * @param state - the current tracking state.
 * @param document - the raw transaction JSON.
 * @returns the validated transaction.
 */
export function normalizeTransaction(project: string, state: TrackingState, document: unknown): TrackingTransaction {
  const root = asMapping(document, 'transaction')
  requireKnownKeys(root, new Set(['schema_version', 'mode', 'chapter', 'chapter_title', 'expected_state_revision', 'delta', 'context', 'character_snapshots', 'wordcount', 'reader_value', 'expected_body_sha256', 'expected_outline_sha256', 'accepted_findings']), 'transaction')
  require(root.schema_version === INPUT_SCHEMA_VERSION, 'transaction schema_version is unsupported')
  const mode = cleanText(root.mode, 'mode', { maxBytes: 24 })
  require(mode === 'append' || mode === 'revision', 'mode must be append or revision')
  const chapter = asInt(root.chapter, 'chapter', 1)
  const expectedRevision = asInt(root.expected_state_revision, 'expected_state_revision')
  require(expectedRevision === state.state_revision, 'tracking state changed since this transaction was prepared')
  let sourceSnapshot: ChapterSourceSnapshot | null = null
  if (Object.hasOwn(root, 'expected_body_sha256') || Object.hasOwn(root, 'expected_outline_sha256')) {
    const snapshot = wordcountValue(() => chapterSourceSnapshot(project, chapter))
    sourceSnapshot = snapshot
    wordcountValue(() => validateExpectedSourceDigests(root, chapterSourceDigests(snapshot)))
  }
  const last = state.last_committed_chapter
  if (mode === 'append') require(chapter === last + 1, `append chapter must be ${String(last + 1)}, got ${String(chapter)}`)
  else require(chapter <= last, `cannot revise unwritten chapter ${String(chapter)}; last committed chapter is ${String(last)}`)
  const context = validateContextInput(root.context, false)
  const snapshots = normalizeSnapshots(optional(root, 'character_snapshots', {}))
  const existingNames = new Map(Object.keys(state.characters).map(name => [portableNameKey(name), name]))
  for (const name of Object.keys(snapshots)) {
    const existing = existingNames.get(portableNameKey(name))
    require(existing === undefined || existing === name, `character ${name} conflicts with existing character ${String(existing)}`)
  }
  const throughChapter = mode === 'append' ? chapter : last
  const delta = normalizeDelta(root.delta, throughChapter, snapshots, existingNames)
  const wordcount = root.wordcount === null || root.wordcount === undefined
    ? null
    : wordcountValue(() => validateCurrentWordcountRecord(project, chapter, root.wordcount))
  return {
    mode,
    chapter,
    title: cleanText(root.chapter_title, 'chapter_title', { maxBytes: 240 }),
    delta,
    context,
    snapshots,
    wordcount,
    source_snapshot: sourceSnapshot,
    acceptedFindings: acceptedFindingsOf(root),
  }
}

/**
 * Merge a validated transaction into a copy of the state.
 * @param state - the current state.
 * @param transaction - the validated transaction; its `retired_context_items` are rewritten to the dropped items.
 * @returns the next, revalidated state.
 */
export function mergeTransaction(state: TrackingState, transaction: TrackingTransaction): TrackingState {
  const next = structuredClone(state) as {
    -readonly [key in keyof TrackingState]: TrackingState[key]
  }
  const chapter = transaction.chapter
  if (transaction.mode === 'append') next.last_committed_chapter = chapter
  next.state_revision += 1
  Object.assign(next.characters, transaction.snapshots)
  if (transaction.wordcount !== null) next.wordcount_records[String(chapter)] = transaction.wordcount
  const nextContext = transaction.context
  // 退役说的是「从此刻起离开当前状态」，只有 append 的逐章记录代表此刻；
  // 修订记录属于被改写的旧章，落在那里会谎报退役发生的章节。
  const isRevision = transaction.mode === 'revision'
  require(!(isRevision && transaction.delta.retired_characters.length > 0), 'retired_characters must be committed in an append transaction, not a revision')
  for (const name of transaction.delta.retired_characters) {
    require(Object.hasOwn(next.characters, name), `retired character ${name} has no current snapshot`)
    require(!Object.hasOwn(transaction.snapshots, name), `character ${name} cannot be retired and updated in the same transaction`)
    require(!nextContext.active_character_names.includes(name), `retired character ${name} is still listed in context.active_character_names`)
    delete next.characters[name]
  }

  // 上下文条目是整份提交的；漏写会静默丢历史裁定，因此掉落必须显式声明。
  const previousItems = new Set([...state.context.long_term_constraints, ...state.context.continuity_risks])
  const nextItems = new Set([...nextContext.long_term_constraints, ...nextContext.continuity_risks])
  const dropped = [...previousItems].filter(item => !nextItems.has(item)).sort()
  require(!(isRevision && dropped.length > 0), `a revision must resubmit every current context item; retire them in an append transaction instead: ${dropped.join('；')}`)
  const declared = new Set(transaction.delta.retired_context_items)
  const undeclared = dropped.filter(item => !declared.has(item))
  require(undeclared.length === 0, `context items were dropped without being declared in delta.retired_context_items: ${undeclared.join('；')}`)
  transaction.delta.retired_context_items = dropped

  for (const change of transaction.delta.foreshadow_changes) {
    if (change.action === 'delete') { delete next.foreshadow[change.id]; continue }
    const previous = next.foreshadow[change.id]
    const { action: _action, ...fields } = change
    next.foreshadow[change.id] = { ...fields, updated_chapter: Math.max(previous?.updated_chapter ?? chapter, chapter) }
  }
  for (const change of transaction.delta.timeline_events) {
    if (change.action === 'delete') { delete next.timeline[change.id]; continue }
    const previous = next.timeline[change.id]
    const { action: _action, ...fields } = change
    next.timeline[change.id] = {
      ...fields,
      updated_chapter: Math.max(previous?.updated_chapter ?? chapter, chapter),
      first_recorded_chapter: previous?.first_recorded_chapter ?? chapter,
    }
  }

  const recentByChapter = new Map(state.context.recent_chapters.map(item => [item.chapter, item]))
  if (recentByChapter.has(chapter) || transaction.mode === 'append') {
    recentByChapter.set(chapter, { chapter, summary: transaction.delta.result })
  }
  const recent = [...recentByChapter.values()].sort((a, b) => a.chapter - b.chapter).slice(-3)
  const currentLast = next.last_committed_chapter
  const nextCommitments = transaction.mode === 'append' || chapter === currentLast
    ? transaction.delta.next_chapter_commitments
    : state.context.next_chapter_commitments
  next.context = { ...nextContext, recent_chapters: recent, next_chapter_commitments: nextCommitments }
  return normalizeState(next)
}
