import type { ErrorType, StudyState } from '../schema.ts'
import { builtinObjectives, builtinObjectivesIn, curriculumFor, type CurriculumMethod, type CurriculumScope, type CurriculumSubject } from '../curriculum.ts'
import { DAY, schoolGate, scopeSelects, studyDay, taughtUnit, type ObjectiveBase, type Outcome } from './shared.ts'

/** Subject display order shared by check-in plans and history. */
export const SUBJECT_ORDER = ['chinese', 'math', 'english'] as const
const DIAGNOSIS_INTERVAL = 14 * DAY
const RECHECK_AFTER = 30 * DAY

/** Why an objective needs attention; codes are localized by the workbench and read by the model. */
export interface InsightReason {
  code: 'due-mistakes' | 'open-mistakes' | 'recent-help-or-error' | 'recurring-error' | 'not-practised-recently' | 'not-started' | 'diagnosis-due' | 'preview' | 'school-pace' | 'needs-teaching' | 'prerequisite-gap'
  count: number
}

/** One objective's mastery derived from saved attempts, paper results and linked mistakes. */
export interface ObjectiveInsight {
  id: string
  subject: CurriculumSubject
  title: string
  goal: string
  method: CurriculumMethod
  unit: string
  unitName: string
  conceptIds: string[]
  level: 'due' | 'weak' | 'stalled' | 'mastered' | 'practising' | 'untouched'
  independentDays: number
  attempts: number
  helpedOrWrong: number
  lastAt?: number
  activeMistakes: number
  dueMistakes: number
  masteredMistakes: number
  errorTypes: { type: ErrorType; count: number }[]
  priority: number
  reasons: InsightReason[]
}

/** How much one check-in block probes: three quick choice questions, six mixed, or twelve with reasoning and progress re-checks. */
export type CheckInIntensity = 'light' | 'standard' | 'deep'
/** Objectives probed per intensity. */
export const checkInSizes: Record<CheckInIntensity, number> = { light: 3, standard: 6, deep: 12 }

/** One objective selected for a check-in and why. */
export interface DiagnosticSample { id: string; title: string; unit: string; unitName: string; reason: 'untouched' | 'stalled' | 'recheck' | 'progress' }

/** One subject's recurring check-in plan: whether a check-in is due, coverage so far and the objectives to probe per intensity. */
export interface DiagnosticPlan {
  subject: CurriculumSubject
  due: boolean
  lastAt?: number
  nextAt?: number
  untouched: number
  stalled: number
  recheck: number
  coverage: { probed: number; total: number }
  recommendedIntensity: CheckInIntensity
  sample: DiagnosticSample[]
  samples: Record<CheckInIntensity, DiagnosticSample[]>
  scope?: CurriculumScope & { units?: string[] | undefined; objectiveIds?: string[] | undefined }
}

/** One recorded check-in block with its answers and counts. */
export interface CheckInRecord {
  subject: CurriculumSubject
  sessionId: string
  startedAt: number
  endedAt: number | null
  intensity: CheckInIntensity
  counts: { independent: number; helped: number; wrong: number; unassessed: number }
  results: { id: string; objectiveId: string | null; title: string; result: StudyState['attempts'][number]['result']; assistance: StudyState['attempts'][number]['assistance'] }[]
}

/** One non-scored "explain it back" nudge derived from today's evidence; never part of mastery. */
export interface UnderstandingReminder {
  code: 'first-explain' | 'after-correction' | 'before-next'
  subject: CurriculumSubject
  objectiveId?: string
  title: string
}

