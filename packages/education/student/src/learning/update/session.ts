import { canonical, choiceMismatch, matchChoice, requireValue, sameSavedAnswer, scopeSelects, spent, studyDay } from '../shared.ts'
import { objectiveOf } from '../view.ts'
import { alignRecord, dropTaught, resolveAssistance } from './context.ts'
import type { UpdateContext } from './index.ts'
import { builtinObjectiveIn, curriculumFor } from '../../curriculum.ts'
import type { StudyState } from '../../schema.ts'

/** Open the next question inside the active block; an unanswered question can be replaced when skipping or switching tasks. */
export function applyTask(ctx: UpdateContext<'task'>): StudyState {
  const { command, previous, state, active } = ctx
  requireValue(active && active.id === command.task.sessionId && active.subject === command.task.subject, '请在当前学习段内出题。')
  if (state.task?.id === command.task.id && state.task.sessionId === command.task.sessionId) {
    const { response: _response, rawResponse: _raw, answeredAt: _answeredAt, hintLevel: _hint, stuck: _stuck, ...stored } = state.task
    requireValue(canonical(stored) === canonical(command.task), '这个学习段里的题目编号已用于另一道题。')
    return previous
  }
  requireValue(!state.attempts.some(item => item.id === command.task.id && item.sessionId === command.task.sessionId), '这个学习段里的题目编号已使用。下一段学习可以再用同一个编号。')
  requireValue(!state.task || state.task.sessionId !== active.id || state.task.response === undefined || state.attempts.some(item => item.id === state.task?.id), '请先完成当前已作答题目的反馈。')
  const mistake = state.mistakes.find(item => item.id === command.task.mistakeId)
  requireValue(active.mode !== 'review' || mistake, '复习题需要关联一条已确认的错题。')
  requireValue(active.mode !== 'diagnose' || command.task.objectiveId !== undefined, '摸底题必须关联学习目标（objectiveId）。')
  requireValue(active.mode !== 'diagnose' || command.task.phase === undefined, '摸底题不进入教学步骤。')
  if (command.task.mistakeId) requireValue(mistake && mistake.subject === active.subject && mistake.confirmedAt !== undefined && mistake.uncertainties === '', '请先确认这道错题，再开始复习。')
  if (command.task.objectiveId) requireValue(objectiveOf(state, command.task.objectiveId)?.subject === active.subject, '学习目标不存在或科目不符。')
  if (mistake?.objectiveId) requireValue(command.task.objectiveId === mistake.objectiveId, '复习题必须对应错题的学习目标。')
  state.task = { ...command.task, hintLevel: 0 }
  return state
}

/** Save the raw answer or raise the hint level of the current task. */
export function applyAnswerOrHint(ctx: UpdateContext<'answer' | 'hint'>): StudyState {
  const { command, previous, state, active, now } = ctx
  const task = state.task
  requireValue(task && task.id === command.taskId && active?.id === task.sessionId, '当前题目已结束，请刷新学习状态。')
  requireValue(!state.attempts.some(item => item.id === task.id), '这道题已记录反馈。')
  if (command.action === 'answer') {
    if (task.response !== undefined) { requireValue(sameSavedAnswer(task, command.response), '答案已提交，请等待反馈。'); return previous }
    const matched = task.choices ? matchChoice(task.choices, command.response) : command.response
    if (task.choices) requireValue(matched, choiceMismatch(task.choices, command.response))
    task.response = matched ?? command.response
    task.rawResponse = command.response
    task.answeredAt = now
  } else {
    if (task.hintLevel >= 3) return previous
    requireValue(task.response === undefined, '答案已提交，请等待反馈。')
    task.hintLevel += 1
  }
  return state
}

