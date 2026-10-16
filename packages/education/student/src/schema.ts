import { z } from 'zod'
import { chineseErrorTypes, chineseFocus, englishErrorTypes, englishFocus, mathErrorTypes, mathFocus } from './vocabulary.ts'

const text = z.string().trim().min(1).max(2000)
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u)
const time = z.number().int().nonnegative()
const subject = z.enum(['chinese', 'math', 'english'])

/** Deduplicate enum source values while keeping the tuple type `z.enum` requires. */
function enumValues<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = [...new Set(values)]
  if (first === undefined) throw new Error('枚举不能为空。')
  return [first, ...rest]
}

/** Model-suggested cause of one mistake; the parent can review and change it in the panel. */
export const errorTypeSchema = z.enum(enumValues([...mathErrorTypes, ...chineseErrorTypes, ...englishErrorTypes]))
/** One mistake's error cause. */
export type ErrorType = z.infer<typeof errorTypeSchema>
/** How far one review question departs from the original mistake. */
export const variantSchema = z.enum(['numeric', 'context', 'reasoning'])
/** One review question's variation level. */
export type Variant = z.infer<typeof variantSchema>
/** How a unit is practised daily, per subject; drives the subject-routine view. */
export const unitFocusSchema = z.enum(enumValues([...chineseFocus, ...mathFocus, ...englishFocus]))
/** One unit's daily-practice focus. */
export type UnitFocus = z.infer<typeof unitFocusSchema>
/** Which variation axes one objective supports. */
export const variationAxisSchema = z.enum(['numbers', 'context', 'representation', 'reverse', 'explain'])
/** One objective's supported variation axis. */
export type VariationAxis = z.infer<typeof variationAxisSchema>
/** One printable sheet's role; absent keeps the legacy title heuristic. */
export const sheetKindSchema = z.enum(['daily', 'practice', 'review'])
const scope = z.object({ region: text, grade: z.number().int().min(1).max(6), term: z.enum(['first', 'second']), schoolYear: text, schoolSystem: z.enum(['five-four', 'six-three']) }).strict()
const limits = z.object({ blockMinutes: z.number().int().min(5).max(15), breakMinutes: z.number().int().min(5).max(15), dailyMinutes: z.number().int().min(10).max(30) }).strict()
const profile = scope.extend({ nickname: text, schoolAlias: z.string().trim().max(2000), limits, parentConfirmation: text }).strict()
const material = z.object({
  id, subject, scope, title: text, publisher: text, edition: text,
  editionStatus: z.enum(['unconfirmed', 'identified']),
  kind: z.enum(['official-textbook', 'school-material', 'reference', 'generated']),
  locator: text, evidence: text,
}).strict()
const schoolProgress = z.object({
  unitId: id,
  confirmedAt: time,
  posture: z.enum(['keep-up', 'catch-up']),
  preview: z.boolean(),
  pace: z.enum(['teaching', 'review']),
}).strict()
const courseInput = z.object({ subject, materialId: id, unit: text, parentConfirmation: text }).strict()
const course = courseInput.extend({ progress: schoolProgress.optional() }).strict()
const mistake = z.object({
  id, subject, topic: text, prompt: text, learnerAnswer: text, correction: text,
  explanation: text, answerEvidence: text, imagePath: text.optional(),
  uncertainties: z.string().max(2000), materialId: id.optional(), objectiveId: id.optional(),
  errorType: errorTypeSchema.optional(),
}).strict()
const attempt = z.object({
  id, sessionId: id, subject, topic: text, prompt: text, response: text,
  result: z.enum(['correct', 'partial', 'incorrect', 'unassessed']),
  assistance: z.enum(['independent', 'hint', 'worked-example']),
  feedback: text, answerEvidence: text, mistakeId: id.optional(), objectiveId: id.optional(),
  variant: variantSchema.optional(),
}).strict()

