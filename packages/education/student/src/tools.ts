import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ValueSchemaSpec, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { updateNotices } from './learning/update/index.ts'
import { commandSchema } from './schema.ts'
import { queryStudy, studyStore } from './store.ts'

/** Project the shared validated input into DSH's schema DSL; numeric/string bounds stay in Zod. */
function toolSchema(input: z.core.JSONSchema.BaseSchema | boolean): ValueSchemaSpec {
  if (typeof input === 'boolean') throw new Error('Study inputs require explicit value schemas.')
  const variants = input.oneOf ?? input.anyOf
  if (variants) {
    const [first, second, ...rest] = variants.map(toolSchema)
    if (!first || !second) throw new Error('Study actions require at least two branches.')
    return { oneOf: [first, second, ...rest] }
  }
  if (input.type === 'object') {
    const properties: ParameterSchemaSpec = {}
    for (const [key, value] of Object.entries(input.properties ?? {})) {
      properties[key] = { ...toolSchema(value), ...(input.required?.includes(key) ? { required: true } : {}) }
    }
    return { type: 'object', additionalProperties: false, properties }
  }
  if (input.type === 'array') {
    if (!input.items || Array.isArray(input.items)) throw new Error('Study arrays require one item schema.')
    return { type: 'array', items: toolSchema(input.items) }
  }
  if (input.type === 'string') return { type: 'string', ...(typeof input.const === 'string' ? { const: input.const } : {}), ...(input.enum ? { enum: z.array(z.string()).parse(input.enum) } : {}) }
  if (input.type === 'integer' || input.type === 'number') return { type: 'integer' }
  throw new Error(`Unsupported study input schema type: ${String(input.type)}`)
}

/** Register bounded lookup and validated mutations with DSH's normal logged tool runtime. */
export function registerStudyTools(context: Context): void {
  context.tools.register(defineTool({
    name: 'study_status',
    description: 'Read this workspace\'s learner profile, learning records and derived suggestions. Call it before each learning step. The study skill owns how to teach, write questions and grade; load it before tutoring.',
    parameters: {
      kind: { type: 'string', enum: ['status', 'materials', 'mistakes', 'due', 'pending', 'attempts', 'sessions', 'progress', 'concepts', 'objectives', 'relations', 'worksheets', 'paper-results', 'curriculum', 'weak', 'elements', 'diagnose', 'review-sheet'], description: 'status (default) returns the time budget, timeNotice, interests, interestFocus, top weak points, one recommendation, dueToday (at most two) and openmaic.baseUrl plus the lesson-log path; collections page 20 records with offset. curriculum needs subject (grade and term browse another map); elements needs subject and returns question-writing elements and the hint ladder; diagnose returns check-in plans (grade, term or unit narrow the scope); review-sheet needs subject; weak lists weak points.' },
      offset: { type: 'integer', description: 'Zero-based collection offset; defaults to 0.' },
      id: { type: 'string', description: 'Optional exact record ID for materials, mistakes, attempts, sessions, concepts, objectives or worksheets.' },
      subject: { type: 'string', enum: ['chinese', 'math', 'english'], description: 'Optional subject filter for subject-owned records; required for kind=curriculum and kind=elements.' },
      unit: { type: 'string', description: 'Optional map unit filter for kind=elements; for kind=diagnose with grade/term, narrow the cross-grade plan to one unit.' },
      grade: { type: 'integer', description: 'Optional grade (1 or 2) to browse another map (kind=curriculum) or build a cross-grade check-in plan (kind=diagnose); defaults to the learner profile.' },
      term: { type: 'string', enum: ['first', 'second'], description: 'Optional term for kind=curriculum and kind=diagnose; defaults to the learner profile.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const offset = args.offset ?? 0
      if (offset < 0) throw new Error('offset 不能为负数。')
      return z.json().parse(queryStudy(await studyStore(exec), args.kind ?? 'status', offset, {
        ...(args.id !== undefined ? { id: args.id } : {}), ...(args.subject !== undefined ? { subject: args.subject } : {}), ...(args.unit !== undefined ? { unit: args.unit } : {}),
        ...(args.grade !== undefined ? { grade: args.grade } : {}), ...(args.term !== undefined ? { term: args.term } : {}),
      }))
    },
  }))
  context.tools.register(defineTool({
    name: 'study_update',
    description: 'Save one learning change in this workspace. One action per call; confirmation text must quote the user. Identical retries succeed; reusing an id for different content fails; a conflicting field is rejected with the expected value. Do not edit .study/state.json directly.',
    parameters: { change: { ...toolSchema(z.toJSONSchema(commandSchema)), required: true, description: 'One action. Numeric bounds are schema-enforced. setup, limits, courses, school progress, interests and openmaic-settings are parent-confirmed; interests saves theme tags only, and openmaic-settings saves only the base URL, not lesson rows. task, answer, hint, stuck and record run inside an active block; paper actions grade printed sheets. The study skill owns each action\'s rules.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const status = z.json().parse(queryStudy(await studyStore(exec, args.change), 'status', 0))
      const notices = updateNotices(args.change)
      if (notices.length === 0 || typeof status !== 'object' || status === null) return status
      const prior = 'notices' in status && Array.isArray(status.notices) ? status.notices.filter(item => typeof item === 'string') : []
      return { ...status, notices: [...prior, ...notices] }
    },
  }))
}