/** Record 不会 on the current task as a stuck attempt. */
export function applyStuck(ctx: UpdateContext<'stuck'>): StudyState {
  const { command, previous, state, active, now } = ctx
  const task = state.task
  requireValue(task && task.id === command.taskId && active && active.id === task.sessionId, '当前题目已结束，请刷新学习状态。')
  if (state.attempts.some(item => item.id === task.id && item.sessionId === task.sessionId)) return previous
  task.stuck = true
  const materialId = active.materialId
  state.attempts.push({
    id: task.id, sessionId: task.sessionId, subject: task.subject, topic: task.topic, prompt: task.prompt,
    response: '不会', result: 'stuck', assistance: 'hint', feedback: '孩子表示不会，先教方法再独立做。', answerEvidence: '未作答，记为不会。',
    ...(task.mistakeId !== undefined ? { mistakeId: task.mistakeId } : {}),
    ...(task.objectiveId !== undefined ? { objectiveId: task.objectiveId } : {}),
    ...(task.variant !== undefined ? { variant: task.variant } : {}),
    ...(task.figure !== undefined ? { figure: task.figure } : {}),
    at: now, ...(materialId ? { materialId } : {}),
  })
  return state
}

/** Start one learning block, automatically closing any earlier open block and archiving a reused session id. */
export function applyStart(ctx: UpdateContext<'start'>): StudyState {
  const { command, previous, state, active, now } = ctx
  const existing = state.sessions.find(item => item.id === command.id)
  if (existing && existing.endedAt === undefined) {
    requireValue(existing.subject === command.subject && existing.mode === command.mode, '这个学习段编号正在使用，请换一个新编号。')
    return previous
  }
  requireValue(command.scope === undefined || command.mode === 'diagnose' || command.mode === 'foundation' || command.mode === 'school', '自定义范围只用于摸底或学习。')
  if (command.scope) {
    const file = curriculumFor({ grade: command.scope.grade, term: command.scope.term }, command.subject)
    requireValue(file, '该年级学期的知识地图不存在。')
    if (command.scope.units) for (const unitId of command.scope.units) requireValue(file.units.some(unit => unit.id === unitId), `单元不在该年级学期的知识地图里：${unitId}`)
    if (command.scope.objectiveIds) for (const objectiveId of command.scope.objectiveIds) requireValue(builtinObjectiveIn({ grade: command.scope.grade, term: command.scope.term }, command.subject, objectiveId) || state.objectives.some(item => item.id === objectiveId), `学习目标不存在：${objectiveId}`)
  }
  const course = state.courses.find(item => item.subject === command.subject)
  requireValue(command.mode !== 'school' || course, '该科教材与学校进度尚未确认；可先选择 foundation 通用基础练习。')
  if (active) {
    active.endedAt = now
    active.spentMs = spent(active, now)
    const day = studyDay(active.startedAt)
    const hasWork = state.attempts.some(item => item.sessionId === active.id)
    if (hasWork && !state.rewards.some(reward => reward.day === day && reward.reason === 'participation')) {
      state.rewards.push({ day, reason: 'participation' })
    }
  }
  if (existing) {
    const archived = `${existing.id}-past-${state.sessions.filter(item => item.id.startsWith(`${existing.id}-past-`)).length}`
    requireValue(archived.length <= 80, '这个学习段编号已经用过，请换一个更短的新编号。')
    for (const attempt of state.attempts) if (attempt.sessionId === existing.id) attempt.sessionId = archived
    if (state.task?.sessionId === existing.id) state.task.sessionId = archived
    existing.id = archived
  }
  const id = command.id
  state.sessions.push({
    id, subject: command.subject, mode: command.mode, startedAt: now,
    ...(command.mode === 'diagnose' ? { intensity: command.intensity ?? 'standard' } : {}),
    ...(command.mode === 'school' && course ? { materialId: course.materialId, unit: course.unit } : {}),
    ...(command.scope !== undefined ? { scope: command.scope } : {}),
  })
  return state
}

