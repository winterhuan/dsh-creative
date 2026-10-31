/**
 * Read-only health risks from one tracking state.
 *
 * Character snapshots have no update chapter. A character's last touch is the
 * newest `updated_chapter` among timeline events that name them. A character
 * with no such event is not reported, because the snapshot cannot show how
 * long it has stood unchanged. Open threads on that character use the same
 * touch. The check does not write state or derived views.
 */

/** Chapters an unscheduled foreshadow may stay planted before it is stale. */
export const DEFAULT_STALE_PLANTED_CHAPTERS = 30
/** Chapters since a character's last timeline touch before that character is stale. */
export const DEFAULT_STALE_CHARACTER_CHAPTERS = 20
/** Chapters an unrevealed fact or open thread may stay open before it is stale. */
export const DEFAULT_STALE_THREAD_CHAPTERS = 40
/** Largest accepted health threshold. */
export const HEALTH_THRESHOLD_MAX = 100_000
/** Health rows kept in a writing-context summary before the rest are omitted. */
export const HEALTH_SUMMARY_LIMIT = 8

/** Health risk kinds, most urgent first. */
export const HEALTH_RISKS = ['overdue-foreshadow', 'unscheduled-foreshadow', 'stale-character', 'stale-thread'] as const

/** One health risk kind. */
export type HealthRisk = typeof HEALTH_RISKS[number]

/** Options of {@link assessHealth}. Omitted thresholds use the defaults above. */
export interface HealthOptions {
  /** Reference chapter. Defaults to the next chapter after the last commit. */
  readonly chapter?: number
  /** See {@link DEFAULT_STALE_PLANTED_CHAPTERS}. */
  readonly stalePlanted?: number
  /** See {@link DEFAULT_STALE_CHARACTER_CHAPTERS}. */
  readonly staleCharacter?: number
  /** See {@link DEFAULT_STALE_THREAD_CHAPTERS}. */
  readonly staleThread?: number
}

/** One risk row. `source` is a project-relative derived view. */
export interface HealthItem {
  readonly risk: HealthRisk
  readonly id: string
  readonly summary: string
  readonly age: number
  /** Planned chapter, planted chapter, last timeline touch, or first recorded chapter. */
  readonly anchor_chapter: number
  readonly source: string
  /** Present for `stale-character`: whether the name is on the hot card. */
  readonly active?: boolean
}

/** Thresholds echoed so a later page uses the same cutoffs. */
export interface HealthThresholds {
  readonly stale_planted: number
  readonly stale_character: number
  readonly stale_thread: number
}

/** Counts of every matching row, including rows omitted from a summary. */
export interface HealthCounts {
  readonly overdue_foreshadow: number
  readonly unscheduled_foreshadow: number
  readonly stale_character: number
  readonly stale_thread: number
}

/** Full health list for one reference chapter. */
export interface HealthReport {
  readonly at_chapter: number
  readonly thresholds: HealthThresholds
  readonly counts: HealthCounts
  readonly items: readonly HealthItem[]
}

/** Fields the check reads. Tracking state and the workbench view both satisfy this. */
export interface HealthState {
  readonly last_committed_chapter: number
  readonly context: { readonly active_character_names: readonly string[] }
  readonly characters: Readonly<Record<string, {
    readonly identity: string
    readonly state: string
    readonly open_threads: readonly string[]
  }>>
  readonly foreshadow: Readonly<Record<string, {
    readonly id: string
    readonly summary: string
    readonly planted_chapter: number
    readonly planned_resolution_chapter: number | null
    readonly status: string
    readonly importance: string
  }>>
  readonly timeline: Readonly<Record<string, {
    readonly id: string
    readonly objective_fact: string
    readonly reveal_status: string
    readonly characters: readonly string[]
    readonly first_recorded_chapter: number
    readonly updated_chapter: number
  }>>
}

const RISK_RANK: Readonly<Record<HealthRisk, number>> = {
  'overdue-foreshadow': 0,
  'unscheduled-foreshadow': 1,
  'stale-character': 2,
  'stale-thread': 3,
}
const FORESHADOW_SOURCE = '追踪/伏笔.md'
const TIMELINE_SOURCE = '追踪/时间线/作者真相.md'

interface Sortable {
  readonly item: HealthItem
  readonly importance: number
  readonly activeRank: number
}

function importanceRank(value: string): number {
  if (value === '高') return 0
  if (value === '中') return 1
  if (value === '低') return 2
  return 3
}

function characterSource(name: string): string {
  return `追踪/角色状态/${name}.md`
}

