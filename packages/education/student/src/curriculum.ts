import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { errorTypeSchema, exerciseItemSchema, unitFocusSchema, variationAxisSchema, type ErrorType, type ExerciseItem, type VariationAxis } from './schema.ts'
import { errorTypesBySubject, focusBySubject } from './vocabulary.ts'

const recordId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u)
const text = z.string().trim().min(1).max(2000)
const fact = z.string().trim().min(1).max(240)
const subjectSchema = z.enum(['chinese', 'math', 'english'])
const termSchema = z.enum(['first', 'second'])
const methodSchema = z.enum(['recognize', 'read-evidence', 'express', 'represent', 'reason', 'verify', 'context', 'listen', 'speak'])
const relationKindSchema = z.enum(['prerequisite', 'part-of', 'contrast', 'explains', 'cause-effect'])

/** The learner fields that select a shipped knowledge map. */
export interface CurriculumScope { grade: number; term: 'first' | 'second' }
/** One of the three supported subjects. */
export type CurriculumSubject = z.infer<typeof subjectSchema>
/** A learning method a shipped objective may use; each value is also a workbench locale key. */
export type CurriculumMethod = z.infer<typeof methodSchema>
/** A shipped concept-relation kind; each value is also a workbench locale key. */
export type CurriculumRelationKind = z.infer<typeof relationKindSchema>
/** Subject methods a shipped learning objective may use; mirrors the state schema. */
export const curriculumMethods: Record<CurriculumSubject, readonly string[]> = {
  chinese: ['recognize', 'read-evidence', 'express'],
  math: ['represent', 'reason', 'verify'],
  english: ['context', 'listen', 'speak'],
}

const ideaSchema = z.object({ id: recordId, name: text, definition: text, example: text }).strict()
/** One subject's concepts. A concept is shared by the subject and is not divided by grade or unit. Its definition states only what is required to identify it, and admits one reading. */
export const ideaCatalogSchema = z.object({
  subject: subjectSchema,
  ideas: z.array(ideaSchema).min(1).max(240),
}).strict()
/** One shipped concept: the meaning a subject uses, independent of grade and unit. */
export type SubjectIdea = z.infer<typeof ideaSchema>

/** One subject's shipped exercise bank, validated against shipped objectives and error types. */
export const exerciseCatalogSchema = z.object({
  subject: subjectSchema,
  exercises: z.array(exerciseItemSchema).min(1).max(500),
}).strict()