/** Cross-subject insight: every objective's mastery, the weakest points, check-in plans, the error-cause profile and the next recommended step. */
export interface StudyInsight {
  objectives: ObjectiveInsight[]
  weakPoints: ObjectiveInsight[]
  diagnostics: DiagnosticPlan[]
  recommendation: {
    kind: 'review' | 'practice' | 'diagnose' | 'learn' | 'preview' | 'hold'
    subject: CurriculumSubject
    objectiveId?: string
    title?: string
    reason: InsightReason
    /** Confirmed school unit name for this subject, when the parent has saved one. */
    unitName?: string
    /** When practice redirects to an unmet prerequisite, the goal that raised the need. */
    redirectedFrom?: { id: string; title: string }
  } | null
  /** At most two due mistakes to clear today. A longer overdue list stays in `dueBacklog`. */
  dueToday: DueClear[]
  /** Confirmed due mistakes inside the suggestion range, including `dueToday`. */
  dueBacklog: number
  errorProfile: { subject: CurriculumSubject; type: ErrorType; count: number; objectiveIds: string[] }[]
  understandingReminders: UnderstandingReminder[]
}

/** One due mistake the Today page asks the learner to clear. */
export interface DueClear {
  id: string
  subject: CurriculumSubject
  topic: string
  objectiveId?: string
}


function outcomeIndex(state: StudyState): Map<string, Outcome[]> {
  const index = new Map<string, Outcome[]>()
  const add = (objectiveId: string | undefined, outcome: Outcome) => {
    if (objectiveId === undefined) return
    index.set(objectiveId, [...(index.get(objectiveId) ?? []), outcome])
  }
  const mistakeObjective = new Map(state.mistakes.map(mistake => [mistake.id, mistake.objectiveId]))
  const worksheetObjective = new Map<string, string>()
  for (const sheet of state.worksheets) for (const item of sheet.items) {
    const goal = item.objectiveId ?? (item.mistakeId !== undefined ? mistakeObjective.get(item.mistakeId) : undefined) ?? sheet.objectiveId
    if (goal !== undefined) worksheetObjective.set(`${sheet.id}:${item.id}`, goal)
  }
  for (const attempt of state.attempts) add(attempt.objectiveId, { at: attempt.at, result: attempt.result, assistance: attempt.assistance })
  for (const result of state.paperResults) add(worksheetObjective.get(`${result.worksheetId}:${result.itemId}`), { at: result.receivedAt, result: result.result, assistance: result.assistance })
  return index
}

/**
 * Whether this objective still needs a teaching block.
 * One "不会" stays until a later independent correct. Correct only with help, and a teaching-queue item
 * with no independent correct after it was confirmed, do the same.
 */
function teachingNeeded(outcomes: Outcome[], queue: { confirmedAt: number }[]): boolean {
  const stuckAt = outcomes.flatMap(item => item.result === 'stuck' ? [item.at] : [])
  const latestStuck = stuckAt.length > 0 ? Math.max(...stuckAt) : undefined
  if (latestStuck !== undefined && !outcomes.some(item => item.at > latestStuck && item.result === 'correct' && item.assistance === 'independent')) return true
  const independentCorrect = outcomes.some(item => item.result === 'correct' && item.assistance === 'independent')
  if (!independentCorrect && outcomes.some(item => item.result === 'correct' && item.assistance !== 'independent')) return true
  return queue.some(item => !outcomes.some(outcome => outcome.at >= item.confirmedAt && outcome.result === 'correct' && outcome.assistance === 'independent'))
}

/**
 * One objective's mastery derived from its outcome evidence, its confirmed mistakes and the teaching queue.
 * One rule serves the current-term insight and every cross-grade check-in plan; an objective never
 * independently answered that was recently wrong counts as weak, and a recurring error cause raises priority.
 */
