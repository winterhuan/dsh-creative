import { commandSchema, stateSchema, type StudyState } from './schema.ts'

const MINUTE = 60_000
const DAY = 86_400_000
const OFFSET = 8 * 60 * MINUTE

/** Calendar day for the Shanghai teaching profile, independent of the host timezone. */
export function studyDay(at: number): string { return new Date(at + OFFSET).toISOString().slice(0, 10) }

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function sameScope(a: StudyState['profile'], b: StudyState['materials'][number]['scope']): boolean {
  return a.region === b.region && a.grade === b.grade && a.term === b.term && a.schoolYear === b.schoolYear && a.schoolSystem === b.schoolSystem
}

function spent(session: StudyState['sessions'][number], now: number): number {
  return session.spentMs ?? Math.max(0, Math.min(now, session.deadline) - session.startedAt)
}

function todaySpent(state: StudyState, now: number): number {
  return state.sessions.filter(session => studyDay(session.startedAt) === studyDay(now)).reduce((sum, session) => sum + spent(session, now), 0)
}

function activeSession(state: StudyState) { return state.sessions.find(session => session.endedAt === undefined) }

/**
 * Summarize today's shared budget, course confirmation, rewards and evidence-derived progress.
 * Reading does not close expired sessions; stop records when the learner actually stopped.
 */
export function studyStatus(state: StudyState, now: number) {
  const active = activeSession(state)
  const remainingMs = Math.max(0, state.profile.limits.dailyMinutes * MINUTE - todaySpent(state, now))
  const phase = active ? now >= active.deadline ? 'stop-required' : 'studying'
    : now < state.breakUntil ? 'break' : remainingMs === 0 ? 'daily-complete' : 'ready'
  const progress = new Map<string, { subject: string; topic: string; materialId?: string; attempts: number; independentDays: string[] }>()
  for (const attempt of state.attempts) {
    const key = JSON.stringify([attempt.subject, attempt.topic, attempt.materialId])
    const item = progress.get(key) ?? { subject: attempt.subject, topic: attempt.topic, ...(attempt.materialId ? { materialId: attempt.materialId } : {}), attempts: 0, independentDays: [] }
    item.attempts += 1
    if (attempt.result !== 'unassessed' && (attempt.result !== 'correct' || attempt.assistance !== 'independent')) item.independentDays = []
    if (attempt.result === 'correct' && attempt.assistance === 'independent' && !item.independentDays.includes(studyDay(attempt.at))) item.independentDays.push(studyDay(attempt.at))
    progress.set(key, item)
  }
  return {
    task: state.task ?? null, feedback: state.task ? state.attempts.find(item => item.id === state.task?.id) ?? null : null,
    revision: state.revision, profile: state.profile, phase, remainingMs,
    breakRemainingMs: Math.max(0, state.breakUntil - now), active: active ?? null,
    courses: state.courses, unconfirmedSubjects: ['chinese', 'math', 'english'].filter(subject => !state.courses.some(course => course.subject === subject)),
    stars: state.rewards.length, todayStars: state.rewards.filter(reward => reward.day === studyDay(now)).length,
    dueMistakes: state.mistakes.filter(mistake => mistake.dueAt !== undefined && mistake.dueAt <= now).map(mistake => ({ id: mistake.id, subject: mistake.subject, topic: mistake.topic })),
    pendingMistakes: state.mistakes.filter(mistake => mistake.confirmedAt === undefined).map(mistake => mistake.id),
    progress: [...progress.values()].map(item => ({ ...item, level: item.independentDays.length >= 3 ? 'independent-on-three-days' : 'practising' })),
  }
}

/**
 * Apply one validated mutation without changing the input. No wall-clock time is supplied by the model.
 * Duplicate identities with identical content are no-ops; conflicting reuse throws.
 * Throws on unconfirmed curricula, exhausted time, skipped breaks or unconfirmed/early reviews.
 */
