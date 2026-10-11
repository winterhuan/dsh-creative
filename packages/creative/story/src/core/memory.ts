/**
 * Evidence-backed author preferences and their deterministic Markdown views.
 *
 * Port of `tests/reference/author_memory_commit.py`. The model supplies compact
 * semantic transactions; this module validates and applies them in memory,
 * renders every derived view, and writes the JSON state last as the commit
 * point. Author memory is workspace-level and separate from each book's
 * story-continuity tracking.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pythonJson } from './json.ts'
import { atomicWriteText, writeIfChanged } from './tracking/store.ts'

const INPUT_SCHEMA_VERSION = 1
const STATE_SCHEMA_VERSION = 1
const STATE_MAX_BYTES = 2 * 1024 * 1024
const PROFILE_MAX_BYTES = 12288
const PENDING_MAX_BYTES = 12288
const JOURNAL_MAX_BYTES = 24576
const QUERY_MAX_BYTES = 2048

/** Preference kinds. */
export const MEMORY_KINDS = ['prose_style', 'story_design', 'workflow', 'delivery', 'interaction'] as const
const KIND_TITLES: Readonly<Record<MemoryKind, string>> = {
  prose_style: '文风与表达', story_design: '故事设计', workflow: '创作流程', delivery: '交付格式', interaction: '协作方式',
}
const SCOPE_LEVELS = ['global', 'genre', 'book', 'workflow'] as const
const STATUSES = ['active', 'pending', 'conflict', 'rejected', 'superseded'] as const
const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const
const IMPORTANCE_LEVELS = ['low', 'medium', 'high'] as const
const SOURCES = ['explicit_user', 'accepted_suggestion', 'repeated_correction', 'inferred_pattern', 'manual'] as const
const RANK: Readonly<Record<string, number>> = { low: 0, medium: 1, high: 2 }
// Python `str.split()` whitespace: ASCII separators, the C1 NEL and the Unicode space separators.
const PYTHON_WHITESPACE = /[\t\n\v\f\r \x1c-\x1f\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu

/** One preference kind. */
export type MemoryKind = typeof MEMORY_KINDS[number]
type ScopeLevel = typeof SCOPE_LEVELS[number]
type Status = typeof STATUSES[number]
type Level = typeof CONFIDENCE_LEVELS[number]
type Source = typeof SOURCES[number]

/** Expected validation or state error. */
export class AuthorMemoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthorMemoryError'
  }
}

function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new AuthorMemoryError(message)
}

type JsonObject = Readonly<Record<string, unknown>>

interface Scope { level: ScopeLevel; value: string | null }
interface Evidence { quote: string; source_ref: string | null }
interface Item {
  id: string
  kind: MemoryKind
  scope: Scope
  assertion: string
  confidence: Level
  importance: Level
  status: Status
  source: Source
  reason: string
  conflicts_with: string[]
  confirmation_count: number
  evidence: Evidence[]
  created_revision: number
  updated_revision: number
  superseded_by: string | null
}
interface JournalEntry { revision: number; transaction_id: string; committed_at: string; summaries: string[] }
interface AppliedTransaction { revision: number; digest: string; item_ids: string[] }

/** The author-memory state (`.story/作者记忆/_author-memory-state.json`). */
export interface MemoryState {
  schema_version: number
  state_revision: number
  next_item_number: number
  items: Record<string, Item>
  journal: JournalEntry[]
  applied_transactions: Record<string, AppliedTransaction>
}

interface Preference {
  kind: MemoryKind
  scope: Scope
  assertion: string
  quote: string
  source_ref: string | null
  source: Source
  confidence: Level
  importance: Level
  status: 'active' | 'pending' | 'conflict'
  reason: string
  conflicts_with: string[]
}

type Operation =
  | { action: 'remember'; preference: Preference }
  | { action: 'decide'; item_id: string; decision: 'activate' | 'reject'; quote: string; reason: string }
  | { action: 'replace'; old_ids: string[]; preference: Preference }
  | { action: 'forget'; item_id: string; quote: string; reason: string }

interface Transaction {
  schema_version: number
  transaction_id: string
  expected_state_revision: number
  operations: Operation[]
}

function get(mapping: JsonObject, key: string, fallback: unknown = undefined): unknown {
  return Object.hasOwn(mapping, key) ? mapping[key] : fallback
}