function lastTouch(state: HealthState, name: string): number | undefined {
  let latest: number | undefined
  for (const event of Object.values(state.timeline)) {
    if (!event.characters.includes(name)) continue
    if (latest === undefined || event.updated_chapter > latest) latest = event.updated_chapter
  }
  return latest
}

function countsOf(items: readonly HealthItem[]): HealthCounts {
  const count = (risk: HealthRisk): number => items.filter(item => item.risk === risk).length
  return {
    overdue_foreshadow: count('overdue-foreshadow'),
    unscheduled_foreshadow: count('unscheduled-foreshadow'),
    stale_character: count('stale-character'),
    stale_thread: count('stale-thread'),
  }
}

/**
 * List overdue hooks, long-unscheduled hooks, stale characters, and long-open threads.
 *
 * Overdue matches the foreshadow `overdue` filter: status `已埋` and a planned
 * chapter before `chapter`. Unscheduled hooks count from `planted_chapter`.
 * Resolved, expired, and abandoned hooks are omitted. `已揭示` timeline events
 * are omitted. `next_chapter_commitments` have no age and are omitted.
 * @param state - committed tracking fields.
 * @param options - reference chapter and thresholds.
 * @returns every matching row, most urgent first.
 */
export function assessHealth(state: HealthState, options: HealthOptions = {}): HealthReport {
  const atChapter = options.chapter ?? state.last_committed_chapter + 1
  const thresholds: HealthThresholds = {
    stale_planted: options.stalePlanted ?? DEFAULT_STALE_PLANTED_CHAPTERS,
    stale_character: options.staleCharacter ?? DEFAULT_STALE_CHARACTER_CHAPTERS,
    stale_thread: options.staleThread ?? DEFAULT_STALE_THREAD_CHAPTERS,
  }
  const active = new Set(state.context.active_character_names)
  const rows: Sortable[] = []
  for (const row of Object.values(state.foreshadow)) {
    if (row.status !== '已埋') continue
    const planned = row.planned_resolution_chapter
    if (planned !== null) {
      const age = atChapter - planned
      if (age < 1) continue
      rows.push({
        importance: importanceRank(row.importance),
        activeRank: 0,
        item: {
          risk: 'overdue-foreshadow', id: row.id, summary: row.summary, age,
          anchor_chapter: planned, source: FORESHADOW_SOURCE,
        },
      })
      continue
    }
    const age = atChapter - row.planted_chapter
    if (age < thresholds.stale_planted) continue
    rows.push({
      importance: importanceRank(row.importance),
      activeRank: 0,
      item: {
        risk: 'unscheduled-foreshadow', id: row.id, summary: row.summary, age,
        anchor_chapter: row.planted_chapter, source: FORESHADOW_SOURCE,
      },
    })
  }
  for (const [name, snapshot] of Object.entries(state.characters)) {
    const touch = lastTouch(state, name)
    if (touch === undefined) continue
    const age = atChapter - touch
    const isActive = active.has(name)
    if (age >= thresholds.stale_character) {
      rows.push({
        importance: 0,
        activeRank: isActive ? 0 : 1,
        item: {
          risk: 'stale-character', id: name, summary: `${snapshot.identity}｜${snapshot.state}`, age,
          anchor_chapter: touch, source: characterSource(name), active: isActive,
        },
      })
    }
    if (age < thresholds.stale_thread) continue
    for (const thread of snapshot.open_threads) {
      rows.push({
        importance: 0,
        activeRank: 0,
        item: {
          risk: 'stale-thread', id: name, summary: thread, age,
          anchor_chapter: touch, source: characterSource(name),
        },
      })
    }
  }
  for (const event of Object.values(state.timeline)) {
    if (event.reveal_status !== '未揭示' && event.reveal_status !== '部分揭示') continue
    const age = atChapter - event.first_recorded_chapter
    if (age < thresholds.stale_thread) continue
    rows.push({
      importance: 0,
      activeRank: 0,
      item: {
        risk: 'stale-thread', id: event.id, summary: event.objective_fact, age,
        anchor_chapter: event.first_recorded_chapter, source: TIMELINE_SOURCE,
      },
    })
  }
  rows.sort((left, right) => RISK_RANK[left.item.risk] - RISK_RANK[right.item.risk]
    || right.item.age - left.item.age
    || left.importance - right.importance
    || left.activeRank - right.activeRank
    || (left.item.id < right.item.id ? -1 : left.item.id > right.item.id ? 1 : 0)
    || (left.item.summary < right.item.summary ? -1 : left.item.summary > right.item.summary ? 1 : 0))
  const items = rows.map(row => row.item)
  return { at_chapter: atChapter, thresholds, counts: countsOf(items), items }
}
