import { commandSchema, stateSchema, type StudyState } from './schema.ts'
import { builtinObjective, builtinObjectives, curriculumFor, type CurriculumMethod, type CurriculumRelationKind, type CurriculumScope, type CurriculumSubject } from './curriculum.ts'

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

function objectiveOf(state: StudyState, objectiveId: string) {
  return state.objectives.find(item => item.id === objectiveId) ?? builtinObjective(state.profile, objectiveId)
}

/**
 * Title and subject of a learning objective, custom or shipped, for projections.
 * @param state - current durable learning state.
 * @param objectiveId - objective to resolve.
 * @returns title and subject, or undefined when the objective is unknown in this profile.
 */
export function objectiveInfo(state: StudyState, objectiveId: string): { title: string; subject: CurriculumSubject } | undefined {
  const objective = objectiveOf(state, objectiveId)
  return objective ? { title: objective.title, subject: objective.subject } : undefined
}

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
      requireValue(active.mode !== 'diagnose' || command.task.objectiveId !== undefined, '摸底题必须关联学习目标（objectiveId）。')
      if (command.task.mistakeId) requireValue(mistake && mistake.subject === active.subject && mistake.confirmedAt !== undefined && mistake.uncertainties === '' && mistake.dueAt !== undefined && mistake.dueAt <= now, '请先确认错题并等待复习日期。')
      if (command.task.objectiveId) requireValue(objectiveOf(state, command.task.objectiveId)?.subject === active.subject, '学习目标不存在或科目不符。')
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
        if (task.choices) requireValue(task.choices.includes(command.response), '请选择题目给出的选项之一。')
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
      if (attempt.objectiveId) requireValue(objectiveOf(state, attempt.objectiveId)?.subject === attempt.subject, '学习目标不存在或科目不符。')
      if (mistake?.objectiveId) requireValue(attempt.objectiveId === mistake.objectiveId, '作答必须对应错题的学习目标。')
      requireValue(active.mode !== 'review' || mistake, '复习模式的作答需要关联一条已确认且到期的错题。')
      requireValue(active.mode !== 'diagnose' || attempt.objectiveId !== undefined, '摸底作答必须关联学习目标（objectiveId）。')
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
      if (command.mistake.objectiveId) requireValue(objectiveOf(state, command.mistake.objectiveId)?.subject === command.mistake.subject, '错题学习目标不存在或科目不符。')
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
      const objective = objectiveOf(state, command.objectiveId)
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
      const objective = objectiveOf(state, command.worksheet.objectiveId)
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

const SUBJECT_ORDER = ['chinese', 'math', 'english'] as const
const DIAGNOSIS_INTERVAL = 14 * DAY
const RECHECK_AFTER = 30 * DAY
const DIAGNOSIS_SAMPLE = 6

/** Why an objective needs attention; codes are localized by the workbench and read by the model. */
export interface InsightReason {
  code: 'due-mistakes' | 'open-mistakes' | 'recent-help-or-error' | 'not-practised-recently' | 'not-started' | 'diagnosis-due'
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
  priority: number
  reasons: InsightReason[]
}

/** One subject's recurring check-in plan: whether a check-in is due and which objectives to probe next. */
export interface DiagnosticPlan {
  subject: CurriculumSubject
  due: boolean
  lastAt?: number
  nextAt?: number
  untouched: number
  stalled: number
  recheck: number
  sample: { id: string; title: string; unit: string; unitName: string; reason: 'untouched' | 'stalled' | 'recheck' }[]
}

/** Cross-subject insight: every objective's mastery, the weakest points, check-in plans and the next recommended step. */
export interface StudyInsight {
  objectives: ObjectiveInsight[]
  weakPoints: ObjectiveInsight[]
  diagnostics: DiagnosticPlan[]
  recommendation: { kind: 'review' | 'practice' | 'diagnose' | 'learn'; subject: CurriculumSubject; objectiveId?: string; title?: string; reason: InsightReason } | null
}

/**
 * Derive mastery, weak points and the next step from saved evidence and the shipped knowledge maps.
 * Confirmed mistakes, independent answers on different days and paper results are the only evidence;
 * a helped or wrong answer counts against independence, and an unassessed answer is not an error.
 * A check-in (diagnose block) is due per subject every fourteen days while untouched, stalled or long-mastered
 * objectives remain to probe; its sample rotates across units so one block covers the term broadly.
 * @param state - current durable learning state.
 * @param now - host wall-clock time in milliseconds.
 * @returns objective insights, the five weakest points, per-subject check-in plans and one recommendation.
 */
