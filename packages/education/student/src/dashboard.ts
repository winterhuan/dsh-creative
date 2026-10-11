import type { StudyState } from './schema.ts'
import type { CurriculumSubject } from './curriculum.ts'
import { curriculumView, insightSummary, objectiveInfo, studyInsight, studyStatus } from './learning.ts'

/** Mistake-book filter for the confirmed list. */
export type MistakeStatus = 'all' | 'due' | 'reviewing' | 'mastered'

/**
 * Bounded sidebar projection: status, the selected subject's knowledge map with mastery,
 * weak points, the next step and one page of the mistake notebook.
 * @param state - current durable learning state, or undefined before setup.
 * @param now - host wall-clock time in milliseconds.
 * @param options - selected subject, notebook offset and status filter, and an optional grade and term to browse another knowledge map.
 * @returns the dashboard payload served to the workbench.
 */
export function dashboard(state: StudyState | undefined, now: number, options: { subject?: CurriculumSubject; mistakeOffset?: number; mistakeStatus?: MistakeStatus; mapGrade?: number; mapTerm?: 'first' | 'second' } = {}) {
  if (!state) return { serverNow: now, revision: 0, study: null }
  const subject = options.subject ?? 'math'
  const mistakeOffset = options.mistakeOffset ?? 0
  const mistakeStatus = options.mistakeStatus ?? 'all'
  const status = studyStatus(state, now)
  const insight = studyInsight(state, now)
  const scope = options.mapGrade !== undefined || options.mapTerm !== undefined ? { grade: options.mapGrade ?? state.profile.grade, term: options.mapTerm ?? state.profile.term } : undefined
  const inStatus = (item: StudyState['mistakes'][number]) => {
    if (item.confirmedAt === undefined) return false
    if (mistakeStatus === 'due') return item.dueAt !== undefined && item.dueAt <= now
    if (mistakeStatus === 'reviewing') return item.stage < 4
    if (mistakeStatus === 'mastered') return item.stage >= 4
    return true
  }
  const confirmedCounts = { chinese: 0, math: 0, english: 0 }
  const confirmed = state.mistakes.filter(item => {
    if (!inStatus(item)) return false
    confirmedCounts[item.subject]++
    return item.subject === subject
  }).reverse()
  const confirmedOffset = Math.min(mistakeOffset, Math.max(0, Math.ceil(confirmed.length / 20) - 1) * 20)
  const book = state.mistakes.filter(item => item.subject === subject && item.confirmedAt !== undefined)
  const due = status.dueMistakes.filter(item => item.subject === subject)
  const pending = state.mistakes.filter(item => item.subject === subject && item.confirmedAt === undefined)
  return { serverNow: now, revision: state.revision, study: {
    ...status,
    progress: status.progress.filter(item => item.subject === subject).slice(-20),
    printAvailable: process.platform !== 'win32',
    concepts: state.concepts.filter(item => item.subject === subject).slice(-20).reverse(),
    objectives: state.objectives.filter(item => item.subject === subject).slice(-20).reverse(),
    relations: state.relations.filter(item => state.concepts.some(concept => concept.id === item.fromId && concept.subject === subject)).slice(-20),
    worksheets: state.worksheets.filter(item => item.subject === subject).slice(-20).reverse().map(sheet => ({
      ...sheet,
      objectiveTitle: objectiveInfo(state, sheet.objectiveId)?.title ?? sheet.objectiveId,
      results: state.paperResults.filter(item => item.worksheetId === sheet.id).map(item => ({ itemId: item.itemId, result: item.result, response: item.response })),
      sources: sheet.items.map(item => {
        const mistake = state.mistakes.find(candidate => candidate.id === item.mistakeId)
        return { itemId: item.id, mistakeId: item.mistakeId, topic: mistake?.topic ?? item.mistakeId, stage: mistake?.stage ?? 0 }
      }),
    })),
    paperResults: state.paperResults.filter(item => state.worksheets.some(sheet => sheet.id === item.worksheetId && sheet.subject === subject)).slice(-20).reverse(),
    dueMistakes: due.slice(0, 20), dueCount: due.length, dueTotal: status.dueMistakes.length, dueSubjects: due.length ? [subject] : [],
    pendingMistakes: pending.slice(0, 20), pendingCount: pending.length,
    confirmedMistakes: confirmed.slice(confirmedOffset, confirmedOffset + 20), confirmedCount: confirmed.length, confirmedCounts, confirmedOffset, confirmedSubject: subject,
    mistakeStatus,
    mistakeBook: {
      due: book.filter(item => item.dueAt !== undefined && item.dueAt <= now).length,
      reviewing: book.filter(item => item.stage < 4 && (item.dueAt === undefined || item.dueAt > now)).length,
      mastered: book.filter(item => item.stage >= 4).length,
      pending: pending.length,
    },
    curriculum: curriculumView(state, subject, insight, scope),
    diagnostic: insight.diagnostics.find(plan => plan.subject === subject) ?? null,
    lastDiagnosis: lastDiagnosis(state, subject),
    ...insightSummary(insight),
    materials: state.materials.filter(item => state.courses.some(course => course.materialId === item.id)),
    recentAttempts: state.attempts.filter(item => item.subject === subject).slice(-20).reverse(),
  } }
}

function lastDiagnosis(state: StudyState, subject: CurriculumSubject) {
  const session = state.sessions.filter(item => item.mode === 'diagnose' && item.subject === subject).at(-1)
  if (!session) return null
  return {
    sessionId: session.id, startedAt: session.startedAt, endedAt: session.endedAt ?? null,
    results: state.attempts.filter(item => item.sessionId === session.id).map(item => ({
      id: item.id, objectiveId: item.objectiveId ?? null, result: item.result, assistance: item.assistance,
      title: item.objectiveId ? objectiveInfo(state, item.objectiveId)?.title ?? item.topic : item.topic,
    })),
  }
}

/** Shared HTTP response shape; client imports this type without host runtime code. */
export type Dashboard = ReturnType<typeof dashboard>
