import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ValueSchemaSpec, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { commandSchema } from './schema.ts'
import { queryStudy, studyStore } from './store.ts'

/** Project the shared validated input into DSH's schema DSL; numeric/string bounds stay in Zod. */
function toolSchema(input: z.core.JSONSchema.BaseSchema | boolean): ValueSchemaSpec {
  if (typeof input === 'boolean') throw new Error('Study inputs require explicit value schemas.')
  if (input.oneOf) {
    const [first, second, ...rest] = input.oneOf.map(toolSchema)
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
  if (input.type === 'integer') return { type: 'integer' }
  throw new Error(`Unsupported study input schema type: ${String(input.type)}`)
}

/** Register bounded lookup and validated mutations with DSH's normal logged tool runtime. */
export function registerStudyTools(context: Context): void {
  context.tools.register(defineTool({
    name: 'study_status',
    description: 'Read the learner profile, shared time budget, course confirmation, the shipped knowledge map with mastery, weak points, mistakes, worksheets and learning evidence in this Session workspace. Use before each new learning activity. kind=curriculum returns one subject\'s units, knowledge points, objectives and relations for the learner\'s term, or for another grade and term when grade/term are given (browse-only, no mastery); kind=weak returns weak points, a next-step recommendation and practised objectives; kind=diagnose returns the recurring check-in plan per subject. Collections return 20 records per page; status does not start or stop a timer.',
    parameters: {
      kind: { type: 'string', enum: ['status', 'materials', 'mistakes', 'due', 'pending', 'attempts', 'sessions', 'progress', 'concepts', 'objectives', 'relations', 'worksheets', 'paper-results', 'curriculum', 'weak', 'diagnose'], description: 'Defaults to status. Due and pending filter mistakes. curriculum needs subject and returns the shipped knowledge map with mastery for grades one and two. weak returns weak points and the recommended next step. diagnose returns each subject\'s recurring check-in plan: whether it is due (every 14 days) and up to six objectives to probe. Query mistakes by id to read the confirmed prompt and answer evidence.' },
      offset: { type: 'integer', description: 'Zero-based collection offset; defaults to 0.' },
      id: { type: 'string', description: 'Optional exact record ID for materials, mistakes, attempts, sessions, concepts, objectives or worksheets.' },
      subject: { type: 'string', enum: ['chinese', 'math', 'english'], description: 'Optional subject filter for subject-owned records; required for kind=curriculum.' },
      grade: { type: 'integer', description: 'Optional grade (1 or 2) for kind=curriculum to browse another knowledge map; defaults to the learner profile. Objectives outside the profile term cannot be used in tasks.' },
      term: { type: 'string', enum: ['first', 'second'], description: 'Optional term for kind=curriculum; defaults to the learner profile.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const offset = args.offset ?? 0
      if (offset < 0) throw new Error('offset 不能为负数。')
      return z.json().parse(queryStudy(await studyStore(exec), args.kind ?? 'status', offset, {
        ...(args.id !== undefined ? { id: args.id } : {}), ...(args.subject !== undefined ? { subject: args.subject } : {}),
        ...(args.grade !== undefined ? { grade: args.grade } : {}), ...(args.term !== undefined ? { term: args.term } : {}),
      }))
    },
  }))
  context.tools.register(defineTool({
    name: 'study_update',
    description: 'Save learner setup, concepts and objectives, confirmed school progress, timed study, photo mistakes, frozen worksheets or verified paper results. Load /study first. Confirmation text must quote an actual user statement; do not invent it. Prefer the shipped knowledge-map objective IDs (study_status kind=curriculum) in task, record, mistake, link-mistake and worksheet objectiveId; they need no parent confirmation. Start before interactive teaching; publish one task, save the actual answer and any hint request, then record assessment against that task. For young learners prefer tasks with 2–4 choices (task.choices) so the learner taps an option; answers must then be one of the choices. Use free-text tasks for calculations, dictation or reading evidence. A diagnose block is a short check-in: one task per sampled objective (objectiveId required on task and record), brief feedback only, no unsolicited hints; its results feed mastery and weak points. Paper results use a saved worksheet and do not require an active timer. Session and record IDs are stable across retries. Image mistakes remain pending until confirm-mistake. Generated/reference materials cannot become school textbooks.',
    parameters: { change: { ...toolSchema(z.toJSONSchema(commandSchema)), required: true, description: 'Choose one action. Setup requires parent-confirmed limits (block 5–15, break 5–15, daily 10–30 minutes). Suggested grade-two defaults: 10/5/20, product settings, not medical guidance. Material scope must match profile for course confirmation. Dates and elapsed time come from the host.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) { return z.json().parse(queryStudy(await studyStore(exec, args.change), 'status', 0)) },
  }))
}