export function studyInsight(state: StudyState, now: number): StudyInsight {
  const worksheetOf = new Map(state.worksheets.map(sheet => [sheet.id, sheet]))
  const objectives: ObjectiveInsight[] = []
  const seen = new Set<string>()
  const include = (base: { id: string; subject: CurriculumSubject; title: string; goal: string; method: CurriculumMethod; unit: string; unitName: string; conceptIds: string[] }) => {
    if (seen.has(base.id)) return
    seen.add(base.id)
    const outcomes = [
      ...state.attempts.filter(item => item.objectiveId === base.id).map(item => ({ at: item.at, result: item.result, assistance: item.assistance })),
      ...state.paperResults.filter(item => worksheetOf.get(item.worksheetId)?.objectiveId === base.id).map(item => ({ at: item.receivedAt, result: item.result, assistance: item.assistance })),
    ]
    const independentDays = new Set(outcomes.filter(item => item.result === 'correct' && item.assistance === 'independent').map(item => studyDay(item.at)))
    const lastAt = outcomes.reduce<number | undefined>((latest, item) => latest === undefined || item.at > latest ? item.at : latest, undefined)
    const helpedOrWrong = outcomes.filter(item => item.at >= now - 14 * DAY && (item.result === 'incorrect' || item.result === 'partial' || (item.result === 'correct' && item.assistance !== 'independent'))).length
    const wrongRecent = outcomes.filter(item => item.at >= now - 14 * DAY && (item.result === 'incorrect' || item.result === 'partial')).length
    const mistakes = state.mistakes.filter(item => item.objectiveId === base.id && item.confirmedAt !== undefined)
    const dueMistakes = mistakes.filter(item => item.dueAt !== undefined && item.dueAt <= now).length
    const activeMistakes = mistakes.filter(item => item.stage < 4).length
    const weak = activeMistakes >= 2 || helpedOrWrong >= 2 || (independentDays.size === 0 && wrongRecent >= 1)
    const stalled = !weak && independentDays.size < 3 && lastAt !== undefined && now - lastAt > 10 * DAY
    const level = dueMistakes > 0 ? 'due' : weak ? 'weak'
      : independentDays.size >= 3 && activeMistakes === 0 ? 'mastered' : stalled ? 'stalled'
        : lastAt !== undefined || mistakes.length > 0 ? 'practising' : 'untouched'
    const reasons: InsightReason[] = []
    if (dueMistakes > 0) reasons.push({ code: 'due-mistakes', count: dueMistakes })
    if (activeMistakes > 0) reasons.push({ code: 'open-mistakes', count: activeMistakes })
    if (helpedOrWrong > 0) reasons.push({ code: 'recent-help-or-error', count: helpedOrWrong })
    if (stalled && lastAt !== undefined) reasons.push({ code: 'not-practised-recently', count: Math.floor((now - lastAt) / DAY) })
    if (level === 'untouched') reasons.push({ code: 'not-started', count: 0 })
    const priority = level === 'mastered' ? 0
      : dueMistakes * 40 + Math.min(36, helpedOrWrong * 12) + Math.min(24, activeMistakes * 8) + (stalled ? 10 : 0) + (level === 'untouched' ? 5 : 0)
    objectives.push({ ...base, level, independentDays: independentDays.size, attempts: outcomes.length, helpedOrWrong,
      ...(lastAt !== undefined ? { lastAt } : {}), activeMistakes, dueMistakes, masteredMistakes: mistakes.length - activeMistakes, priority, reasons })
  }
  for (const objective of builtinObjectives(state.profile)) include(objective)
  for (const objective of state.objectives) include({ ...objective, unit: '', unitName: '' })
  const weakPoints = objectives.filter(item => item.level === 'due' || item.level === 'weak' || item.level === 'stalled')
    .sort((a, b) => b.priority - a.priority).slice(0, 5)
  const due = SUBJECT_ORDER.map(subject => ({ subject, count: state.mistakes.filter(item => item.subject === subject && item.confirmedAt !== undefined && item.dueAt !== undefined && item.dueAt <= now).length }))
    .filter(item => item.count > 0).sort((a, b) => b.count - a.count)
  const diagnostics: DiagnosticPlan[] = SUBJECT_ORDER.map(subject => {
    const own = objectives.filter(item => item.subject === subject)
    const lastAt = state.sessions.filter(item => item.mode === 'diagnose' && item.subject === subject).reduce<number | undefined>((latest, item) => latest === undefined || item.startedAt > latest ? item.startedAt : latest, undefined)
    const pick = (item: ObjectiveInsight) => ({ id: item.id, title: item.title, unit: item.unit, unitName: item.unitName })
    const untouched = own.filter(item => item.level === 'untouched')
    const stalled = own.filter(item => item.level === 'stalled')
    const recheck = own.filter(item => item.level === 'mastered' && item.lastAt !== undefined && now - item.lastAt >= RECHECK_AFTER)
    const sample: DiagnosticPlan['sample'] = []
    const byUnit = new Map<string, ObjectiveInsight[]>()
    for (const item of untouched) byUnit.set(item.unit, [...(byUnit.get(item.unit) ?? []), item])
    for (let round = 0; round < DIAGNOSIS_SAMPLE && sample.length < DIAGNOSIS_SAMPLE; round += 1) {
      for (const list of byUnit.values()) {
        const item = list[round]
        if (item && sample.length < DIAGNOSIS_SAMPLE) sample.push({ ...pick(item), reason: 'untouched' })
      }
    }
    for (const [list, reason] of [[stalled, 'stalled'], [recheck, 'recheck']] as const) {
      for (const item of list) if (sample.length < DIAGNOSIS_SAMPLE) sample.push({ ...pick(item), reason })
    }
    const due = sample.length > 0 && (lastAt === undefined || now - lastAt >= DIAGNOSIS_INTERVAL)
    return { subject, due, ...(lastAt !== undefined ? { lastAt, nextAt: lastAt + DIAGNOSIS_INTERVAL } : {}), untouched: untouched.length, stalled: stalled.length, recheck: recheck.length, sample }
  })
  const first = due[0]
  const checkIn = diagnostics.filter(plan => plan.due).sort((a, b) => b.sample.length - a.sample.length)[0]
  const untouched = objectives.find(item => item.level === 'untouched')
  const recommendation: StudyInsight['recommendation'] = first
    ? { kind: 'review', subject: first.subject, reason: { code: 'due-mistakes', count: first.count } }
    : weakPoints[0]
      ? { kind: 'practice', subject: weakPoints[0].subject, objectiveId: weakPoints[0].id, title: weakPoints[0].title, reason: weakPoints[0].reasons[0] ?? { code: 'recent-help-or-error', count: 0 } }
      : checkIn
        ? { kind: 'diagnose', subject: checkIn.subject, reason: { code: 'diagnosis-due', count: checkIn.sample.length } }
        : untouched
          ? { kind: 'learn', subject: untouched.subject, objectiveId: untouched.id, title: untouched.title, reason: { code: 'not-started', count: 0 } }
          : null
  return { objectives, weakPoints, diagnostics, recommendation }
}

