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

const subjectMethods = {
  chinese: ['recognize', 'read-evidence', 'express'],
  math: ['represent', 'reason', 'verify'],
  english: ['context', 'listen', 'speak'],
} as const

function advanceMistake(mistake: StudyState['mistakes'][number], result: 'correct' | 'partial' | 'incorrect' | 'unassessed', assistance: 'independent' | 'hint' | 'worked-example', now: number) {
  if (result === 'unassessed' || mistake.dueAt === undefined || mistake.dueAt > now) return
  const independent = result === 'correct' && assistance === 'independent'
  if (!independent) { mistake.stage = 0; mistake.independentDays = [] }
  else if (!mistake.independentDays.includes(studyDay(now))) {
    mistake.independentDays.push(studyDay(now))
    mistake.stage = Math.min(4, mistake.stage + 1)
  } else return
  mistake.dueAt = now + ([1, 3, 7, 14, 30][mistake.stage] ?? 1) * DAY
}

/**
 * Summarize today's shared budget, course confirmation, rewards and evidence-derived progress.
 * Reading does not close expired sessions; stop records when the learner actually stopped.
 */
export function studyStatus(state: StudyState, now: number) {
  const active = activeSession(state)
  const remainingMs = Math.max(0, state.profile.limits.dailyMinutes * MINUTE - todaySpent(state, now))
  const phase = active ? now >= active.deadline ? 'stop-required' : 'studying'
    : now < state.breakUntil ? 'break' : remainingMs === 0 ? 'daily-complete' : 'ready'
  const progress = new Map<string, { subject: string; topic: string; materialId?: string; objectiveId?: string; attempts: number; independentDays: string[] }>()
  function includeEvidence(subject: string, topic: string, at: number, result: string, assistance: string, materialId?: string, objectiveId?: string) {
    const key = objectiveId ?? JSON.stringify([subject, topic, materialId])
    const item = progress.get(key) ?? { subject, topic, ...(materialId ? { materialId } : {}), ...(objectiveId ? { objectiveId } : {}), attempts: 0, independentDays: [] }
    item.attempts += 1
    if (result !== 'unassessed' && (result !== 'correct' || assistance !== 'independent')) item.independentDays = []
    if (result === 'correct' && assistance === 'independent' && !item.independentDays.includes(studyDay(at))) item.independentDays.push(studyDay(at))
    progress.set(key, item)
  }
  for (const attempt of state.attempts) includeEvidence(attempt.subject, attempt.topic, attempt.at, attempt.result, attempt.assistance, attempt.materialId, attempt.objectiveId)
  for (const result of state.paperResults) {
    const worksheet = state.worksheets.find(item => item.id === result.worksheetId)
    const objective = state.objectives.find(item => item.id === worksheet?.objectiveId)
    if (worksheet && objective) includeEvidence(worksheet.subject, objective.title, result.receivedAt, result.result, result.assistance, undefined, objective.id)
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
      if (command.task.objectiveId) requireValue(state.objectives.some(item => item.id === command.task.objectiveId && item.subject === active.subject), '学习目标不存在或科目不符。')
      if (mistake?.objectiveId) requireValue(command.task.objectiveId === mistake.objectiveId, '复习题必须对应错题的学习目标。')
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
        requireValue(task.id === attempt.id && task.topic === attempt.topic && task.prompt === attempt.prompt && task.mistakeId === attempt.mistakeId && task.objectiveId === attempt.objectiveId && task.response === attempt.response, '反馈必须对应当前题目和已保存的原始回答。')
        requireValue(!task.hintRequested || attempt.assistance !== 'independent', '学生请求过提示，不能记录为独立作答。')
      }
      const mistake = attempt.mistakeId ? state.mistakes.find(item => item.id === attempt.mistakeId) : undefined
      requireValue(!attempt.mistakeId || mistake, '错题不存在，请先查询错题记录。')
      if (attempt.objectiveId) requireValue(state.objectives.some(item => item.id === attempt.objectiveId && item.subject === attempt.subject), '学习目标不存在或科目不符。')
      if (mistake?.objectiveId) requireValue(attempt.objectiveId === mistake.objectiveId, '作答必须对应错题的学习目标。')
      requireValue(active.mode !== 'review' || mistake, '复习模式的作答需要关联一条已确认且到期的错题。')
      if (mistake) {
        requireValue(mistake.confirmedAt !== undefined && mistake.uncertainties === '' && mistake.subject === attempt.subject, '先确认图片转录、答案依据与科目，再进行复习。')
        requireValue(mistake.dueAt !== undefined && mistake.dueAt <= now, '该错题尚未到复习时间。')
        advanceMistake(mistake, attempt.result, attempt.assistance, now)
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
      if (command.mistake.objectiveId) requireValue(state.objectives.some(item => item.id === command.mistake.objectiveId && item.subject === command.mistake.subject), '错题学习目标不存在或科目不符。')
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
    case 'concept':
      if (duplicate(state.concepts, item => item.id === command.concept.id, item => Object.entries(command.concept).every(([key, value]) => Reflect.get(item, key) === value))) return previous
      state.concepts.push(command.concept)
      break
    case 'confirm-concept': {
      const concept = state.concepts.find(item => item.id === command.id)
      requireValue(concept, '概念不存在。')
      if (concept.confirmedAt !== undefined) {
        requireValue(concept.userConfirmation === command.userConfirmation && (command.definition === undefined || concept.definition === command.definition)
          && (command.example === undefined || concept.example === command.example) && (command.source === undefined || concept.source === command.source), '概念已确认且确认内容不同。')
        return previous
      }
      if (command.definition !== undefined) concept.definition = command.definition
      if (command.example !== undefined) concept.example = command.example
      if (command.source !== undefined) concept.source = command.source
      concept.confirmedAt = now
      concept.userConfirmation = command.userConfirmation
      break
    }
    case 'objective':
      if (duplicate(state.objectives, item => item.id === command.objective.id, item => JSON.stringify(item) === JSON.stringify(command.objective))) return previous
      requireValue(subjectMethods[command.objective.subject].some(method => method === command.objective.method), '学习方法与科目不符。')
      requireValue(command.objective.conceptIds.every(id => state.concepts.some(item => item.id === id && item.subject === command.objective.subject && item.confirmedAt !== undefined)), '学习目标必须关联同科已确认概念。')
      requireValue(new Set(command.objective.conceptIds).size === command.objective.conceptIds.length, '学习目标不能重复关联概念。')
      state.objectives.push(command.objective)
      break
    case 'relation': {
      if (duplicate(state.relations, item => item.id === command.relation.id, item => JSON.stringify(item) === JSON.stringify(command.relation))) return previous
      const from = state.concepts.find(item => item.id === command.relation.fromId)
      const to = state.concepts.find(item => item.id === command.relation.toId)
      requireValue(from && to && from.id !== to.id && from.subject === to.subject && from.confirmedAt !== undefined && to.confirmedAt !== undefined, '概念关系必须连接同科两个已确认概念。')
      state.relations.push(command.relation)
      break
    }
    case 'link-mistake': {
      const mistake = state.mistakes.find(item => item.id === command.mistakeId)
      const objective = state.objectives.find(item => item.id === command.objectiveId)
      requireValue(mistake && objective && mistake.confirmedAt !== undefined && mistake.subject === objective.subject, '错题与学习目标必须已确认且属于同一科目。')
      if (mistake.objectiveId === objective.id) return previous
      mistake.objectiveId = objective.id
      break
    }
    case 'worksheet': {
      if (duplicate(state.worksheets, item => item.id === command.worksheet.id, item => {
        const { createdAt: _createdAt, ...stored } = item
        return JSON.stringify(stored) === JSON.stringify(command.worksheet)
      })) return previous
      const objective = state.objectives.find(item => item.id === command.worksheet.objectiveId)
      requireValue(objective && objective.subject === command.worksheet.subject, '练习单学习目标不存在或科目不符。')
      requireValue(new Set(command.worksheet.items.map(item => item.id)).size === command.worksheet.items.length, '练习单题号不能重复。')
      requireValue(command.worksheet.items.every(item => state.mistakes.some(mistake => mistake.id === item.mistakeId && mistake.confirmedAt !== undefined && mistake.objectiveId === objective.id)), '练习单每题必须引用已确认、已归类的错题。')
      state.worksheets.push({ ...command.worksheet, createdAt: now })
      break
    }
    case 'paper-result': {
      const result = command.paperResult
      if (duplicate(state.paperResults, item => item.worksheetId === result.worksheetId && item.itemId === result.itemId, item => {
        const { receivedAt: _receivedAt, ...stored } = item
        return JSON.stringify(stored) === JSON.stringify(result)
      })) return previous
      const worksheet = state.worksheets.find(item => item.id === result.worksheetId)
      const item = worksheet?.items.find(item => item.id === result.itemId)
      requireValue(worksheet && item, '纸上作答必须对应已保存的练习单题号。')
      const mistake = state.mistakes.find(mistake => mistake.id === item.mistakeId)
      requireValue(mistake, '练习单对应的错题不存在。')
      state.paperResults.push({ ...result, receivedAt: now })
      if (mistake.objectiveId === worksheet.objectiveId) advanceMistake(mistake, result.result, result.assistance, now)
      break
    }
  }
  state.revision += 1
  state.updatedAt = now
  return stateSchema.parse(state)
}