/** One shipped knowledge map: units, knowledge points, objectives and relations for one subject, grade and term. */
export const curriculumSchema = z.object({
  id: recordId, subject: subjectSchema, grade: z.number().int().min(1).max(2), term: termSchema,
  title: text, basis: text,
  units: z.array(z.object({ id: recordId, name: text, summary: text, focus: unitFocusSchema.optional() }).strict()).min(1).max(20),
  concepts: z.array(z.object({ id: recordId, name: text, unit: recordId, definition: text, example: text, source: text, ideaIds: z.array(recordId).max(6).optional(), facts: z.array(fact).min(2).max(8).optional(), misconceptions: z.array(text).max(3).optional(), examples: z.array(text).max(3).optional() }).strict()).min(1).max(80),
  objectives: z.array(z.object({ id: recordId, title: text, goal: text, conceptIds: z.array(recordId).min(1).max(5), method: methodSchema, errorTypes: z.array(errorTypeSchema).max(4).optional(), questionPoints: z.array(text).max(4).optional(), variationAxes: z.array(variationAxisSchema).max(4).optional() }).strict()).min(1).max(60),
  relations: z.array(z.object({ id: recordId, fromId: recordId, toId: recordId, kind: relationKindSchema, explanation: text, source: text }).strict()).max(120),
}).strict().superRefine((file, context) => {
  const fail = (path: (string | number)[], message: string) => context.addIssue({ code: 'custom', path, message })
  for (const [label, items] of [['units', file.units], ['concepts', file.concepts], ['objectives', file.objectives], ['relations', file.relations]] as const) {
    const seen = new Set<string>()
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id)) fail([label, index, 'id'], `重复的 ID：${item.id}`)
      seen.add(item.id)
    }
  }
  const units = new Set(file.units.map(unit => unit.id))
  const concepts = new Set(file.concepts.map(concept => concept.id))
  const ideas = new Set(subjectIdeas(file.subject).map(idea => idea.id))
  for (const [index, concept] of file.concepts.entries()) {
    if (!units.has(concept.unit)) fail(['concepts', index, 'unit'], `知识点的单元不存在：${concept.unit}`)
    if (concept.ideaIds !== undefined && new Set(concept.ideaIds).size !== concept.ideaIds.length) fail(['concepts', index, 'ideaIds'], '概念不能重复')
    for (const [position, ideaId] of (concept.ideaIds ?? []).entries()) {
      if (!ideas.has(ideaId)) fail(['concepts', index, 'ideaIds', position], `知识点引用的概念不存在：${ideaId}`)
    }
  }
  for (const [index, unit] of file.units.entries()) {
    if (!file.concepts.some(concept => concept.unit === unit.id)) fail(['units', index], `单元没有知识点：${unit.id}`)
    if (unit.focus !== undefined && !focusBySubject[file.subject].includes(unit.focus)) fail(['units', index, 'focus'], `单元的日常侧重与科目不符：${unit.focus}`)
  }
  for (const [index, objective] of file.objectives.entries()) {
    if (!curriculumMethods[file.subject].includes(objective.method)) fail(['objectives', index, 'method'], `学习方法与科目不符：${objective.method}`)
    for (const [position, errorType] of (objective.errorTypes ?? []).entries()) {
      if (!errorTypesBySubject[file.subject].includes(errorType)) fail(['objectives', index, 'errorTypes', position], `错因分类与科目不符：${errorType}`)
    }
    if (objective.errorTypes !== undefined && new Set(objective.errorTypes).size !== objective.errorTypes.length) fail(['objectives', index, 'errorTypes'], '错因分类不能重复')
    if (objective.variationAxes !== undefined && new Set(objective.variationAxes).size !== objective.variationAxes.length) fail(['objectives', index, 'variationAxes'], '变式维度不能重复')
    for (const [position, conceptId] of objective.conceptIds.entries()) {
      if (!concepts.has(conceptId)) fail(['objectives', index, 'conceptIds', position], `学习目标引用的知识点不存在：${conceptId}`)
    }
  }
  for (const [index, relation] of file.relations.entries()) {
    if (!concepts.has(relation.fromId) || !concepts.has(relation.toId)) fail(['relations', index], `概念关系引用的知识点不存在：${relation.fromId} → ${relation.toId}`)
    if (relation.fromId === relation.toId) fail(['relations', index], '概念关系不能连接自身')
  }
  if (file.id !== `${file.subject}-grade${file.grade}-${file.term}`) fail(['id'], `文件 ID 与科目、年级、学期不符：${file.id}`)
})

/** A validated shipped knowledge map. */
export type Curriculum = z.infer<typeof curriculumSchema>
/** One shipped learning objective resolved with its subject and unit. */
export interface BuiltinObjective {
  id: string
  subject: CurriculumSubject
  title: string
  goal: string
  conceptIds: string[]
  method: CurriculumMethod
  unit: string
  unitName: string
  errorTypes?: ErrorType[] | undefined
  questionPoints?: string[] | undefined
  variationAxes?: VariationAxis[] | undefined
}
/** One shipped knowledge point resolved with its subject. */
export interface BuiltinConcept {
  id: string
  subject: CurriculumSubject
  name: string
  unit: string
  definition: string
  example: string
  source: string
  ideaIds?: string[] | undefined
  facts?: string[] | undefined
  misconceptions?: string[] | undefined
  examples?: string[] | undefined
}

const SUBJECTS = ['chinese', 'math', 'english'] as const
const cache = new Map<string, Curriculum>()
const ideaCache = new Map<CurriculumSubject, SubjectIdea[]>()
const exerciseCache = new Map<CurriculumSubject, ExerciseItem[]>()
/** Read through a variable so bundler asset rewriting of `new URL(…, import.meta.url)` does not apply to data files. */
const moduleUrl = import.meta.url

