/**
 * Compact `project check` report.
 *
 * The original two fields stay. `facts` explains ledger coverage: chapters
 * with a wordcount record that are absent from `covered_chapters`, and rows
 * whose source hash no longer matches. A missing ledger file still lists
 * those committed chapters as `missing_chapters`. `facts stale` keeps its
 * own rule and returns an empty gap when the file is absent.
 */
import { FactsError, loadFacts, staleFacts } from './facts.ts'
import { checkProject } from './tracking/store.ts'

/** Schema of {@link projectCheckReport}. */
export const PROJECT_CHECK_SCHEMA = 'story-project-check/v1'

/** Ledger coverage attached to a project check. */
export interface ProjectCheckFacts {
  readonly present: boolean
  readonly covered_chapters: readonly number[]
  readonly missing_chapters: readonly number[]
  readonly stale_count: number
  readonly stale: readonly { readonly id: string; readonly chapter: number }[]
  readonly error?: string
}

/**
 * Verify derived tracking views and attach a ledger gap summary.
 * @param project - the book directory.
 * @returns the two progress fields plus `facts`.
 * @throws TrackingError when derived views disagree with the state file.
 */
export function projectCheckReport(project: string): {
  schema: typeof PROJECT_CHECK_SCHEMA
  last_committed_chapter: number
  state_revision: number
  facts: ProjectCheckFacts
} {
  const state = checkProject(project)
  return {
    schema: PROJECT_CHECK_SCHEMA,
    last_committed_chapter: state.last_committed_chapter,
    state_revision: state.state_revision,
    facts: factsSummary(project, Object.keys(state.wordcount_records).map(key => Number(key))),
  }
}

function factsSummary(project: string, committed: readonly number[]): ProjectCheckFacts {
  try {
    const ledger = loadFacts(project)
    const stale = staleFacts(project)
    const missing = ledger.present
      ? stale.missing_chapters
      : committed.filter(chapter => Number.isInteger(chapter) && chapter >= 1).sort((left, right) => left - right)
    return {
      present: ledger.present,
      covered_chapters: ledger.covered_chapters,
      missing_chapters: missing,
      stale_count: stale.stale.length,
      stale: stale.stale.map(row => ({ id: row.id, chapter: row.chapter })),
    }
  } catch (error) {
    if (!(error instanceof FactsError)) throw error
    return {
      present: false,
      covered_chapters: [],
      missing_chapters: [],
      stale_count: 0,
      stale: [],
      error: error.message,
    }
  }
}