function masteryOf(state: StudyState, base: ObjectiveBase, outcomes: Outcome[], now: number): ObjectiveInsight {
  const independentDays = new Set(outcomes.filter(item => item.result === 'correct' && item.assistance === 'independent').map(item => studyDay(item.at)))
  const lastAt = outcomes.reduce<number | undefined>((latest, item) => latest === undefined || item.at > latest ? item.at : latest, undefined)
  const helpedOrWrong = outcomes.filter(item => item.at >= now - 14 * DAY && (item.result === 'incorrect' || item.result === 'partial' || (item.result === 'correct' && item.assistance !== 'independent'))).length
  const wrongRecent = outcomes.filter(item => item.at >= now - 14 * DAY && (item.result === 'incorrect' || item.result === 'partial')).length
  const mistakes = state.mistakes.filter(item => item.objectiveId === base.id && item.confirmedAt !== undefined)
  const dueMistakes = mistakes.filter(item => item.dueAt !== undefined && item.dueAt <= now).length
  const activeMistakes = mistakes.filter(item => item.stage < 4).length
  const causeCounts = new Map<ErrorType, number>()
  for (const mistake of mistakes) if (mistake.errorType !== undefined) causeCounts.set(mistake.errorType, (causeCounts.get(mistake.errorType) ?? 0) + 1)
  const errorTypes = [...causeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)).slice(0, 5)
  const recurringTypes = [...causeCounts.values()].filter(count => count >= 2).length
  const queue = state.teachingQueue.filter(item => item.objectiveId === base.id)
  const teaching = teachingNeeded(outcomes, queue)
  const weak = teaching || activeMistakes >= 2 || helpedOrWrong >= 2 || (independentDays.size === 0 && wrongRecent >= 1)
  const stalled = !weak && independentDays.size < 3 && lastAt !== undefined && now - lastAt > 10 * DAY
  const level = dueMistakes > 0 ? 'due' : weak ? 'weak'
    : independentDays.size >= 3 && activeMistakes === 0 && helpedOrWrong === 0 ? 'mastered' : stalled ? 'stalled'
      : lastAt !== undefined || mistakes.length > 0 ? 'practising' : 'untouched'
  const reasons: InsightReason[] = []
  if (dueMistakes > 0) reasons.push({ code: 'due-mistakes', count: dueMistakes })
  if (teaching) reasons.push({ code: 'needs-teaching', count: 1 })
  if (activeMistakes > 0) reasons.push({ code: 'open-mistakes', count: activeMistakes })
  if (helpedOrWrong > 0) reasons.push({ code: 'recent-help-or-error', count: helpedOrWrong })
  if (recurringTypes > 0) reasons.push({ code: 'recurring-error', count: recurringTypes })
  if (stalled && lastAt !== undefined) reasons.push({ code: 'not-practised-recently', count: Math.floor((now - lastAt) / DAY) })
  if (level === 'untouched') reasons.push({ code: 'not-started', count: 0 })
  const priority = level === 'mastered' ? 0
    : (teaching ? 64 : 0) + dueMistakes * 40 + Math.min(36, helpedOrWrong * 12) + Math.min(24, activeMistakes * 8) + Math.min(16, recurringTypes * 8) + (stalled ? 10 : 0) + (level === 'untouched' ? 5 : 0)
  return { ...base, level, independentDays: independentDays.size, attempts: outcomes.length, helpedOrWrong,
    ...(lastAt !== undefined ? { lastAt } : {}), activeMistakes, dueMistakes, masteredMistakes: mistakes.length - activeMistakes, errorTypes, priority, reasons }
}

/** New learning stays inside the current unit, or inside every taught unit when catching up, unless a session scope overrides. A review week adds none. */
function learnable(state: StudyState, item: ObjectiveInsight, scope?: CurriculumScope & { units?: string[] | undefined; objectiveIds?: string[] | undefined }): boolean {
  if (item.level !== 'untouched') return false
  if (scope !== undefined) return scopeSelects(scope, item.subject, item.unit, item.id)
  const gate = schoolGate(state, item.subject)
  if (!gate) return true
  if (gate.pace === 'review') return false
  if (gate.posture === 'catch-up') return gate.taught.has(item.unit)
  return item.unit === gate.current
}


