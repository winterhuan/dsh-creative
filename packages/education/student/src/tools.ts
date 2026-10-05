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
  if (input.type === 'string') return { type: 'string', ...(typeof input.const === 'string' ? { const: input.const } : {}), ...(input.enum ? { enum: z.array(z.string()).parse(input.enum) } : {}) }
  if (input.type === 'integer') return { type: 'integer' }
  throw new Error(`Unsupported study input schema type: ${String(input.type)}`)
}

/** Register bounded lookup and validated mutations with DSH's normal logged tool runtime. */
export function registerStudyTools(context: Context): void {
  context.tools.register(defineTool({
    name: 'study_status',
    description: 'Read the learner profile, shared time budget, course confirmation, stars and learning evidence in this Session workspace. Use before each new learning activity. Collections return 20 records per page; status does not start or stop a timer.',
    parameters: {
      kind: { type: 'string', enum: ['status', 'materials', 'mistakes', 'due', 'pending', 'attempts', 'sessions', 'progress'], description: 'Defaults to status. Due and pending filter mistakes. Query mistakes by id to read the confirmed prompt and answer evidence.' },
      offset: { type: 'integer', description: 'Zero-based collection offset; defaults to 0.' },
      id: { type: 'string', description: 'Optional exact record ID for materials, mistakes, attempts or sessions.' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const offset = args.offset ?? 0
      if (offset < 0) throw new Error('offset 不能为负数。')
      return z.json().parse(queryStudy(await studyStore(exec), args.kind ?? 'status', offset, args.id))
    },
  }))
  context.tools.register(defineTool({
    name: 'study_update',
    description: 'Save learner setup, material evidence, confirmed school progress, timed study, attempts or photo mistakes. Load /study first. Confirmation text must quote an actual user statement; do not invent it. Start before teaching; publish one task, save the actual answer and any hint request, then record assessment against that task; stop on fatigue or deadline. Session and record IDs are stable across retries. Image mistakes remain pending until confirm-mistake. Generated/reference materials cannot become school textbooks.',
    parameters: { change: { ...toolSchema(z.toJSONSchema(commandSchema)), required: true, description: 'Choose one action. Setup requires parent-confirmed limits (block 5–15, break 5–15, daily 10–30 minutes). Suggested grade-two defaults: 10/5/20, product settings, not medical guidance. Material scope must match profile for course confirmation. Dates and elapsed time come from the host.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) { return z.json().parse(queryStudy(await studyStore(exec, args.change), 'status', 0)) },
  }))
}
