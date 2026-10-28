import { activeSession, requireValue } from '../shared.ts'
import { scheduleMistakes } from '../schedule.ts'
import { commandSchema, stateSchema, type Command, type StudyState } from '../../schema.ts'
import { applyArchiveTerm, applyConfigureCourse, applyCourse, applyLimits, applyMaterial, applyOpenmaicSettings, applySchoolProgress, applySetup } from './profile.ts'
import { applyAnswerOrHint, applyRecord, applyStart, applyStop, applyStuck, applyTask } from './session.ts'
import { applyClassifyMistake, applyConcept, applyConfirmConcept, applyConfirmMistake, applyLinkMistake, applyMistake, applyObjective, applyRelation } from './mistakes.ts'
import { applyConfirmPaper, applyConfirmWorkbook, applyDiscardSheet, applyDismissTeaching, applyGradeSheet, applyPaperDraft, applyWorksheet, applyWorkbookDraft } from './paper.ts'

/** Context handed to every action handler: the clone to mutate, the input state, the active block and the clock. */
export interface UpdateContext<K extends Command['action'] = Command['action']> {
  previous: StudyState
  state: StudyState
  now: number
  active: StudyState['sessions'][number] | undefined
  command: Extract<Command, { action: K }>
}

/** Notice text appended to a status result when the model sends a field the mode ignores. */
export function updateNotices(input: unknown): string[] {
  const parsed = commandSchema.safeParse(input)
  if (!parsed.success || parsed.data.action !== 'start' || parsed.data.mode === 'diagnose' || parsed.data.intensity === undefined) return []
  return [`已忽略 intensity「${parsed.data.intensity}」。摸底强度只用于摸底检测，本次不记录强度。`]
}

/** Apply one validated command end to end: clone, dispatch, and re-derive review schedules for mutations. */
export function rawApply(previous: StudyState, command: Command, now: number): StudyState {
  const state = structuredClone(previous)
  const active = activeSession(state)
  const base = { previous, state, now, active }
  let result: StudyState
  switch (command.action) {
    case 'setup': result = applySetup(command, now); break
    case 'configure-course': result = applyConfigureCourse({ ...base, command }); break
    case 'archive-term': result = applyArchiveTerm({ ...base, command }); break
    case 'limits': result = applyLimits({ ...base, command }); break
    case 'material': result = applyMaterial({ ...base, command }); break
    case 'course': result = applyCourse({ ...base, command }); break
    case 'school-progress': result = applySchoolProgress({ ...base, command }); break
    case 'openmaic-settings': result = applyOpenmaicSettings({ ...base, command }); break
    case 'task': result = applyTask({ ...base, command }); break
    case 'answer': case 'hint': result = applyAnswerOrHint({ ...base, command }); break
    case 'stuck': result = applyStuck({ ...base, command }); break
    case 'start': result = applyStart({ ...base, command }); break
    case 'record': result = applyRecord({ ...base, command }); break
    case 'stop': result = applyStop({ ...base, command }); break
    case 'mistake': result = applyMistake({ ...base, command }); break
    case 'confirm-mistake': result = applyConfirmMistake({ ...base, command }); break
    case 'concept': result = applyConcept({ ...base, command }); break
    case 'confirm-concept': result = applyConfirmConcept({ ...base, command }); break
    case 'objective': result = applyObjective({ ...base, command }); break
    case 'relation': result = applyRelation({ ...base, command }); break
    case 'link-mistake': result = applyLinkMistake({ ...base, command }); break
    case 'classify-mistake': result = applyClassifyMistake({ ...base, command }); break
    case 'worksheet': result = applyWorksheet({ ...base, command }); break
    case 'paper-draft': result = applyPaperDraft({ ...base, command }); break
    case 'grade-sheet': result = applyGradeSheet({ ...base, command }); break
    case 'confirm-paper': result = applyConfirmPaper({ ...base, command }); break
    case 'discard-sheet': result = applyDiscardSheet({ ...base, command }); break
    case 'workbook-draft': result = applyWorkbookDraft({ ...base, command }); break
    case 'confirm-workbook': result = applyConfirmWorkbook({ ...base, command }); break
    case 'dismiss-teaching': result = applyDismissTeaching({ ...base, command }); break
  }
  if (result === previous) return previous
  if (result !== state) return result
  state.revision += 1
  state.updatedAt = now
  return scheduleMistakes(stateSchema.parse(state))
}

/** Apply one validated mutation without changing the input; setup creates the first state. */
export function updateStudy(previous: StudyState | undefined, input: unknown, now: number): StudyState {
  const command = commandSchema.parse(input)
  if (command.action === 'setup') {
    requireValue(previous === undefined, '学习档案已存在。每个工作区保存一名学生的一学期，请为其他学生或学期使用新工作区。')
    return applySetup(command, now)
  }
  requireValue(previous, '请先用 /study 完成家长确认的学习档案。')
  requireValue(now >= previous.updatedAt, '系统时间早于上次记录，请核对设备时钟后重试。')
  return rawApply(previous, command, now)
}