const task = z.object({ id, sessionId: id, subject, topic: text, prompt: text, choices: z.array(text).min(2).max(4).optional(), variant: variantSchema.optional(), mistakeId: id.optional(), objectiveId: id.optional() }).strict()
const concept = z.object({ id, subject, name: text, definition: text, example: text, source: text, misconceptions: z.array(text).max(3).optional() }).strict()
const objective = z.object({ id, subject, title: text, goal: text, conceptIds: z.array(id).min(1).max(5), method: z.enum(['recognize', 'read-evidence', 'express', 'represent', 'reason', 'verify', 'context', 'listen', 'speak']), errorTypes: z.array(errorTypeSchema).max(4).optional(), questionPoints: z.array(text).max(4).optional(), variationAxes: z.array(variationAxisSchema).max(4).optional() }).strict()
const relation = z.object({ id, fromId: id, toId: id, kind: z.enum(['prerequisite', 'part-of', 'contrast', 'explains', 'cause-effect']), explanation: text, source: text }).strict()
const label = z.string().trim().max(24)
const count = (max: number) => z.number().int().min(0).max(max)
const denomination = z.enum(['1分', '2分', '5分', '1角', '2角', '5角', '1元', '5元', '10元', '20元', '50元', '100元'])
/** Printable figures drawn by the PDF renderer; an empty label prints an answer box. */
const figure = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bar-model'), bars: z.array(z.object({ name: label, segments: z.array(z.object({ label, units: z.number().int().min(1).max(20), style: z.enum(['solid', 'dashed']).optional() }).strict()).min(1).max(4), total: label.optional() }).strict()).min(1).max(3) }).strict(),
  z.object({ kind: z.literal('money'), items: z.array(z.union([denomination, z.object({ denomination, count: z.number().int().min(1).max(9) }).strict()])).min(1).max(16) }).strict(),
  z.object({ kind: z.literal('place-value'), tens: count(9), ones: count(9), crossTens: count(9), crossOnes: count(19), regroup: z.enum(['yes', 'no']) }).strict(),
  z.object({ kind: z.literal('hundred-chart'), hidden: z.array(z.number().int().min(1).max(100)).max(20).optional(), window: z.object({ center: z.number().int().min(12).max(89) }).strict().optional() }).strict(),
  z.object({ kind: z.literal('number-line'), from: z.number().int().min(-999).max(9999), to: z.number().int().min(-999).max(9999), step: z.number().int().min(1).max(100), marks: z.array(z.object({ value: z.number().int(), label: label.optional() }).strict()).max(4).optional(), jumps: z.array(z.object({ from: z.number().int(), to: z.number().int(), label: label.optional() }).strict()).max(3).optional() }).strict(),
  z.object({ kind: z.literal('clock'), clocks: z.array(z.object({ hour: z.number().int().min(1).max(12), minute: z.union([z.literal(0), z.literal(30)]) }).strict()).min(1).max(2) }).strict(),
  z.object({ kind: z.literal('sticks'), bundles: count(9), singles: count(9), crossBundles: count(9).optional(), crossSingles: count(9).optional() }).strict(),
  z.object({ kind: z.literal('vertical'), count: z.number().int().min(1).max(3) }).strict(),
  z.object({ kind: z.literal('shapes'), rows: z.array(z.object({ name: label, shape: z.enum(['circle', 'square', 'triangle']), count: count(20), blank: count(20) }).strict()).min(1).max(3) }).strict(),
]).superRefine((value, context) => {
  const fail = (message: string) => context.addIssue({ code: 'custom', message })
  if (value.kind === 'money') {
    const expanded = value.items.reduce((sum, item) => sum + (typeof item === 'string' ? 1 : item.count), 0)
    if (expanded > 30) fail('钱币图最多展示 30 枚。')
  }
  if (value.kind === 'hundred-chart') {
    if (value.window !== undefined && value.hidden !== undefined) fail('百数表不能同时使用隐藏格和邻域窗口。')
    if (value.window !== undefined && ((value.window.center - 1) % 10 < 1 || (value.window.center - 1) % 10 > 8)) fail('邻域窗口的中心数必须避开百数表左右边界。')
  }
  if (value.kind === 'number-line') {
    if (value.from >= value.to) fail('数轴的起点必须小于终点。')
    if ((value.to - value.from) % value.step !== 0) fail('数轴的步长必须整除区间长度。')
    for (const mark of value.marks ?? []) if (mark.value < value.from || mark.value > value.to) fail('数轴标注必须落在区间内。')
    for (const jump of value.jumps ?? []) if (jump.from < value.from || jump.from > value.to || jump.to < value.from || jump.to > value.to) fail('数轴跳数必须落在区间内。')
  }
  if (value.kind === 'sticks' && ((value.crossBundles ?? 0) > value.bundles || (value.crossSingles ?? 0) > value.singles)) {
    fail('划去的小棒不能多于画出的小棒。')
  }
})
const answerSpace = z.enum(['none', 'line', 'lines', 'box'])
const worksheetItem = z.object({ id, objectiveId: id.optional(), mistakeId: id.optional(), variant: variantSchema.optional(), prompt: text, figure: figure.optional(), space: answerSpace.optional(), answer: text, explanation: text, answerEvidence: text }).strict()
const worksheet = z.object({ id, subject, kind: sheetKindSchema.optional(), objectiveId: id.optional(), items: z.array(worksheetItem).min(1).max(8) }).strict()
const result = z.enum(['correct', 'partial', 'incorrect', 'unassessed'])
const assistance = z.enum(['independent', 'hint', 'worked-example'])
const paperResult = z.object({ worksheetId: id, itemId: id, response: text, result, assistance, feedback: text, answerEvidence: text, userConfirmation: text }).strict()
const paperDraft = z.object({ worksheetId: id, itemId: id, response: text, result, assistance, uncertainties: z.string().max(2000), errorType: errorTypeSchema.optional() }).strict()
const gradeSheet = z.object({ worksheetId: id, results: z.array(z.object({ itemId: id, result: z.enum(['correct', 'partial', 'incorrect']), response: text.optional(), assistance: assistance.optional(), errorType: errorTypeSchema.optional() }).strict()).min(1).max(8), userConfirmation: text }).strict()

