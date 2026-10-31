import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { sampleTrackingInput } from './support/tracking-input.ts'
import { main } from '../src/cli/main.ts'
import { projectGates } from '../src/core/gates.ts'
import { migrateWritingGates } from '../src/core/writing-check.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<{ root: string; directory: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-gates-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(join(directory, '设定'), { recursive: true })
  initialize(directory, sampleTrackingInput())
  return { root, directory }
}

describe('project gates', () => {
  it('reports missing gates as required and echoes a configured style streak', async context => {
    const { root, directory } = await book(context)
    const absent = projectGates(directory)
    expect(absent).toMatchObject({
      schema: 'story-project-gates/v1',
      rule_audit: 'required', facts_diff: 'required', style: 'off', streak: null,
      facts_present: false, covered_chapters: [], stale: { present: false, stale_count: 0, missing_chapters: [] },
    })
    await writeFile(join(directory, '设定/写作检查.json'), JSON.stringify({
      style: { streak: 4, paragraph_median: [20, 80] },
    }))
    const active = projectGates(directory)
    expect(active.style).toBe('active')
    expect(active.streak).toBe(4)
    expect(active.rule_audit).toBe('required')
    expect(active.facts_diff).toBe('required')
    let out = ''
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      const code = await main(['project', 'gates', '--workspace', root, '--book', '样书'])
      expect(code).toBe(0)
    } finally {
      process.stdout.write = write
    }
    const echoed = JSON.parse(out) as { rule_audit: string; facts_diff: string; style: string }
    expect(echoed.rule_audit).toBe('required')
    expect(echoed.facts_diff).toBe('required')
    expect(echoed.style).toBe('active')
    await writeFile(join(directory, '设定/写作检查.json'), JSON.stringify({ rule_audit: 'off', style: { streak: 4 } }))
    const explicit = projectGates(directory)
    expect(explicit.rule_audit).toBe('off')
    expect(explicit.facts_diff).toBe('required')
    const stamped = migrateWritingGates(directory, true)
    expect(stamped).toMatchObject({ created: false, rule_audit: 'off', facts_diff: 'off' })
    const legacy = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(join(directory, '设定/写作检查.json'), 'utf8'))) as { style: { streak: number } }
    expect(legacy.style.streak).toBe(4)
  })
})