import { commandSchema, stateSchema, type ErrorType, type StudyState, type UnitFocus, type Variant, type VariationAxis } from './schema.ts'
import { errorTypesBySubject } from './vocabulary.ts'
import { builtinObjective, builtinObjectiveIn, builtinObjectives, builtinObjectivesIn, curriculumFor, type CurriculumMethod, type CurriculumRelationKind, type CurriculumScope, type CurriculumSubject } from './curriculum.ts'

const MINUTE = 60_000
const DAY = 86_400_000
const OFFSET = 8 * 60 * MINUTE

/** Calendar day for the Shanghai teaching profile, independent of the host timezone. */
export function studyDay(at: number): string { return new Date(at + OFFSET).toISOString().slice(0, 10) }

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** Key order is not part of a record. Retries that only reorder fields match. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`).join(',')}}`
  return JSON.stringify(value)
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
 * Resolve a learning objective, custom or shipped, across any shipped scope.
 * @param state - current durable learning state.
 * @param objectiveId - objective to resolve.
 * @returns the objective, or undefined when unknown in any shipped map.
 */
function objectiveOf(state: StudyState, objectiveId: string) {
  return state.objectives.find(item => item.id === objectiveId)
    ?? builtinObjective(state.profile, objectiveId)
    ?? (['chinese', 'math', 'english'] as const).flatMap(subject =>
      ([1, 2] as const).flatMap(grade =>
        (['first', 'second'] as const).map(term =>
          builtinObjectiveIn({ grade, term }, subject, objectiveId)
        )
      )
    ).find(item => item !== undefined)
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

type Worksheet = StudyState['worksheets'][number]
type WorksheetItem = Worksheet['items'][number]

/** The goal a worksheet question tests: its own, then its source mistake's, then the sheet's. */
export function itemObjectiveId(state: StudyState, worksheet: Pick<Worksheet, 'objectiveId'>, item: Pick<WorksheetItem, 'objectiveId' | 'mistakeId'>): string | undefined {
  return item.objectiveId ?? (item.mistakeId ? state.mistakes.find(mistake => mistake.id === item.mistakeId)?.objectiveId : undefined) ?? worksheet.objectiveId
}

function questionObjectiveId(state: StudyState, worksheet: Worksheet, itemId: string): string | undefined {
  const item = worksheet.items.find(question => question.id === itemId)
  return item ? itemObjectiveId(state, worksheet, item) : undefined
}

/** A printed sheet still waiting for at least one graded question. Discarded sheets never wait. */
export function sheetOpen(state: StudyState, worksheet: Worksheet): boolean {
  return worksheet.discardedAt === undefined && worksheet.items.some(item => !state.paperResults.some(result => result.worksheetId === worksheet.id && result.itemId === item.id))
}

/**
 * Save one graded question. A changed grade replaces the earlier one and keeps its original day.
 * A wrong or partial answer to a new question becomes a confirmed mistake on that question's goal;
 * regrading it correct removes that mistake again unless other answers already cite it.
 * @returns whether anything changed.
 */
function gradeItem(state: StudyState, worksheet: Worksheet, item: WorksheetItem, entry: StudyState['paperResults'][number], errorType?: ErrorType): boolean {
  const index = state.paperResults.findIndex(result => result.worksheetId === worksheet.id && result.itemId === item.id)
  const previous = state.paperResults[index]
  if (previous) {
    const { receivedAt: _before, ...stored } = previous
    const { receivedAt: _now, ...next } = entry
    if (canonical(stored) === canonical(next)) return false
    state.paperResults.splice(index, 1)
  }
  state.paperResults.push(previous ? { ...entry, receivedAt: previous.receivedAt } : entry)
  const linked = item.mistakeId ? state.mistakes.find(mistake => mistake.id === item.mistakeId) : undefined
  const fromHere = linked?.source?.worksheetId === worksheet.id && linked.source.itemId === item.id
  const wrong = entry.result === 'incorrect' || entry.result === 'partial'
  if (linked && wrong && errorType !== undefined) linked.errorType = errorType
  if (linked && fromHere) {
    if (wrong) {
      linked.learnerAnswer = entry.response
      linked.answerEvidence = entry.answerEvidence
      return true
    }
    const citedElsewhere = state.attempts.some(attempt => attempt.mistakeId === linked.id)
      || state.worksheets.some(sheet => sheet.items.some(question => question !== item && question.mistakeId === linked.id))
    if (!citedElsewhere) {
      state.mistakes = state.mistakes.filter(mistake => mistake !== linked)
      delete item.mistakeId
    }
    return true
  }
  if (!linked && wrong) {
    const objectiveId = itemObjectiveId(state, worksheet, item)
    const id = practiceMistakeId(state, worksheet.id, item.id)
    state.mistakes.push({
      id, subject: worksheet.subject, topic: item.prompt.slice(0, 60), prompt: item.prompt, learnerAnswer: entry.response,
      correction: item.answer, explanation: item.explanation, answerEvidence: entry.answerEvidence, uncertainties: '',
      ...(objectiveId ? { objectiveId } : {}), ...(errorType ? { errorType } : {}), confirmedAt: entry.receivedAt, userConfirmation: entry.userConfirmation,
      source: { worksheetId: worksheet.id, itemId: item.id }, stage: 0, independentDays: [],
    })
    item.mistakeId = id
  }
  return true
}

function practiceMistakeId(state: StudyState, worksheetId: string, itemId: string): string {
  const base = `w-${worksheetId}-${itemId}`.slice(0, 80)
  if (!state.mistakes.some(item => item.id === base)) return base
  const extra = `-${state.mistakes.length}`
  return `${base.slice(0, 80 - extra.length)}${extra}`
}

const REVIEW_DAYS = [1, 3, 7, 14, 30]

/** Midnight in the teaching timezone that starts the given calendar day. */
function dayStart(day: string): number { return Date.parse(`${day}T00:00:00+08:00`) }

/**
 * Replay every confirmed mistake's review evidence: answers that cite it and paper results on items that cite it.
 * A mistake is due from the calendar day after confirmation or after the last wrong answer, not at a clock time.
 * Wrong, partial or helped answers keep the stage and only make it due again the next day. An independent correct
 * answer on any day, earlier than the due day included, advances it at most once per day; the next due day counts
 * from that answer.
 * Stage 4 (a 30-day interval) is consolidated.
 */
export function scheduleMistakes(state: StudyState): StudyState {
  const evidence = new Map<string, { at: number; result: string; assistance: string }[]>()
  const add = (mistakeId: string | undefined, at: number, result: string, assistance: string) => {
    if (!mistakeId) return
    evidence.set(mistakeId, [...evidence.get(mistakeId) ?? [], { at, result, assistance }])
  }
  for (const attempt of state.attempts) add(attempt.mistakeId, attempt.at, attempt.result, attempt.assistance)
  const sheets = new Map(state.worksheets.map(sheet => [sheet.id, sheet]))
  for (const result of state.paperResults) add(sheets.get(result.worksheetId)?.items.find(item => item.id === result.itemId)?.mistakeId, result.receivedAt, result.result, result.assistance)
  for (const mistake of state.mistakes) {
    if (mistake.confirmedAt === undefined) continue
    const confirmedAt = mistake.confirmedAt
    let stage = 0
    let days: string[] = []
    let due = studyDay(confirmedAt + DAY)
    for (const item of (evidence.get(mistake.id) ?? []).filter(entry => entry.at >= confirmedAt).sort((a, b) => a.at - b.at)) {
      if (item.result === 'unassessed') continue
      const day = studyDay(item.at)
      if (item.result !== 'correct' || item.assistance !== 'independent') {
        due = studyDay(item.at + DAY)
        continue
      }
      if (days.includes(day)) continue
      days = [...days, day]
      stage = Math.min(4, stage + 1)
      due = studyDay(item.at + (REVIEW_DAYS[stage] ?? 1) * DAY)
    }
    mistake.stage = stage
    mistake.independentDays = days
    mistake.dueAt = dayStart(due)
  }
  return state
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
    const objectiveId = worksheet ? questionObjectiveId(state, worksheet, result.itemId) : undefined
    const objective = objectiveId ? objectiveInfo(state, objectiveId) : undefined
    if (worksheet && objective && objectiveId) includeEvidence(worksheet.subject, objective.title, result.receivedAt, result.result, result.assistance, undefined, objectiveId)
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
 * Throws on unconfirmed curricula, exhausted time, skipped breaks or unconfirmed reviews.
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
    requireValue(equal(existing), '该记录 ID 已用于另一条内容。完全相同的重试会直接成功；新的一条请换一个 ID。')
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
      if (state.task?.id === command.task.id && state.task.sessionId === command.task.sessionId) {
        const { response: _response, answeredAt: _answeredAt, hintRequested: _hint, ...stored } = state.task
        requireValue(canonical(stored) === canonical(command.task), '这个学习段里的题目编号已用于另一道题。')
        return previous
      }
      requireValue(!state.attempts.some(item => item.id === command.task.id && item.sessionId === command.task.sessionId), '这个学习段里的题目编号已使用。下一段学习可以再用同一个编号。')
      requireValue(!state.task || state.task.sessionId !== active.id || state.attempts.some(item => item.id === state.task?.id), '请先完成当前题目的作答和反馈。')
      const mistake = state.mistakes.find(item => item.id === command.task.mistakeId)
      requireValue(active.mode !== 'review' || mistake, '复习题需要关联一条已确认的错题。')
      requireValue(active.mode !== 'diagnose' || command.task.objectiveId !== undefined, '摸底题必须关联学习目标（objectiveId）。')
      if (command.task.mistakeId) requireValue(mistake && mistake.subject === active.subject && mistake.confirmedAt !== undefined && mistake.uncertainties === '', '请先确认这道错题，再开始复习。')
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
      if (duplicate(state.materials, item => item.id === command.material.id, item => canonical(item) === canonical(command.material))) return previous
      state.materials.push(command.material)
      break
    case 'course': {
      requireValue(!active, '先结束当前学习，再修改校内进度。')
      const material = state.materials.find(item => item.id === command.course.materialId)
      requireValue(material && material.subject === command.course.subject && sameScope(state.profile, material.scope), '教材的科目、地区、年级、学期、学年和学制必须与档案一致。')
      requireValue(material.kind === 'official-textbook' || material.kind === 'school-material', '参考资料和 AI 自编练习不能标为校内同步教材。')
      requireValue(material.editionStatus === 'identified', '该资料的版次尚未核实，请先核对实物或官方信息并登记已识别的版本。')
      const prior = state.courses.find(course => course.subject === command.course.subject)
      const progress = prior?.progress
      state.courses = state.courses.filter(course => course.subject !== command.course.subject)
      state.courses.push(progress ? { ...command.course, progress } : command.course)
      break
    }
    case 'school-progress': {
      requireValue(!active, '先结束当前学习，再修改学校进度。')
      const course = state.courses.find(item => item.subject === command.subject)
      requireValue(course, '先确认该科教材，再标学校教到哪一单元。')
      const file = curriculumFor(state.profile, command.subject)
      requireValue(file?.units.some(unit => unit.id === command.unitId), '这个单元不在当前年级学期的知识地图里。')
      course.progress = { unitId: command.unitId, confirmedAt: now, posture: command.posture, preview: command.preview === 'on', pace: command.pace }
      break
    }
    case 'start': {
      const existing = state.sessions.find(item => item.id === command.id)
      if (existing && existing.endedAt === undefined) {
        requireValue(existing.subject === command.subject && existing.mode === command.mode, '这个学习段编号正在使用，请换一个新编号。')
        return previous
      }
      if (existing) {
        const archived = `${existing.id}-past-${state.sessions.filter(item => item.id.startsWith(`${existing.id}-past-`)).length}`
        requireValue(archived.length <= 80, '这个学习段编号已经用过，请换一个更短的新编号。')
        for (const attempt of state.attempts) if (attempt.sessionId === existing.id) attempt.sessionId = archived
        if (state.task?.sessionId === existing.id) state.task.sessionId = archived
        existing.id = archived
      }
      const id = command.id
      requireValue(!active, '请先结束当前学习段；到时也需要记录停止。')
      requireValue(command.mode === 'diagnose' || command.intensity === undefined, '摸底强度只用于摸底检测。')
      requireValue(command.scope === undefined || command.mode === 'diagnose' || command.mode === 'foundation' || command.mode === 'school', '自定义范围只用于摸底或学习。')
      if (command.scope) {
        const file = curriculumFor({ grade: command.scope.grade, term: command.scope.term }, command.subject)
        requireValue(file, '该年级学期的知识地图不存在。')
        if (command.scope.units) for (const unitId of command.scope.units) requireValue(file.units.some(unit => unit.id === unitId), `单元不在该年级学期的知识地图里：${unitId}`)
        if (command.scope.objectiveIds) for (const objectiveId of command.scope.objectiveIds) requireValue(builtinObjectiveIn({ grade: command.scope.grade, term: command.scope.term }, command.subject, objectiveId) || state.objectives.some(item => item.id === objectiveId), `学习目标不存在：${objectiveId}`)
      }
      requireValue(now >= state.breakUntil, '还在休息时间，请离屏活动，休息结束后再开始。')
      const remaining = state.profile.limits.dailyMinutes * MINUTE - todaySpent(state, now)
      requireValue(remaining > 0, '今天的学习时长已到上限，明天再继续。')
      const course = state.courses.find(item => item.subject === command.subject)
      requireValue(command.mode !== 'school' || course, '该科教材与学校进度尚未确认；可先选择 foundation 通用基础练习。')
      const nextMidnight = (Math.floor((now + OFFSET) / DAY) + 1) * DAY - OFFSET
      state.sessions.push({ id, subject: command.subject, mode: command.mode, startedAt: now, ...(command.mode === 'diagnose' ? { intensity: command.intensity ?? 'standard' } : {}),
        deadline: Math.min(now + state.profile.limits.blockMinutes * MINUTE, now + remaining, nextMidnight),
        ...(command.mode === 'school' && course ? { materialId: course.materialId, unit: course.unit } : {}),
        ...(command.scope !== undefined ? { scope: command.scope } : {}),
      })
      break
    }
    case 'record': {
      const attempt = command.attempt
      if (duplicate(state.attempts, item => item.id === attempt.id && item.sessionId === attempt.sessionId, item => {
        const { at: _at, materialId: _material, ...stored } = item
        return canonical(stored) === canonical(attempt)
      })) return previous
      requireValue(active && active.id === attempt.sessionId && active.subject === attempt.subject, '作答必须属于当前学习段和科目。')
      requireValue(now <= active.deadline, '本段学习已到时，请停止并休息。超时答案可在对话中保留，下次学习再复核。')
      if (attempt.objectiveId && active.scope) {
        const objective = objectiveOf(state, attempt.objectiveId)
        requireValue(objective?.subject === attempt.subject, '学习目标不存在或科目不符。')
        const unit = objective !== undefined && 'unit' in objective && typeof objective.unit === 'string' ? objective.unit : ''
        requireValue(scopeSelects(active.scope, attempt.subject, unit, attempt.objectiveId), '作答目标不在本段学习范围内。')
      }
      if (state.task?.sessionId === active.id) {
        const task = state.task
        requireValue(task.id === attempt.id && task.topic === attempt.topic && task.prompt === attempt.prompt && task.mistakeId === attempt.mistakeId && task.objectiveId === attempt.objectiveId && task.variant === attempt.variant && task.response === attempt.response, '反馈必须对应当前题目和已保存的原始回答。')
        requireValue(!task.hintRequested || attempt.assistance !== 'independent', '学生请求过提示，不能记录为独立作答。')
      }
      const mistake = attempt.mistakeId ? state.mistakes.find(item => item.id === attempt.mistakeId) : undefined
      requireValue(!attempt.mistakeId || mistake, '错题不存在，请先查询错题记录。')
      if (attempt.objectiveId) {
        const objective = objectiveOf(state, attempt.objectiveId)
        requireValue(objective?.subject === attempt.subject, '学习目标不存在或科目不符。')
      }
      if (mistake?.objectiveId) requireValue(attempt.objectiveId === mistake.objectiveId, '作答必须对应错题的学习目标。')
      requireValue(active.mode !== 'review' || mistake, '复习模式的作答需要关联一条已确认的错题。')
      requireValue(active.mode !== 'diagnose' || attempt.objectiveId !== undefined, '摸底作答必须关联学习目标（objectiveId）。')
      if (mistake) requireValue(mistake.confirmedAt !== undefined && mistake.uncertainties === '' && mistake.subject === attempt.subject, '先确认图片转录、答案依据与科目，再进行复习。')
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
      if (command.mistake.materialId) requireValue(state.materials.some(item => item.id === command.mistake.materialId && item.subject === command.mistake.subject), '错题资料不存在或科目不符。')
      if (command.mistake.objectiveId) requireValue(objectiveOf(state, command.mistake.objectiveId)?.subject === command.mistake.subject, '错题学习目标不存在或科目不符。')
      if (command.mistake.errorType !== undefined) requireValue(errorTypesBySubject[command.mistake.subject].includes(command.mistake.errorType), '错因分类与科目不符。')
      const existing = state.mistakes.find(item => item.id === command.mistake.id)
      if (existing) {
        const pending = existing.confirmedAt === undefined
        const same = Object.entries(command.mistake).every(([key, value]) => canonical(Reflect.get(existing, key)) === canonical(value))
        requireValue(pending || same, '这条错题已确认。要改正请用 confirm-mistake，新题请换一个编号。')
        if (!pending) return previous
        Object.assign(existing, command.mistake)
        break
      }
      state.mistakes.push({ ...command.mistake, stage: 0, independentDays: [] })
      break
    }
    case 'confirm-mistake': {
      const mistake = state.mistakes.find(item => item.id === command.id)
      requireValue(mistake, '错题不存在。')
      if (command.errorType !== undefined) requireValue(errorTypesBySubject[mistake.subject].includes(command.errorType), '错因分类与科目不符。')
      if (mistake.confirmedAt !== undefined && (command.learnerAnswer === undefined || mistake.learnerAnswer === command.learnerAnswer) && mistake.prompt === command.prompt && mistake.correction === command.correction
        && mistake.explanation === command.explanation && mistake.answerEvidence === command.answerEvidence && (command.errorType === undefined || mistake.errorType === command.errorType) && mistake.userConfirmation === command.userConfirmation) return previous
      requireValue(!active, '先结束当前学习，再校正错题记录。')
      mistake.prompt = command.prompt
      if (command.learnerAnswer !== undefined) mistake.learnerAnswer = command.learnerAnswer
      mistake.correction = command.correction
      mistake.explanation = command.explanation
      mistake.answerEvidence = command.answerEvidence
      if (command.errorType !== undefined) mistake.errorType = command.errorType
      mistake.userConfirmation = command.userConfirmation
      mistake.uncertainties = ''
      mistake.confirmedAt = now
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
      if (duplicate(state.objectives, item => item.id === command.objective.id, item => canonical(item) === canonical(command.objective))) return previous
      requireValue(subjectMethods[command.objective.subject].some(method => method === command.objective.method), '学习方法与科目不符。')
      requireValue(command.objective.conceptIds.every(id => state.concepts.some(item => item.id === id && item.subject === command.objective.subject && item.confirmedAt !== undefined)), '学习目标必须关联同科已确认概念。')
      requireValue(new Set(command.objective.conceptIds).size === command.objective.conceptIds.length, '学习目标不能重复关联概念。')
      state.objectives.push(command.objective)
      break
    case 'relation': {
      if (duplicate(state.relations, item => item.id === command.relation.id, item => canonical(item) === canonical(command.relation))) return previous
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
    case 'classify-mistake': {
      const mistake = state.mistakes.find(item => item.id === command.mistakeId)
      requireValue(mistake?.confirmedAt !== undefined, '先确认错题，再归类错因。')
      const next = command.errorType === undefined ? mistake.errorType : command.errorType === '' ? undefined : command.errorType
      if (next !== undefined) requireValue(errorTypesBySubject[mistake.subject].includes(next), '错因分类与科目不符。')
      if (next === mistake.errorType) return previous
      if (next === undefined) delete mistake.errorType
      else mistake.errorType = next
      break
    }
    case 'worksheet': {
      const sheet = command.worksheet
      requireValue(new Set(sheet.items.map(item => item.id)).size === sheet.items.length, '练习单题号不能重复。')
      if (sheet.objectiveId) requireValue(objectiveOf(state, sheet.objectiveId)?.subject === sheet.subject, '练习单学习目标不存在或科目不符。')
      const cited = sheet.items.flatMap(item => item.mistakeId ? [item.mistakeId] : [])
      requireValue(new Set(cited).size === cited.length, '同一道错题在一张卷上只出一题。')
      const horizon = dayStart(studyDay(now + DAY)) + DAY
      for (const item of sheet.items) {
        const mistake = item.mistakeId ? state.mistakes.find(candidate => candidate.id === item.mistakeId) : undefined
        requireValue(!item.mistakeId || (mistake?.confirmedAt !== undefined && mistake.objectiveId !== undefined && mistake.subject === sheet.subject), '练习单引用的错题必须已确认、已归类到同科学习目标。')
        const goalId = itemObjectiveId(state, sheet, item)
        requireValue(goalId !== undefined && objectiveOf(state, goalId)?.subject === sheet.subject, '每道题都要有同科学习目标：写在题上，或写在整张卷上。')
        if (!mistake) continue
        requireValue(mistake.objectiveId === goalId, '巩固题的学习目标必须和它的错题一致。')
        requireValue(item.prompt !== mistake.prompt, '巩固题必须换题面，不能照抄原题。')
        requireValue(mistake.dueAt !== undefined && mistake.dueAt < horizon, `错题 ${mistake.id} 明天之后才到复习日，先不放进巩固卷。`)
        const other = state.worksheets.find(candidate => candidate.id !== sheet.id && sheetOpen(state, candidate) && candidate.items.some(question => question.mistakeId === mistake.id))
        requireValue(!other, `错题 ${mistake.id} 已经在还没批改的练习单 ${other?.id ?? ''} 上，先批改或作废那张。`)
      }
      const existing = state.worksheets.find(item => item.id === sheet.id)
      if (existing) {
        const { createdAt: _createdAt, discardedAt: _discardedAt, ...stored } = existing
        if (canonical(stored) === canonical(sheet)) return previous
        requireValue(existing.discardedAt === undefined, '这张练习单已作废，请换一个新编号。')
        requireValue(!state.paperResults.some(item => item.worksheetId === existing.id), '这张练习单已有作答，请换一个新编号。')
        state.worksheets = state.worksheets.map(item => item === existing ? { ...sheet, createdAt: existing.createdAt } : item)
        break
      }
      state.worksheets.push({ ...sheet, createdAt: now })
      break
    }
    case 'paper-draft': {
      const draft = command.paperDraft
      const worksheet = state.worksheets.find(item => item.id === draft.worksheetId)
      const item = worksheet?.items.find(item => item.id === draft.itemId)
      requireValue(worksheet && item, '转录草稿必须对应已保存的练习单项。')
      requireValue(worksheet.discardedAt === undefined, '这张练习单已作废。')
      if (draft.errorType !== undefined) requireValue(errorTypesBySubject[worksheet.subject].includes(draft.errorType), '错因分类与科目不符。')
      const existing = state.paperDrafts.find(candidate => candidate.worksheetId === draft.worksheetId && candidate.itemId === draft.itemId)
      const next = {
        worksheetId: draft.worksheetId, itemId: draft.itemId, response: draft.response, result: draft.result, assistance: draft.assistance,
        uncertainties: draft.uncertainties ?? existing?.uncertainties ?? '',
        ...(draft.errorType !== undefined ? { errorType: draft.errorType } : existing?.errorType !== undefined ? { errorType: existing.errorType } : {}),
      }
      if (existing) {
        const { receivedAt: _existingAt, ...before } = existing
        if (canonical(before) === canonical(next)) return previous
        state.paperDrafts = state.paperDrafts.map(candidate => candidate === existing ? { ...next, receivedAt: existing.receivedAt } : candidate)
        break
      }
      state.paperDrafts.push({ ...next, receivedAt: now })
      break
    }
    case 'grade-sheet': {
      const grade = command.grade
      const worksheet = state.worksheets.find(item => item.id === grade.worksheetId)
      requireValue(worksheet, '练习单不存在。')
      requireValue(worksheet.discardedAt === undefined, '这张练习单已作废。')
      requireValue(new Set(grade.results.map(entry => entry.itemId)).size === grade.results.length, '同一道题只批改一次。')
      let changed = false
      for (const entry of grade.results) {
        const item = worksheet.items.find(question => question.id === entry.itemId)
        requireValue(item, `练习单 ${worksheet.id} 没有题号 ${entry.itemId}。`)
        if (entry.errorType !== undefined) requireValue(errorTypesBySubject[worksheet.subject].includes(entry.errorType), '错因分类与科目不符。')
        const before = state.paperResults.find(result => result.worksheetId === worksheet.id && result.itemId === item.id)
        const assistance = entry.assistance ?? 'independent'
        const response = entry.response ?? before?.response ?? '（家长在面板批改，未转录原答案）'
        if (before && before.result === entry.result && before.assistance === assistance && before.response === response) continue
        gradeItem(state, worksheet, item, { worksheetId: worksheet.id, itemId: item.id, response, result: entry.result, assistance, feedback: '家长批改', answerEvidence: item.answerEvidence, userConfirmation: grade.userConfirmation, receivedAt: now }, entry.result !== 'correct' ? entry.errorType : undefined)
        changed = true
      }
      if (!changed) return previous
      break
    }
    case 'confirm-paper': {
      const worksheet = state.worksheets.find(item => item.id === command.worksheetId)
      requireValue(worksheet, '练习单不存在。')
      requireValue(worksheet.discardedAt === undefined, '这张练习单已作废。')
      requireValue(new Set(command.results.map(entry => entry.itemId)).size === command.results.length, '同一道题只核对一次。')
      let changed = false
      for (const entry of command.results) {
        const item = worksheet.items.find(question => question.id === entry.itemId)
        requireValue(item, `练习单 ${worksheet.id} 没有题号 ${entry.itemId}。`)
        if (entry.errorType !== undefined) requireValue(errorTypesBySubject[worksheet.subject].includes(entry.errorType), '错因分类与科目不符。')
        const draft = state.paperDrafts.find(candidate => candidate.worksheetId === worksheet.id && candidate.itemId === item.id)
        const before = state.paperResults.find(result => result.worksheetId === worksheet.id && result.itemId === item.id)
        requireValue(draft !== undefined || before !== undefined, '请先让学习助手转录这张卷，再逐题核对入库。')
        const assistance = entry.assistance ?? draft?.assistance ?? before?.assistance ?? 'independent'
        const response = entry.response ?? draft?.response ?? before?.response ?? '（家长核对照片转录，未转录原答案）'
        const errorType = entry.result !== 'correct' ? entry.errorType ?? draft?.errorType : undefined
        const same = before !== undefined && before.result === entry.result && before.assistance === assistance && before.response === response
        if (!same) {
          gradeItem(state, worksheet, item, { worksheetId: worksheet.id, itemId: item.id, response, result: entry.result, assistance, feedback: '家长核对照片转录', answerEvidence: item.answerEvidence, userConfirmation: command.userConfirmation, receivedAt: draft?.receivedAt ?? now }, errorType)
          changed = true
        }
        if (draft !== undefined) {
          state.paperDrafts = state.paperDrafts.filter(candidate => candidate !== draft)
          changed = true
        }
      }
      if (!changed) return previous
      break
    }
    case 'discard-sheet': {
      const worksheet = state.worksheets.find(item => item.id === command.worksheetId)
      requireValue(worksheet, '练习单不存在。')
      if (worksheet.discardedAt !== undefined) return previous
      worksheet.discardedAt = now
      break
    }
  }
  state.revision += 1
  state.updatedAt = now
  return scheduleMistakes(stateSchema.parse(state))
}

/** The elements a review or daily question can draw on for one objective, shipped or custom. */
export interface ObjectiveElements {
  misconceptions: string[]
  examples: string[]
  errorTypes: ErrorType[]
  questionPoints: string[]
  variationAxes: VariationAxis[]
}

/**
 * Elements for one objective: its concepts' misconceptions and examples plus the objective's own error
 * causes, question points and variation axes. Shipped objectives read the same-term knowledge map; custom
 * objectives read the workspace's confirmed concepts and the objective record.
 * @param state - current durable learning state.
 * @param objectiveId - objective to describe.
 * @returns the merged elements, or undefined for an unknown objective.
 */
export function objectiveElements(state: StudyState, objectiveId: string): ObjectiveElements | undefined {
  const builtin = builtinObjective(state.profile, objectiveId)
  if (builtin) {
    const concepts = curriculumFor(state.profile, builtin.subject)?.concepts.filter(concept => builtin.conceptIds.includes(concept.id)) ?? []
    return {
      misconceptions: [...new Set(concepts.flatMap(concept => concept.misconceptions ?? []))].slice(0, 6),
      examples: [...new Set(concepts.flatMap(concept => concept.examples ?? []))].slice(0, 6),
      errorTypes: [...(builtin.errorTypes ?? [])],
      questionPoints: [...(builtin.questionPoints ?? [])],
      variationAxes: [...(builtin.variationAxes ?? [])],
    }
  }
  const custom = state.objectives.find(item => item.id === objectiveId)
  if (!custom) return undefined
  const concepts = state.concepts.filter(concept => custom.conceptIds.includes(concept.id))
  return {
    misconceptions: [...new Set(concepts.flatMap(concept => concept.misconceptions ?? []))].slice(0, 6),
    examples: [...new Set(concepts.map(concept => concept.example))].slice(0, 6),
    errorTypes: [...(custom.errorTypes ?? [])],
    questionPoints: [...(custom.questionPoints ?? [])],
    variationAxes: [...(custom.variationAxes ?? [])],
  }
}

/** One review question to write: the confirmed mistake it targets, its ladder level and what went wrong. */
export interface ReviewPick {
  kind: 'mistake'
  id: string
  objectiveId: string
  objectiveTitle: string
  topic: string
  prompt: string
  learnerAnswer: string
  correction: string
  explanation: string
  stage: number
  dueToday: boolean
  variantLevel: Variant
  errorType?: ErrorType
  elements?: ObjectiveElements
}

/** One weak goal to re-ask on the same sheet with a fresh variant when no due mistake covers it. */
export interface ObjectiveFill {
  kind: 'objective'
  id: string
  objectiveId: string
  title: string
  level: ObjectiveInsight['level']
  variantLevel: Variant
  elements?: ObjectiveElements
}

/** Ladder level for one review question: numeric retests first, then context, then reasoning. */
function variantLevelFor(stage: number): Variant {
  return stage >= 3 ? 'reasoning' : stage >= 2 ? 'context' : 'numeric'
}

/**
 * Mistakes for the next printed review sheet of one subject: confirmed, goal-linked mistakes due today or
 * tomorrow, lowest review stage first, at most two per error cause, one question each, none already printed on
 * a sheet that is still ungraded, and none behind the parent-confirmed class frontier. Two of the sheet's slots
 * stay for weak goals without a due mistake, returned as objective fills. Due mistakes without a goal are
 * listed so they can be classified first.
 * @param state - current durable learning state.
 * @param subject - subject of the sheet.
 * @param now - host time.
 * @param size - most questions on one sheet.
 * @param insight - precomputed insight for the same state and time, when the caller already has it.
 * @returns picks, objective fills, error-cause coverage, and the open-sheet and unlinked summaries.
 */
export function reviewPlan(state: StudyState, subject: CurriculumSubject, now: number, size = 8, insight?: StudyInsight) {
  const horizon = dayStart(studyDay(now + DAY)) + DAY
  const open = state.worksheets.filter(sheet => sheet.subject === subject && sheetOpen(state, sheet))
  const printed = new Set(open.flatMap(sheet => sheet.items.flatMap(item => item.mistakeId ? [item.mistakeId] : [])))
  const due = state.mistakes.filter(item => item.subject === subject && item.confirmedAt !== undefined && item.dueAt !== undefined && item.dueAt < horizon)
  const current = insight ?? studyInsight(state, now)
  const unitOf = (objectiveId: string) => current.objectives.find(item => item.id === objectiveId)?.unit ?? ''
  const candidates = due.filter(item => item.objectiveId !== undefined && taughtUnit(state, item.subject, unitOf(item.objectiveId)) && !printed.has(item.id))
    .sort((a, b) => a.stage - b.stage || (a.dueAt ?? 0) - (b.dueAt ?? 0))
  const picks: ReviewPick[] = []
  const perCause = new Map<ErrorType, number>()
  for (const item of candidates) {
    if (picks.length >= Math.max(1, size - 2)) break
    if (item.errorType !== undefined && (perCause.get(item.errorType) ?? 0) >= 2) continue
    if (item.errorType !== undefined) perCause.set(item.errorType, (perCause.get(item.errorType) ?? 0) + 1)
    const elements = item.objectiveId !== undefined ? objectiveElements(state, item.objectiveId) : undefined
    picks.push({
      kind: 'mistake', id: item.id, objectiveId: item.objectiveId ?? '', objectiveTitle: objectiveInfo(state, item.objectiveId ?? '')?.title ?? '',
      topic: item.topic, prompt: item.prompt, learnerAnswer: item.learnerAnswer, correction: item.correction, explanation: item.explanation,
      stage: item.stage, dueToday: (item.dueAt ?? 0) <= now, variantLevel: variantLevelFor(item.stage),
      ...(item.errorType !== undefined ? { errorType: item.errorType } : {}),
      ...(elements !== undefined ? { elements } : {}),
    })
  }
  const covered = new Set<string>([
    ...picks.map(item => item.objectiveId),
    ...open.flatMap(sheet => sheet.items.map(item => itemObjectiveId(state, sheet, item))).filter((value): value is string => value !== undefined),
  ])
  const objectiveFills: ObjectiveFill[] = current.weakPoints
    .filter(item => taughtUnit(state, item.subject, item.unit) && !covered.has(item.id))
    .slice(0, Math.min(2, Math.max(0, size - picks.length)))
    .map((item): ObjectiveFill => {
      const elements = objectiveElements(state, item.id)
      return { kind: 'objective', id: item.id, objectiveId: item.id, title: item.title, level: item.level, variantLevel: 'numeric', ...(elements !== undefined ? { elements } : {}) }
    })
  const coverage = new Map<ErrorType, number>()
  for (const pick of picks) if (pick.errorType !== undefined) coverage.set(pick.errorType, (coverage.get(pick.errorType) ?? 0) + 1)
  return {
    subject, picks, objectiveFills,
    errorCoverage: [...coverage.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    remaining: candidates.length - picks.length,
    unlinkedDue: due.filter(item => item.objectiveId === undefined).map(item => item.id),
    openSheets: open.map(sheet => ({ id: sheet.id, createdAt: sheet.createdAt, items: sheet.items.length, graded: state.paperResults.filter(result => result.worksheetId === sheet.id).length })),
  }
}

const SUBJECT_ORDER = ['chinese', 'math', 'english'] as const
const DIAGNOSIS_INTERVAL = 14 * DAY
const RECHECK_AFTER = 30 * DAY

/** Why an objective needs attention; codes are localized by the workbench and read by the model. */
export interface InsightReason {
  code: 'due-mistakes' | 'open-mistakes' | 'recent-help-or-error' | 'recurring-error' | 'not-practised-recently' | 'not-started' | 'diagnosis-due' | 'preview' | 'school-pace'
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
  recommendation: { kind: 'review' | 'practice' | 'diagnose' | 'learn' | 'preview' | 'hold'; subject: CurriculumSubject; objectiveId?: string; title?: string; reason: InsightReason } | null
  errorProfile: { subject: CurriculumSubject; type: ErrorType; count: number; objectiveIds: string[] }[]
  understandingReminders: UnderstandingReminder[]
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
 * @returns objective insights, the five weakest points, per-subject check-in plans and one recommendation.
 */
/** Parent-confirmed class frontier; the default suggestion range, not a hard gate. Absent progress leaves the whole map in scope. */
function schoolGate(state: StudyState, subject: CurriculumSubject) {
  const progress = state.courses.find(item => item.subject === subject)?.progress
  if (!progress) return undefined
  const file = curriculumFor(state.profile, subject)
  const index = file?.units.findIndex(unit => unit.id === progress.unitId) ?? -1
  if (!file || index < 0) return undefined
  const previewUnit = progress.preview && progress.pace === 'teaching' ? file.units[index + 1]?.id : undefined
  return {
    taught: new Set(file.units.slice(0, index + 1).map(unit => unit.id)),
    current: progress.unitId,
    ...(previewUnit ? { previewUnit } : {}),
    posture: progress.posture,
    pace: progress.pace,
  }
}

/**
 * Whether a map unit may be suggested, sampled, or asked about.
 * An explicit session scope overrides the confirmed school frontier; absent both, the whole map is in scope.
 * @param state - current durable learning state.
 * @param subject - subject the unit belongs to.
 * @param unit - map unit id, or '' for a custom goal.
 * @param scope - optional session scope selecting a grade, term and units.
 * @returns whether the unit is in scope.
 */
export function taughtUnit(state: StudyState, subject: CurriculumSubject, unit: string, scope?: CurriculumScope & { units?: string[] | undefined }): boolean {
  if (unit === '') return true
  if (scope !== undefined) {
    if (scope.units !== undefined) return scope.units.includes(unit)
    const file = curriculumFor({ grade: scope.grade, term: scope.term }, subject)
    return file?.units.some(item => item.id === unit) ?? false
  }
  const gate = schoolGate(state, subject)
  if (!gate) return true
  return gate.taught.has(unit)
}

/**
 * Whether a session scope selects an objective: by explicit ID, by unit, or by grade/term map.
 * @param scope - session scope from the start command.
 * @param subject - subject the objective belongs to.
 * @param unit - map unit id, or '' for a custom goal.
 * @param objectiveId - objective to test.
 * @returns whether the objective is in scope.
 */
function scopeSelects(scope: { grade: number; term: 'first' | 'second'; units?: string[] | undefined; objectiveIds?: string[] | undefined }, subject: CurriculumSubject, unit: string, objectiveId: string): boolean {
  if (scope.objectiveIds !== undefined) return scope.objectiveIds.includes(objectiveId)
  if (unit === '') return false
  if (scope.units !== undefined) return scope.units.includes(unit)
  const file = curriculumFor({ grade: scope.grade, term: scope.term }, subject)
  return file?.units.some(item => item.id === unit) ?? false
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

export function studyInsight(state: StudyState, now: number): StudyInsight {
  const worksheetOf = new Map(state.worksheets.map(sheet => [sheet.id, sheet]))
  const outcomesByObjective = new Map<string, { at: number; result: string; assistance: string }[]>()
  const objectives: ObjectiveInsight[] = []
  const seen = new Set<string>()
  const include = (base: { id: string; subject: CurriculumSubject; title: string; goal: string; method: CurriculumMethod; unit: string; unitName: string; conceptIds: string[] }) => {
    if (seen.has(base.id)) return
    seen.add(base.id)
    const outcomes = [
      ...state.attempts.filter(item => item.objectiveId === base.id).map(item => ({ at: item.at, result: item.result, assistance: item.assistance })),
      ...state.paperResults.filter(item => {
        const sheet = worksheetOf.get(item.worksheetId)
        return sheet !== undefined && questionObjectiveId(state, sheet, item.itemId) === base.id
      }).map(item => ({ at: item.receivedAt, result: item.result, assistance: item.assistance })),
    ]
    outcomesByObjective.set(base.id, outcomes)
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
    const weak = activeMistakes >= 2 || helpedOrWrong >= 2 || (independentDays.size === 0 && wrongRecent >= 1)
    const stalled = !weak && independentDays.size < 3 && lastAt !== undefined && now - lastAt > 10 * DAY
    const level = dueMistakes > 0 ? 'due' : weak ? 'weak'
      : independentDays.size >= 3 && activeMistakes === 0 && helpedOrWrong === 0 ? 'mastered' : stalled ? 'stalled'
        : lastAt !== undefined || mistakes.length > 0 ? 'practising' : 'untouched'
    const reasons: InsightReason[] = []
    if (dueMistakes > 0) reasons.push({ code: 'due-mistakes', count: dueMistakes })
    if (activeMistakes > 0) reasons.push({ code: 'open-mistakes', count: activeMistakes })
    if (helpedOrWrong > 0) reasons.push({ code: 'recent-help-or-error', count: helpedOrWrong })
    if (recurringTypes > 0) reasons.push({ code: 'recurring-error', count: recurringTypes })
    if (stalled && lastAt !== undefined) reasons.push({ code: 'not-practised-recently', count: Math.floor((now - lastAt) / DAY) })
    if (level === 'untouched') reasons.push({ code: 'not-started', count: 0 })
    const priority = level === 'mastered' ? 0
      : dueMistakes * 40 + Math.min(36, helpedOrWrong * 12) + Math.min(24, activeMistakes * 8) + Math.min(16, recurringTypes * 8) + (stalled ? 10 : 0) + (level === 'untouched' ? 5 : 0)
    objectives.push({ ...base, level, independentDays: independentDays.size, attempts: outcomes.length, helpedOrWrong,
      ...(lastAt !== undefined ? { lastAt } : {}), activeMistakes, dueMistakes, masteredMistakes: mistakes.length - activeMistakes, errorTypes, priority, reasons })
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
  const weakPoints = objectives.filter(item => (item.level === 'due' || item.level === 'weak' || item.level === 'stalled') && taughtUnit(state, item.subject, item.unit))
    .sort((a, b) => b.priority - a.priority).slice(0, 5)
  const dueMistake = (item: StudyState['mistakes'][number]) => {
    if (item.confirmedAt === undefined || item.dueAt === undefined || item.dueAt > now) return false
    if (!item.objectiveId) return true
    const objective = objectives.find(candidate => candidate.id === item.objectiveId)
    return taughtUnit(state, item.subject, objective?.unit ?? '')
  }
  const due = SUBJECT_ORDER.map(subject => ({ subject, count: state.mistakes.filter(item => item.subject === subject && dueMistake(item)).length }))
    .filter(item => item.count > 0).sort((a, b) => b.count - a.count)
  const first = due[0]
  const checkIn = diagnostics.filter(plan => plan.due).sort((a, b) => b.sample.length - a.sample.length)[0]
  const untouched = objectives.find(item => learnable(state, item))
  const preview = objectives.find(item => item.level === 'untouched' && schoolGate(state, item.subject)?.previewUnit === item.unit)
  const held = objectives.find(item => item.level === 'untouched' && schoolGate(state, item.subject) !== undefined && !learnable(state, item) && schoolGate(state, item.subject)?.previewUnit !== item.unit)
  const recommendation: StudyInsight['recommendation'] = first
    ? { kind: 'review', subject: first.subject, reason: { code: 'due-mistakes', count: first.count } }
    : weakPoints[0]
      ? { kind: 'practice', subject: weakPoints[0].subject, objectiveId: weakPoints[0].id, title: weakPoints[0].title, reason: weakPoints[0].reasons[0] ?? { code: 'recent-help-or-error', count: 0 } }
      : checkIn
        ? { kind: 'diagnose', subject: checkIn.subject, reason: { code: 'diagnosis-due', count: checkIn.sample.length } }
        : untouched
          ? { kind: 'learn', subject: untouched.subject, objectiveId: untouched.id, title: untouched.title, reason: { code: 'not-started', count: 0 } }
          : preview
            ? { kind: 'preview', subject: preview.subject, objectiveId: preview.id, title: preview.title, reason: { code: 'preview', count: 0 } }
            : held
              ? { kind: 'hold', subject: held.subject, reason: { code: 'school-pace', count: 0 } }
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
    const outcomes = outcomesByObjective.get(item.id) ?? []
    if (outcomes.length > 0 && item.independentDays === 0 && outcomes.every(outcome => studyDay(outcome.at) === today)) remind(item, 'first-explain')
  }
  for (const mistake of state.mistakes) {
    if (mistake.confirmedAt === undefined || !mistake.independentDays.includes(today)) continue
    const item = mistake.objectiveId !== undefined ? objectives.find(candidate => candidate.id === mistake.objectiveId) : undefined
    if (item !== undefined) remind(item, 'after-correction')
    else if (understandingReminders.length < 3) understandingReminders.push({ code: 'after-correction', subject: mistake.subject, title: mistake.topic })
  }
  if (recommendation !== null && (recommendation.kind === 'preview' || recommendation.kind === 'learn') && recommendation.objectiveId !== undefined) {
    const nextTarget = objectives.find(candidate => candidate.id === recommendation.objectiveId)
    const practised = objectives.filter(candidate => candidate.lastAt !== undefined).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))[0]
    if (nextTarget !== undefined && (recommendation.kind === 'preview' || practised === undefined || practised.unit !== nextTarget.unit)) remind(nextTarget, 'before-next')
  }
  return { objectives, weakPoints, diagnostics, recommendation, errorProfile, understandingReminders }
}

/**
 * A check-in plan for an explicit scope: custom objectives, specific units, or a whole cross-grade map.
 * The scope overrides the confirmed school frontier for this plan.
 * @param state - current durable learning state.
 * @param subject - subject to plan for.
 * @param now - host wall-clock time in milliseconds.
 * @param scope - grade and term with optional unit or objective narrowing.
 * @returns the plan for the scoped pool.
 */
export function diagnosticFor(state: StudyState, subject: CurriculumSubject, now: number, scope: CurriculumScope & { units?: string[] | undefined; objectiveIds?: string[] | undefined }): DiagnosticPlan {
  const profileScope = scope.grade === state.profile.grade && scope.term === state.profile.term
  const insight = studyInsight(state, now)
  let pool: ObjectiveInsight[]
  if (profileScope) {
    pool = insight.objectives.filter(item => item.subject === subject && (
      scope.objectiveIds !== undefined ? scope.objectiveIds.includes(item.id)
        : scope.units !== undefined ? item.unit !== '' && scope.units.includes(item.unit)
          : item.unit !== '' && curriculumFor(scope, subject)?.units.some(unit => unit.id === item.unit) === true
    ))
  } else {
    const map = builtinObjectivesIn(scope, subject)
    const scoped = scope.objectiveIds !== undefined ? map.filter(item => scope.objectiveIds?.includes(item.id))
      : scope.units !== undefined ? map.filter(item => item.unit !== '' && scope.units?.includes(item.unit))
        : map
    pool = scoped.map(base => {
      const existing = insight.objectives.find(item => item.id === base.id)
      if (existing) return existing
      const outcomes = state.attempts.filter(item => item.objectiveId === base.id).map(item => ({ at: item.at, result: item.result, assistance: item.assistance }))
      const independentDays = new Set(outcomes.filter(item => item.result === 'correct' && item.assistance === 'independent').map(item => studyDay(item.at)))
      const lastAt = outcomes.reduce<number | undefined>((latest, item) => latest === undefined || item.at > latest ? item.at : latest, undefined)
      const helpedOrWrong = outcomes.filter(item => item.at >= now - 14 * DAY && (item.result === 'incorrect' || item.result === 'partial' || (item.result === 'correct' && item.assistance !== 'independent'))).length
      const mistakes = state.mistakes.filter(item => item.objectiveId === base.id && item.confirmedAt !== undefined)
      const activeMistakes = mistakes.filter(item => item.stage < 4).length
      const dueMistakes = mistakes.filter(item => item.dueAt !== undefined && item.dueAt <= now).length
      const weak = activeMistakes >= 2 || helpedOrWrong >= 2
      const stalled = !weak && independentDays.size < 3 && lastAt !== undefined && now - lastAt > 10 * DAY
      const level = dueMistakes > 0 ? 'due' as const : weak ? 'weak' as const
        : independentDays.size >= 3 && activeMistakes === 0 && helpedOrWrong === 0 ? 'mastered' as const : stalled ? 'stalled' as const
          : lastAt !== undefined || mistakes.length > 0 ? 'practising' as const : 'untouched' as const
      const priority = level === 'mastered' ? 0 : dueMistakes * 40 + Math.min(36, helpedOrWrong * 12) + Math.min(24, activeMistakes * 8) + (stalled ? 10 : 0) + (level === 'untouched' ? 5 : 0)
      return { ...base, level, independentDays: independentDays.size, attempts: outcomes.length, helpedOrWrong, ...(lastAt !== undefined ? { lastAt } : {}), activeMistakes, dueMistakes, masteredMistakes: mistakes.length - activeMistakes, errorTypes: [], priority, reasons: level === 'untouched' ? [{ code: 'not-started' as const, count: 0 }] : [] }
    })
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
    errorProfile: insight.errorProfile,
    understandingReminders: insight.understandingReminders,
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
  lastAt?: number
}

/** One unit's knowledge-point counts by mastery state. */
export interface UnitView {
  id: string
  name: string
  summary: string
  focus?: UnitFocus
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
  order: string[]
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
      return { ...objective, subject, unit, unitName: file.units.find(item => item.id === unit)?.name ?? '', level: 'untouched', independentDays: 0, attempts: 0, helpedOrWrong: 0, activeMistakes: 0, dueMistakes: 0, masteredMistakes: 0, errorTypes: [], priority: 0, reasons: [{ code: 'not-started', count: 0 }] }
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
    const lastAt = linked.reduce<number | undefined>((latest, item) => item.lastAt !== undefined && (latest === undefined || item.lastAt > latest) ? item.lastAt : latest, undefined)
    return { id: concept.id, name: concept.name, unit: concept.unit, definition: concept.definition, example: concept.example, source: concept.source,
      level: levelOf(linked.map(item => item.level)), objectiveIds: linked.map(item => item.id), ...(lastAt !== undefined ? { lastAt } : {}),
      independentDays: Math.max(0, ...linked.map(item => item.independentDays)),
      attempts: linked.reduce((sum, item) => sum + item.attempts, 0),
      activeMistakes: linked.reduce((sum, item) => sum + item.activeMistakes, 0),
      dueMistakes: linked.reduce((sum, item) => sum + item.dueMistakes, 0) }
  })
  const units: UnitView[] = file.units.map(unit => {
    const own = concepts.filter(concept => concept.unit === unit.id)
    return { id: unit.id, name: unit.name, summary: unit.summary, ...(unit.focus !== undefined ? { focus: unit.focus } : {}), concepts: own.length,
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
  const prerequisites = file.relations.filter(relation => relation.kind === 'prerequisite')
  const remaining = file.concepts.map(concept => concept.id)
  const order: string[] = []
  while (remaining.length > 0) {
    const ready = remaining.find(id => !prerequisites.some(relation => relation.toId === id && remaining.includes(relation.fromId))) ?? remaining[0]
    if (ready === undefined) break
    order.push(ready)
    remaining.splice(remaining.indexOf(ready), 1)
  }
  return { id: file.id, title: file.title, basis: file.basis, units, concepts, objectives, summary, scope: { grade: target.grade, term: target.term, current }, order,
    relations: file.relations.map(relation => ({ id: relation.id, fromId: relation.fromId, toId: relation.toId, kind: relation.kind, explanation: relation.explanation })) }
}

/**
 * Recent check-in blocks per subject, newest first, with per-answer results and counts.
 * @param state - current durable learning state.
 * @param limitPerSubject - how many recent blocks to keep for each subject.
 * @returns check-in records across the three subjects.
 */
export function checkInHistory(state: StudyState, limitPerSubject = 5): CheckInRecord[] {
  return SUBJECT_ORDER.flatMap(subject => state.sessions.filter(item => item.mode === 'diagnose' && item.subject === subject).slice(-limitPerSubject).reverse().map(session => {
    const results = state.attempts.filter(item => item.sessionId === session.id).map(item => ({
      id: item.id, objectiveId: item.objectiveId ?? null, result: item.result, assistance: item.assistance,
      title: item.objectiveId ? objectiveInfo(state, item.objectiveId)?.title ?? item.topic : item.topic,
    }))
    return { subject, sessionId: session.id, startedAt: session.startedAt, endedAt: session.endedAt ?? null, intensity: session.intensity ?? 'standard', results,
      counts: {
        independent: results.filter(item => item.result === 'correct' && item.assistance === 'independent').length,
        helped: results.filter(item => item.result === 'correct' && item.assistance !== 'independent').length,
        wrong: results.filter(item => item.result === 'incorrect' || item.result === 'partial').length,
        unassessed: results.filter(item => item.result === 'unassessed').length,
      } }
  }))
}
