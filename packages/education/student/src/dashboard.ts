import type { StudyState } from './schema.ts'
import { studyStatus } from './learning.ts'

/** Bounded sidebar projection; confirmed mistakes can be read one page at a time. */
export function dashboard(state: StudyState | undefined, now: number, mistakeOffset = 0, mistakeSubject: StudyState['mistakes'][number]['subject'] = 'math') {
  if (!state) return { serverNow: now, revision: 0, study: null }
  const status = studyStatus(state, now)
  const due = status.dueMistakes.filter(item => item.subject === mistakeSubject)
  const pending = state.mistakes.filter(item => item.subject === mistakeSubject && item.confirmedAt === undefined)
  const confirmedCounts = { chinese: 0, math: 0, english: 0 }
  const confirmed = state.mistakes.filter(item => {
    if (item.confirmedAt === undefined) return false
    confirmedCounts[item.subject]++
    return item.subject === mistakeSubject
  }).reverse()
  const confirmedOffset = Math.min(mistakeOffset, Math.max(0, Math.ceil(confirmed.length / 20) - 1) * 20)
  return { serverNow: now, revision: state.revision, study: {
    ...status, progress: status.progress.filter(item => item.subject === mistakeSubject).slice(-20),
    printAvailable: process.platform !== 'win32',
    concepts: state.concepts.filter(item => item.subject === mistakeSubject).slice(-20).reverse(),
    objectives: state.objectives.filter(item => item.subject === mistakeSubject).slice(-20).reverse(),
    relations: state.relations.filter(item => state.concepts.some(concept => concept.id === item.fromId && concept.subject === mistakeSubject)).slice(-20),
    worksheets: state.worksheets.filter(item => item.subject === mistakeSubject).slice(-20).reverse(),
    paperResults: state.paperResults.filter(item => state.worksheets.some(sheet => sheet.id === item.worksheetId && sheet.subject === mistakeSubject)).slice(-20).reverse(),
    dueMistakes: due.slice(0, 20), dueCount: due.length, dueSubjects: due.length ? [mistakeSubject] : [],
    pendingMistakes: pending.slice(0, 20), pendingCount: pending.length,
    confirmedMistakes: confirmed.slice(confirmedOffset, confirmedOffset + 20), confirmedCount: confirmed.length, confirmedCounts, confirmedOffset, confirmedSubject: mistakeSubject,
    materials: state.materials.filter(item => state.courses.some(course => course.materialId === item.id)),
    recentAttempts: state.attempts.filter(item => item.subject === mistakeSubject).slice(-20).reverse(),
  } }
}

/** Shared HTTP response shape; client imports this type without host runtime code. */
export type Dashboard = ReturnType<typeof dashboard>
