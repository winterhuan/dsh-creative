/**
 * Bounded, read-only queries over the tracking state and chapter records.
 *
 * Port of `tests/reference/project_query.py`: one state revision per call, a 16 KiB
 * result budget, and pagination that never rewrites state or silently drops an
 * oversized item. `kind: 'health'` is a TypeScript risk list; the Python reference
 * does not implement it.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, sep } from 'node:path'
import {
  assessHealth, DEFAULT_STALE_CHARACTER_CHAPTERS, DEFAULT_STALE_PLANTED_CHAPTERS, DEFAULT_STALE_THREAD_CHAPTERS,
  HEALTH_THRESHOLD_MAX, type HealthReport,
} from './health.ts'
import { DELTA_MAX_BYTES, normalizeState, require, type ForeshadowRow, type TrackingState } from './schema.ts'
import { deltaPath, projectCommitInProgress } from './store.ts'

/** Largest encoded query result. */
export const QUERY_MAX_BYTES = 16_384
const STATE_SOURCE = '追踪/_tracking-state.json'
/** Query kinds. */
export const QUERY_KINDS = ['characters', 'foreshadow', 'author-timeline', 'reader-timeline', 'chapter', 'health'] as const
/** Foreshadow selections. */
export const QUERY_FILTERS = ['all', 'open', 'due', 'overdue', 'unscheduled', 'resolved'] as const

/** One query kind. */
export type QueryKind = typeof QUERY_KINDS[number]
/** One foreshadow selection. */
export type QueryFilter = typeof QUERY_FILTERS[number]

/** Query options; `kind` omitted returns the status overview. Health thresholds apply only to `kind: 'health'`. */
export interface QueryOptions {
  readonly kind?: QueryKind
  readonly search?: string
  readonly selection?: QueryFilter
  readonly chapter?: number | null
  readonly offset?: number
  readonly limit?: number
  readonly expectedRevision?: number | null
  /** Chapters since planting before an unscheduled foreshadow is stale. Health only. */
  readonly stalePlanted?: number
  /** Chapters since a character's last timeline touch before that character is stale. Health only. */
  readonly staleCharacter?: number
  /** Chapters before an unrevealed fact or open thread is stale. Health only. */
  readonly staleThread?: number
}

function encoded(value: unknown): number {
  return Buffer.byteLength(`${JSON.stringify(value)}\n`, 'utf8')
}

function boundedThreshold(value: number | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback
  require(Number.isInteger(value) && value >= 1 && value <= HEALTH_THRESHOLD_MAX, `${label} must be an integer from 1 to ${String(HEALTH_THRESHOLD_MAX)}`)
  return value
}

/** Resolve symlinks as far as the path exists, like Python's non-strict `Path.resolve()`. */
function looseRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(looseRealpath(parent), basename(path))
  }
}

function sourcePath(project: string, relative: string): string {
  const path = join(project, relative)
  const root = looseRealpath(project)
  const resolved = looseRealpath(path)
  require(resolved === root || resolved.startsWith(root + sep), `source leaves selected project: ${relative}`)
  return path
}

/**
 * Decide whether a foreshadow row matches a selection relative to a chapter.
 * @param row - the row.
 * @param selection - the selection.
 * @param chapter - the reference chapter.
 * @returns whether the row matches.
 */
export function matchesForeshadow(row: ForeshadowRow, selection: QueryFilter, chapter: number): boolean {
  const due = row.planned_resolution_chapter
  if (selection === 'all') return true
  if (selection === 'resolved') return row.status === '已回收'
  if (row.status !== '已埋') return false
  return selection === 'open' || (selection === 'unscheduled' && due === null)
    || (selection === 'due' && due !== null && due <= chapter) || (selection === 'overdue' && due !== null && due < chapter)
}

/**
 * Read a single state revision.
 * @param project - the book directory.
 * @param options - kind, filter, search and pagination.
 * @returns the status overview or one page of rows, always within the byte budget.
 * @throws TrackingError for invalid options, a changed revision, or a result over budget.
 */
