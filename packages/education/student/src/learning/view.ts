import type { ErrorType, StudyState, UnitFocus, Variant, VariationAxis } from '../schema.ts'
import { builtinObjective, builtinObjectiveAnywhere, curriculumFor, subjectIdeas, type CurriculumMethod, type CurriculumRelationKind, type CurriculumScope, type CurriculumSubject } from '../curriculum.ts'
import { DAY, studyDay, taughtUnit } from './shared.ts'
import { dayStart } from './schedule.ts'
import { SUBJECT_ORDER, studyInsight, type CheckInRecord, type ObjectiveInsight, type StudyInsight } from './mastery.ts'

/**
 * Resolve a learning objective, custom or shipped, across any shipped scope.
 * @param state - current durable learning state.
 * @param objectiveId - objective to resolve.
 * @returns the objective, or undefined when unknown in any shipped map.
 */
export function objectiveOf(state: StudyState, objectiveId: string) {
  return state.objectives.find(item => item.id === objectiveId) ?? builtinObjectiveAnywhere(objectiveId)
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

export type Worksheet = StudyState['worksheets'][number]
export type WorksheetItem = Worksheet['items'][number]

/** The goal a worksheet question tests: its own, then its source mistake's, then the sheet's. */
export function itemObjectiveId(state: StudyState, worksheet: Pick<Worksheet, 'objectiveId'>, item: Pick<WorksheetItem, 'objectiveId' | 'mistakeId'>): string | undefined {
  return item.objectiveId ?? (item.mistakeId ? state.mistakes.find(mistake => mistake.id === item.mistakeId)?.objectiveId : undefined) ?? worksheet.objectiveId
}

export function questionObjectiveId(state: StudyState, worksheet: Worksheet, itemId: string): string | undefined {
  const item = worksheet.items.find(question => question.id === itemId)
  return item ? itemObjectiveId(state, worksheet, item) : undefined
}

/** A printed sheet still waiting for at least one graded question. Discarded sheets never wait. */
export function sheetOpen(state: StudyState, worksheet: Worksheet): boolean {
  return worksheet.discardedAt === undefined && worksheet.items.some(item => !state.paperResults.some(result => result.worksheetId === worksheet.id && result.itemId === item.id))
}

/** The elements a review or daily question can draw on for one objective, shipped or custom. */
export interface ObjectiveElements {
  facts: string[]
  misconceptions: string[]
  examples: string[]
  errorTypes: ErrorType[]
  questionPoints: string[]
  variationAxes: VariationAxis[]
  /** Three hint rungs for an ordinary try: point at the givens, check the registered slip, then the steps. */
  hintLadder: [string, string, string]
}

/** The first hint rung names a condition or a drawing, by the objective's learning method. */
const methodCues: Record<CurriculumMethod, string> = {
  recognize: '先让孩子在题里指一指已经给出的条件',
  'read-evidence': '先让孩子在文中找出和问题相关的原句',
  express: '先让孩子说一说这道题想表达什么',
  represent: '先让孩子画一画图，把数量或关系摆出来',
  reason: '先让孩子说说已知什么、要求什么',
  verify: '先让孩子换一种方法再算一遍或再查一遍',
  context: '先让孩子说说这段话里的人物在做什么',
  listen: '先让孩子再听一遍，留意关键词',
  speak: '先让孩子说出要用到的关键词',
}

/** Build the three-rung hint ladder from the objective's method, registered misconceptions and question points. */
function ladderFor(method: CurriculumMethod, misconceptions: readonly string[], questionPoints: readonly string[]): [string, string, string] {
  return [
    methodCues[method],
    misconceptions[0] !== undefined ? `让孩子自己核对一个常见错处：${misconceptions[0]}` : '让孩子说说这道题要用哪个方法',
    questionPoints.length > 0 ? `给出步骤提示：${questionPoints.slice(0, 2).join('；')}` : '和孩子一起把这道题的步骤说完整',
  ]
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
    const misconceptions = [...new Set(concepts.flatMap(concept => concept.misconceptions ?? []))].slice(0, 6)
    const questionPoints = [...(builtin.questionPoints ?? [])]
    return {
      facts: [...new Set(concepts.flatMap(concept => concept.facts ?? []))].slice(0, 24),
      misconceptions,
      examples: [...new Set(concepts.flatMap(concept => concept.examples ?? []))].slice(0, 6),
      errorTypes: [...(builtin.errorTypes ?? [])],
      questionPoints,
      variationAxes: [...(builtin.variationAxes ?? [])],
      hintLadder: ladderFor(builtin.method, misconceptions, questionPoints),
    }
  }
  const custom = state.objectives.find(item => item.id === objectiveId)
  if (!custom) return undefined
  const concepts = state.concepts.filter(concept => custom.conceptIds.includes(concept.id))
  const misconceptions = [...new Set(concepts.flatMap(concept => concept.misconceptions ?? []))].slice(0, 6)
  const questionPoints = [...(custom.questionPoints ?? [])]
  return {
    facts: [...new Set(concepts.flatMap(concept => concept.facts ?? []))].slice(0, 24),
    misconceptions,
    examples: [...new Set(concepts.map(concept => concept.example))].slice(0, 6),
    errorTypes: [...(custom.errorTypes ?? [])],
    questionPoints,
    variationAxes: [...(custom.variationAxes ?? [])],
    hintLadder: ladderFor(custom.method, misconceptions, questionPoints),
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
function variantLevelFor(stage: number, recurringCause = false): Variant {
  const level = stage >= 3 ? 'reasoning' : stage >= 2 ? 'context' : 'numeric'
  return recurringCause && level === 'numeric' ? 'context' : level
}

/** Whether the mistake's goal carries a recurring error cause: two or more active mistakes sharing it. */
function recurringCauseOn(state: StudyState, mistake: StudyState['mistakes'][number]): boolean {
  if (mistake.objectiveId === undefined || mistake.errorType === undefined) return false
  return state.mistakes.filter(other => other.confirmedAt !== undefined && other.objectiveId === mistake.objectiveId && other.stage < 4 && other.errorType === mistake.errorType).length >= 2
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
      stage: item.stage, dueToday: (item.dueAt ?? 0) <= now, variantLevel: variantLevelFor(item.stage, recurringCauseOn(state, item)),
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

/** One knowledge point with mastery rolled up from the objectives that teach it. */
export interface ConceptView {
  id: string
  name: string
  unit: string
  definition: string
  example: string
  source: string
  ideaIds?: string[]
  facts?: string[]
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

/** One concept: what a mathematical or language idea means, apart from the lesson that teaches it. */
export interface IdeaView {
  id: string
  name: string
  definition: string
  example: string
}

/** The shipped knowledge map for one subject with mastery overlaid. */
export interface CurriculumView {
  id: string
  title: string
  basis: string
  units: UnitView[]
  ideas: IdeaView[]
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
    return { id: concept.id, name: concept.name, unit: concept.unit, definition: concept.definition, example: concept.example, source: concept.source, ...(concept.ideaIds !== undefined ? { ideaIds: concept.ideaIds } : {}), ...(concept.facts !== undefined ? { facts: concept.facts } : {}),
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
  return { id: file.id, title: file.title, basis: file.basis, units, ideas: subjectIdeas(file.subject), concepts, objectives, summary, scope: { grade: target.grade, term: target.term, current }, order,
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
