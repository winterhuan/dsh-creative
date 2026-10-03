import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = await readFile(new URL('../knowledge/story/workflows/chapter.js', import.meta.url), 'utf8')
const source = { body_sha256: 'a'.repeat(64), outline_sha256: 'b'.repeat(64), state_revision: 7 }
const draft = { status: 'checked', summary: 'Written and checked.', compression_used: false, length_status: 'internal_pass', ...source }
const ready = { recommendation: 'ready', review: 'No important unresolved issue in the inspected chapter.' }
const revise = { recommendation: 'revise', review: 'The guard knows the concealed fact. Revise paragraph 2.' }
const committed = { status: 'committed', summary: 'Tracking and sources verified.', ...source, state_revision: 8 }
const args = {
  project: '/book', resource_base: '/resources/story', chapter: 8, body_path: '/book/正文/第8章.md',
  outline_path: '/book/大纲/细纲_第8章.md', python: '/bin/python3', expected_state_revision: 7,
  instructions: 'Do not reveal the concealed fact.', context_paths: ['/book/追踪/上下文.md'],
  resume: false, compression_used: false,
}

const prepared = {
  status: 'ready', summary: 'Existing outline checked.', outline_sha256: source.outline_sha256, state_revision: 7,
  body_path: args.body_path, outline_path: args.outline_path, context_paths: args.context_paths,
  scene_execution_plan: 'The protagonist uses the signed order to enter; retain the concealed fact.',
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
    const { result, calls, phases } = run([draft, ready, committed])
    expect(await result).toMatchObject({ status: 'committed', revisions: 0, state_revision: 8 })
    expect(phases).toEqual(['Prepare', 'Write', 'Review', 'Submit'])
    expect(calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Submit'])
    expect(calls[2]!.schema).toMatchObject({ required: ['recommendation', 'review'], additionalProperties: false })
    expect(calls[3]!.prompt).toContain(`expected_body_sha256=${source.body_sha256}`)
    expect(calls[3]!.prompt).toContain('chapter commit')
  })

  it('reviews the changed draft before submitting it', async () => {
    const changed = { ...draft, body_sha256: 'c'.repeat(64), compression_used: true }
    const { result, calls } = run([draft, revise, changed, ready, { ...committed, body_sha256: changed.body_sha256 }])
    expect(await result).toMatchObject({ status: 'committed', revisions: 1, compression_used: true })
    expect(calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Revise 1', 'Review 1', 'Submit'])
    expect(calls[3]!.prompt).toContain(revise.review)
    expect(calls[4]!.prompt).toContain(changed.body_sha256)
  })

  it('retains unresolved findings after two revisions without submitting', async () => {
    const { result, calls } = run([draft, revise, draft, revise, draft, revise])
    expect(await result).toMatchObject({ status: 'revision_limit', revisions: 2, review: revise.review })
    expect(calls.map(call => call.label)).toEqual(['Prepare', 'Write', 'Review', 'Revise 1', 'Review 1', 'Revise 2', 'Review 2'])
  })

  it.each(['under', 'over'])('requires a user decision for %s length', async length_status => {
    const { result, calls } = run([{ ...draft, length_status }])
    expect(await result).toMatchObject({ status: 'needs_input' })
    expect(calls).toHaveLength(2)
  })

  it('uses explicit natural-length acceptance only for the accepted bytes', async () => {
    const accepted_length = { body_sha256: source.body_sha256, outline_sha256: source.outline_sha256 }
    const first = run([{ ...draft, length_status: 'under' }, ready, committed], { accepted_length, resume: true, compression_used: true })
    expect(await first.result).toMatchObject({ status: 'committed', compression_used: true })
    expect(first.calls[1]!.prompt).toContain('preserve the existing draft')
    expect(first.calls[3]!.prompt).toContain('chapter accept-current-length')
    const second = run([{ ...draft, body_sha256: 'c'.repeat(64), length_status: 'under' }], { accepted_length })
    expect(await second.result).toMatchObject({ status: 'needs_input' })
  })

  it('stops when facts changed or a stage needs user input', async () => {
    for (const replies of [
      [{ ...draft, state_revision: 8 }],
      [{ status: 'needs_input', summary: 'Missing outline.', compression_used: false }],
      [draft, { recommendation: 'needs_input', review: 'Which account is authoritative?' }],
      [draft, ready, { status: 'needs_input', summary: 'Files changed before commit.' }],
    ]) {
      expect(await run(replies).result).toMatchObject({ status: 'needs_input' })
    }
  })

  it.each([0, 1, 2])('does not advance after a null child at stage %i', async index => {
    const replies = [draft, ready, committed].slice(0, index)
    const { result, calls } = run([...replies, null])
    await expect(result).rejects.toThrow('failed')
    expect(calls).toHaveLength(index + 2)
  })

  it('rejects missing identity, malformed review and incorrect submission verification', async () => {
    for (const replies of [
      [{ ...draft, body_sha256: 'invalid' }],
      [draft, { recommendation: 'approve', review: 'Invented status.' }],
      [draft, { recommendation: 'ready' }],
      [draft, { recommendation: 'ready', review: 'x'.repeat(4001) }],
      [draft, ready, { ...committed, state_revision: 7 }],
      [draft, ready, { ...committed, outline_sha256: 'c'.repeat(64) }],
    ]) await expect(run(replies).result).rejects.toThrow()
  })

  it('returns an uncertain commit for artifact inspection without retrying', async () => {
    const { result, calls } = run([draft, ready, { status: 'uncertain', summary: 'Inspect the partially written transaction.' }])
    expect(await result).toMatchObject({ status: 'uncertain' })
    expect(calls).toHaveLength(4)
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
    const { result, calls } = run([draft, ready, committed], {
      body_path: undefined, outline_path: undefined, expected_state_revision: undefined,
    })
    expect(await result).toMatchObject({ status: 'committed', body_path: prepared.body_path })
    expect(calls[0]!.label).toBe('Prepare')
    expect(calls[1]!.prompt).toContain(prepared.scene_execution_plan)
    expect(calls[1]!.prompt).toContain(prepared.outline_path)
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
    const { result, calls } = run([], { project: 'relative', chapter: 0 })
    await expect(result).rejects.toThrow('absolute path')
    expect(calls).toHaveLength(0)
  })
})
