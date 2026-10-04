/** Read-only validation and projections of the tracking fields displayed in the workbench. */
import { z } from 'zod'

const text = z.string().trim().min(1)
const count = z.number().int().nonnegative()
const chapter = z.number().int().positive()
const strings = z.array(text)
const character = z.object({
  identity: text, location: text, goal: text, state: text,
  abilities_resources: strings.default([]), relationships: strings.default([]),
  knowledge: strings.default([]), open_threads: strings.default([]),
})
const foreshadow = z.object({
  id: z.string().regex(/^F\d{3,}$/u), summary: text, planted_chapter: chapter,
  planned_resolution_chapter: chapter.nullable(), status: z.enum(['已埋', '已回收', '已过期', '放弃']),
  importance: z.enum(['高', '中', '低']), updated_chapter: chapter,
})
const timeline = z.object({
  id: z.string().regex(/^E\d{3,}$/u), story_time: text, objective_fact: text, reader_knowledge: text,
  reveal_status: z.enum(['未揭示', '部分揭示', '已揭示']), reveal_chapter: chapter.nullable(),
  characters: strings.default([]), first_recorded_chapter: chapter, updated_chapter: chapter,
})
const schema = z.object({
  schema_version: z.union([z.literal(4), z.literal(5)]), book_title: text,
  last_committed_chapter: count, imported_through_chapter: count, state_revision: count,
  context: z.object({
    position: z.object({ volume: text, volume_start_chapter: chapter, story_time: text, scene: text }),
    long_term_constraints: strings.max(6).default([]), active_character_names: strings.max(6).default([]),
    continuity_risks: strings.max(5).default([]), next_chapter_commitments: strings.max(5).default([]),
    recent_chapters: z.array(z.object({ chapter, summary: text })).max(3).default([]),
  }),
  characters: z.record(z.string(), character).default({}),
  foreshadow: z.record(z.string(), foreshadow).default({}),
  timeline: z.record(z.string(), timeline).default({}),
}).superRefine((state, ctx) => {
  const last = state.last_committed_chapter
  const invalid = state.imported_through_chapter > last
    || state.context.position.volume_start_chapter > Math.max(1, last)
    || state.context.recent_chapters.some(row => row.chapter > last)
    || state.context.active_character_names.some(name => !Object.hasOwn(state.characters, name))
    || Object.entries(state.characters).some(([name]) => /[<>:"/\\|?*\x00-\x1f]/u.test(name) || name === '.' || name === '..')
    || Object.entries(state.foreshadow).some(([id, row]) => row.id !== id || row.planted_chapter > last || row.updated_chapter > last
      || (row.planned_resolution_chapter !== null && row.planned_resolution_chapter < row.planted_chapter))
    || Object.entries(state.timeline).some(([id, row]) => row.id !== id || row.first_recorded_chapter > last || row.updated_chapter > last
      || (row.reveal_status === '未揭示' ? row.reveal_chapter !== null : row.reveal_chapter === null || row.reveal_chapter > last))
  if (invalid) ctx.addIssue({ code: 'custom', message: 'Tracking facts disagree with their chapter or identity.' })
})

/** Displayed continuity fields; historical review and word-count records confer no approval. */
export type TrackingView = z.infer<typeof schema>
/** Foreshadow filters shared by counters and the list. */
export type ForeshadowFilter = 'all' | 'open' | 'due' | 'overdue' | 'unscheduled' | 'resolved'

/** Decode supported tracking versions without migrating or writing them.
 * @param content - the authoritative tracking JSON read through the workspace API.
 * @returns validated fields required for presentation.
 * @throws SyntaxError or ZodError for unreadable or inconsistent display data.
 */
export function parseTrackingView(content: string): TrackingView { return schema.parse(JSON.parse(content)) }

/** Filter all tracked foreshadowing independently of the eight-item continuation card.
 * @param state - validated current tracking.
 * @param filter - unresolved deadline or state selection.
 * @returns due-date, importance and ID ordered entries, with no truncation.
 */
export function selectForeshadow(state: TrackingView, filter: ForeshadowFilter) {
  const next = state.last_committed_chapter + 1
  const importance = { 高: 0, 中: 1, 低: 2 }
  return Object.values(state.foreshadow).filter(row => {
    if (filter === 'all') return true
    if (filter === 'resolved') return row.status === '已回收'
    if (row.status !== '已埋') return false
    const due = row.planned_resolution_chapter
    return filter === 'open' || (filter === 'unscheduled' && due === null)
      || (filter === 'due' && due !== null && due <= next) || (filter === 'overdue' && due !== null && due < next)
  }).sort((a, b) => (a.planned_resolution_chapter ?? Infinity) - (b.planned_resolution_chapter ?? Infinity)
    || importance[a.importance] - importance[b.importance] || a.id.localeCompare(b.id))
}
