import type { StudyState } from './schema.ts'
import { studyStatus } from './learning.ts'

/** Bounded sidebar projection; complete history stays available through study_status. */
export function dashboard(state: StudyState | undefined, now: number) {
  if (!state) return { serverNow: now, revision: 0, study: null }
  const status = studyStatus(state, now)
  return { serverNow: now, revision: state.revision, study: {
    ...status, progress: status.progress.slice(-20),
    dueMistakes: status.dueMistakes.slice(0, 20), dueCount: status.dueMistakes.length, dueSubjects: [...new Set(status.dueMistakes.map(item => item.subject))],
    pendingMistakes: state.mistakes.filter(item => item.confirmedAt === undefined).slice(0, 20), pendingCount: status.pendingMistakes.length,
    materials: state.materials.filter(item => state.courses.some(course => course.materialId === item.id)),
    recentAttempts: state.attempts.slice(-20).reverse(),
  } }
}

/** Shared HTTP response shape; client imports this type without host runtime code. */
export type Dashboard = ReturnType<typeof dashboard>
