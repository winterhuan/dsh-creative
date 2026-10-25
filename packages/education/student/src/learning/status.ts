import { DAY, MINUTE, activeSession, beijingClock, formatDuration, studyDay, todaySpent, type Outcome } from './shared.ts'
import type { ErrorType, StudyState } from '../schema.ts'
import type { StudyInsight } from './mastery.ts'
import { objectiveInfo, questionObjectiveId } from './view.ts'

/** One time-derived suggestion state; suggestions never reject a later call. */
export type StudyPhase = 'ready' | 'studying' | 'stop-required' | 'break' | 'daily-complete'
/** The time-derived part of the status: phase, budgets and the relayed notice text. */
export interface TimeStatus {
  phase: StudyPhase
  remainingMs: number
  timeNotice: string
  time: {
    timezone: 'Asia/Shanghai'
    blockElapsed: string | null
    blockSuggested: string
    todayElapsed: string
    todaySuggested: string
    breakUntil: string | null
  }
  breakRemainingMs: number
}

/**
 * Today's suggested budget and clocks, computed from sessions and limits only.
 * A passed block, an unfinished break or a full day does not reject a later call;
 * `timeNotice` is the text to relay and already states elapsed time, the suggestion
 * and any break clock in Beijing time. Reading does not close a session.
 */
export function timeStatus(state: StudyState, now: number): TimeStatus {
  const active = activeSession(state)
  const todayMs = todaySpent(state, now)
  const remainingMs = Math.max(0, state.profile.limits.dailyMinutes * MINUTE - todayMs)
  const phase = active ? now >= active.deadline ? 'stop-required' : 'studying'
    : now < state.breakUntil ? 'break' : remainingMs === 0 ? 'daily-complete' : 'ready'
  const blockElapsedMs = active ? Math.max(0, now - active.startedAt) : 0
  const timeParts = [
    ...(active ? [`本段已用 ${formatDuration(blockElapsedMs)}，建议 ${state.profile.limits.blockMinutes} 分钟。`] : []),
    ...(active && now >= active.deadline ? ['已超过本段建议时长，可以继续，也可以结束休息。'] : []),
    `今天累计 ${formatDuration(todayMs)}，建议 ${state.profile.limits.dailyMinutes} 分钟。`,
    ...(todayMs > state.profile.limits.dailyMinutes * MINUTE ? ['今天已超过建议时长，仍可以继续。'] : []),
    ...(now < state.breakUntil ? [`建议休息到 ${beijingClock(state.breakUntil)}（北京时间），现在也可以开始。`] : []),
  ]
  return {
    phase, remainingMs, timeNotice: timeParts.join(''),
    time: {
      timezone: 'Asia/Shanghai',
      blockElapsed: active ? formatDuration(blockElapsedMs) : null,
      blockSuggested: `${state.profile.limits.blockMinutes}分钟`,
      todayElapsed: formatDuration(todayMs),
      todaySuggested: `${state.profile.limits.dailyMinutes}分钟`,
      breakUntil: now < state.breakUntil ? beijingClock(state.breakUntil) : null,
    },
    breakRemainingMs: Math.max(0, state.breakUntil - now),
  }
}

/**
 * Summarize today's suggested budget, course confirmation, rewards and evidence-derived progress.
 * `phase` names a suggestion. A passed block, an unfinished break or a full day does not reject a later call.
 * `timeNotice` is the text to relay; it already states elapsed time, the suggestion and any break clock.
 * Reading does not close a session past its suggestion; stop records when the learner actually stopped.
 */
export function studyStatus(state: StudyState, now: number) {
  const time = timeStatus(state, now)
  const progress = new Map<string, { subject: string; topic: string; materialId?: string; objectiveId?: string; attempts: number; independentDays: string[] }>()
  function includeEvidence(subject: string, topic: string, at: number, result: string, assistance: string, materialId?: string, objectiveId?: string) {
    const key = objectiveId ?? JSON.stringify([subject, topic, materialId])
    const item = progress.get(key) ?? { subject, topic, ...(materialId ? { materialId } : {}), ...(objectiveId ? { objectiveId } : {}), attempts: 0, independentDays: [] }
    item.attempts += 1
    // Distinct independent days stay. A later hint does not erase them; map mastery still withholds mastered while recent help is inside 14 days.
    if (result === 'correct' && assistance === 'independent' && !item.independentDays.includes(studyDay(at))) item.independentDays.push(studyDay(at))
    progress.set(key, item)
  }
  for (const attempt of state.attempts) includeEvidence(attempt.subject, attempt.topic, attempt.at, attempt.result, attempt.assistance, attempt.materialId, attempt.objectiveId)
  for (const result of state.paperResults) {
    const worksheet = state.worksheets.find(item => item.id === result.worksheetId)
    const objectiveId = worksheet ? questionObjectiveId(state, worksheet, result.itemId) : undefined
    const objective = objectiveId ? objectiveInfo(state, objectiveId) : undefined
    if (worksheet && objective && objectiveId) includeEvidence(worksheet.subject, objective.title, result.receivedAt, result.result, result.assistance, undefined, objectiveId)
  }
  return {
    task: state.task ?? null, feedback: state.task ? state.attempts.find(item => item.id === state.task?.id) ?? null : null,
    revision: state.revision, profile: state.profile, ...time, active: activeSession(state) ?? null,
    courses: state.courses, unconfirmedSubjects: ['chinese', 'math', 'english'].filter(subject => !state.courses.some(course => course.subject === subject)),
    stars: state.rewards.length, todayStars: state.rewards.filter(reward => reward.day === studyDay(now)).length,
    dueMistakes: state.mistakes.filter(mistake => mistake.dueAt !== undefined && mistake.dueAt <= now).map(mistake => ({ id: mistake.id, subject: mistake.subject, topic: mistake.topic })),
    pendingMistakes: state.mistakes.filter(mistake => mistake.confirmedAt === undefined).map(mistake => mistake.id),
    progress: [...progress.values()].map(item => ({ ...item, level: item.independentDays.length >= 3 ? 'independent-on-three-days' : 'practising' })),
  }
}

