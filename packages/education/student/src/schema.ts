import { z } from 'zod'

const text = z.string().trim().min(1).max(2000)
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u)
const time = z.number().int().nonnegative()
const subject = z.enum(['chinese', 'math', 'english'])
const scope = z.object({ region: text, grade: z.number().int().min(1).max(6), term: z.enum(['first', 'second']), schoolYear: text, schoolSystem: z.enum(['five-four', 'six-three']) }).strict()
const limits = z.object({ blockMinutes: z.number().int().min(5).max(15), breakMinutes: z.number().int().min(5).max(15), dailyMinutes: z.number().int().min(10).max(30) }).strict()
const profile = scope.extend({ nickname: text, schoolAlias: z.string().trim().max(2000), limits, parentConfirmation: text }).strict()
const material = z.object({
  id, subject, scope, title: text, publisher: text, edition: text,
  editionStatus: z.enum(['unconfirmed', 'identified']),
  kind: z.enum(['official-textbook', 'school-material', 'reference', 'generated']),
  locator: text, evidence: text,
}).strict()
const course = z.object({ subject, materialId: id, unit: text, parentConfirmation: text }).strict()
const mistake = z.object({
  id, subject, topic: text, prompt: text, learnerAnswer: text, correction: text,
  explanation: text, answerEvidence: text, imagePath: text.optional(),
  uncertainties: z.string().max(2000), materialId: id.optional(), objectiveId: id.optional(),
}).strict()
const attempt = z.object({
  id, sessionId: id, subject, topic: text, prompt: text, response: text,
  result: z.enum(['correct', 'partial', 'incorrect', 'unassessed']),
  assistance: z.enum(['independent', 'hint', 'worked-example']),
  feedback: text, answerEvidence: text, mistakeId: id.optional(), objectiveId: id.optional(),
}).strict()

const task = z.object({ id, sessionId: id, subject, topic: text, prompt: text, choices: z.array(text).min(2).max(4).optional(), mistakeId: id.optional(), objectiveId: id.optional() }).strict()
const concept = z.object({ id, subject, name: text, definition: text, example: text, source: text }).strict()
const objective = z.object({ id, subject, title: text, goal: text, conceptIds: z.array(id).min(1).max(5), method: z.enum(['recognize', 'read-evidence', 'express', 'represent', 'reason', 'verify', 'context', 'listen', 'speak']) }).strict()
const relation = z.object({ id, fromId: id, toId: id, kind: z.enum(['prerequisite', 'part-of', 'contrast', 'explains', 'cause-effect']), explanation: text, source: text }).strict()
const worksheet = z.object({ id, subject, objectiveId: id, items: z.array(z.object({ id, mistakeId: id, prompt: text, answer: text, explanation: text, answerEvidence: text }).strict()).min(1).max(8) }).strict()
const paperResult = z.object({ worksheetId: id, itemId: id, response: text, result: z.enum(['correct', 'partial', 'incorrect', 'unassessed']), assistance: z.enum(['independent', 'hint', 'worked-example']), feedback: text, answerEvidence: text, userConfirmation: text }).strict()

/** Validated mutations; confirmation fields record user statements, not authenticated identities. */
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup'), profile }).strict(),
  z.object({ action: z.literal('limits'), limits, parentConfirmation: text }).strict(),
  z.object({ action: z.literal('material'), material }).strict(),
  z.object({ action: z.literal('course'), course }).strict(),
  z.object({ action: z.literal('start'), id, subject, mode: z.enum(['foundation', 'school', 'review', 'explore', 'diagnose']) }).strict(),
  z.object({ action: z.literal('task'), task }).strict(),
  z.object({ action: z.literal('answer'), taskId: id, response: text }).strict(),
  z.object({ action: z.literal('hint'), taskId: id }).strict(),
  z.object({ action: z.literal('configure-course'), material, course }).strict(),
  z.object({ action: z.literal('record'), attempt }).strict(),
  z.object({ action: z.literal('stop'), sessionId: id, reflection: z.string().max(2000) }).strict(),
  z.object({ action: z.literal('mistake'), mistake }).strict(),
  z.object({ action: z.literal('confirm-mistake'), id, prompt: text, learnerAnswer: text.optional(), correction: text, explanation: text, answerEvidence: text, userConfirmation: text }).strict(),
  z.object({ action: z.literal('concept'), concept }).strict(),
  z.object({ action: z.literal('confirm-concept'), id, definition: text.optional(), example: text.optional(), source: text.optional(), userConfirmation: text }).strict(),
  z.object({ action: z.literal('objective'), objective }).strict(),
  z.object({ action: z.literal('relation'), relation }).strict(),
  z.object({ action: z.literal('link-mistake'), mistakeId: id, objectiveId: id }).strict(),
  z.object({ action: z.literal('worksheet'), worksheet }).strict(),
  z.object({ action: z.literal('paper-result'), paperResult }).strict(),
])

/** One learner and term per workspace; previous materials and attempts are retained. */
export const stateSchema = z.object({
  format: z.literal(1), revision: time, updatedAt: time, profile,
  materials: z.array(material).max(500),
  courses: z.array(course).max(3),
  sessions: z.array(z.object({
    id, subject, mode: z.enum(['foundation', 'school', 'review', 'explore', 'diagnose']),
    startedAt: time, deadline: time, endedAt: time.optional(), spentMs: time.optional(),
    materialId: id.optional(), unit: text.optional(), reflection: z.string().max(2000).optional(),
  }).strict()).max(5000),
  attempts: z.array(attempt.extend({ at: time, materialId: id.optional() }).strict()).max(20000),
  mistakes: z.array(mistake.extend({
    confirmedAt: time.optional(), userConfirmation: text.optional(), dueAt: time.optional(),
    independentDays: z.array(z.string()), stage: z.number().int().min(0).max(4),
  }).strict()).max(5000),
  concepts: z.array(concept.extend({ confirmedAt: time.optional(), userConfirmation: text.optional() }).strict()).max(1000).default([]),
  objectives: z.array(objective).max(1000).default([]),
  relations: z.array(relation).max(2000).default([]),
  worksheets: z.array(worksheet.extend({ createdAt: time }).strict()).max(500).default([]),
  paperResults: z.array(paperResult.extend({ receivedAt: time }).strict()).max(4000).default([]),
  rewards: z.array(z.object({ day: z.string(), reason: z.enum(['participation', 'reflection']) }).strict()).max(1000),
  breakUntil: time,
  task: task.extend({ response: text.optional(), answeredAt: time.optional(), hintRequested: z.boolean() }).strict().optional(),
}).strict()

/** A schema-validated learning mutation. */
export type Command = z.infer<typeof commandSchema>
/** Durable learning evidence, parsed before reads and after every mutation. */
export type StudyState = z.infer<typeof stateSchema>