export function updateStudy(previous: StudyState | undefined, input: unknown, now: number): StudyState {
  const command = commandSchema.parse(input)
  if (command.action === 'setup') {
    requireValue(previous === undefined, '学习档案已存在。每个工作区保存一名学生的一学期，请为其他学生或学期使用新工作区。')
    requireValue(command.profile.limits.blockMinutes <= command.profile.limits.dailyMinutes, '单段时长不能超过每日上限。')
    return stateSchema.parse({ format: 1, revision: 1, updatedAt: now, profile: command.profile, materials: [], courses: [], sessions: [], attempts: [], mistakes: [], rewards: [], breakUntil: 0 })
  }
  requireValue(previous, '请先用 /study 完成家长确认的学习档案。')
  requireValue(now >= previous.updatedAt, '系统时间早于上次记录，请核对设备时钟后重试。')
  const state = structuredClone(previous)
  const active = activeSession(state)
  const duplicate = <T>(items: readonly T[], matches: (item: T) => boolean, equal: (item: T) => boolean): boolean => {
    const existing = items.find(matches)
    if (existing === undefined) return false
    requireValue(equal(existing), '该记录 ID 已使用且内容不同，请查询原记录后使用新的 ID。')
    return true
  }
  switch (command.action) {
    case 'configure-course': {
      requireValue(command.material.id === command.course.materialId && command.material.subject === command.course.subject, '教材与学校进度必须引用同一份资料和科目。')
      const withMaterial = updateStudy(previous, { action: 'material', material: command.material }, now)
      const withCourse = updateStudy(withMaterial, { action: 'course', course: command.course }, now)
      return stateSchema.parse({ ...withCourse, revision: previous.revision + 1 })
    }
    case 'task': {
      requireValue(active && active.id === command.task.sessionId && active.subject === command.task.subject && now < active.deadline, '请在有效学习段内出题。')
      if (state.task?.id === command.task.id) {
        const { response: _response, answeredAt: _answeredAt, hintRequested: _hint, ...stored } = state.task
        requireValue(JSON.stringify(stored) === JSON.stringify(command.task), '题目 ID 已存在且内容不同。')
        return previous
      }
      requireValue(!state.attempts.some(item => item.id === command.task.id), '题目 ID 已使用。')
      requireValue(!state.task || state.task.sessionId !== active.id || state.attempts.some(item => item.id === state.task?.id), '请先完成当前题目的作答和反馈。')
      const mistake = state.mistakes.find(item => item.id === command.task.mistakeId)
      requireValue(active.mode !== 'review' || mistake, '复习题需要关联到期错题。')
      if (command.task.mistakeId) requireValue(mistake && mistake.subject === active.subject && mistake.confirmedAt !== undefined && mistake.uncertainties === '' && mistake.dueAt !== undefined && mistake.dueAt <= now, '请先确认错题并等待复习日期。')
      state.task = { ...command.task, hintRequested: false }
      break
    }
    case 'answer':
    case 'hint': {
      const task = state.task
      requireValue(task && task.id === command.taskId && active?.id === task.sessionId && now < active.deadline, '当前题目已结束，请刷新学习状态。')
      requireValue(!state.attempts.some(item => item.id === task.id), '这道题已记录反馈。')
      if (command.action === 'answer') {
        if (task.response !== undefined) { requireValue(task.response === command.response, '答案已提交，请等待反馈。'); return previous }
        task.response = command.response
        task.answeredAt = now
      } else {
        if (task.hintRequested) return previous
        requireValue(task.response === undefined, '答案已提交，请等待反馈。')
        task.hintRequested = true
      }
      break
    }
    case 'limits':
      requireValue(!active, '先结束当前学习，再由家长调整时长。')
      requireValue(command.limits.blockMinutes <= command.limits.dailyMinutes, '单段时长不能超过每日上限。')
      state.profile.limits = command.limits
      state.profile.parentConfirmation = command.parentConfirmation
      break
    case 'material':
      if (duplicate(state.materials, item => item.id === command.material.id, item => JSON.stringify(item) === JSON.stringify(command.material))) return previous
      state.materials.push(command.material)
      break
    case 'course': {
      requireValue(!active, '先结束当前学习，再修改校内进度。')
      const material = state.materials.find(item => item.id === command.course.materialId)
      requireValue(material && material.subject === command.course.subject && sameScope(state.profile, material.scope), '教材的科目、地区、年级、学期、学年和学制必须与档案一致。')
      requireValue(material.kind === 'official-textbook' || material.kind === 'school-material', '参考资料和 AI 自编练习不能标为校内同步教材。')
      requireValue(material.editionStatus === 'identified', '该资料的版次尚未核实，请先核对实物或官方信息并登记已识别的版本。')
      state.courses = state.courses.filter(course => course.subject !== command.course.subject)
      state.courses.push(command.course)
      break
    }
    case 'start': {
      if (duplicate(state.sessions, item => item.id === command.id, item => item.subject === command.subject && item.mode === command.mode)) return previous
      requireValue(!active, '请先结束当前学习段；到时也需要记录停止。')
      requireValue(now >= state.breakUntil, '还在休息时间，请离屏活动，休息结束后再开始。')
      const remaining = state.profile.limits.dailyMinutes * MINUTE - todaySpent(state, now)
      requireValue(remaining > 0, '今天的学习时长已到上限，明天再继续。')
      const course = state.courses.find(item => item.subject === command.subject)
      requireValue(command.mode !== 'school' || course, '该科教材与学校进度尚未确认；可先选择 foundation 通用基础练习。')
      const nextMidnight = (Math.floor((now + OFFSET) / DAY) + 1) * DAY - OFFSET
      state.sessions.push({ id: command.id, subject: command.subject, mode: command.mode, startedAt: now,
        deadline: Math.min(now + state.profile.limits.blockMinutes * MINUTE, now + remaining, nextMidnight),
        ...(command.mode === 'school' && course ? { materialId: course.materialId, unit: course.unit } : {}),
      })
      break
    }
    case 'record': {
      const attempt = command.attempt
      if (duplicate(state.attempts, item => item.id === attempt.id, item => {
        const { at: _at, materialId: _material, ...stored } = item
        return JSON.stringify(stored) === JSON.stringify(attempt)
      })) return previous
      requireValue(active && active.id === attempt.sessionId && active.subject === attempt.subject, '作答必须属于当前学习段和科目。')
      requireValue(now <= active.deadline, '本段学习已到时，请停止并休息。超时答案可在对话中保留，下次学习再复核。')
      if (state.task?.sessionId === active.id) {
        const task = state.task
        requireValue(task.id === attempt.id && task.topic === attempt.topic && task.prompt === attempt.prompt && task.mistakeId === attempt.mistakeId && task.response === attempt.response, '反馈必须对应当前题目和已保存的原始回答。')
        requireValue(!task.hintRequested || attempt.assistance !== 'independent', '学生请求过提示，不能记录为独立作答。')
      }
      const mistake = attempt.mistakeId ? state.mistakes.find(item => item.id === attempt.mistakeId) : undefined
      requireValue(!attempt.mistakeId || mistake, '错题不存在，请先查询错题记录。')
      requireValue(active.mode !== 'review' || mistake, '复习模式的作答需要关联一条已确认且到期的错题。')
      if (mistake) {
        requireValue(mistake.confirmedAt !== undefined && mistake.uncertainties === '' && mistake.subject === attempt.subject, '先确认图片转录、答案依据与科目，再进行复习。')
        requireValue(mistake.dueAt !== undefined && mistake.dueAt <= now, '该错题尚未到复习时间。')
        if (attempt.result !== 'unassessed') {
          const independent = attempt.result === 'correct' && attempt.assistance === 'independent'
          if (!independent) { mistake.stage = 0; mistake.independentDays = [] }
          else if (!mistake.independentDays.includes(studyDay(now))) {
            mistake.independentDays.push(studyDay(now))
            mistake.stage = Math.min(4, mistake.stage + 1)
          }
          mistake.dueAt = now + ([1, 3, 7, 14, 30][mistake.stage] ?? 1) * DAY
        }
      }
      const materialId = mistake?.materialId ?? active.materialId
      state.attempts.push({ ...attempt, at: now, ...(materialId ? { materialId } : {}) })
      break
    }
    case 'stop': {
      const session = state.sessions.find(item => item.id === command.sessionId)
      requireValue(session, '学习段不存在。')
      if (session.endedAt !== undefined) return previous
      session.endedAt = now
      session.spentMs = spent(session, now)
      session.reflection = command.reflection.trim()
      state.breakUntil = now + state.profile.limits.breakMinutes * MINUTE
      const day = studyDay(session.startedAt)
      const hasWork = state.attempts.some(item => item.sessionId === session.id)
      for (const reason of ['participation', 'reflection'] as const) {
        if (hasWork && (reason === 'participation' || session.reflection) && !state.rewards.some(reward => reward.day === day && reward.reason === reason)) state.rewards.push({ day, reason })
      }
      break
    }
    case 'mistake': {
      if (duplicate(state.mistakes, item => item.id === command.mistake.id, item => Object.entries(command.mistake).every(([key, value]) => Reflect.get(item, key) === value))) return previous
      if (command.mistake.materialId) requireValue(state.materials.some(item => item.id === command.mistake.materialId && item.subject === command.mistake.subject), '错题资料不存在或科目不符。')
      state.mistakes.push({ ...command.mistake, stage: 0, independentDays: [] })
      break
    }
    case 'confirm-mistake': {
      const mistake = state.mistakes.find(item => item.id === command.id)
      requireValue(mistake, '错题不存在。')
      if (mistake.confirmedAt !== undefined && (command.learnerAnswer === undefined || mistake.learnerAnswer === command.learnerAnswer) && mistake.prompt === command.prompt && mistake.correction === command.correction
        && mistake.explanation === command.explanation && mistake.answerEvidence === command.answerEvidence && mistake.userConfirmation === command.userConfirmation) return previous
      requireValue(!active, '先结束当前学习，再校正错题记录。')
      mistake.prompt = command.prompt
      if (command.learnerAnswer !== undefined) mistake.learnerAnswer = command.learnerAnswer
      mistake.correction = command.correction
      mistake.explanation = command.explanation
      mistake.answerEvidence = command.answerEvidence
      mistake.userConfirmation = command.userConfirmation
      mistake.uncertainties = ''
      mistake.confirmedAt = now
      mistake.dueAt = now + DAY
      mistake.stage = 0
      mistake.independentDays = []
      break
    }
  }
  state.revision += 1
  state.updatedAt = now
  return stateSchema.parse(state)
}
