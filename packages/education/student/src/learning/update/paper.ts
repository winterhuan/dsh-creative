import { DAY, canonical, requireValue, studyDay } from '../shared.ts'
import { itemObjectiveId, objectiveOf, sheetOpen } from '../view.ts'
import { dayStart } from '../schedule.ts'
import { dropTaught, gradeItem } from './context.ts'
import type { UpdateContext } from './index.ts'
import type { StudyState } from '../../schema.ts'
import { errorTypesBySubject } from '../../vocabulary.ts'

/** Save one printable sheet and freeze its mistake citations. */
export function applyWorksheet(ctx: UpdateContext<'worksheet'>): StudyState {
  const { command, previous, state, now } = ctx
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
    return state
  }
  state.worksheets.push({ ...sheet, createdAt: now })
  return state
}

/** Save one photo transcription draft for a sheet item. */
export function applyPaperDraft(ctx: UpdateContext<'paper-draft'>): StudyState {
  const { command, previous, state, now } = ctx
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
    ...(draft.confidence !== undefined ? { confidence: draft.confidence } : existing?.confidence !== undefined ? { confidence: existing.confidence } : {}),
  }
  if (existing) {
    const { receivedAt: _existingAt, ...before } = existing
    if (canonical(before) === canonical(next)) return previous
    state.paperDrafts = state.paperDrafts.map(candidate => candidate === existing ? { ...next, receivedAt: existing.receivedAt } : candidate)
    return state
  }
  state.paperDrafts.push({ ...next, receivedAt: now })
  return state
}

/** Apply the parent per-item marks for one sheet. */
export function applyGradeSheet(ctx: UpdateContext<'grade-sheet'>): StudyState {
  const { command, previous, state, now } = ctx
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
  return state
}

/** Confirm transcription drafts into paper results. */
export function applyConfirmPaper(ctx: UpdateContext<'confirm-paper'>): StudyState {
  const { command, previous, state, now } = ctx
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
  return state
}

/** Discard one sheet so its mistakes can print again. */
export function applyDiscardSheet(ctx: UpdateContext<'discard-sheet'>): StudyState {
  const { command, previous, state, now } = ctx
  const worksheet = state.worksheets.find(item => item.id === command.worksheetId)
  requireValue(worksheet, '练习单不存在。')
  if (worksheet.discardedAt !== undefined) return previous
  worksheet.discardedAt = now
  return state
}

/** Save one workbook photo draft without a sheet. */
export function applyWorkbookDraft(ctx: UpdateContext<'workbook-draft'>): StudyState {
  const { command, previous, state, now } = ctx
  const draft = command.draft
  if (draft.objectiveId) requireValue(objectiveOf(state, draft.objectiveId)?.subject === draft.subject, '学习目标不存在或科目不符。')
  const next = { ...draft, uncertainties: draft.uncertainties }
  const existing = state.workbookDrafts.find(item => item.id === draft.id)
  if (existing) {
    const { receivedAt: _receivedAt, ...before } = existing
    if (canonical(before) === canonical(next)) return previous
    state.workbookDrafts = state.workbookDrafts.map(item => item.id === draft.id ? { ...next, receivedAt: existing.receivedAt } : item)
    return state
  }
  state.workbookDrafts.push({ ...next, receivedAt: now })
  return state
}

/** Route a confirmed workbook draft to teaching, mistakes or nothing. */
export function applyConfirmWorkbook(ctx: UpdateContext<'confirm-workbook'>): StudyState {
  const { command, previous, state, now } = ctx
  const draft = state.workbookDrafts.find(item => item.id === command.id)
  if (!draft) return previous
  const outcome = command.outcome ?? draft.outcome
  const objectiveId = command.objectiveId === '' ? undefined : command.objectiveId ?? draft.objectiveId
  if (objectiveId) requireValue(objectiveOf(state, objectiveId)?.subject === draft.subject, '学习目标不存在或科目不符。')
  state.workbookDrafts = state.workbookDrafts.filter(item => item.id !== draft.id)
  if (outcome === 'independent-correct') { dropTaught(state, objectiveId); return state }
  if (outcome === 'stuck' || outcome === 'hinted') {
    const queueId = `tq-${draft.id}`.slice(0, 80)
    if (!state.teachingQueue.some(item => item.id === queueId)) {
      state.teachingQueue.push({
        id: queueId, subject: draft.subject, prompt: draft.prompt, confirmedAt: now, sourceDraftId: draft.id,
        ...(objectiveId !== undefined ? { objectiveId } : {}),
      })
    }
    return state
  }
  if (command.correction === undefined || command.explanation === undefined || command.answerEvidence === undefined) throw new Error('独立做错要写订正、说明和答案依据。')
  const mistakeId = `wb-${draft.id}`.slice(0, 80)
  if (!state.mistakes.some(item => item.id === mistakeId)) {
    state.mistakes.push({
      id: mistakeId, subject: draft.subject, topic: draft.prompt.slice(0, 60), prompt: draft.prompt,
      learnerAnswer: draft.response ?? '（未转录）', correction: command.correction, explanation: command.explanation, answerEvidence: command.answerEvidence,
      uncertainties: '', ...(draft.imagePath !== undefined ? { imagePath: draft.imagePath } : {}),
      ...(objectiveId !== undefined ? { objectiveId } : {}),
      confirmedAt: now, userConfirmation: command.userConfirmation, stage: 0, independentDays: [],
    })
  }
  return state
}

/** Remove one item from the teaching queue. */
export function applyDismissTeaching(ctx: UpdateContext<'dismiss-teaching'>): StudyState {
  const { command, previous, state } = ctx
  if (!state.teachingQueue.some(item => item.id === command.id)) return previous
  state.teachingQueue = state.teachingQueue.filter(item => item.id !== command.id)
  return state
}