/**
 * Derive mastery, weak points and the next step from saved evidence and the shipped knowledge maps.
 * Confirmed mistakes, independent answers on different days and paper results are the only evidence;
 * a helped or wrong answer counts against independence, and an unassessed answer is not an error.
 * A check-in (diagnose block) is due per subject every fourteen days while untouched, stalled or long-mastered
 * objectives remain to probe; its sample rotates across units. The confirmed school frontier is the default
 * suggestion range, not a hard gate: a session scope (grade, term, units or objective IDs) can override it
 * for cross-grade or custom diagnosis and learning. Without a scope, check-ins, weak points and new goals
 * stay in the confirmed unit and earlier ones; preview, if enabled, offers only the next unit after the
 * current unit has no new goal, and a review week adds no new goal.
 * @param state - current durable learning state.
 * @param now - host wall-clock time in milliseconds.
 * @returns objective insights, the five weakest points, per-subject check-in plans, at most two due clears and one recommendation.
 */
export function studyInsight(state: StudyState, now: number): StudyInsight {
  const outcomes = outcomeIndex(state)
  const objectives: ObjectiveInsight[] = []
  const seen = new Set<string>()
  const include = (base: ObjectiveBase) => {
    if (seen.has(base.id)) return
    seen.add(base.id)
    objectives.push(masteryOf(state, base, outcomes.get(base.id) ?? [], now))
  }
  for (const objective of builtinObjectives(state.profile)) include(objective)
  for (const objective of state.objectives) include({ ...objective, unit: '', unitName: '' })
  const diagnosticPlan = (subject: CurriculumSubject, pool: ObjectiveInsight[], scope?: CurriculumScope & { units?: string[] | undefined; objectiveIds?: string[] | undefined }): DiagnosticPlan => {
    const lastAt = state.sessions.filter(item => item.mode === 'diagnose' && item.subject === subject).reduce<number | undefined>((latest, item) => latest === undefined || item.startedAt > latest ? item.startedAt : latest, undefined)
    const pick = (item: ObjectiveInsight, reason: DiagnosticSample['reason']): DiagnosticSample => ({ id: item.id, title: item.title, unit: item.unit, unitName: item.unitName, reason })
    const untouched = pool.filter(item => item.level === 'untouched')
    const stalled = pool.filter(item => item.level === 'stalled')
    const recheck = pool.filter(item => item.level === 'mastered' && item.lastAt !== undefined && now - item.lastAt >= RECHECK_AFTER)
    const progress = pool.filter(item => item.level === 'practising')
    const rotated: DiagnosticSample[] = []
    const byUnit = new Map<string, ObjectiveInsight[]>()
    for (const item of untouched) byUnit.set(item.unit, [...(byUnit.get(item.unit) ?? []), item])
    for (let round = 0; round <= untouched.length && rotated.length < untouched.length; round += 1) {
      for (const list of byUnit.values()) {
        const item = list[round]
        if (item) rotated.push(pick(item, 'untouched'))
      }
    }
    const candidates = [...rotated, ...stalled.map(item => pick(item, 'stalled')), ...recheck.map(item => pick(item, 'recheck'))]
    const samples: Record<CheckInIntensity, DiagnosticSample[]> = {
      light: candidates.slice(0, checkInSizes.light),
      standard: candidates.slice(0, checkInSizes.standard),
      deep: [...candidates, ...progress.map(item => pick(item, 'progress'))].slice(0, checkInSizes.deep),
    }
    const count = untouched.length + stalled.length + recheck.length
    const recommendedIntensity: CheckInIntensity = count <= checkInSizes.light ? 'light' : count >= 10 && lastAt !== undefined ? 'deep' : 'standard'
    const due = samples.standard.length > 0 && (lastAt === undefined || now - lastAt >= DIAGNOSIS_INTERVAL)
    return { subject, due, ...(lastAt !== undefined ? { lastAt, nextAt: lastAt + DIAGNOSIS_INTERVAL } : {}), untouched: untouched.length, stalled: stalled.length, recheck: recheck.length,
      coverage: { probed: pool.length - untouched.length, total: pool.length }, recommendedIntensity, sample: samples.standard, samples, ...(scope !== undefined ? { scope } : {}) }
  }
  const diagnostics: DiagnosticPlan[] = SUBJECT_ORDER.map(subject => diagnosticPlan(subject, objectives.filter(item => item.subject === subject && taughtUnit(state, subject, item.unit))))
  // Teaching follows prerequisite edges: a goal that needs teaching may rest on an earlier unmet goal,
  // and practice then redirects there first, nearest prerequisite ahead.
  const objectivesByConcept = new Map<string, ObjectiveInsight[]>()
  for (const item of objectives) for (const conceptId of item.conceptIds) objectivesByConcept.set(conceptId, [...(objectivesByConcept.get(conceptId) ?? []), item])
  const prerequisiteGap = (goal: ObjectiveInsight): ObjectiveInsight | undefined => {
    const file = curriculumFor(state.profile, goal.subject)
    if (!file) return undefined
    const seen = new Set<string>([goal.id])
    const queue = [...goal.conceptIds]
    while (queue.length > 0) {
      const conceptId = queue.shift()
      if (conceptId === undefined) break
      for (const relation of file.relations) {
        if (relation.kind !== 'prerequisite' || relation.toId !== conceptId) continue
        for (const candidate of objectivesByConcept.get(relation.fromId) ?? []) {
          if (seen.has(candidate.id)) continue
          seen.add(candidate.id)
          if (candidate.level !== 'mastered' && candidate.level !== 'due' && taughtUnit(state, candidate.subject, candidate.unit)) return candidate
          queue.push(...candidate.conceptIds)
        }
      }
    }
    return undefined
  }
  const gapRedirects = new Map<string, { id: string; title: string }>()
  for (const goal of objectives) {
    if (!goal.reasons.some(reason => reason.code === 'needs-teaching')) continue
    const gap = prerequisiteGap(goal)
    if (gap === undefined || gap.id === goal.id) continue
    if (!gap.reasons.some(reason => reason.code === 'prerequisite-gap')) gap.reasons.push({ code: 'prerequisite-gap', count: 1 })
    gap.priority += 30
    if (!gapRedirects.has(goal.id)) gapRedirects.set(goal.id, { id: gap.id, title: gap.title })
  }
  const weakPoints = objectives.filter(item => (item.level === 'due' || item.level === 'weak' || item.level === 'stalled') && taughtUnit(state, item.subject, item.unit))
    .sort((a, b) => b.priority - a.priority).slice(0, 5)
  const dueMistake = (item: StudyState['mistakes'][number]) => {
    if (item.confirmedAt === undefined || item.dueAt === undefined || item.dueAt > now) return false
    if (!item.objectiveId) return true
    const objective = objectives.find(candidate => candidate.id === item.objectiveId)
    return taughtUnit(state, item.subject, objective?.unit ?? '')
  }
  const dueItems = state.mistakes.filter(dueMistake).sort((left, right) => (left.dueAt ?? 0) - (right.dueAt ?? 0) || left.id.localeCompare(right.id))
  const dueToday: DueClear[] = dueItems.slice(0, 2).map(item => ({
    id: item.id, subject: item.subject, topic: item.topic, ...(item.objectiveId !== undefined ? { objectiveId: item.objectiveId } : {}),
  }))
  const dueBacklog = dueItems.length
  const checkIn = diagnostics.filter(plan => plan.due).sort((a, b) => b.sample.length - a.sample.length)[0]
  const untouched = objectives.find(item => learnable(state, item))
  const preview = objectives.find(item => item.level === 'untouched' && schoolGate(state, item.subject)?.previewUnit === item.unit)
  const held = objectives.find(item => item.level === 'untouched' && schoolGate(state, item.subject) !== undefined && !learnable(state, item) && schoolGate(state, item.subject)?.previewUnit !== item.unit)
  const teachingGoal = objectives.filter(item => item.reasons.some(reason => reason.code === 'needs-teaching') && taughtUnit(state, item.subject, item.unit))
    .sort((a, b) => b.priority - a.priority)[0]
  const queued = state.teachingQueue.filter(item => item.objectiveId === undefined).sort((a, b) => a.confirmedAt - b.confirmedAt)[0]
  const redirect = teachingGoal ? gapRedirects.get(teachingGoal.id) : undefined
  // A single due mistake does not take the main path. Practice still wins when the goal needs teaching,
  // has repeated recent errors, has two open mistakes, or has gone stale.
  const practiceWeak = weakPoints.find(item => {
    if (item.level === 'weak' || item.level === 'stalled') return true
    if (item.reasons.some(reason => reason.code === 'needs-teaching' || reason.code === 'not-practised-recently' || reason.code === 'prerequisite-gap')) return true
    const recent = item.reasons.find(reason => reason.code === 'recent-help-or-error')
    if (recent !== undefined && recent.count >= 2) return true
    const open = item.reasons.find(reason => reason.code === 'open-mistakes')
    return open !== undefined && open.count >= 2
  })
  const recommendation: StudyInsight['recommendation'] = teachingGoal && redirect
      ? { kind: 'practice', subject: teachingGoal.subject, objectiveId: redirect.id, title: redirect.title, reason: { code: 'prerequisite-gap', count: 1 }, redirectedFrom: { id: teachingGoal.id, title: teachingGoal.title } }
    : teachingGoal
      ? { kind: 'practice', subject: teachingGoal.subject, objectiveId: teachingGoal.id, title: teachingGoal.title, reason: { code: 'needs-teaching', count: 1 } }
      : queued
        ? { kind: 'practice', subject: queued.subject, title: queued.prompt.slice(0, 40), reason: { code: 'needs-teaching', count: 1 } }
        : practiceWeak
          ? { kind: 'practice', subject: practiceWeak.subject, objectiveId: practiceWeak.id, title: practiceWeak.title, reason: practiceWeak.reasons.find(reason => reason.code !== 'due-mistakes') ?? practiceWeak.reasons[0] ?? { code: 'recent-help-or-error', count: 0 } }
          : checkIn
        ? { kind: 'diagnose', subject: checkIn.subject, reason: { code: 'diagnosis-due', count: checkIn.sample.length } }
        : untouched
          ? { kind: 'learn', subject: untouched.subject, objectiveId: untouched.id, title: untouched.title, reason: { code: 'not-started', count: 0 } }
          : preview
            ? { kind: 'preview', subject: preview.subject, objectiveId: preview.id, title: preview.title, reason: { code: 'preview', count: 0 } }
            : held
              ? { kind: 'hold', subject: held.subject, reason: { code: 'school-pace', count: 0 } }
              : dueToday[0]
                ? { kind: 'review', subject: dueToday[0].subject, ...(dueToday[0].objectiveId !== undefined ? { objectiveId: dueToday[0].objectiveId } : {}), title: dueToday[0].topic.slice(0, 40), reason: { code: 'due-mistakes', count: dueToday.length } }
                : null
  const profileCounts = new Map<string, { subject: CurriculumSubject; type: ErrorType; count: number; objectiveIds: Set<string> }>()
  for (const mistake of state.mistakes) {
    if (mistake.confirmedAt === undefined || mistake.errorType === undefined) continue
    const unit = mistake.objectiveId !== undefined ? objectives.find(item => item.id === mistake.objectiveId)?.unit ?? '' : ''
    if (!taughtUnit(state, mistake.subject, unit)) continue
    const key = `${mistake.subject}:${mistake.errorType}`
    const entry = profileCounts.get(key) ?? { subject: mistake.subject, type: mistake.errorType, count: 0, objectiveIds: new Set<string>() }
    entry.count += 1
    if (mistake.objectiveId !== undefined) entry.objectiveIds.add(mistake.objectiveId)
    profileCounts.set(key, entry)
  }
  const errorProfile = [...profileCounts.values()].map(entry => ({ subject: entry.subject, type: entry.type, count: entry.count, objectiveIds: [...entry.objectiveIds] }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)).slice(0, 5)
  const today = studyDay(now)
  const understandingReminders: UnderstandingReminder[] = []
  const remind = (item: ObjectiveInsight, code: UnderstandingReminder['code']): void => {
    if (understandingReminders.length >= 3 || understandingReminders.some(reminder => reminder.code === code && reminder.objectiveId === item.id)) return
    understandingReminders.push({ code, subject: item.subject, objectiveId: item.id, title: item.title })
  }
  for (const item of objectives) {
    const history = outcomes.get(item.id) ?? []
    if (history.some(outcome => outcome.result !== 'stuck') && item.independentDays === 0 && history.every(outcome => studyDay(outcome.at) === today)) remind(item, 'first-explain')
  }
  for (const mistake of state.mistakes) {
    if (mistake.confirmedAt === undefined || !mistake.independentDays.includes(today)) continue
    const item = mistake.objectiveId !== undefined ? objectives.find(candidate => candidate.id === mistake.objectiveId) : undefined
    if (item !== undefined) remind(item, 'after-correction')
    else if (understandingReminders.length < 3) understandingReminders.push({ code: 'after-correction', subject: mistake.subject, title: mistake.topic })
  }
  const unitId = recommendation === null ? undefined : state.courses.find(item => item.subject === recommendation.subject)?.progress?.unitId
  const unitName = unitId !== undefined ? curriculumFor(state.profile, recommendation?.subject ?? 'math')?.units.find(unit => unit.id === unitId)?.name : undefined
  const named = recommendation === null ? null : unitName !== undefined ? { ...recommendation, unitName } : recommendation
  if (named !== null && (named.kind === 'preview' || named.kind === 'learn') && named.objectiveId !== undefined) {
    const nextTarget = objectives.find(candidate => candidate.id === named.objectiveId)
    const practised = objectives.filter(candidate => candidate.lastAt !== undefined).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0]
    if (nextTarget !== undefined && (named.kind === 'preview' || practised === undefined || practised.unit !== nextTarget.unit)) remind(nextTarget, 'before-next')
  }
  return { objectives, weakPoints, diagnostics, recommendation: named, dueToday, dueBacklog, errorProfile, understandingReminders }
}

