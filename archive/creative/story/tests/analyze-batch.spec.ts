import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'

const script = await readFile(new URL('../knowledge/story/skills/story-analyze/workflows/analyze-batch.js', import.meta.url), 'utf8')
const chapter = (number: number, extra: Record<string, unknown> = {}) => ({
  chapter: number, title: `章节${number}`, start_line: number * 10, end_line: number * 10 + 4, ...extra,
})
const card = (number: number) => ({
  chapter: number, title: `章节${number}`, summary: '甲'.repeat(120), key_events: ['主角回家'],
  characters: [{ name: '许七安', importance: 'major' }],
  turning_points: [{ title: '回家', type: '行动', event: '主角回家。', tone: '轻松', locator: `L${number * 10}` }],
})
const baseArgs = {
  skills_root: '/resources/story/skills', cli: '/resources/lib/cli.js', workspace: '/workspace', title: '参考书',
  source: '/library/原文.txt', source_sha256: 'a'.repeat(64), source_version: ['1', '2', '3', '4', '5'],
  chapters: [chapter(1), chapter(2)],
}
function run(replies: Record<string, unknown>, overrides: Record<string, unknown> = {}, throwOn = '') {
  const calls: { prompt: string; label: string; schema: object }[] = []
  const result = runInNewContext(`(async () => {${script}\n})()`, {
    args: { ...baseArgs, ...overrides },
    agent: async (prompt: string, options: { label: string; schema: object }) => {
      assertObjectJsonSchema(options.schema)
      calls.push({ prompt, ...options })
      if (throwOn === options.label) throw new Error(`boom ${options.label}`)
      if (!Object.prototype.hasOwnProperty.call(replies, options.label)) throw new Error(`Unexpected ${options.label}`)
      return replies[options.label]
    },
    phase: () => {},
    parallel: (fns: Array<() => Promise<unknown>>) => Promise.all(fns.map(fn => fn())),
  }) as Promise<Record<string, unknown>>
  return { result, calls }
}

describe('native analyze-batch extraction', () => {
  it('preserves inspected source identity and returns successful cards beside a failed chapter', async () => {
    const second = card(2)
    const { result, calls } = run({ 'Extract 1': null, 'Extract 2': second })
    expect(await result).toMatchObject({
      source: baseArgs.source, source_sha256: baseArgs.source_sha256, source_version: baseArgs.source_version,
      chapters: baseArgs.chapters, cards: [second],
      failed: [{ chapter: 1, reason: 'extract returned no structured result' }], skipped: [],
    })
    expect(await result).not.toHaveProperty('written')
    expect(calls.map(call => call.label)).toEqual(['Extract 1', 'Extract 2'])
    expect(calls[1]!.prompt).toContain('lines 20-24')
    expect(calls[1]!.prompt).not.toContain('lines 10-14')
  })

  it('accepts zero or one real event without starting a formatting agent', async () => {
    const first = { ...card(1), key_events: [], turning_points: [] }
    const second = card(2)
    const { result, calls } = run({ 'Extract 1': first, 'Extract 2': second })
    expect(await result).toMatchObject({ cards: [first, second], failed: [], skipped: [] })
    expect(calls).toHaveLength(2)
    expect(calls[0]!.schema).toMatchObject({ properties: {
      key_events: { type: 'array' }, turning_points: { type: 'array' },
    } })
  })

  it('skips existing cards unless their selected chapter is explicitly replaceable', async () => {
    const { result, calls } = run({ 'Extract 2': card(2) }, {
      chapters: [chapter(1, { exists: true }), chapter(2, { exists: true })], replace: [2],
    })
    expect(await result).toMatchObject({ cards: [card(2)], failed: [], skipped: [{ chapter: 1 }] })
    expect(calls.map(call => call.label)).toEqual(['Extract 2'])
  })

  it('isolates exceptions and invalid cards to their chapter', async () => {
    const thrown = run({ 'Extract 2': card(2) }, {}, 'Extract 1')
    expect(await thrown.result).toMatchObject({ cards: [card(2)], failed: [{ chapter: 1, reason: 'boom Extract 1' }] })
    const invalid = run({ 'Extract 1': { ...card(1), summary: '太短' }, 'Extract 2': card(2) })
    expect(await invalid.result).toMatchObject({ cards: [card(2)], failed: [{ chapter: 1, reason: 'summary must be 100 to 300 characters' }] })
  })

  it.each([
    { chapters: [1, 2, 3, 4, 5].map(number => chapter(number)) },
    { chapters: [{ chapter: 1, title: '衙门', start_line: 10 }] },
    { source: '原文.txt' }, { title: '../book' }, { source_sha256: 'unknown' },
    { source_version: [1, 2, 3, 4, 5] },
  ])('rejects invalid scope before starting children: %j', async overrides => {
    const { result, calls } = run({}, overrides)
    await expect(result).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})
