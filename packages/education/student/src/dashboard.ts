import type { StudyState } from './schema.ts'
import type { CurriculumSubject } from './curriculum.ts'
import { diagnosticFor, insightSummary, studyInsight } from './learning/mastery.ts'
import { studyStatus, weeklySummary } from './learning/status.ts'
import { checkInHistory, curriculumView, itemObjectiveId, objectiveInfo, reviewPlan, sheetOpen } from './learning/view.ts'

/** Mistake-book filter for the confirmed list. */
export type MistakeStatus = 'all' | 'due' | 'reviewing' | 'mastered'
/** The workbench tab a payload is built for; the map tab carries the full knowledge map, others a lite one. */
export type StudyTab = 'today' | 'map' | 'mistakes' | 'parent'

/**
 * Bounded sidebar projection: status, the selected subject's knowledge map with mastery,
 * weak points, the next step and one page of the mistake notebook.
 * @param state - current durable learning state, or undefined before setup.
 * @param now - host wall-clock time in milliseconds.
 * @param options - selected subject, notebook offset and status filter, an optional grade and term to browse another knowledge map, and an optional check-in scope (grade, term, unit).
 * @returns the dashboard payload served to the workbench.
 */
export function dashboard(state: StudyState | undefined, now: number, options: { subject?: CurriculumSubject; mistakeOffset?: number; mistakeStatus?: MistakeStatus; mapGrade?: number; mapTerm?: 'first' | 'second'; diagGrade?: number; diagTerm?: 'first' | 'second'; diagUnit?: string; tab?: StudyTab } = {}) {
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
    concepts: state.concepts.filter(item => item.subject === subject).slice(-20).reverse(),
    objectives: state.objectives.filter(item => item.subject === subject).slice(-20).reverse(),
    relations: state.relations.filter(item => state.concepts.some(concept => concept.id === item.fromId && concept.subject === subject)).slice(-20),
    worksheets: state.worksheets.filter(item => item.subject === subject && item.discardedAt === undefined).slice(-20).reverse().map(sheet => {
      const titles = [...new Set(sheet.items.map(item => objectiveInfo(state, itemObjectiveId(state, sheet, item) ?? '')?.title).filter(title => title !== undefined))]
      return {
        ...sheet,
        objectiveTitle: titles.length <= 2 ? titles.join('、') : `${titles.slice(0, 2).join('、')}等 ${titles.length} 个目标`,
        open: sheetOpen(state, sheet),
        results: state.paperResults.filter(item => item.worksheetId === sheet.id).map(item => ({ itemId: item.itemId, result: item.result, response: item.response, assistance: item.assistance })),
        drafts: state.paperDrafts.filter(item => item.worksheetId === sheet.id).map(item => ({ itemId: item.itemId, response: item.response, result: item.result, assistance: item.assistance, uncertainties: item.uncertainties, ...(item.errorType !== undefined ? { errorType: item.errorType } : {}), ...(item.confidence !== undefined ? { confidence: item.confidence } : {}) })),
        sources: sheet.items.map(item => {
          const mistake = item.mistakeId ? state.mistakes.find(candidate => candidate.id === item.mistakeId) : undefined
          const fromHere = mistake?.source?.worksheetId === sheet.id && mistake.source.itemId === item.id
          return { itemId: item.id, ...(item.mistakeId && !fromHere ? { mistakeId: item.mistakeId } : {}), topic: fromHere ? '' : mistake?.topic ?? '', stage: mistake?.stage ?? 0 }
        }),
      }
    }),
    reviewPlan: (({ picks, objectiveFills, remaining, unlinkedDue, openSheets }) => ({ picks: picks.length, fills: objectiveFills.length, remaining, unlinkedDue: unlinkedDue.length, openSheets: openSheets.length }))(reviewPlan(state, subject, now, 8, insight)),
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
    curriculum: (() => { const view = curriculumView(state, subject, insight, scope); return view === null ? null : lighten(view, options.tab) })(),
    diagnostic: insight.diagnostics.find(plan => plan.subject === subject) ?? null,
    scopedDiagnostic: options.diagGrade !== undefined || options.diagTerm !== undefined
      ? diagnosticFor(state, subject, now, { grade: options.diagGrade ?? state.profile.grade, term: options.diagTerm ?? state.profile.term, ...(options.diagUnit !== undefined && options.diagUnit !== '' ? { units: [options.diagUnit] } : {}) }, insight)
      : null,
    scopedUnits: options.diagGrade !== undefined || options.diagTerm !== undefined
      ? (curriculumView(state, subject, insight, { grade: options.diagGrade ?? state.profile.grade, term: options.diagTerm ?? state.profile.term })?.units.map(unit => ({ id: unit.id, name: unit.name })) ?? [])
      : [],
    checkIns: checkInHistory(state),
    ...insightSummary(insight),
    weekly: weeklySummary(state, now, insight),
    diagnostics: insight.diagnostics,
    materials: state.materials.filter(item => state.courses.some(course => course.materialId === item.id)),
    workbookDrafts: state.workbookDrafts.filter(item => item.subject === subject).slice(-20).reverse(),
    teachingQueue: state.teachingQueue.filter(item => item.subject === subject).slice(-20).reverse(),
    recentAttempts: state.attempts.filter(item => item.subject === subject).slice(-20).reverse(),
  } }
}

/** Drop the heavy map collections unless the map tab asked for them; objectives, units and summary stay for progress dots and goal lists. */
function lighten(view: NonNullable<ReturnType<typeof curriculumView>>, tab: StudyTab | undefined) {
  if (tab === undefined || tab === 'map') return view
  return { ...view, concepts: [], relations: [], ideas: [], order: [], lite: true }
}

/** Shared HTTP response shape; client imports this type without host runtime code. */
export type Dashboard = ReturnType<typeof dashboard>
