import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = await readFile(new URL('../knowledge/story/skills/story-write/workflows/revise.js', import.meta.url), 'utf8')
const hash = 'a'.repeat(64)
const other = 'b'.repeat(64)
const args = {
  workspace: '/', book: 'book', skills_root: '/resources/story/skills', cli: '/resources/lib/cli.js',
  chapter: 8, instructions: 'Retire the stale venue line.', approved: true,
}

function run(replies: unknown[], overrides: Record<string, unknown> = {}) {
  const calls: { prompt: string; label: string }[] = []
  const phases: string[] = []
  const result = runInNewContext(`(async () => {${script}\n})()`, {
    args: { ...args, ...overrides },
    agent: async (prompt: string, options: { label: string }) => {
      calls.push({ prompt, label: options.label })
      return replies.shift()
    },
    phase: (name: string) => phases.push(name),
  }) as Promise<Record<string, unknown>>
  return { result, calls, phases }
}

describe('native revise template', () => {
  it('submits a revision after approval and names the fact and retire commands', async () => {
    const { result, calls, phases } = run([
      { status: 'ready', summary: 'Chapter 8 is on the issue list.', issues_path: '草稿/问题单.json' },
      { status: 'ready', summary: 'Rewrite the venue sentence.' },
      { status: 'checked', summary: 'Checked.', body_sha256: hash, outline_sha256: other, state_revision: 4 },
      { schema: 'story-rule-audit/v1', body_sha256: hash, rules_sha256: other, verdicts: [{ rule_id: 'OUT-008-PAY', verdict: 'pass' }] },
      { status: 'committed', summary: 'Revision stored.', body_sha256: hash, outline_sha256: other, state_revision: 5 },
    ])
    expect(await result).toMatchObject({ status: 'committed', state_revision: 5 })
    expect(phases).toEqual(['Locate', 'Plan', 'Rewrite', 'Audit', 'Submit'])
    expect(calls.map(call => call.label)).toEqual(['Locate', 'Plan', 'Rewrite', 'Audit', 'Submit'])
    expect(calls[4]!.prompt).toContain('mode=revision')
    expect(calls[4]!.prompt).toContain('facts stale')
    expect(calls[4]!.prompt).toContain('project context retire')
    expect(calls[4]!.prompt).toContain('project legacy archive')
    expect(calls[2]!.prompt).toContain('chapter check')
  })

  it('stops when the plan still needs approval', async () => {
    const { result, phases } = run([
      { status: 'ready', summary: 'Located.', issues_path: '草稿/问题单.json' },
      { status: 'needs_approval', summary: 'This rewrite changes the ending.' },
    ], { approved: false })
    expect(await result).toMatchObject({ status: 'needs_input' })
    expect(phases).toEqual(['Locate', 'Plan'])
  })
})