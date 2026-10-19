// Native workflow script body; load through read and submit unchanged to workflow.
const object = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false })
const string = { type: 'string' }
const locateSchema = object({
  status: { type: 'string', enum: ['ready', 'needs_input'] },
  summary: string,
  issues_path: string,
}, ['status', 'summary'])
const planSchema = object({
  status: { type: 'string', enum: ['ready', 'needs_approval', 'needs_input'] },
  summary: string,
}, ['status', 'summary'])
const rewriteSchema = object({
  status: { type: 'string', enum: ['checked', 'needs_input'] },
  summary: string,
  body_sha256: string,
  outline_sha256: string,
  state_revision: { type: 'integer' },
}, ['status', 'summary'])
const auditSchema = object({
  schema: { type: 'string', enum: ['story-rule-audit/v1'] },
  body_sha256: string,
  rules_sha256: string,
  verdicts: { type: 'array', items: object({ rule_id: string, verdict: { type: 'string', enum: ['pass', 'violate', 'not_applicable', 'unclear'] } }, ['rule_id', 'verdict']) },
}, ['schema', 'body_sha256', 'rules_sha256', 'verdicts'])
const commitSchema = object({
  status: { type: 'string', enum: ['committed', 'needs_input', 'uncertain'] },
  summary: string,
  body_sha256: string,
  outline_sha256: string,
  state_revision: { type: 'integer' },
}, ['status', 'summary'])

const absolute = value => typeof value === 'string' && /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
for (const key of ['workspace', 'skills_root', 'cli']) {
  if (!absolute(args[key])) throw new Error(`${key} must be an absolute path`)
}
if (typeof args.book !== 'string' || !args.book.trim() || /[\\/]/.test(args.book)) throw new Error('book must name an immediate child of the workspace')
if (!Number.isInteger(args.chapter) || args.chapter < 1 || typeof args.instructions !== 'string' || !args.instructions.trim() || typeof args.approved !== 'boolean') {
  throw new Error('Invalid chapter, instructions or approved flag')
}
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const project = `${args.workspace.replace(/[\\/]+$/, '')}/${args.book}`
const quote = value => `'${value.replaceAll("'", "'\\''")}'`
const cli = `node ${quote(args.cli)}`
const scope = `--workspace ${quote(args.workspace)} --book ${quote(args.book)}`
const common = () => `Revise one committed chapter. Task data: ${JSON.stringify({ ...args, project })}
Use native read. Do not delegate or start another workflow. Return structured_output for this stage.`
const response = (value, field, stage) => {
  if (value === null || value === undefined) throw new Error(`${stage} failed`)
  if (typeof value !== 'object' || typeof value[field] !== 'string' || !value[field].trim()) throw new Error(`${stage} returned invalid ${field}`)
  return value
}

phase('Locate')
const located = response(await agent(`${common()}
Read the issue list at 草稿/问题单.json when it exists. Otherwise run ${cli} book audit ${scope} --from ${args.chapter} --to ${args.chapter} --issues --json and use that file. Return ready with issues_path, or needs_input when the chapter cannot be located.`, {
  label: 'Locate', schema: locateSchema,
}), 'summary', 'Locate')
if (located.status === 'needs_input') return { status: 'needs_input', summary: located.summary, chapter: args.chapter }
if (located.status !== 'ready' || typeof located.issues_path !== 'string' || !located.issues_path.trim()) throw new Error('Locate returned invalid issues_path')

phase('Plan')
const planned = response(await agent(`${common()}
Propose the rewrite from the issue list. Return needs_approval when the rewrite changes plot and args.approved is false. Return ready when the change is local or already approved. Return needs_input when a fact is missing.`, {
  label: 'Plan', schema: planSchema,
}), 'summary', 'Plan')
if (planned.status === 'needs_input' || (planned.status === 'needs_approval' && args.approved !== true)) {
  return { status: 'needs_input', summary: planned.summary, chapter: args.chapter }
}
if (planned.status !== 'ready' && planned.status !== 'needs_approval') throw new Error('Plan returned an invalid status')

phase('Rewrite')
const rewritten = response(await agent(`${common()}
Edit the committed body in place. Run ${cli} chapter check ${scope} --chapter ${args.chapter} --json. checked requires outline_readiness and quality to pass. Return the checked hashes and state_revision.`, {
  label: 'Rewrite', schema: rewriteSchema,
}), 'summary', 'Rewrite')
if (rewritten.status === 'needs_input') return { status: 'needs_input', summary: rewritten.summary, chapter: args.chapter }
if (rewritten.status !== 'checked' || !digest(rewritten.body_sha256) || !digest(rewritten.outline_sha256) || !Number.isInteger(rewritten.state_revision)) {
  throw new Error('Rewrite returned invalid identity')
}

phase('Audit')
const audited = await agent(`${common()}
Run ${cli} chapter rules ${scope} --chapter ${args.chapter} --json and write story-rule-audit/v1 for the rewritten body. Then run ${cli} chapter audit-verify ${scope} --chapter ${args.chapter} --json. Return the document only after verified is true. When rule_audit is off, still return the document; do not block on the gate.`, {
  label: 'Audit', schema: auditSchema,
})
if (audited === null || audited === undefined || audited.schema !== 'story-rule-audit/v1' || audited.body_sha256 !== rewritten.body_sha256) {
  throw new Error('Audit failed')
}

phase('Submit')
const submitted = response(await agent(`${common()}
Submit one mode=revision transaction. Include expected_body_sha256=${rewritten.body_sha256}, expected_outline_sha256=${rewritten.outline_sha256}, expected_state_revision=${rewritten.state_revision}.
Run ${cli} chapter commit ${scope} --chapter ${args.chapter} --input <absolute-transaction-file> --json.
When facts_diff is required, run facts diff on 草稿/事实/第${String(args.chapter).padStart(3, '0')}章.claims.json before the commit. When it is off, report conflicts and do not block.
After success run ${cli} facts stale ${scope} --json. Re-record changed rows with ${cli} facts record ${scope} --chapter ${args.chapter} --input <claims file> --json when that file exists.
A context item that the rewrite retires, and that is not part of this revision delta, uses ${cli} project context retire ${scope} --item <text> --reason <reason> --json. Old reader-value rows move with ${cli} project legacy archive ${scope} --reader-value --json.
Downstream chapters that still cite a changed fact go back on the issue list. Do not start those chapters in this run.`, {
  label: 'Submit', schema: commitSchema,
}), 'summary', 'Submit')
if (submitted.status !== 'committed' || submitted.body_sha256 !== rewritten.body_sha256 || submitted.state_revision !== rewritten.state_revision + 1) {
  if (submitted.status === 'needs_input' || submitted.status === 'uncertain') return { status: submitted.status, summary: submitted.summary, chapter: args.chapter }
  throw new Error('Submission did not verify the revision')
}
return { status: 'committed', chapter: args.chapter, summary: submitted.summary, body_sha256: submitted.body_sha256, state_revision: submitted.state_revision }
