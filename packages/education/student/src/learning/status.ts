import { MINUTE, activeSession, beijingClock, formatDuration, studyDay, todaySpent } from './shared.ts'
import { objectiveInfo, questionObjectiveId } from './view.ts'
import type { StudyState } from '../schema.ts'

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