function asMapping(value: unknown, label: string): JsonObject {
  require(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be a JSON object`)
  return value as JsonObject
}

function asList(value: unknown, label: string): readonly unknown[] {
  require(Array.isArray(value), `${label} must be a JSON array`)
  return value as readonly unknown[]
}

function asInt(value: unknown, label: string, minimum = 0): number {
  require(typeof value === 'number' && Number.isInteger(value), `${label} must be an integer`)
  require(value >= minimum, `${label} must be >= ${String(minimum)}`)
  return value
}

function requireKnownKeys(mapping: JsonObject, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(mapping).filter(key => !allowed.includes(key)).sort()
  require(unknown.length === 0, `${label} contains unsupported fields: ${unknown.join(', ')}`)
}

function cleanText(value: unknown, label: string, maxBytes = 768): string {
  require(typeof value === 'string', `${label} must be a string`)
  const cleaned = value.replaceAll('|', '｜').split(PYTHON_WHITESPACE).filter(part => part !== '').join(' ')
  require(cleaned !== '', `${label} must not be empty`)
  require(Buffer.byteLength(cleaned, 'utf8') <= maxBytes, `${label} exceeds ${String(maxBytes)} bytes`)
  return cleaned
}

function optionalText(value: unknown, label: string, maxBytes = 768): string | null {
  return value === null || value === undefined ? null : cleanText(value, label, maxBytes)
}

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  require(typeof value === 'string' && (allowed as readonly string[]).includes(value), `${label} must be one of: ${allowed.join(', ')}`)
  return value as T
}

function isMemoryId(value: string): boolean {
  return value.startsWith('AP') && /^\d+$/.test(value.slice(2)) && Number(value.slice(2)) >= 1
}

function cleanIdList(value: unknown, label: string, maximum = 32): string[] {
  const raw = asList(value, label)
  require(raw.length <= maximum, `${label} may contain at most ${String(maximum)} items`)
  const result: string[] = []
  raw.forEach((item, index) => {
    const itemId = cleanText(item, `${label}[${String(index)}]`, 32)
    require(isMemoryId(itemId), `${label}[${String(index)}] is not an author-memory id`)
    if (!result.includes(itemId)) result.push(itemId)
  })
  return result
}

function readJson(path: string): unknown {
  try {
    require(statSync(path).size <= STATE_MAX_BYTES, `${path} exceeds ${String(STATE_MAX_BYTES)} bytes`)
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    if (error instanceof AuthorMemoryError) throw error
    throw new AuthorMemoryError(`unable to read JSON ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function jsonPayload(document: unknown): string {
  return `${pythonJson(document, 'indent2')}\n`
}

/**
 * The author-memory directory of a workspace.
 * @param workspace - the Session workspace.
 * @returns the `.story/作者记忆` directory.
 */
export function memoryRoot(workspace: string): string {
  return join(realpathSync(workspace), '.story', '作者记忆')
}

/**
 * The author-memory state file.
 * @param workspace - the Session workspace.
 * @returns the state path.
 */
export function memoryStatePath(workspace: string): string {
  return join(memoryRoot(workspace), '_author-memory-state.json')
}

function emptyState(): MemoryState {
  return { schema_version: STATE_SCHEMA_VERSION, state_revision: 0, next_item_number: 1, items: {}, journal: [], applied_transactions: {} }
}

function normalizeScope(value: unknown, label: string): Scope {
  const scope = asMapping(value, label)
  requireKnownKeys(scope, ['level', 'value'], label)
  const level = choice(get(scope, 'level'), SCOPE_LEVELS, `${label}.level`)
  const rawValue = get(scope, 'value')
  if (level === 'global') {
    require(rawValue === null || rawValue === undefined, `${label}.value must be null for global scope`)
    return { level, value: null }
  }
  return { level, value: cleanText(rawValue, `${label}.value`, 180) }
}

function normalizeEvidence(value: unknown, label: string): Evidence {
  const evidence = asMapping(value, label)
  requireKnownKeys(evidence, ['quote', 'source_ref'], label)
  return { quote: cleanText(get(evidence, 'quote'), `${label}.quote`, 768), source_ref: optionalText(get(evidence, 'source_ref'), `${label}.source_ref`, 240) }
}

function normalizeItem(value: unknown, label: string): Item {
  const item = asMapping(value, label)
  requireKnownKeys(item, ['id', 'kind', 'scope', 'assertion', 'confidence', 'importance', 'status', 'source', 'reason', 'conflicts_with', 'confirmation_count', 'evidence', 'created_revision', 'updated_revision', 'superseded_by'], label)
  const itemId = cleanText(get(item, 'id'), `${label}.id`, 32)
  require(isMemoryId(itemId), `${label}.id is invalid`)
  const evidence = asList(get(item, 'evidence'), `${label}.evidence`).map((entry, index) => normalizeEvidence(entry, `${label}.evidence[${String(index)}]`))
  require(evidence.length > 0, `${label}.evidence must not be empty`)
  const status = choice(get(item, 'status'), STATUSES, `${label}.status`)
  const conflicts = cleanIdList(get(item, 'conflicts_with'), `${label}.conflicts_with`)
  const supersededBy = optionalText(get(item, 'superseded_by'), `${label}.superseded_by`, 32)
  if (supersededBy !== null) require(supersededBy.startsWith('AP') && /^\d+$/.test(supersededBy.slice(2)), `${label}.superseded_by is invalid`)
  return {
    id: itemId,
    kind: choice(get(item, 'kind'), MEMORY_KINDS, `${label}.kind`),
    scope: normalizeScope(get(item, 'scope'), `${label}.scope`),
    assertion: cleanText(get(item, 'assertion'), `${label}.assertion`, 768),
    confidence: choice(get(item, 'confidence'), CONFIDENCE_LEVELS, `${label}.confidence`),
    importance: choice(get(item, 'importance'), IMPORTANCE_LEVELS, `${label}.importance`),
    status,
    source: choice(get(item, 'source'), SOURCES, `${label}.source`),
    reason: cleanText(get(item, 'reason'), `${label}.reason`, 480),
    conflicts_with: conflicts,
    confirmation_count: asInt(get(item, 'confirmation_count'), `${label}.confirmation_count`, 1),
    evidence,
    created_revision: asInt(get(item, 'created_revision'), `${label}.created_revision`, 1),
    updated_revision: asInt(get(item, 'updated_revision'), `${label}.updated_revision`, 1),
    superseded_by: supersededBy,
  }
}

/**
 * Validate a complete author-memory state.
 * @param value - the raw state document.
 * @returns the validated state (a fresh copy).
 */
export function validateState(value: unknown): MemoryState {
  const state = asMapping(value, 'state')
  requireKnownKeys(state, ['schema_version', 'state_revision', 'next_item_number', 'items', 'journal', 'applied_transactions'], 'state')
  require(get(state, 'schema_version') === STATE_SCHEMA_VERSION, `state.schema_version must be ${String(STATE_SCHEMA_VERSION)}`)
  const revision = asInt(get(state, 'state_revision'), 'state.state_revision')
  const nextNumber = asInt(get(state, 'next_item_number'), 'state.next_item_number', 1)
  const rawItems = asMapping(get(state, 'items'), 'state.items')
  const items: Record<string, Item> = {}
  let maxNumber = 0
  for (const [rawId, rawItem] of Object.entries(rawItems)) {
    const normalized = normalizeItem(rawItem, `state.items.${rawId}`)
    require(rawId === normalized.id, `state.items key ${rawId} does not match item id`)
    maxNumber = Math.max(maxNumber, Number(rawId.slice(2)))
    require(normalized.created_revision <= normalized.updated_revision && normalized.updated_revision <= revision, `state.items.${rawId} revision is ahead of state`)
    items[rawId] = normalized
  }
  require(nextNumber > maxNumber, 'state.next_item_number must be greater than every allocated item id')
  for (const [itemId, item] of Object.entries(items)) {
    for (const conflictId of item.conflicts_with) {
      require(Object.hasOwn(items, conflictId) && conflictId !== itemId, `state.items.${itemId} has an invalid conflict id`)
    }
    if (item.superseded_by !== null) {
      require(Object.hasOwn(items, item.superseded_by) && item.superseded_by !== itemId, `state.items.${itemId} has an invalid superseded_by id`)
    }
    if (item.status === 'active') require(item.conflicts_with.length === 0, `active item ${itemId} cannot retain conflicts`)
    if (item.status === 'pending') require(item.conflicts_with.length === 0, `pending item ${itemId} cannot retain conflicts`)
    if (item.status === 'conflict') {
      require(item.conflicts_with.length > 0, `conflict item ${itemId} must reference an active item`)
      require(item.conflicts_with.every(conflictId => items[conflictId]?.status === 'active'), `conflict item ${itemId} must reference only active items`)
    }
    if (item.status !== 'superseded') require(item.superseded_by === null, `only superseded item ${itemId} may set superseded_by`)
  }
  const journal = asList(get(state, 'journal'), 'state.journal')
  require(journal.length === revision, 'state.journal length must equal state.state_revision')
  const journalRevisions = new Map<string, number>()
  const entries: JournalEntry[] = journal.map((entry, index) => {
    const label = `state.journal[${String(index)}]`
    const mapping = asMapping(entry, label)
    requireKnownKeys(mapping, ['revision', 'transaction_id', 'committed_at', 'summaries'], label)
    const entryRevision = asInt(get(mapping, 'revision'), `${label}.revision`, 1)
    require(entryRevision === index + 1, `${label}.revision must be ${String(index + 1)}`)
    const transactionId = cleanText(get(mapping, 'transaction_id'), `${label}.transaction_id`, 128)
    require(!journalRevisions.has(transactionId), `state.journal repeats transaction_id ${transactionId}`)
    journalRevisions.set(transactionId, entryRevision)
    const committedAt = cleanText(get(mapping, 'committed_at'), `${label}.committed_at`, 64)
    const summaries = asList(get(mapping, 'summaries'), `${label}.summaries`)
    require(summaries.length > 0, `${label}.summaries must not be empty`)
    const cleaned = summaries.map((summary, summaryIndex) => cleanText(summary, `${label}.summaries[${String(summaryIndex)}]`, 768))
    return { revision: entryRevision, transaction_id: transactionId, committed_at: committedAt, summaries: cleaned }
  })
  const transactions = asMapping(get(state, 'applied_transactions'), 'state.applied_transactions')
  const transactionIds = Object.keys(transactions)
  require(transactionIds.length === journalRevisions.size && transactionIds.every(id => journalRevisions.has(id)), 'state.applied_transactions must match state.journal transaction ids')
  const applied: Record<string, AppliedTransaction> = {}
  for (const [transactionId, record] of Object.entries(transactions)) {
    cleanText(transactionId, 'state.applied_transactions key', 128)
    const label = `state.applied_transactions.${transactionId}`
    const mapping = asMapping(record, label)
    requireKnownKeys(mapping, ['revision', 'digest', 'item_ids'], label)
    const transactionRevision = asInt(get(mapping, 'revision'), `${label}.revision`, 1)
    require(transactionRevision === journalRevisions.get(transactionId), `${label}.revision does not match journal`)
    const digest = cleanText(get(mapping, 'digest'), `${label}.digest`, 64)
    require(/^[0-9a-f]{64}$/.test(digest), `${label}.digest is invalid`)
    const itemIds = cleanIdList(get(mapping, 'item_ids'), `${label}.item_ids`)
    require(itemIds.length > 0, `${label}.item_ids must not be empty`)
    require(itemIds.every(itemId => Object.hasOwn(items, itemId)), `${label}.item_ids references an unknown item`)
    applied[transactionId] = { revision: transactionRevision, digest, item_ids: itemIds }
  }
  // Python keeps the raw journal and transaction objects; their validated fields are identical.
  return { schema_version: STATE_SCHEMA_VERSION, state_revision: revision, next_item_number: nextNumber, items, journal: entries, applied_transactions: applied }
}

function normalizePreference(value: unknown, label: string, allowStatus: boolean): Preference {
  const preference = asMapping(value, label)
  const allowed = ['kind', 'scope', 'assertion', 'quote', 'source_ref', 'source', 'confidence', 'importance', 'reason', ...(allowStatus ? ['status', 'conflicts_with'] : [])]
  requireKnownKeys(preference, allowed, label)
  const source = choice(get(preference, 'source'), SOURCES, `${label}.source`)
  const status = allowStatus ? choice(get(preference, 'status'), ['active', 'pending', 'conflict'] as const, `${label}.status`) : 'active'
  const conflicts = allowStatus ? cleanIdList(get(preference, 'conflicts_with', []), `${label}.conflicts_with`) : []
  if (status === 'active') {
    require(conflicts.length === 0, `${label}.conflicts_with must be empty for active status`)
    require(source !== 'repeated_correction' && source !== 'inferred_pattern', `${label} inferred evidence must remain pending`)
  } else if (status === 'conflict') {
    require(conflicts.length > 0, `${label}.conflicts_with is required for conflict status`)
  } else {
    require(conflicts.length === 0, `${label}.conflicts_with is only valid for conflict status`)
  }
  return {
    kind: choice(get(preference, 'kind'), MEMORY_KINDS, `${label}.kind`),
    scope: normalizeScope(get(preference, 'scope'), `${label}.scope`),
    assertion: cleanText(get(preference, 'assertion'), `${label}.assertion`, 768),
    quote: cleanText(get(preference, 'quote'), `${label}.quote`, 768),
    source_ref: optionalText(get(preference, 'source_ref'), `${label}.source_ref`, 240),
    source,
    confidence: choice(get(preference, 'confidence'), CONFIDENCE_LEVELS, `${label}.confidence`),
    importance: choice(get(preference, 'importance'), IMPORTANCE_LEVELS, `${label}.importance`),
    status,
    reason: cleanText(get(preference, 'reason'), `${label}.reason`, 480),
    conflicts_with: conflicts,
  }
}

function normalizeTransaction(value: unknown): Transaction {
  const transaction = asMapping(value, 'transaction')
  requireKnownKeys(transaction, ['schema_version', 'transaction_id', 'expected_state_revision', 'operations'], 'transaction')
  require(get(transaction, 'schema_version') === INPUT_SCHEMA_VERSION, `transaction.schema_version must be ${String(INPUT_SCHEMA_VERSION)}`)
  const transactionId = cleanText(get(transaction, 'transaction_id'), 'transaction.transaction_id', 128)
  const operations = asList(get(transaction, 'operations'), 'transaction.operations')
  require(operations.length >= 1 && operations.length <= 32, 'transaction.operations must contain 1-32 operations')
  const normalized: Operation[] = operations.map((rawOperation, index) => {
    const label = `transaction.operations[${String(index)}]`
    const operation = asMapping(rawOperation, label)
    const action = get(operation, 'action')
    if (action === 'remember') {
      requireKnownKeys(operation, ['action', 'preference'], label)
      return { action, preference: normalizePreference(get(operation, 'preference'), `${label}.preference`, true) }
    }
    if (action === 'decide') {
      requireKnownKeys(operation, ['action', 'item_id', 'decision', 'quote', 'reason'], label)
      return {
        action,
        item_id: cleanIdList([get(operation, 'item_id')], `${label}.item_id`, 1)[0] ?? '',
        decision: choice(get(operation, 'decision'), ['activate', 'reject'] as const, `${label}.decision`),
        quote: cleanText(get(operation, 'quote'), `${label}.quote`, 768),
        reason: cleanText(get(operation, 'reason'), `${label}.reason`, 480),
      }
    }
    if (action === 'replace') {
      requireKnownKeys(operation, ['action', 'old_ids', 'preference'], label)
      const oldIds = cleanIdList(get(operation, 'old_ids'), `${label}.old_ids`)
      require(oldIds.length > 0, `${label}.old_ids must not be empty`)
      return { action, old_ids: oldIds, preference: normalizePreference(get(operation, 'preference'), `${label}.preference`, false) }
    }
    if (action === 'forget') {
      requireKnownKeys(operation, ['action', 'item_id', 'quote', 'reason'], label)
      return {
        action,
        item_id: cleanIdList([get(operation, 'item_id')], `${label}.item_id`, 1)[0] ?? '',
        quote: cleanText(get(operation, 'quote'), `${label}.quote`, 768),
        reason: cleanText(get(operation, 'reason'), `${label}.reason`, 480),
      }
    }
    throw new AuthorMemoryError(`${label}.action must be one of: remember, decide, replace, forget`)
  })
  return {
    schema_version: INPUT_SCHEMA_VERSION,
    transaction_id: transactionId,
    expected_state_revision: asInt(get(transaction, 'expected_state_revision'), 'transaction.expected_state_revision'),
    operations: normalized,
  }
}

function normalizeRecordEvent(value: unknown): { event_id: string; operation: Operation } {
  const event = asMapping(value, 'event')
  requireKnownKeys(event, ['schema_version', 'event_id', 'operation'], 'event')
  require(get(event, 'schema_version') === INPUT_SCHEMA_VERSION, `event.schema_version must be ${String(INPUT_SCHEMA_VERSION)}`)
  const eventId = cleanText(get(event, 'event_id'), 'event.event_id', 120)
  const normalized = normalizeTransaction({ schema_version: INPUT_SCHEMA_VERSION, transaction_id: `record:${eventId}`, expected_state_revision: 0, operations: [get(event, 'operation')] })
  const operation = normalized.operations[0]
  if (operation === undefined) throw new AuthorMemoryError('event.operation is required')
  return { event_id: eventId, operation }
}

function transactionDigest(transaction: Transaction): string {
  return createHash('sha256').update(pythonJson(transaction, 'compact'), 'utf8').digest('hex')
}

function casefold(text: string): string {
  return text.normalize('NFC').toUpperCase().toLowerCase()
}

function fingerprint(preference: { kind: MemoryKind; scope: Scope; assertion: string }): string {
  return pythonJson({ kind: preference.kind, scope: preference.scope, assertion: casefold(preference.assertion) }, 'compact')
}

function allocateItem(state: MemoryState, preference: Preference, revision: number): Item {
  const itemId = `AP${String(state.next_item_number).padStart(3, '0')}`
  state.next_item_number += 1
  return {
    id: itemId,
    kind: preference.kind,
    scope: { ...preference.scope },
    assertion: preference.assertion,
    confidence: preference.confidence,
    importance: preference.importance,
    status: preference.status,
    source: preference.source,
    reason: preference.reason,
    conflicts_with: [...preference.conflicts_with],
    confirmation_count: 1,
    evidence: [{ quote: preference.quote, source_ref: preference.source_ref }],
    created_revision: revision,
    updated_revision: revision,
    superseded_by: null,
  }
}

function bestLevel(first: Level, second: Level): Level {
  return (RANK[first] ?? 0) >= (RANK[second] ?? 0) ? first : second
}

function addEvidence(item: Item, quote: string, sourceRef: string | null): void {
  if (!item.evidence.some(entry => entry.quote === quote && entry.source_ref === sourceRef)) item.evidence.push({ quote, source_ref: sourceRef })
}

function requireItem(state: MemoryState, itemId: string, label: string): Item {
  const item = state.items[itemId]
  require(item !== undefined, `${label} references unknown item ${itemId}`)
  return item
}

function applyRemember(state: MemoryState, preference: Preference, revision: number): string {
  for (const conflictId of preference.conflicts_with) {
    const conflict = requireItem(state, conflictId, 'remember')
    require(conflict.status === 'active', `remember conflict ${conflictId} must be active`)
  }
  const preferenceFingerprint = fingerprint(preference)
  for (const item of Object.values(state.items)) {
    if (!['active', 'pending', 'conflict'].includes(item.status) || fingerprint(item) !== preferenceFingerprint) continue
    require(!(item.status === 'conflict' && preference.status === 'active'), `conflict item ${item.id} must be resolved with replace or rejected`)
    require(!(item.status === 'active' && preference.status === 'conflict'), `active item ${item.id} cannot be recategorized as its own conflict`)
    addEvidence(item, preference.quote, preference.source_ref)
    item.confirmation_count += 1
    item.confidence = bestLevel(item.confidence, preference.confidence)
    item.importance = bestLevel(item.importance, preference.importance)
    item.updated_revision = revision
    item.reason = preference.reason
    if (item.status === 'pending' && preference.status === 'active') item.status = 'active'
    else if (item.status === 'pending' && preference.status === 'conflict') {
      item.status = 'conflict'
      item.conflicts_with = [...preference.conflicts_with]
    } else if (item.status === 'conflict' && preference.status === 'conflict') {
      item.conflicts_with = [...new Set([...item.conflicts_with, ...preference.conflicts_with])].sort()
    }
    return `强化 ${item.id}：${item.assertion}`
  }
  const item = allocateItem(state, preference, revision)
  state.items[item.id] = item
  return `新增 ${item.id}（${item.status}）：${item.assertion}`
}

function applyDecide(state: MemoryState, operation: Extract<Operation, { action: 'decide' }>, revision: number): string {
  const item = requireItem(state, operation.item_id, 'decide')
  require(item.status === 'pending' || item.status === 'conflict', `decide requires pending/conflict item, got ${item.status}`)
  let verb: string
  if (operation.decision === 'activate') {
    require(item.status === 'pending' && item.conflicts_with.length === 0, 'conflict candidates must be activated with replace')
    item.status = 'active'
    verb = '确认'
  } else {
    item.status = 'rejected'
    verb = '拒绝'
  }
  addEvidence(item, operation.quote, null)
  item.reason = operation.reason
  item.updated_revision = revision
  return `${verb} ${item.id}：${item.assertion}`
}

function applyReplace(state: MemoryState, operation: Extract<Operation, { action: 'replace' }>, revision: number): string {
  const oldItems = operation.old_ids.map(itemId => requireItem(state, itemId, 'replace'))
  for (const item of oldItems) {
    require(['active', 'conflict', 'pending'].includes(item.status), `replace target ${item.id} is already ${item.status}`)
  }
  const replacement = allocateItem(state, operation.preference, revision)
  replacement.status = 'active'
  replacement.conflicts_with = []
  state.items[replacement.id] = replacement
  for (const item of oldItems) {
    item.status = 'superseded'
    item.superseded_by = replacement.id
    item.updated_revision = revision
  }
  const oldIds = new Set(oldItems.map(item => item.id))
  let released = 0
  for (const candidate of Object.values(state.items)) {
    if (candidate.status !== 'conflict') continue
    const retained = candidate.conflicts_with.filter(itemId => !oldIds.has(itemId))
    if (retained.length === candidate.conflicts_with.length) continue
    candidate.conflicts_with = retained
    candidate.updated_revision = revision
    if (retained.length === 0) {
      candidate.status = 'pending'
      released += 1
    }
  }
  const replaced = oldItems.map(item => item.id).join(', ')
  const suffix = released > 0 ? `；${String(released)} 个其他冲突候选退回待确认` : ''
  return `用 ${replacement.id} 替代 ${replaced}：${replacement.assertion}${suffix}`
}

function applyForget(state: MemoryState, operation: Extract<Operation, { action: 'forget' }>, revision: number): string {
  const item = requireItem(state, operation.item_id, 'forget')
  require(['active', 'pending', 'conflict'].includes(item.status), `forget target ${item.id} is already ${item.status}`)
  item.status = 'superseded'
  item.superseded_by = null
  item.reason = operation.reason
  item.updated_revision = revision
  addEvidence(item, operation.quote, null)
  let released = 0
  for (const candidate of Object.values(state.items)) {
    if (candidate.status !== 'conflict' || !candidate.conflicts_with.includes(item.id)) continue
    candidate.conflicts_with = candidate.conflicts_with.filter(conflictId => conflictId !== item.id)
    candidate.updated_revision = revision
    if (candidate.conflicts_with.length === 0) {
      candidate.status = 'pending'
      released += 1
    }
  }
  const suffix = released > 0 ? `；${String(released)} 个冲突候选退回待确认` : ''
  return `忘记 ${item.id}：${item.assertion}${suffix}`
}

/** UTC timestamp to the second in Python's `isoformat()` form, e.g. `2026-10-11T08:00:00+00:00`. */
function committedAt(): string {
  return `${new Date().toISOString().slice(0, 19)}+00:00`
}

function applyTransaction(state: MemoryState, transaction: Transaction, digest: string): { state: MemoryState; summaries: string[]; replayed: boolean } {
  const applied = state.applied_transactions[transaction.transaction_id]
  if (applied !== undefined) {
    require(applied.digest === digest, 'transaction_id was already used with different content')
    return { state, summaries: [`事务已应用于修订 ${String(applied.revision)}，本次为幂等重放`], replayed: true }
  }
  require(transaction.expected_state_revision === state.state_revision, `stale state revision: expected ${String(transaction.expected_state_revision)}, current ${String(state.state_revision)}`)
  const updated = structuredClone(state)
  const revision = updated.state_revision + 1
  const summaries: string[] = []
  for (const operation of transaction.operations) {
    if (operation.action === 'remember') summaries.push(applyRemember(updated, operation.preference, revision))
    else if (operation.action === 'decide') summaries.push(applyDecide(updated, operation, revision))
    else if (operation.action === 'replace') summaries.push(applyReplace(updated, operation, revision))
    else summaries.push(applyForget(updated, operation, revision))
  }
  updated.state_revision = revision
  updated.journal.push({ revision, transaction_id: transaction.transaction_id, committed_at: committedAt(), summaries })
  const itemIds = Object.entries(updated.items).filter(([, item]) => item.updated_revision === revision).map(([itemId]) => itemId)
    .sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
  require(itemIds.length > 0, 'transaction did not update any author-memory item')
  updated.applied_transactions[transaction.transaction_id] = { revision, digest, item_ids: itemIds }
  return { state: validateState(updated), summaries, replayed: false }
}

function scopeLabel(scope: Scope): string {
  if (scope.level === 'global') return '全局'
  const labels: Readonly<Record<string, string>> = { genre: '题材', book: '本书', workflow: '流程' }
  return `${labels[scope.level] ?? ''}：${scope.value ?? ''}`
}

function sortedById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)))
}

