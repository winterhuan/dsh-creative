/**
 * The tracking init document shared by story book fixtures.
 * `last_chapter` is the only field these fixtures vary.
 */
export function sampleTrackingInput(lastChapter = 1): {
  schema_version: 1
  book_title: '样书'
  last_chapter: number
  context: {
    position: { volume: '第一卷'; volume_start_chapter: 1; story_time: '夜'; scene: '街' }
    long_term_constraints: []
    active_character_names: []
    continuity_risks: []
    recent_chapters: []
    next_chapter_commitments: []
  }
  character_snapshots: Record<string, never>
  foreshadow: []
  timeline_events: []
} {
  return {
    schema_version: 1, book_title: '样书', last_chapter: lastChapter,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
      long_term_constraints: [], active_character_names: [], continuity_risks: [],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {}, foreshadow: [], timeline_events: [],
  }
}
