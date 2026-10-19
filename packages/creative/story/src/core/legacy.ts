/**
 * Maintenance writes that the chapter transaction does not cover.
 *
 * `archiveReaderValue` moves historical `reader_value_records` out of the
 * state file. `retireContextItem` drops one context string without a chapter
 * append. Both hold the tracking write lock, increment `state_revision`, and
 * render derived views before replacing `_tracking-state.json`.
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeState } from './tracking/schema.ts'
import { atomicWriteText, jsonPayload, loadState, statePath, trackingRoot, withProjectWriteLock, writeViews } from './tracking/store.ts'
import { renderViews } from './tracking/render.ts'

/** Result schema of {@link archiveReaderValue}. */
export const LEGACY_ARCHIVE_SCHEMA = 'story-reader-value-legacy/v1'

/** A maintenance command has nothing to change, or the archive file is already present. */
export class LegacyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegacyError'
  }
}

/**
 * Move `reader_value_records` to `追踪/_legacy/reader_value_records.json` and delete the state field.
 * @param project - the book directory.
 * @returns how many records moved and the revision after the write. A state without the field is unchanged.
 * @throws LegacyError when the archive file already exists.
 * @throws TrackingError when the state is missing or invalid.
 */
export function archiveReaderValue(project: string): { schema: typeof LEGACY_ARCHIVE_SCHEMA; archived: number; path: string; state_revision: number } {
  const relative = '追踪/_legacy/reader_value_records.json'
  return withProjectWriteLock(project, () => {
    const state = loadState(project)
    if (!Object.hasOwn(state, 'reader_value_records')) {
      return { schema: LEGACY_ARCHIVE_SCHEMA, archived: 0, path: relative, state_revision: state.state_revision }
    }
    const tracking = trackingRoot(project)
    const path = join(tracking, '_legacy', 'reader_value_records.json')
    if (existsSync(path)) throw new LegacyError('追踪/_legacy/reader_value_records.json already exists')
    mkdirSync(join(tracking, '_legacy'), { recursive: true })
    const records = state.reader_value_records
    const archived = typeof records === 'object' && records !== null && !Array.isArray(records) ? Object.keys(records).length : 1
    atomicWriteText(path, jsonPayload({ schema: LEGACY_ARCHIVE_SCHEMA, from_state_revision: state.state_revision, records }))
    const raw = cloneState(state)
    delete raw.reader_value_records
    raw.state_revision = state.state_revision + 1
    const next = normalizeState(raw)
    commitDerived(project, next)
    return { schema: LEGACY_ARCHIVE_SCHEMA, archived, path: relative, state_revision: next.state_revision }
  })
}

/**
 * Remove one exact context string from the current lists and append `追踪/维护记录.md`.
 * @param project - the book directory.
 * @param item - the exact constraint, risk, or next-chapter commitment.
 * @param reason - why the item leaves the current context.
 * @returns the lists that contained the item and the new revision.
 * @throws LegacyError when the item is not in those lists or the reason is empty.
 * @throws TrackingError when the state is missing or invalid.
 */
export function retireContextItem(project: string, item: string, reason: string): { schema: 'story-context-retire/v1'; removed: readonly string[]; state_revision: number; path: string } {
  const text = item.trim()
  const why = reason.trim()
  if (text === '' || why === '') throw new LegacyError('--item and --reason must be non-empty')
  return withProjectWriteLock(project, () => {
    const state = loadState(project)
    const raw = cloneState(state)
    const context = raw.context
    if (typeof context !== 'object' || context === null || Array.isArray(context)) throw new LegacyError('tracking context is not an object')
    const record = context as Record<string, unknown>
    const removed: string[] = []
    for (const field of ['long_term_constraints', 'continuity_risks', 'next_chapter_commitments'] as const) {
      const values = record[field]
      if (!Array.isArray(values)) continue
      const next = values.filter(entry => entry !== text)
      if (next.length !== values.length) {
        record[field] = next
        removed.push(field)
      }
    }
    if (removed.length === 0) throw new LegacyError('context item was not found')
    raw.state_revision = state.state_revision + 1
    const next = normalizeState(raw)
    const relative = '追踪/维护记录.md'
    const log = join(trackingRoot(project), '维护记录.md')
    const block = [
      existsSync(log) ? '' : '# 维护记录\n',
      `## 修订 ${String(next.state_revision)}`,
      '- 动作：退役上下文',
      `- 条目：${text}`,
      `- 原因：${why}`,
      `- 列表：${removed.join('、')}`,
      '',
    ].join('\n')
    appendFileSync(log, block, 'utf8')
    commitDerived(project, next)
    return { schema: 'story-context-retire/v1', removed, state_revision: next.state_revision, path: relative }
  })
}

function cloneState(state: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>
}

function commitDerived(project: string, state: ReturnType<typeof normalizeState>): void {
  const tracking = trackingRoot(project)
  writeViews(tracking, renderViews(state))
  atomicWriteText(statePath(project), jsonPayload(state))
}