/** One week of derived parent-facing summary; every number comes from stored evidence. */
export interface WeeklySummary {
  minutesByDay: { day: string; minutes: number }[]
  activeDays: number
  practisedGoals: number
  masteredGoals: number
  newMistakes: number
  consolidatedMistakes: number
  dueCompletion: { done: number; total: number }
  errorCauses: { type: ErrorType; count: number }[]
  suggestion: StudyInsight['recommendation']
}

/**
 * Summarise the last seven calendar days for the parent: minutes per day, goals practised and
 * newly mastered, mistake flow, due-review completion and this week's top error causes.
 * Purely derived from stored evidence; nothing is stored per week.
 * @param state - current durable learning state.
 * @param now - host wall-clock time in milliseconds.
 * @param insight - precomputed insight for the same state and time, when the caller already has one.
 */
export function weeklySummary(state: StudyState, now: number, insight: StudyInsight): WeeklySummary {
  const days = Array.from({ length: 7 }, (_, index) => studyDay(now - (6 - index) * DAY))
  const daySet = new Set(days)
  const minutesByDay = days.map(day => ({
    day,
    minutes: Math.round(state.sessions.filter(session => studyDay(session.startedAt) === day)
      .reduce((sum, session) => sum + (session.spentMs ?? Math.max(0, (session.endedAt ?? now) - session.startedAt)), 0) / 60_000),
  }))
  const windowStart = now - 7 * DAY
  const outcomesByGoal = new Map<string, Outcome[]>()
  const add = (key: string | undefined, outcome: Outcome) => { if (key !== undefined) outcomesByGoal.set(key, [...(outcomesByGoal.get(key) ?? []), outcome]) }
  for (const attempt of state.attempts) add(attempt.objectiveId, { at: attempt.at, result: attempt.result, assistance: attempt.assistance })
  for (const result of state.paperResults) {
    const sheet = state.worksheets.find(item => item.id === result.worksheetId)
    const item = sheet?.items.find(candidate => candidate.id === result.itemId)
    const goal = item?.objectiveId ?? (item?.mistakeId !== undefined ? state.mistakes.find(mistake => mistake.id === item.mistakeId)?.objectiveId : undefined) ?? sheet?.objectiveId
    add(goal, { at: result.receivedAt, result: result.result, assistance: result.assistance })
  }
  let practisedGoals = 0
  let masteredGoals = 0
  for (const goal of insight.objectives) {
    const history = outcomesByGoal.get(goal.id) ?? []
    if (!history.some(item => item.at >= windowStart)) continue
    practisedGoals += 1
    const independentDays = new Set(history.filter(item => item.at >= windowStart && item.result === 'correct' && item.assistance === 'independent').map(item => studyDay(item.at)))
    if (goal.independentDays >= 3 && independentDays.size > 0) masteredGoals += 1
  }
  const newMistakes = state.mistakes.filter(mistake => mistake.confirmedAt !== undefined && mistake.confirmedAt >= windowStart).length
  const consolidatedMistakes = state.mistakes.filter(mistake => mistake.stage >= 4 && (mistake.independentDays.at(-1) !== undefined) && daySet.has(mistake.independentDays.at(-1) ?? '')).length
  const dueInWindow = state.mistakes.filter(mistake => mistake.confirmedAt !== undefined && mistake.dueAt !== undefined && mistake.dueAt >= windowStart && mistake.dueAt <= now)
  const dueCompletion = { done: dueInWindow.filter(mistake => state.attempts.some(attempt => attempt.mistakeId === mistake.id && attempt.at >= (mistake.dueAt ?? 0)) || state.paperResults.some(result => result.receivedAt >= (mistake.dueAt ?? 0) && state.worksheets.some(sheet => sheet.id === result.worksheetId && sheet.items.some(item => item.id === result.itemId && item.mistakeId === mistake.id)))).length, total: dueInWindow.length }
  const causeCounts = new Map<ErrorType, number>()
  for (const mistake of state.mistakes) {
    if (mistake.confirmedAt === undefined || mistake.confirmedAt < windowStart || mistake.errorType === undefined) continue
    causeCounts.set(mistake.errorType, (causeCounts.get(mistake.errorType) ?? 0) + 1)
  }
  const errorCauses = [...causeCounts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)).slice(0, 3)
  return { minutesByDay, activeDays: minutesByDay.filter(item => item.minutes > 0).length, practisedGoals, masteredGoals, newMistakes, consolidatedMistakes, dueCompletion, errorCauses, suggestion: insight.recommendation }
}
