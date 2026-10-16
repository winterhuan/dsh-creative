import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ValueSchemaSpec, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
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
    description: 'Read the learner profile, shared time budget, course confirmation, the shipped knowledge map with mastery, weak points, mistakes, worksheets and learning evidence in this Session workspace. Use before each new learning activity. kind=curriculum returns one subject\'s units, knowledge points, objectives and relations for the learner\'s term, or for another grade and term when grade/term are given (browse-only, no mastery); kind=weak returns weak points, a next-step recommendation and practised objectives; kind=elements returns the taught objectives\' writing elements (error causes, question points, variation axes, common mistakes, extra examples) for one subject, optionally narrowed by unit or id; kind=diagnose returns the recurring check-in plan per subject. Collections return 20 records per page; status does not start or stop a timer.',
    parameters: {
      kind: { type: 'string', enum: ['status', 'materials', 'mistakes', 'due', 'pending', 'attempts', 'sessions', 'progress', 'concepts', 'objectives', 'relations', 'worksheets', 'paper-results', 'curriculum', 'weak', 'elements', 'diagnose', 'review-sheet'], description: 'Defaults to status. Due and pending filter mistakes. review-sheet needs subject and returns the mistakes to put on the next printed review sheet (due today or tomorrow, lowest stage first, at most 8, none already on an ungraded sheet), plus ungraded sheets and due mistakes still missing a goal. curriculum needs subject and returns the shipped knowledge map with mastery for grades one and two. weak returns weak points and the recommended next step. elements returns per-objective writing elements with subject (optional unit or id). diagnose returns each subject\'s recurring check-in plan: whether it is due (every 14 days), coverage, the objectives to probe per intensity (light 3, standard 6, deep 12) and recent check-in history. Query mistakes by id to read the confirmed prompt and answer evidence.' },
      offset: { type: 'integer', description: 'Zero-based collection offset; defaults to 0.' },
      id: { type: 'string', description: 'Optional exact record ID for materials, mistakes, attempts, sessions, concepts, objectives or worksheets.' },
      subject: { type: 'string', enum: ['chinese', 'math', 'english'], description: 'Optional subject filter for subject-owned records; required for kind=curriculum and kind=elements.' },
      unit: { type: 'string', description: 'Optional map unit filter for kind=elements; defaults to every taught unit.' },
      grade: { type: 'integer', description: 'Optional grade (1 or 2) for kind=curriculum to browse another knowledge map; defaults to the learner profile. Objectives outside the profile term cannot be used in tasks.' },
      term: { type: 'string', enum: ['first', 'second'], description: 'Optional term for kind=curriculum; defaults to the learner profile.' },
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
    description: 'Save learner setup, concepts and objectives, confirmed school progress, timed study, photo mistakes, frozen worksheets or verified paper results. Load /study first. Confirmation text must quote an actual user statement; do not invent it. Prefer the shipped knowledge-map objective IDs (study_status kind=curriculum) in task, record, mistake, link-mistake and worksheet objectiveId; they need no parent confirmation. Start before interactive teaching; publish one task, save the actual answer and any hint request, then record assessment against that task. On-screen recognition, situation checks and light or standard check-ins use 2–4 choices (task.choices), and the answer must be one of them. Calculations, dictation, drawing and reading evidence stay free text. Before a printed worksheet, read the study skill questions reference: vary the item types, keep prompts free of answers and choices, give every item an objectiveId (or set the sheet objectiveId), and draw what the child needs with item.figure (bar-model, money, place-value, hundred-chart, number-line, clock, sticks, vertical, shapes) and item.space; a 看图 prompt must carry its figure and must not restate what the figure already shows; never produce a separate HTML sheet. A diagnose block is a short check-in: start it with intensity light (3 choice questions), standard (6 mixed, default) or deep (12 with at least one reasoning task per unit and progress re-checks); one task per sampled objective (objectiveId required on task and record), brief feedback only, no unsolicited hints; its results feed mastery and weak points. Paper results use a saved worksheet and do not require an active timer. A practice sheet omits mistakeId. A review sheet holds exactly the mistakes returned by study_status kind=review-sheet, one item each with that mistake\'s mistakeId and objectiveId; mistakes not due by tomorrow or already on an ungraded sheet are rejected. The parent usually marks a printed sheet in the panel (grade-sheet). For a photographed sheet, transcribe each answer with paper-draft; the parent reviews the drafts in the panel and confirm-paper stores the verified results (wrong or partial answers become confirmed mistakes there). An incorrect or partial result on an item without mistakeId creates a confirmed mistake on that item\'s goal; marking an item again replaces its earlier result. Review stages are derived from evidence: an independent correct answer on any day, before the due day included, moves a mistake up one stage (1, 3, 7, 14, 30 days), at most once per day, and any wrong, partial or helped answer only makes it due again tomorrow without lowering the stage. Review questions from kind=review-sheet carry a variantLevel (numeric, then context, then reasoning): never repeat a mistake\'s original prompt (rejected), report the pick\'s errorType on the sheet mistake, and write only the picks and objectiveFills the query returned. Before writing items, read kind=elements for the target goals; set worksheet.kind (daily, practice or review) so the printed title matches. classify-mistake sets or clears a confirmed mistake\'s error cause; mistake, paper-draft and grading entries also accept an errorType suggestion. discard-sheet retires an unused or abandoned sheet so its mistakes can be printed again. Identical retries succeed. Reusing a finished session id starts a new block under the same id. Question ids are unique inside one block and can be reused in the next. An unconfirmed mistake with the same id is replaced; a confirmed one is not. A worksheet with no paper results can be saved again under the same id. Image mistakes remain pending until confirm-mistake. Generated/reference materials cannot become school textbooks. school-progress records the map unit the class has reached after the parent confirms it; do not infer that unit from a homework photo or move it on a calendar. keep-up teaches only that unit, catch-up fills earlier gaps first, preview may add only the next unit, and pace review adds no new goal. Check-ins then count only units up to that frontier.',
    parameters: { change: { ...toolSchema(z.toJSONSchema(commandSchema)), required: true, description: 'Choose one action. Setup requires parent-confirmed limits (block 5–15, break 5–15, daily 10–30 minutes). Suggested grade-two defaults: 10/5/20, product settings, not medical guidance. Material scope must match profile for course confirmation. Dates and elapsed time come from the host.' } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) { return z.json().parse(queryStudy(await studyStore(exec, args.change), 'status', 0)) },
  }))
}