/**
 * Compact projection of the insight for the workbench and the status tool.
 * @param insight - full insight for the current state.
 * @returns up to three weak points, per-subject check-in status with the sampled objective IDs, and the current recommendation.
 */
export function insightSummary(insight: StudyInsight) {
  return {
    weakPoints: insight.weakPoints.slice(0, 3).map(item => ({ id: item.id, subject: item.subject, title: item.title, level: item.level, priority: item.priority, reasons: item.reasons })),
    diagnostics: insight.diagnostics.map(plan => ({ subject: plan.subject, due: plan.due, ...(plan.lastAt !== undefined ? { lastAt: plan.lastAt } : {}), ...(plan.nextAt !== undefined ? { nextAt: plan.nextAt } : {}), sample: plan.sample.map(item => item.id) })),
    recommendation: insight.recommendation,
  }
}

/** One knowledge point with mastery rolled up from the objectives that teach it. */
export interface ConceptView {
  id: string
  name: string
  unit: string
  definition: string
  example: string
  source: string
  level: ObjectiveInsight['level']
  objectiveIds: string[]
  independentDays: number
  attempts: number
  activeMistakes: number
  dueMistakes: number
}

/** One unit's knowledge-point counts by mastery state. */
export interface UnitView {
  id: string
  name: string
  summary: string
  concepts: number
  mastered: number
  learning: number
  weak: number
  due: number
  untouched: number
}

