import { canonical, requireValue } from '../shared.ts'
import { duplicate } from './context.ts'
import { objectiveOf } from '../view.ts'
import { errorTypesBySubject } from '../../vocabulary.ts'
import type { UpdateContext } from './index.ts'
import type { StudyState } from '../../schema.ts'

/** Learning methods each subject allows for custom objectives; mirrors the shipped maps. */
const subjectMethods = {
  chinese: ['recognize', 'read-evidence', 'express'],
  math: ['represent', 'reason', 'verify'],
  english: ['context', 'listen', 'speak'],
} as const

/** Save or update an unconfirmed mistake transcription. */
export function applyMistake(ctx: UpdateContext<'mistake'>): StudyState {
  const { command, previous, state } = ctx
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
    return state
  }
  state.mistakes.push({ ...command.mistake, stage: 0, independentDays: [] })
  return state
}

/** Confirm the final transcription of one mistake. */
export function applyConfirmMistake(ctx: UpdateContext<'confirm-mistake'>): StudyState {
  const { command, previous, state, active, now } = ctx
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
  return state
}

/** Propose one concept for parent review. */
export function applyConcept(ctx: UpdateContext<'concept'>): StudyState {
  const { command, previous, state } = ctx
  if (duplicate(state.concepts, item => item.id === command.concept.id, item => Object.entries(command.concept).every(([key, value]) => Reflect.get(item, key) === value))) return previous
  state.concepts.push(command.concept)
  return state
}

/** Confirm a proposed concept with the parent statement. */
export function applyConfirmConcept(ctx: UpdateContext<'confirm-concept'>): StudyState {
  const { command, previous, state, now } = ctx
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
  return state
}

/** Create one custom learning objective over confirmed concepts. */
export function applyObjective(ctx: UpdateContext<'objective'>): StudyState {
  const { command, previous, state } = ctx
  if (duplicate(state.objectives, item => item.id === command.objective.id, item => canonical(item) === canonical(command.objective))) return previous
  requireValue(subjectMethods[command.objective.subject].some(method => method === command.objective.method), '学习方法与科目不符。')
  requireValue(command.objective.conceptIds.every(id => state.concepts.some(item => item.id === id && item.subject === command.objective.subject && item.confirmedAt !== undefined)), '学习目标必须关联同科已确认概念。')
  requireValue(new Set(command.objective.conceptIds).size === command.objective.conceptIds.length, '学习目标不能重复关联概念。')
  state.objectives.push(command.objective)
  return state
}

/** Create one relation between confirmed concepts. */
export function applyRelation(ctx: UpdateContext<'relation'>): StudyState {
  const { command, previous, state } = ctx
  if (duplicate(state.relations, item => item.id === command.relation.id, item => canonical(item) === canonical(command.relation))) return previous
  const from = state.concepts.find(item => item.id === command.relation.fromId)
  const to = state.concepts.find(item => item.id === command.relation.toId)
  requireValue(from && to && from.id !== to.id && from.subject === to.subject && from.confirmedAt !== undefined && to.confirmedAt !== undefined, '概念关系必须连接同科两个已确认概念。')
  state.relations.push(command.relation)
  return state
}

/** Link a confirmed mistake to a learning goal. */
export function applyLinkMistake(ctx: UpdateContext<'link-mistake'>): StudyState {
  const { command, previous, state } = ctx
  const mistake = state.mistakes.find(item => item.id === command.mistakeId)
  const objective = objectiveOf(state, command.objectiveId)
  requireValue(mistake && objective && mistake.confirmedAt !== undefined && mistake.subject === objective.subject, '错题与学习目标必须已确认且属于同一科目。')
  if (mistake.objectiveId === objective.id) return previous
  mistake.objectiveId = objective.id
  return state
}

/** Set, change or clear a mistake error cause. */
export function applyClassifyMistake(ctx: UpdateContext<'classify-mistake'>): StudyState {
  const { command, previous, state } = ctx
  const mistake = state.mistakes.find(item => item.id === command.mistakeId)
  requireValue(mistake?.confirmedAt !== undefined, '先确认错题，再归类错因。')
  const next = command.errorType === undefined ? mistake.errorType : command.errorType === '' ? undefined : command.errorType
  if (next !== undefined) requireValue(errorTypesBySubject[mistake.subject].includes(next), '错因分类与科目不符。')
  if (next === mistake.errorType) return previous
  if (next === undefined) delete mistake.errorType
  else mistake.errorType = next
  return state
}

