import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ValueSchemaSpec, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { updateNotices } from './learning.ts'
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
    description: 'Read this workspace\'s learner profile, time budget, courses, knowledge map, weak points, check-ins, mistakes, worksheets and evidence. Call it before each learning step. kind selects the page; collections return 20 records. Reading does not start or stop a timer. Load the study skill for how to teach from a page.',
    parameters: {
      kind: { type: 'string', enum: ['status', 'materials', 'mistakes', 'due', 'pending', 'attempts', 'sessions', 'progress', 'concepts', 'objectives', 'relations', 'worksheets', 'paper-results', 'curriculum', 'weak', 'elements', 'diagnose', 'review-sheet'], description: 'status (default) includes the suggested time budget, timeNotice, top weak points and one recommendation. Relay timeNotice as written; it states elapsed time, the suggestion and any break clock in Beijing time. curriculum needs subject; optional grade and term browse another map without mastery. weak lists weak points and the next step. elements needs subject and returns question-writing elements for taught goals; optional unit or id. diagnose returns check-in plans; optional subject, grade, term and unit select a cross-grade or single-unit plan. review-sheet needs subject and returns the next printed review picks. Other values page materials, mistakes, due, pending, attempts, sessions, progress, concepts, objectives, relations, worksheets or paper-results. id selects one record; a mistake id returns its confirmed prompt and answer evidence.' },
      offset: { type: 'integer', description: 'Zero-based collection offset; defaults to 0.' },
      id: { type: 'string', description: 'Optional exact record ID for materials, mistakes, attempts, sessions, concepts, objectives or worksheets.' },
      subject: { type: 'string', enum: ['chinese', 'math', 'english'], description: 'Optional subject filter for subject-owned records; required for kind=curriculum and kind=elements.' },
      unit: { type: 'string', description: 'Optional map unit filter for kind=elements; defaults to every taught unit. For kind=diagnose with grade/term, narrow the cross-grade plan to one unit.' },
      grade: { type: 'integer', description: 'Optional grade (1 or 2). For kind=curriculum, browse another knowledge map (browse-only, no mastery). For kind=diagnose, build a cross-grade check-in plan; combine with subject and optionally unit. Defaults to the learner profile.' },
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
    description: 'Save one learning change in this workspace. Load the study skill first; it owns question writing, figures, hints, review spacing and paper grading. Confirmation text must quote the user. Use shipped objective IDs from study_status. Inside a running block, save one task, the learner\'s real answer, any hint request, then the assessment of that task. A task and its record may carry the same figure; an omitted figure, objective, mistake or variant is copied from the current task. A conflicting field is rejected with the expected value. Choice answers accept case, width, spacing and letter forms such as A or 选择A; the stored response is the choice text and rawResponse keeps the input. Paper grading does not need a running block. Identical retries succeed; reusing an id for different content fails. Do not edit .study/state.json directly.',
    parameters: { change: { ...toolSchema(z.toJSONSchema(commandSchema)), required: true, description: 'One action. setup limits are block 5–15, break 5–15 and daily 10–30 minutes; grade-two defaults 10/5/20 are suggestions, not a rejection and not medical guidance. A passed block, an unfinished break or a full day still saves, and the result includes timeNotice. intensity is stored only for diagnose; other modes ignore it and say so in notices. Course material must match the profile. Dates come from the host. start for diagnose, foundation or school may include scope (grade, term, units or objectiveIds); without scope the confirmed school unit stays the default.' } },
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