function renderProfile(state: MemoryState): string {
  const lines = [
    '# 作者画像', '',
    '<!-- 由 author_memory_commit.py 生成，请勿手改；修改请提交事务。 -->', '',
    `> 状态修订：${String(state.state_revision)}。仅列出已确认偏好；当前明确要求、本书设定与硬性门禁优先。`, '',
  ]
  const active = Object.values(state.items).filter(item => item.status === 'active')
  for (const kind of MEMORY_KINDS) {
    lines.push(`## ${KIND_TITLES[kind]}`, '')
    const items = sortedById(active.filter(item => item.kind === kind))
    if (items.length === 0) { lines.push('- 暂无', ''); continue }
    for (const item of items) {
      lines.push(`- **${item.id}**〔${scopeLabel(item.scope)}｜${item.confidence}｜确认 ${String(item.confirmation_count)} 次〕${item.assertion}`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function renderPending(state: MemoryState): string {
  const lines = [
    '# 待确认的作者习惯', '',
    '<!-- 由 author_memory_commit.py 生成，请勿手改；修改请提交事务。 -->', '',
    `> 状态修订：${String(state.state_revision)}。待确认项不参与创作约束，也不应打断当前任务。`, '',
  ]
  const items = sortedById(Object.values(state.items).filter(item => item.status === 'pending' || item.status === 'conflict'))
  if (items.length === 0) lines.push('暂无待确认项。', '')
  for (const item of items) {
    lines.push(
      `## ${item.id} · ${item.status === 'conflict' ? '冲突' : '待确认'}`, '',
      `- 候选习惯：${item.assertion}`,
      `- 范围：${scopeLabel(item.scope)}`,
      `- 原话：“${item.evidence[item.evidence.length - 1]?.quote ?? ''}”`,
      `- 依据：${item.reason}`,
      `- 置信度 / 重要度：${item.confidence} / ${item.importance}`,
    )
    if (item.conflicts_with.length > 0) lines.push(`- 冲突对象：${item.conflicts_with.join(', ')}`)
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function renderJournal(state: MemoryState): string {
  const lines = ['# 作者记忆变更记录', '', '<!-- 由 author_memory_commit.py 生成，请勿手改；最近记录在前。 -->', '']
  if (state.journal.length === 0) lines.push('暂无变更。', '')
  for (const entry of [...state.journal.slice(-100)].reverse()) {
    lines.push(`## r${String(entry.revision)} · ${entry.committed_at}`, '', `- 事务：\`${entry.transaction_id}\``)
    lines.push(...entry.summaries.map(summary => `- ${summary}`))
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function renderViews(state: MemoryState): Record<string, string> {
  const views: Record<string, string> = { '作者画像.md': renderProfile(state), '待确认.md': renderPending(state), '变更记录.md': renderJournal(state) }
  const limits: Readonly<Record<string, number>> = { '作者画像.md': PROFILE_MAX_BYTES, '待确认.md': PENDING_MAX_BYTES, '变更记录.md': JOURNAL_MAX_BYTES }
  for (const [name, payload] of Object.entries(views)) {
    require(Buffer.byteLength(payload, 'utf8') <= (limits[name] ?? 0), `${name} exceeds ${String(limits[name] ?? 0)} bytes; consolidate old memory first`)
  }
  return views
}

function writeSnapshot(workspace: string, state: MemoryState): void {
  const root = memoryRoot(workspace)
  const views = renderViews(state)
  const payload = jsonPayload(state)
  require(Buffer.byteLength(payload, 'utf8') <= STATE_MAX_BYTES, `_author-memory-state.json exceeds ${String(STATE_MAX_BYTES)} bytes`)
  for (const [name, text] of Object.entries(views)) writeIfChanged(join(root, name), text)
  // State is the authority and therefore the last commit point.
  writeIfChanged(memoryStatePath(workspace), payload)
}

function requireWorkspace(workspace: string): void {
  require(statSync(workspace, { throwIfNoEntry: false })?.isDirectory() === true, `workspace does not exist: ${workspace}`)
}

/**
 * Create or repair the memory directory and its views.
 * @param workspace - the Session workspace.
 * @returns the current revision and root.
 */
export function memoryInit(workspace: string): Record<string, unknown> {
  requireWorkspace(workspace)
  const path = memoryStatePath(workspace)
  const state = existsSync(path) ? validateState(readJson(path)) : emptyState()
  writeSnapshot(workspace, state)
  return { ok: true, command: 'init', revision: state.state_revision, root: memoryRoot(workspace) }
}

/**
 * Apply one explicit transaction; a replayed transaction id with the same content is a no-op.
 * @param workspace - the Session workspace.
 * @param inputPath - the transaction JSON file.
 * @returns the applied revision, item ids and summaries.
 */
export function memoryCommit(workspace: string, inputPath: string): Record<string, unknown> {
  require(existsSync(memoryStatePath(workspace)), 'author memory is not initialized; run init first')
  const state = validateState(readJson(memoryStatePath(workspace)))
  const transaction = normalizeTransaction(readJson(inputPath))
  const digest = transactionDigest(transaction)
  const { state: updated, summaries, replayed } = applyTransaction(state, transaction, digest)
  // Repair missing or stale views during an idempotent retry.
  writeSnapshot(workspace, replayed ? state : updated)
  return {
    ok: true, command: 'commit', revision: updated.state_revision, transaction_id: transaction.transaction_id, replayed,
    item_ids: updated.applied_transactions[transaction.transaction_id]?.item_ids ?? [], summaries,
  }
}

/**
 * Record one event as its own idempotent transaction and return the receipt the Skill reports.
 * @param workspace - the Session workspace.
 * @param inputPath - the event JSON file.
 * @returns the applied revision, item ids, receipt and summaries.
 */
export function memoryRecord(workspace: string, inputPath: string): Record<string, unknown> {
  requireWorkspace(workspace)
  const event = normalizeRecordEvent(readJson(inputPath))
  const path = memoryStatePath(workspace)
  const state = existsSync(path) ? validateState(readJson(path)) : emptyState()
  const transactionId = `record:${event.event_id}`
  const applied = state.applied_transactions[transactionId]
  const expectedRevision = applied !== undefined ? applied.revision - 1 : state.state_revision
  const transaction: Transaction = { schema_version: INPUT_SCHEMA_VERSION, transaction_id: transactionId, expected_state_revision: expectedRevision, operations: [event.operation] }
  const digest = transactionDigest(transaction)
  const { state: updated, summaries, replayed } = applyTransaction(state, transaction, digest)
  writeSnapshot(workspace, updated)
  const record = updated.applied_transactions[transactionId]
  const itemIds = record?.item_ids ?? []
  return {
    ok: true, command: 'record', revision: updated.state_revision, applied_revision: record?.revision ?? 0, event_id: event.event_id, replayed,
    item_ids: itemIds, receipt: `Author Memory Receipt: r${String(record?.revision ?? 0)} · ${itemIds.join(', ')}`, summaries,
  }
}

function sameScopeValue(itemValue: string | null, requested: string | null): boolean {
  return requested !== null && itemValue !== null && casefold(itemValue) === casefold(requested)
}

/**
 * Query active preferences within a fixed byte budget, most specific scope first.
 * @param workspace - the Session workspace.
 * @param kinds - preference kinds to include; all when omitted.
 * @param book - book scope filter.
 * @param genre - genre scope filter.
 * @param workflow - workflow scope filter.
 * @returns compact items and the count omitted by the budget.
 */
export function memoryQuery(workspace: string, kinds: readonly string[] | null, book: string | null, genre: string | null, workflow: string | null): Record<string, unknown> {
  requireWorkspace(workspace)
  const path = memoryStatePath(workspace)
  if (!existsSync(path)) return { ok: true, command: 'query', initialized: false, revision: 0, items: [], omitted: 0 }
  const state = validateState(readJson(path))
  const requestedKinds = new Set(kinds === null || kinds.length === 0 ? MEMORY_KINDS : kinds)
  const requestedScopes: Readonly<Record<string, string | null>> = {
    book: optionalText(book, 'query.book', 180), genre: optionalText(genre, 'query.genre', 180), workflow: optionalText(workflow, 'query.workflow', 180),
  }
  const relevant = (item: Item): boolean => {
    if (item.status !== 'active' || !requestedKinds.has(item.kind)) return false
    return item.scope.level === 'global' || sameScopeValue(item.scope.value, requestedScopes[item.scope.level] ?? null)
  }
  const scopeRank: Readonly<Record<string, number>> = { book: 0, genre: 1, workflow: 2, global: 3 }
  const candidates = Object.values(state.items).filter(relevant).sort((a, b) =>
    (scopeRank[a.scope.level] ?? 0) - (scopeRank[b.scope.level] ?? 0)
    || (RANK[b.importance] ?? 0) - (RANK[a.importance] ?? 0)
    || b.confirmation_count - a.confirmation_count
    || Number(a.id.slice(2)) - Number(b.id.slice(2)))
  const result: { ok: true; command: 'query'; initialized: true; revision: number; items: Record<string, unknown>[]; omitted: number } = {
    ok: true, command: 'query', initialized: true, revision: state.state_revision, items: [], omitted: candidates.length,
  }
  const encoded = (): number => Buffer.byteLength(`${pythonJson(result, 'default')}\n`, 'utf8')
  for (const item of candidates) {
    result.items.push({ id: item.id, kind: item.kind, scope: item.scope, assertion: item.assertion })
    result.omitted = candidates.length - result.items.length
    if (encoded() > QUERY_MAX_BYTES) {
      result.items.pop()
      result.omitted += 1
      break
    }
  }
  require(encoded() <= QUERY_MAX_BYTES, 'query result exceeds its fixed byte budget')
  return result
}

/**
 * Verify the derived views against the state file.
 * @param workspace - the Session workspace.
 * @returns the revision and per-status item counts.
 */
export function memoryCheck(workspace: string): Record<string, unknown> {
  const path = memoryStatePath(workspace)
  require(existsSync(path), 'author memory is not initialized')
  const state = validateState(readJson(path))
  const views = renderViews(state)
  const root = memoryRoot(workspace)
  for (const [name, expected] of Object.entries(views)) {
    const viewPath = join(root, name)
    require(existsSync(viewPath), `missing derived view: ${viewPath}`)
    require(readFileSync(viewPath, 'utf8') === expected, `derived view is stale or edited: ${viewPath}`)
  }
  const counts = Object.fromEntries(STATUSES.map(status => [status, Object.values(state.items).filter(item => item.status === status).length]))
  return { ok: true, command: 'check', revision: state.state_revision, counts }
}

// `atomicWriteText` is re-exported for the CLI's ledger writes so one implementation owns temp-file commits.
export { atomicWriteText }