export function projectQuery(project: string, options: QueryOptions = {}): Record<string, unknown> {
  const kind = options.kind
  const search = options.search ?? ''
  const selection = options.selection ?? 'all'
  const chapter = options.chapter ?? null
  const offset = options.offset ?? 0
  const limit = options.limit ?? 20
  const expectedRevision = options.expectedRevision ?? null
  require(statSync(project, { throwIfNoEntry: false })?.isDirectory() === true, 'project directory does not exist')
  require(kind === undefined || (QUERY_KINDS as readonly string[]).includes(kind), 'unsupported query kind')
  require((QUERY_FILTERS as readonly string[]).includes(selection), 'unsupported foreshadow filter')
  require(kind === 'foreshadow' || selection === 'all', '--filter requires --kind foreshadow')
  const thresholdArguments = [
    ['--stale-planted', options.stalePlanted],
    ['--stale-character', options.staleCharacter],
    ['--stale-thread', options.staleThread],
  ] as const
  if (kind !== 'health') {
    const unexpected = thresholdArguments.filter(([, value]) => value !== undefined).map(([name]) => name)
    require(unexpected.length === 0, `${unexpected.join(', ')} requires --kind health`)
  }
  const stalePlanted = kind === 'health' ? boundedThreshold(options.stalePlanted, '--stale-planted', DEFAULT_STALE_PLANTED_CHAPTERS) : undefined
  const staleCharacter = kind === 'health' ? boundedThreshold(options.staleCharacter, '--stale-character', DEFAULT_STALE_CHARACTER_CHAPTERS) : undefined
  const staleThread = kind === 'health' ? boundedThreshold(options.staleThread, '--stale-thread', DEFAULT_STALE_THREAD_CHAPTERS) : undefined
  require(offset >= 0 && limit >= 1 && limit <= 50, 'offset must be nonnegative and limit must be 1..50')
  require(chapter === null || chapter > 0, 'chapter must be positive')
  require(kind !== 'chapter' || chapter !== null, '--kind chapter requires --chapter')
  const path = sourcePath(project, STATE_SOURCE)
  sourcePath(project, '追踪/.tracking-commit.lock')
  require(!projectCommitInProgress(project), 'tracking commit is in progress; retry the query after it finishes')
  if (!existsSync(path)) {
    require(expectedRevision === null, 'tracking state disappeared; restart the query')
    return { schema: 'story-project-query/v1', initialized: false, source: STATE_SOURCE }
  }
  const original = readFileSync(path)
  const state: TrackingState = normalizeState(JSON.parse(original.toString('utf8')))
  const revision = state.state_revision
  require(expectedRevision === null || revision === expectedRevision, 'tracking revision changed; restart the query from offset 0')
  const through = state.last_committed_chapter
  const atChapter = chapter ?? through + 1
  const base = {
    schema: 'story-project-query/v1', initialized: true, source: STATE_SOURCE,
    book_title: state.book_title, state_revision: revision,
    state_sha256: createHash('sha256').update(original).digest('hex'), through_chapter: through,
    imported_through_chapter: state.imported_through_chapter,
  }
  let result: Record<string, unknown>
  if (kind === undefined) {
    const hooks = Object.values(state.foreshadow)
    const count = (filter: QueryFilter): number => hooks.filter(row => matchesForeshadow(row, filter, atChapter)).length
    result = {
      ...base, next_chapter: through + 1, context: state.context,
      counts: {
        characters: Object.keys(state.characters).length, foreshadow: hooks.length,
        open: count('open'), due: count('due'), overdue: count('overdue'), unscheduled: count('unscheduled'),
        timeline: Object.keys(state.timeline).length,
      },
    }
  } else {
    let rows: Record<string, unknown>[] = []
    let missing: string[] = []
    let healthReport: HealthReport | undefined
    if (kind === 'health') {
      healthReport = assessHealth(state, {
        chapter: atChapter,
        ...(stalePlanted === undefined ? {} : { stalePlanted }),
        ...(staleCharacter === undefined ? {} : { staleCharacter }),
        ...(staleThread === undefined ? {} : { staleThread }),
      })
      rows = healthReport.items.map(item => ({
        risk: item.risk, id: item.id, summary: item.summary, age: item.age,
        anchor_chapter: item.anchor_chapter, source: item.source,
        ...(item.active === undefined ? {} : { active: item.active }),
      }))
    } else if (kind === 'characters') {
      rows = Object.keys(state.characters).sort().map(name => ({ name, ...state.characters[name], source: `追踪/角色状态/${name}.md` }))
    } else if (kind === 'foreshadow') {
      const importance = { 高: 0, 中: 1, 低: 2 } as const
      rows = Object.values(state.foreshadow)
        .filter(row => matchesForeshadow(row, selection, atChapter))
        .sort((a, b) => (a.planned_resolution_chapter ?? Infinity) - (b.planned_resolution_chapter ?? Infinity)
          || importance[a.importance] - importance[b.importance] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(row => ({ ...row, source: '追踪/伏笔.md' }))
    } else if (kind === 'author-timeline' || kind === 'reader-timeline') {
      const field = kind === 'author-timeline' ? 'objective_fact' : 'reader_knowledge'
      const source = kind === 'author-timeline' ? '追踪/时间线/作者真相.md' : '追踪/时间线/读者已知.md'
      rows = Object.values(state.timeline)
        .sort((a, b) => a.first_recorded_chapter - b.first_recorded_chapter || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map(row => ({
          id: row.id, story_time: row.story_time, [field]: row[field], reveal_status: row.reveal_status,
          reveal_chapter: row.reveal_chapter, characters: row.characters,
          first_recorded_chapter: row.first_recorded_chapter, updated_chapter: row.updated_chapter, source,
        }))
    } else {
      require(atChapter <= through, 'chapter is beyond committed tracking')
      const relative = deltaPath('追踪', atChapter).split(sep).join('/')
      const delta = sourcePath(project, relative)
      if (existsSync(delta)) {
        const payload = readFileSync(delta)
        require(payload.byteLength <= DELTA_MAX_BYTES, `chapter record exceeds byte limit: ${relative}`)
        rows = [{ chapter: atChapter, content: payload.toString('utf8'), source: relative }]
      } else {
        missing = [relative]
      }
    }
    const needle = search.toLowerCase().trim()
    if (needle !== '') rows = rows.filter(row => JSON.stringify(row).toLowerCase().includes(needle))
    if (healthReport !== undefined) {
      const countRisk = (risk: string): number => rows.filter(row => row.risk === risk).length
      healthReport = {
        ...healthReport,
        counts: {
          overdue_foreshadow: countRisk('overdue-foreshadow'),
          unscheduled_foreshadow: countRisk('unscheduled-foreshadow'),
          stale_character: countRisk('stale-character'),
          stale_thread: countRisk('stale-thread'),
        },
      }
    }
    result = {
      ...base, kind, at_chapter: atChapter, filter: selection, search,
      total: rows.length, offset, items: [] as Record<string, unknown>[], omitted: rows.length,
      next_offset: null as number | null, missing_sources: missing,
      ...(healthReport === undefined ? {} : { thresholds: healthReport.thresholds, counts: healthReport.counts }),
    }
    const items = result.items as Record<string, unknown>[]
    for (const row of rows.slice(offset, offset + limit)) {
      items.push(row)
      const count = items.length
      result.omitted = rows.length - count
      result.next_offset = offset + count < rows.length ? offset + count : null
      if (encoded(result) > QUERY_MAX_BYTES) {
        items.pop()
        require(items.length > 0, 'one result exceeds query byte budget; read its source directly')
        break
      }
    }
    const count = items.length
    result.omitted = rows.length - count
    result.next_offset = offset + count < rows.length ? offset + count : null
  }
  require(encoded(result) <= QUERY_MAX_BYTES, 'query exceeds byte budget; narrow its scope')
  require(!projectCommitInProgress(project) && readFileSync(path).equals(original), 'tracking changed during query; restart from offset 0')
  return result
}