/**
 * The concepts of one subject. The same concept is shared by every grade and unit of that subject.
 * @param subject - requested subject.
 * @returns the validated concept list.
 */
export function subjectIdeas(subject: CurriculumSubject): SubjectIdea[] {
  const cached = ideaCache.get(subject)
  if (cached !== undefined) return cached
  const url = new URL(`../knowledge/curriculum/ideas/${subject}.json`, moduleUrl)
  const file = ideaCatalogSchema.parse(JSON.parse(readFileSync(url, 'utf8')))
  if (file.subject !== subject) throw new Error(`概念目录的科目不符：${file.subject}`)
  const seen = new Set<string>()
  for (const idea of file.ideas) {
    if (seen.has(idea.id)) throw new Error(`概念目录有重复 ID：${idea.id}`)
    seen.add(idea.id)
  }
  ideaCache.set(subject, file.ideas)
  return file.ideas
}

function load(subject: CurriculumSubject, grade: number, term: 'first' | 'second'): Curriculum | undefined {
  if (grade < 1 || grade > 2) return undefined
  const key = `${subject}-grade${grade}-${term}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const url = new URL(`../knowledge/curriculum/${key}.json`, moduleUrl)
  const file = curriculumSchema.parse(JSON.parse(readFileSync(url, 'utf8')))
  cache.set(key, file)
  return file
}

/**
 * One subject's shipped knowledge map for the profile's grade and term.
 * @param scope - learner grade and term.
 * @param subject - requested subject.
 * @returns the validated map, or undefined outside grades one and two.
 */
export function curriculumFor(scope: CurriculumScope, subject: CurriculumSubject): Curriculum | undefined {
  return load(subject, scope.grade, scope.term)
}

/**
 * Every shipped knowledge map for the profile's grade and term, in subject order.
 * @param scope - learner grade and term.
 * @returns validated maps; empty outside grades one and two.
 */
export function curriculumFiles(scope: CurriculumScope): Curriculum[] {
  return SUBJECTS.map(subject => load(subject, scope.grade, scope.term)).filter(file => file !== undefined)
}

/**
 * All shipped learning objectives for one subject within an arbitrary scope, with unit names resolved.
 * @param scope - grade and term to read; may differ from the learner profile.
 * @param subject - requested subject.
 * @returns resolved objectives; empty outside grades one and two.
 */
export function builtinObjectivesIn(scope: CurriculumScope, subject: CurriculumSubject): BuiltinObjective[] {
  const file = load(subject, scope.grade, scope.term)
  if (!file) return []
  return file.objectives.map(objective => ({
    ...objective,
    subject: file.subject,
    unitName: file.units.find(unit => unit.id === file.concepts.find(concept => concept.id === objective.conceptIds[0])?.unit)?.name ?? '',
    unit: file.concepts.find(concept => concept.id === objective.conceptIds[0])?.unit ?? '',
  }))
}

/**
 * Resolve one shipped objective by ID within an arbitrary scope.
 * @param scope - grade and term to read; may differ from the learner profile.
 * @param subject - requested subject.
 * @param objectiveId - objective to resolve.
 * @returns the resolved objective, or undefined when it is not shipped for this scope.
 */
export function builtinObjectiveIn(scope: CurriculumScope, subject: CurriculumSubject, objectiveId: string): BuiltinObjective | undefined {
  return builtinObjectivesIn(scope, subject).find(objective => objective.id === objectiveId)
}

/**
 * All shipped learning objectives for the profile, in subject and map order.
 * @param scope - learner grade and term.
 * @returns resolved objectives; empty outside grades one and two.
 */
export function builtinObjectives(scope: CurriculumScope): BuiltinObjective[] {
  return curriculumFiles(scope).flatMap(file => builtinObjectivesIn(scope, file.subject))
}

const everyShippedObjective = new Map<string, BuiltinObjective>()

/** Index every shipped objective across all twelve maps, in subject, grade and term order. */
function shippedObjectiveIndex(): Map<string, BuiltinObjective> {
  if (everyShippedObjective.size === 0) {
    for (const subject of SUBJECTS) for (const grade of [1, 2] as const) for (const term of ['first', 'second'] as const) {
      for (const objective of builtinObjectivesIn({ grade, term }, subject)) if (!everyShippedObjective.has(objective.id)) everyShippedObjective.set(objective.id, objective)
    }
  }
  return everyShippedObjective
}

/**
 * Resolve one shipped objective by ID across every shipped map, current term or another.
 * @param objectiveId - objective to resolve.
 * @returns the resolved objective, or undefined when it is not shipped anywhere.
 */
export function builtinObjectiveAnywhere(objectiveId: string): BuiltinObjective | undefined {
  return shippedObjectiveIndex().get(objectiveId)
}

/**
 * Resolve one shipped objective by ID within the profile's grade and term.
 * @param scope - learner grade and term.
 * @param objectiveId - objective to resolve.
 * @returns the resolved objective, or undefined when it is not shipped for this scope.
 */
export function builtinObjective(scope: CurriculumScope, objectiveId: string): BuiltinObjective | undefined {
  return builtinObjectives(scope).find(objective => objective.id === objectiveId)
}

/**
 * The unit a shipped objective belongs to, within an arbitrary scope.
 * @param scope - grade and term to read; may differ from the learner profile.
 * @param subject - requested subject.
 * @param objectiveId - objective to locate.
 * @returns the unit id, or undefined when the objective is not shipped for this scope.
 */
export function builtinUnitOf(scope: CurriculumScope, subject: CurriculumSubject, objectiveId: string): string | undefined {
  return builtinObjectiveIn(scope, subject, objectiveId)?.unit
}

/**
 * All shipped knowledge points for one subject within the profile's grade and term.
 * @param scope - learner grade and term.
 * @param subject - requested subject.
 * @returns resolved knowledge points; empty outside grades one and two.
 */
export function builtinConcepts(scope: CurriculumScope, subject: CurriculumSubject): BuiltinConcept[] {
  const file = load(subject, scope.grade, scope.term)
  return file ? file.concepts.map(concept => ({ ...concept, subject: file.subject })) : []
}

/**
 * Validated shipped exercise items for one subject across grades one and two.
 * @param subject - requested subject.
 * @returns the validated exercise list.
 */
export function subjectExercises(subject: CurriculumSubject): ExerciseItem[] {
  const cached = exerciseCache.get(subject)
  if (cached !== undefined) return cached
  const url = new URL(`../knowledge/curriculum/exercises/${subject}.json`, moduleUrl)
  const file = exerciseCatalogSchema.parse(JSON.parse(readFileSync(url, 'utf8')))
  if (file.subject !== subject) throw new Error(`习题目录的科目不符：${file.subject}`)
  const index = shippedObjectiveIndex()
  const seen = new Set<string>()
  for (const item of file.exercises) {
    if (seen.has(item.id)) throw new Error(`习题目录有重复 ID：${item.id}`)
    seen.add(item.id)
    if (item.subject !== subject) throw new Error(`习题科目与目录不符：${item.id}`)
    const objective = index.get(item.objectiveId)
    if (!objective || objective.subject !== subject) throw new Error(`习题引用的学习目标不存在或科目不符：${item.objectiveId}`)
    if (item.errorType !== undefined && !errorTypesBySubject[subject].includes(item.errorType)) {
      throw new Error(`习题错因分类与科目不符：${item.errorType}`)
    }
  }
  exerciseCache.set(subject, file.exercises)
  return file.exercises
}

/**
 * Shipped exercise items targeting one learning objective.
 * @param objectiveId - objective to look up.
 * @returns matching shipped exercises, or empty when none exist.
 */
export function exercisesForObjective(objectiveId: string): ExerciseItem[] {
  const objective = builtinObjectiveAnywhere(objectiveId)
  if (!objective) return []
  return subjectExercises(objective.subject).filter(item => item.objectiveId === objectiveId)
}