/**
 * A check-in plan for an explicit scope: custom objectives, specific units, or a whole cross-grade map.
 * The scope overrides the confirmed school frontier for this plan; the caller may pass a precomputed
 * insight for the same state and time. Objectives outside the profile use the same mastery rule as the
 * current-term insight.
 * @param state - current durable learning state.
 * @param subject - subject to plan for.
 * @param now - host wall-clock time in milliseconds.
 * @param scope - grade and term with optional unit or objective narrowing.
 * @param insight - precomputed insight for the same state and time, when the caller already has one.
 * @returns the plan for the scoped pool.
 */
export function diagnosticFor(state: StudyState, subject: CurriculumSubject, now: number, scope: CurriculumScope & { units?: string[] | undefined; objectiveIds?: string[] | undefined }, insight?: StudyInsight): DiagnosticPlan {
  const current = insight ?? studyInsight(state, now)
  const profileScope = scope.grade === state.profile.grade && scope.term === state.profile.term
  let pool: ObjectiveInsight[]
  if (profileScope) {
    pool = current.objectives.filter(item => item.subject === subject && (
      scope.objectiveIds !== undefined ? scope.objectiveIds.includes(item.id)
        : scope.units !== undefined ? item.unit !== '' && scope.units.includes(item.unit)
          : item.unit !== '' && curriculumFor(scope, subject)?.units.some(unit => unit.id === item.unit) === true
    ))
  } else {
    const map = builtinObjectivesIn(scope, subject)
    const scoped = scope.objectiveIds !== undefined ? map.filter(item => scope.objectiveIds?.includes(item.id))
      : scope.units !== undefined ? map.filter(item => item.unit !== '' && scope.units?.includes(item.unit))
        : map
    const outcomes = outcomeIndex(state)
    pool = scoped.map(base => current.objectives.find(item => item.id === base.id) ?? masteryOf(state, base, outcomes.get(base.id) ?? [], now))
  }
  const lastAt = state.sessions.filter(item => item.mode === 'diagnose' && item.subject === subject).reduce<number | undefined>((latest, item) => latest === undefined || item.startedAt > latest ? item.startedAt : latest, undefined)
  const pick = (item: ObjectiveInsight, reason: DiagnosticSample['reason']): DiagnosticSample => ({ id: item.id, title: item.title, unit: item.unit, unitName: item.unitName, reason })
  const untouched = pool.filter(item => item.level === 'untouched')
  const stalled = pool.filter(item => item.level === 'stalled')
  const recheck = pool.filter(item => item.level === 'mastered' && item.lastAt !== undefined && now - item.lastAt >= RECHECK_AFTER)
  const progress = pool.filter(item => item.level === 'practising')
  const rotated: DiagnosticSample[] = []
  const byUnit = new Map<string, ObjectiveInsight[]>()
  for (const item of untouched) byUnit.set(item.unit, [...(byUnit.get(item.unit) ?? []), item])
  for (let round = 0; round <= untouched.length && rotated.length < untouched.length; round += 1) {
    for (const list of byUnit.values()) {
      const item = list[round]
      if (item) rotated.push(pick(item, 'untouched'))
    }
  }
  const candidates = [...rotated, ...stalled.map(item => pick(item, 'stalled')), ...recheck.map(item => pick(item, 'recheck'))]
  const samples: Record<CheckInIntensity, DiagnosticSample[]> = {
    light: candidates.slice(0, checkInSizes.light),
    standard: candidates.slice(0, checkInSizes.standard),
    deep: [...candidates, ...progress.map(item => pick(item, 'progress'))].slice(0, checkInSizes.deep),
  }
  const count = untouched.length + stalled.length + recheck.length
  const recommendedIntensity: CheckInIntensity = count <= checkInSizes.light ? 'light' : count >= 10 && lastAt !== undefined ? 'deep' : 'standard'
  const due = samples.standard.length > 0 && (lastAt === undefined || now - lastAt >= DIAGNOSIS_INTERVAL)
  return { subject, due, ...(lastAt !== undefined ? { lastAt, nextAt: lastAt + DIAGNOSIS_INTERVAL } : {}), untouched: untouched.length, stalled: stalled.length, recheck: recheck.length,
    coverage: { probed: pool.length - untouched.length, total: pool.length }, recommendedIntensity, sample: samples.standard, samples, scope }
}

/**
 * Compact projection of the insight for the workbench and the status tool.
 * @param insight - full insight for the current state.
 * @returns up to three weak points, per-subject check-in status with the sampled objective IDs, the error-cause
 *   profile, the understanding reminders and the current recommendation.
 */
export function insightSummary(insight: StudyInsight) {
  return {
    weakPoints: insight.weakPoints.slice(0, 3).map(item => ({ id: item.id, subject: item.subject, title: item.title, level: item.level, priority: item.priority, reasons: item.reasons })),
    diagnostics: insight.diagnostics.map(plan => ({ subject: plan.subject, due: plan.due, ...(plan.lastAt !== undefined ? { lastAt: plan.lastAt } : {}), ...(plan.nextAt !== undefined ? { nextAt: plan.nextAt } : {}), sample: plan.sample.map(item => item.id) })),
    recommendation: insight.recommendation,
    dueToday: insight.dueToday,
    dueBacklog: insight.dueBacklog,
    errorProfile: insight.errorProfile,
    understandingReminders: insight.understandingReminders,
  }
}