/** Validated mutations; confirmation fields record user statements, not authenticated identities. */
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('setup'), profile }).strict(),
  z.object({ action: z.literal('limits'), limits, parentConfirmation: text }).strict(),
  z.object({ action: z.literal('material'), material }).strict(),
  z.object({ action: z.literal('course'), course: courseInput }).strict(),
  z.object({ action: z.literal('start'), id, subject, mode: z.enum(['foundation', 'school', 'review', 'explore', 'diagnose']), intensity: z.enum(['light', 'standard', 'deep']).optional() }).strict(),
  z.object({ action: z.literal('task'), task }).strict(),
  z.object({ action: z.literal('answer'), taskId: id, response: text }).strict(),
  z.object({ action: z.literal('hint'), taskId: id }).strict(),
  z.object({ action: z.literal('configure-course'), material, course: courseInput }).strict(),
  z.object({ action: z.literal('school-progress'), subject, unitId: id, posture: z.enum(['keep-up', 'catch-up']), preview: z.enum(['on', 'off']), pace: z.enum(['teaching', 'review']), parentConfirmation: text }).strict(),
  z.object({ action: z.literal('record'), attempt }).strict(),
  z.object({ action: z.literal('stop'), sessionId: id, reflection: z.string().max(2000) }).strict(),
  z.object({ action: z.literal('mistake'), mistake }).strict(),
  z.object({ action: z.literal('confirm-mistake'), id, prompt: text, learnerAnswer: text.optional(), correction: text, explanation: text, answerEvidence: text, errorType: errorTypeSchema.optional(), userConfirmation: text }).strict(),
  z.object({ action: z.literal('concept'), concept }).strict(),
  z.object({ action: z.literal('confirm-concept'), id, definition: text.optional(), example: text.optional(), source: text.optional(), userConfirmation: text }).strict(),
  z.object({ action: z.literal('objective'), objective }).strict(),
  z.object({ action: z.literal('relation'), relation }).strict(),
  z.object({ action: z.literal('link-mistake'), mistakeId: id, objectiveId: id }).strict(),
  z.object({ action: z.literal('classify-mistake'), mistakeId: id, errorType: z.union([errorTypeSchema, z.literal('')]).optional() }).strict(),
  z.object({ action: z.literal('worksheet'), worksheet }).strict(),
  z.object({ action: z.literal('paper-draft'), paperDraft }).strict(),
  z.object({ action: z.literal('grade-sheet'), grade: gradeSheet }).strict(),
  z.object({ action: z.literal('confirm-paper'), worksheetId: id, results: z.array(z.object({ itemId: id, result: z.enum(['correct', 'partial', 'incorrect']), response: text.optional(), assistance: assistance.optional(), errorType: errorTypeSchema.optional() }).strict()).min(1).max(8), userConfirmation: text }).strict(),
  z.object({ action: z.literal('discard-sheet'), worksheetId: id }).strict(),
])

/** One learner and term per workspace; previous materials and attempts are retained. */
export const stateSchema = z.object({
  format: z.literal(1), revision: time, updatedAt: time, profile,
  materials: z.array(material).max(500),
  courses: z.array(course).max(3),
  sessions: z.array(z.object({
    id, subject, mode: z.enum(['foundation', 'school', 'review', 'explore', 'diagnose']), intensity: z.enum(['light', 'standard', 'deep']).optional(),
    startedAt: time, deadline: time, endedAt: time.optional(), spentMs: time.optional(),
    materialId: id.optional(), unit: text.optional(), reflection: z.string().max(2000).optional(),
  }).strict()).max(5000),
  attempts: z.array(attempt.extend({ at: time, materialId: id.optional() }).strict()).max(20000),
  mistakes: z.array(mistake.extend({
    confirmedAt: time.optional(), userConfirmation: text.optional(), dueAt: time.optional(),
    source: z.object({ worksheetId: id, itemId: id }).strict().optional(),
    independentDays: z.array(z.string()), stage: z.number().int().min(0).max(4),
  }).strict()).max(5000),
  concepts: z.array(concept.extend({ confirmedAt: time.optional(), userConfirmation: text.optional() }).strict()).max(1000).default([]),
  objectives: z.array(objective).max(1000).default([]),
  relations: z.array(relation).max(2000).default([]),
  worksheets: z.array(worksheet.extend({ createdAt: time, discardedAt: time.optional() }).strict()).max(500).default([]),
  paperResults: z.array(paperResult.extend({ receivedAt: time }).strict()).max(4000).default([]),
  paperDrafts: z.array(paperDraft.extend({ receivedAt: time }).strict()).max(500).default([]),
  rewards: z.array(z.object({ day: z.string(), reason: z.enum(['participation', 'reflection']) }).strict()).max(1000),
  breakUntil: time,
  task: task.extend({ response: text.optional(), answeredAt: time.optional(), hintRequested: z.boolean() }).strict().optional(),
}).strict()

/** A schema-validated learning mutation. */
export type Command = z.infer<typeof commandSchema>
/** Durable learning evidence, parsed before reads and after every mutation. */
export type StudyState = z.infer<typeof stateSchema>
