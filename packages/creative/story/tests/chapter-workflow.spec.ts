import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = await readFile(new URL('../knowledge/story/skills/story-write/workflows/chapter.js', import.meta.url), 'utf8')
const source = { body_sha256: 'a'.repeat(64), outline_sha256: 'b'.repeat(64), state_revision: 7 }
const draft = { status: 'checked', summary: 'Written and checked.', compression_used: false, length_status: 'internal_pass', ...source }
const ready = { recommendation: 'ready', review: 'No important unresolved issue in the inspected chapter.' }
const revise = { recommendation: 'revise', review: 'The guard knows the concealed fact. Revise paragraph 2.' }
function auditFor(body = source.body_sha256, verdicts: unknown[] = [{ rule_id: 'OUT-008-NR', verdict: 'pass' }]) {
  return { schema: 'story-rule-audit/v1', body_sha256: body, rules_sha256: 'd'.repeat(64), verdicts }
}
const cleanAudit = auditFor()
const violateAudit = auditFor(source.body_sha256, [{ rule_id: 'OUT-008-NR', verdict: 'violate', evidence: [{ line: 1, quote: 'concealed' }], reason: 'The draft names the concealed fact.', fix: 'Remove that sentence.' }])
const committed = { status: 'committed', summary: 'Tracking and sources verified.', ...source, state_revision: 8 }
const args = {
  workspace: '/', book: 'book', skills_root: '/resources/story/skills', cli: '/resources/lib/cli.js', chapter: 8, body_path: '/book/正文/第8章.md',
  outline_path: '/book/大纲/细纲_第8章.md', expected_state_revision: 7,
  instructions: 'Do not reveal the concealed fact.', context_paths: ['/book/追踪/上下文.md'],
  resume: false, compression_used: false,
}

const prepared = {
  status: 'ready', summary: 'Existing outline checked.', outline_sha256: source.outline_sha256, state_revision: 7,
  body_path: args.body_path, outline_path: args.outline_path, context_paths: args.context_paths,
  scene_execution_plan: 'The protagonist uses the signed order to enter; retain the concealed fact.',
  chapter_rules: 'OUT-008-NR: Do not reveal the concealed fact.',
}

function run(replies: unknown[], overrides: Record<string, unknown> = {}, preparation: unknown = prepared) {
  replies = [preparation, ...replies]
  const calls: { prompt: string; label: string; schema: object }[] = []
  const phases: string[] = []
  // The raw resource is a native workflow body, evaluated with only its supported hooks.
  const result = runInNewContext(`(async () => {${script}\n})()`, {
    args: { ...args, ...overrides },
    agent: async (prompt: string, options: { label: string; schema: object }) => {
      calls.push({ prompt, ...options })
      if (!replies.length) throw new Error('Unexpected dependent stage')
      return replies.shift()
    },
    phase: (name: string) => phases.push(name),
  }) as Promise<Record<string, unknown>>
  return { result, calls, phases }
}