/** The shipped knowledge map for one subject with mastery overlaid. */
export interface CurriculumView {
  id: string
  title: string
  basis: string
  units: UnitView[]
  concepts: ConceptView[]
  objectives: ObjectiveInsight[]
  relations: { id: string; fromId: string; toId: string; kind: CurriculumRelationKind; explanation: string }[]
  summary: { concepts: number; objectives: number; mastered: number; practising: number; weak: number; due: number; stalled: number; untouched: number }
  scope: { grade: number; term: 'first' | 'second'; current: boolean }
}

/**
 * Project one subject's shipped knowledge map with mastery overlaid.
 * @param state - current durable learning state, providing grade and term.
 * @param subject - subject to project.
 * @param insight - insight computed for the same state and time.
 * @param scope - grade and term to browse; defaults to the profile, the only scope that carries mastery.
 * @returns the map view, or null outside grades one and two.
 */
export function curriculumView(state: StudyState, subject: CurriculumSubject, insight: StudyInsight, scope?: CurriculumScope): CurriculumView | null {
  const target = scope ?? { grade: state.profile.grade, term: state.profile.term }
  const file = curriculumFor(target, subject)
  if (!file) return null
  const current = target.grade === state.profile.grade && target.term === state.profile.term
  const objectives: ObjectiveInsight[] = current
    ? insight.objectives.filter(item => item.subject === subject && file.objectives.some(objective => objective.id === item.id))
    : file.objectives.map(objective => {
      const unit = file.concepts.find(concept => concept.id === objective.conceptIds[0])?.unit ?? ''
      return { ...objective, subject, unit, unitName: file.units.find(item => item.id === unit)?.name ?? '', level: 'untouched', independentDays: 0, attempts: 0, helpedOrWrong: 0, activeMistakes: 0, dueMistakes: 0, masteredMistakes: 0, priority: 0, reasons: [{ code: 'not-started', count: 0 }] }
    })
  const levelOf = (levels: readonly ObjectiveInsight['level'][]): ObjectiveInsight['level'] => {
    if (levels.length === 0 || levels.every(level => level === 'untouched')) return 'untouched'
    if (levels.every(level => level === 'mastered')) return 'mastered'
    if (levels.includes('due')) return 'due'
    if (levels.includes('weak')) return 'weak'
    if (levels.includes('stalled')) return 'stalled'
    return 'practising'
  }
  const concepts: ConceptView[] = file.concepts.map(concept => {
    const linked = objectives.filter(objective => objective.conceptIds.includes(concept.id))
    return { id: concept.id, name: concept.name, unit: concept.unit, definition: concept.definition, example: concept.example, source: concept.source,
      level: levelOf(linked.map(item => item.level)), objectiveIds: linked.map(item => item.id),
      independentDays: Math.max(0, ...linked.map(item => item.independentDays)),
      attempts: linked.reduce((sum, item) => sum + item.attempts, 0),
      activeMistakes: linked.reduce((sum, item) => sum + item.activeMistakes, 0),
      dueMistakes: linked.reduce((sum, item) => sum + item.dueMistakes, 0) }
  })
  const units: UnitView[] = file.units.map(unit => {
    const own = concepts.filter(concept => concept.unit === unit.id)
    return { id: unit.id, name: unit.name, summary: unit.summary, concepts: own.length,
      mastered: own.filter(item => item.level === 'mastered').length,
      learning: own.filter(item => item.level === 'practising' || item.level === 'stalled').length,
      weak: own.filter(item => item.level === 'weak').length,
      due: own.filter(item => item.level === 'due').length,
      untouched: own.filter(item => item.level === 'untouched').length }
  })
  const summary = { concepts: concepts.length, objectives: objectives.length,
    mastered: concepts.filter(item => item.level === 'mastered').length,
    practising: concepts.filter(item => item.level === 'practising').length,
    weak: concepts.filter(item => item.level === 'weak').length,
    due: concepts.filter(item => item.level === 'due').length,
    stalled: concepts.filter(item => item.level === 'stalled').length,
    untouched: concepts.filter(item => item.level === 'untouched').length }
  return { id: file.id, title: file.title, basis: file.basis, units, concepts, objectives, summary, scope: { grade: target.grade, term: target.term, current },
    relations: file.relations.map(relation => ({ id: relation.id, fromId: relation.fromId, toId: relation.toId, kind: relation.kind, explanation: relation.explanation })) }
}