/** Record one assessed attempt against the saved task or sheet. */
export function applyRecord(ctx: UpdateContext<'record'>): StudyState {
  const { command, previous, state, active, now } = ctx
  const attempt = command.attempt
  const openTask = state.task?.sessionId === attempt.sessionId && state.task.id === attempt.id ? state.task : undefined
  const aligned = openTask ? alignRecord(openTask, attempt) : attempt
  const assistance = resolveAssistance(openTask, aligned.assistance)
  const recorded = { ...aligned, assistance }
  const existing = state.attempts.find(item => item.id === recorded.id && item.sessionId === recorded.sessionId)
  if (existing) {
    const { at: _at, materialId: _material, rawResponse: _raw, ...stored } = existing
    if (canonical(stored) === canonical(recorded)) return previous
    throw new Error('该记录 ID 已用于另一条内容。完全相同的重试会直接成功；新的一条请换一个 ID。')
  }
  requireValue(active && active.id === attempt.sessionId && active.subject === attempt.subject, '作答必须属于当前学习段和科目。')
  if (aligned.objectiveId && active.scope) {
    const objective = objectiveOf(state, aligned.objectiveId)
    requireValue(objective?.subject === aligned.subject, '学习目标不存在或科目不符。')
    const unit = objective !== undefined && 'unit' in objective && typeof objective.unit === 'string' ? objective.unit : ''
    requireValue(scopeSelects(active.scope, aligned.subject, unit, aligned.objectiveId), '作答目标不在本段学习范围内。')
  }
  if (openTask && openTask.sessionId === active.id && openTask.phase === 'guide') requireValue(openTask.hintLevel >= 1, '引导步要先请求提示。')
  if (openTask && openTask.sessionId === active.id && (openTask.phase === 'demo' || openTask.phase === 'guide')) requireValue(recorded.assistance !== 'independent', '示范或引导不能记录为独立作答。')
  if (openTask && openTask.sessionId === active.id) requireValue(openTask.hintLevel === 0 || recorded.assistance !== 'independent', '学生请求过提示，不能记录为独立作答。')
  const mistake = aligned.mistakeId ? state.mistakes.find(item => item.id === aligned.mistakeId) : undefined
  requireValue(!aligned.mistakeId || mistake, '错题不存在，请先查询错题记录。')
  if (aligned.objectiveId) {
    const objective = objectiveOf(state, aligned.objectiveId)
    requireValue(objective?.subject === aligned.subject, '学习目标不存在或科目不符。')
  }
  if (mistake?.objectiveId) requireValue(aligned.objectiveId === mistake.objectiveId, '作答必须对应错题的学习目标。')
  requireValue(active.mode !== 'review' || mistake, '复习模式的作答需要关联一条已确认的错题。')
  requireValue(active.mode !== 'diagnose' || aligned.objectiveId !== undefined, '摸底作答必须关联学习目标（objectiveId）。')
  if (mistake) requireValue(mistake.confirmedAt !== undefined && mistake.uncertainties === '' && mistake.subject === aligned.subject, '先确认图片转录、答案依据与科目，再进行复习。')
  const materialId = mistake?.materialId ?? active.materialId
  state.attempts.push({ ...recorded, at: now, ...(materialId ? { materialId } : {}), ...(openTask?.rawResponse ? { rawResponse: openTask.rawResponse } : {}) })
  if (recorded.result === 'correct' && recorded.assistance === 'independent') dropTaught(state, recorded.objectiveId)
  return state
}

/** End a block and record elapsed time and rewards. */
export function applyStop(ctx: UpdateContext<'stop'>): StudyState {
  const { command, previous, state, now } = ctx
  const session = state.sessions.find(item => item.id === command.sessionId)
  requireValue(session, '学习段不存在。')
  if (session.endedAt !== undefined) return previous
  session.endedAt = now
  session.spentMs = spent(session, now)
  session.reflection = command.reflection.trim()
  const day = studyDay(session.startedAt)
  const hasWork = state.attempts.some(item => item.sessionId === session.id)
  for (const reason of ['participation', 'reflection'] as const) {
    if (hasWork && (reason === 'participation' || session.reflection) && !state.rewards.some(reward => reward.day === day && reward.reason === reason)) state.rewards.push({ day, reason })
  }
  return state
}