describe('native chapter template transitions', () => {
  it('submits only after a separate structured reviewer recommends ready', async () => {
    const { result, calls, phases } = run([draft, ready, cleanAudit, committed])
    expect(await result).toMatchObject({ status: 'committed', revisions: 0, state_revision: 8 })
    expect(await result).not.toHaveProperty('book_audit_hint')
    expect(phases).toEqual(['Prepare', 'Write', 'Review', 'Submit'])
    expect(calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Audit', 'Submit'])
    expect(calls[2]!.schema).toMatchObject({ required: ['recommendation', 'review'], additionalProperties: false })
    expect(calls[3]!.prompt).toContain('rule-auditor.md')
    expect(calls[3]!.prompt).toContain('chapter audit-verify')
    expect(calls[4]!.prompt).toContain(`expected_body_sha256=${source.body_sha256}`)
    expect(calls[4]!.prompt).toContain('chapter finish')
    expect(calls[1]!.prompt).toContain('facts extract')
    expect(calls[4]!.prompt).toContain('rule_audit')
    expect(await result).toMatchObject({
      phase: 'Submit', rules_sha256: 'd'.repeat(64), claims_present: false,
      gates: { rule_audit: 'off', facts_diff: 'off' },
    })
  })

  it('reviews the changed draft before submitting it', async () => {
    const changed = { ...draft, body_sha256: 'c'.repeat(64), compression_used: true }
    const { result, calls } = run([draft, revise, cleanAudit, changed, ready, auditFor(changed.body_sha256), { ...committed, body_sha256: changed.body_sha256 }])
    expect(await result).toMatchObject({ status: 'committed', revisions: 1, compression_used: true })
    expect(calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Audit', 'Revise 1', 'Review 1', 'Audit 1', 'Submit'])
    expect(calls[4]!.prompt).toContain(revise.review)
    expect(calls[6]!.prompt).toContain(changed.body_sha256)
  })

  it('retains unresolved findings after two revisions without submitting', async () => {
    const { result, calls } = run([draft, revise, cleanAudit, draft, revise, cleanAudit, draft, revise, cleanAudit])
    expect(await result).toMatchObject({ status: 'revision_limit', revisions: 2, review: revise.review, unresolved_rule_ids: [] })
    expect(calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Audit', 'Revise 1', 'Review 1', 'Audit 1', 'Revise 2', 'Review 2', 'Audit 2'])
    expect((await result).summary).toContain('change the outline')
  })

  it.each(['under', 'over'])('requires a user decision for %s length', async length_status => {
    const { result, calls } = run([{ ...draft, length_status }])
    expect(await result).toMatchObject({ status: 'needs_input' })
    expect(calls).toHaveLength(2)
  })

  it('uses explicit natural-length acceptance only for the accepted bytes', async () => {
    const accepted_length = { body_sha256: source.body_sha256, outline_sha256: source.outline_sha256 }
    const first = run([{ ...draft, length_status: 'under' }, ready, cleanAudit, committed], { accepted_length, resume: true, compression_used: true })
    expect(await first.result).toMatchObject({ status: 'committed', compression_used: true })
    expect(first.calls[1]!.prompt).toContain('preserve the existing draft')
    expect(first.calls[4]!.prompt).toContain('chapter finish')
    expect(first.calls[4]!.prompt).toContain('--accept-current-length')
    const second = run([{ ...draft, body_sha256: 'c'.repeat(64), length_status: 'under' }], { accepted_length })
    expect(await second.result).toMatchObject({ status: 'needs_input' })
  })

  it('stops when facts changed or a stage needs user input', async () => {
    for (const replies of [
      [{ ...draft, state_revision: 8 }],
      [{ status: 'needs_input', summary: 'Missing outline.', compression_used: false }],
      [draft, { recommendation: 'needs_input', review: 'Which account is authoritative?' }, cleanAudit],
      [draft, ready, cleanAudit, { status: 'needs_input', summary: 'Files changed before commit.' }],
    ]) {
      expect(await run(replies).result).toMatchObject({ status: 'needs_input' })
    }
  })

  it.each([
    ['write', [null], 2],
    ['review', [draft, null, cleanAudit], 4],
    ['audit', [draft, ready, null], 4],
    ['submit', [draft, ready, cleanAudit, null], 5],
  ] as const)('does not advance after a null %s child', async (_stage, replies, callsExpected) => {
    const { result, calls } = run([...replies])
    await expect(result).rejects.toThrow('failed')
    expect(calls).toHaveLength(callsExpected)
  })

  it('rejects missing identity, malformed review and incorrect submission verification', async () => {
    for (const replies of [
      [{ ...draft, body_sha256: 'invalid' }],
      [draft, { recommendation: 'approve', review: 'Invented status.' }, cleanAudit],
      [draft, { recommendation: 'ready' }, cleanAudit],
      [draft, { recommendation: 'ready', review: 'x'.repeat(4001) }, cleanAudit],
      [draft, ready, { ...cleanAudit, body_sha256: 'c'.repeat(64) }],
      [draft, ready, { ...cleanAudit, verdicts: [{ rule_id: 'OUT-008-NR', verdict: 'violate' }] }],
      [draft, ready, cleanAudit, { ...committed, state_revision: 7 }],
      [draft, ready, cleanAudit, { ...committed, outline_sha256: 'c'.repeat(64) }],
    ]) await expect(run(replies).result).rejects.toThrow()
  })

  it('returns an uncertain commit for artifact inspection without retrying', async () => {
    const { result, calls } = run([draft, ready, cleanAudit, { status: 'uncertain', summary: 'Inspect the partially written transaction.' }])
    expect(await result).toMatchObject({ status: 'uncertain' })
    expect(calls).toHaveLength(5)
  })

  it('independently verifies an already committed chapter without regenerating it', async () => {
    const { result, calls, phases } = run([
      { ...committed, status: 'already_committed', state_revision: 7 },
    ], { resume: true }, { ...prepared, ...source, status: 'already_committed' })
    expect(await result).toMatchObject({ status: 'already_committed', state_revision: 7 })
    expect(phases).toEqual(['Prepare', 'Verify'])
    expect(calls[1]!.prompt).toContain('do not write or resubmit')
  })

  it('passes prepared paths, scene plan and revision without requiring parent preparation', async () => {
    const { result, calls } = run([draft, ready, cleanAudit, committed], {
      body_path: undefined, outline_path: undefined, expected_state_revision: undefined,
    })
    expect(await result).toMatchObject({ status: 'committed', body_path: prepared.body_path })
    expect(calls[0]!.label).toBe('Prepare')
    expect(calls[1]!.prompt).toContain(prepared.scene_execution_plan)
    expect(calls[1]!.prompt).toContain(prepared.chapter_rules)
    expect(calls[1]!.prompt).toContain('never pad an underlength draft')
    expect(calls[0]!.prompt).toContain('chapter rules')
    expect(calls[0]!.prompt).toContain('also')
    expect(calls[1]!.prompt).toContain('also:')
    expect(calls[1]!.prompt).toContain(prepared.outline_path)
  })

  it('suggests a book audit after a committed tenth chapter and does not run it', async () => {
    const tenthArgs = {
      chapter: 10,
      body_path: '/book/正文/第010章.md',
      outline_path: '/book/大纲/细纲_第010章.md',
    }
    const { result, calls } = run([draft, ready, cleanAudit, committed], tenthArgs, { ...prepared, ...tenthArgs })
    expect(await result).toMatchObject({
      status: 'committed',
      book_audit_hint: '建议父会话运行 book audit --workspace / --book book --from 1 --to 10 --json。本模板不自动运行。',
    })
    expect(calls.some(call => call.prompt.includes('book audit'))).toBe(false)
  })

  it('stops before writing when preparation needs a decision, returns null or sees a stale revision', async () => {
    for (const preparation of [
      { status: 'needs_input', summary: 'The volume plan does not identify the next event.' },
      { ...prepared, state_revision: 8 },
    ]) {
      const { result, calls } = run([], {}, preparation)
      expect(await result).toMatchObject({ status: 'needs_input' })
      expect(calls).toHaveLength(1)
    }
    const failed = run([], {}, null)
    await expect(failed.result).rejects.toThrow('Prepare failed: no structured result')
    expect(failed.calls).toHaveLength(1)
  })

  it('rejects incomplete or out-of-project preparation and preserves explicit path constraints', async () => {
    for (const preparation of [
      { ...prepared, outline_sha256: 'invalid' },
      { ...prepared, scene_execution_plan: '' },
      { ...prepared, body_path: '/elsewhere/chapter.md' },
      { ...prepared, outline_path: '/book/../elsewhere/outline.md' },
      { ...prepared, context_paths: ['/elsewhere/context.md'] },
    ]) {
      const { result, calls } = run([], {}, preparation)
      await expect(result).rejects.toThrow()
      expect(calls).toHaveLength(1)
    }
    const changed = run([], {}, { ...prepared, body_path: '/book/正文/第8章_另名.md' })
    expect(await changed.result).toMatchObject({ status: 'needs_input' })
  })

  it('stops if the writer checked a different outline from preparation', async () => {
    const { result, calls } = run([{ ...draft, outline_sha256: 'c'.repeat(64) }])
    expect(await result).toMatchObject({ status: 'needs_input' })
    expect(calls).toHaveLength(2)
  })

  it('rejects incomplete invocation inputs before any child starts', async () => {
    const { result, calls } = run([], { workspace: 'relative', chapter: 0 })
    await expect(result).rejects.toThrow('absolute path')
    expect(calls).toHaveLength(0)
  })

  it('revises an unaccepted violate in the same round as review and stops with the rule id', async () => {
    const limited = run([draft, ready, violateAudit, draft, ready, violateAudit, draft, ready, violateAudit])
    expect(await limited.result).toMatchObject({ status: 'revision_limit', revisions: 2, unresolved_rule_ids: ['OUT-008-NR'] })
    expect((await limited.result).summary).toContain('accepted_findings')
    expect((await limited.result).summary).toContain('change the rule source')
    expect(limited.calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Audit', 'Revise 1', 'Review 1', 'Audit 1', 'Revise 2', 'Review 2', 'Audit 2'])
    expect(limited.calls[4]!.prompt).toContain('violate OUT-008-NR')
    const accepted = run([draft, ready, violateAudit, committed], { accepted_findings: [{ rule_id: 'OUT-008-NR', reason: '作者保留这一句' }] })
    expect(await accepted.result).toMatchObject({ status: 'committed', revisions: 0 })
    expect(accepted.calls[4]!.prompt).toContain('作者保留这一句')
    const unclear = auditFor(source.body_sha256, [{ rule_id: 'OUT-008-NR', verdict: 'unclear', reason: '邻章没有对应句子' }])
    const noted = run([draft, ready, unclear, committed])
    expect(await noted.result).toMatchObject({ status: 'committed', revisions: 0 })
    expect((await noted.result).review).toContain('unclear OUT-008-NR')
  })
})
