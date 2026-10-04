import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = await readFile(new URL('../knowledge/story/workflows/analyze-batch.js', import.meta.url), 'utf8')

const summaryPath = (chapter: number) => `/library/章节/第${String(chapter).padStart(3, '0')}章_摘要.md`
const point = (title: string) => ({
  title, type: '信息揭示', event: `${title}改变了局面。`, tone: '紧张', locator: `${title}原句`,
})
function card(chapter: number, title: string, summaryChar: string) {
  return {
    chapter,
    title,
    summary: summaryChar.repeat(120),
    key_events: [`${title}开场`, `${title}冲突`, `${title}结果`],
    characters: [{ name: '许七安', importance: 'major' }],
    turning_points: [point(`${title}甲`), point(`${title}乙`), point(`${title}丙`)],
  }
}
const chapter = (number: number, title: string, extra: Record<string, unknown> = {}) => ({
  chapter: number, title, start_line: number * 100, end_line: number * 100 + 40, ...extra,
})
const baseArgs = {
  resource_base: '/resources/story',
  source: '/library/原文/原文.txt',
  output_dir: '/library',
  chapters: [chapter(1, '衙门'), chapter(2, '夜谈')],
}

function run(replies: Record<string, unknown>, overrides: Record<string, unknown> = {}, throwOn = '') {
  const calls: { prompt: string; label: string; schema: object }[] = []
  const phases: string[] = []
  let parallelFns: Array<() => Promise<unknown>> | undefined
  const result = runInNewContext(`(async () => {${script}\n})()`, {
    args: { ...baseArgs, ...overrides },
    agent: async (prompt: string, options: { label: string; schema: object }) => {
      calls.push({ prompt, ...options })
      if (throwOn === options.label) throw new Error(`boom ${options.label}`)
      if (!Object.prototype.hasOwnProperty.call(replies, options.label)) throw new Error(`Unexpected ${options.label}`)
      return replies[options.label]
    },
    phase: (name: string) => phases.push(name),
    parallel: async (fns: Array<() => Promise<unknown>>) => {
      parallelFns = fns
      const out = []
      for (const fn of fns) out.push(await fn())
      return out
    },
  }) as Promise<Record<string, unknown>>
  return { result, calls, phases, parallelFns: () => parallelFns }
}

const written = (number: number, bytes = 480) => ({ written: summaryPath(number), bytes })

describe('native analyze-batch template', () => {
  it('writes one chapter from its own card when another extract returns null', async () => {
    const second = card(2, '夜谈', '乙')
    const { result, calls, parallelFns } = run({
      'Extract 1': null,
      'Extract 2': second,
      'Write 2': written(2),
    })
    expect(await result).toMatchObject({
      written: [{ chapter: 2, path: summaryPath(2), bytes: 480 }],
      failed: [{ chapter: 1, path: summaryPath(1), reason: 'extract returned no structured result' }],
      skipped: [],
    })
    expect(parallelFns()?.every(fn => fn.length === 0)).toBe(true)
    expect(calls.map(call => call.label)).toEqual(['Extract 1', 'Extract 2', 'Write 2'])
    const writer = calls[2]!
    expect(writer.prompt).toContain(summaryPath(2))
    expect(writer.prompt).toContain(JSON.stringify(second))
    expect(writer.prompt).not.toContain(summaryPath(1))
    expect(writer.prompt).not.toContain('甲'.repeat(20))
  })

  it('keeps each writer prompt to that chapter path and card', async () => {
    const first = card(1, '衙门', '甲')
    const second = card(2, '夜谈', '乙')
    const { result, calls } = run({
      'Extract 1': first,
      'Write 1': written(1, 300),
      'Extract 2': second,
      'Write 2': written(2, 360),
    })
    expect(await result).toMatchObject({
      written: [
        { chapter: 1, path: summaryPath(1), bytes: 300 },
        { chapter: 2, path: summaryPath(2), bytes: 360 },
      ],
      failed: [],
    })
    const write1 = calls.find(call => call.label === 'Write 1')!
    const write2 = calls.find(call => call.label === 'Write 2')!
    expect(write1.prompt).toContain(summaryPath(1))
    expect(write1.prompt).toContain(JSON.stringify(first))
    expect(write1.prompt).not.toContain(summaryPath(2))
    expect(write1.prompt).not.toContain(second.summary)
    expect(write2.prompt).toContain(summaryPath(2))
    expect(write2.prompt).toContain(JSON.stringify(second))
    expect(write2.prompt).not.toContain(summaryPath(1))
    expect(write2.prompt).not.toContain(first.summary)
  })

  it('fails only the chapter whose writer returns 0 bytes or the wrong path', async () => {
    const first = card(1, '衙门', '甲')
    const second = card(2, '夜谈', '乙')
    const zero = run({
      'Extract 1': first,
      'Write 1': { written: summaryPath(1), bytes: 0 },
      'Extract 2': second,
      'Write 2': written(2),
    })
    expect(await zero.result).toMatchObject({
      written: [{ chapter: 2 }],
      failed: [{ chapter: 1, reason: 'writer returned 0 bytes' }],
    })
    const mismatch = run({
      'Extract 1': first,
      'Write 1': { written: '/library/章节/其他.md', bytes: 20 },
      'Extract 2': second,
      'Write 2': written(2),
    })
    expect(await mismatch.result).toMatchObject({
      written: [{ chapter: 2, path: summaryPath(2) }],
      failed: [{ chapter: 1, reason: 'writer path mismatch' }],
    })
    const missing = run({
      'Extract 1': first,
      'Write 1': null,
      'Extract 2': second,
      'Write 2': written(2),
    })
    expect(await missing.result).toMatchObject({
      written: [{ chapter: 2 }],
      failed: [{ chapter: 1, reason: 'writer returned no structured result' }],
    })
  })

  it('rejects more than four chapters or a missing line range before any child starts', async () => {
    const tooMany = run({}, {
      chapters: [1, 2, 3, 4, 5].map(number => chapter(number, `第${number}章`)),
    })
    await expect(tooMany.result).rejects.toThrow('4')
    expect(tooMany.calls).toHaveLength(0)
    expect(tooMany.parallelFns()).toBeUndefined()

    const missingLine = run({}, {
      chapters: [{ chapter: 1, title: '衙门', start_line: 10 }],
    })
    await expect(missingLine.result).rejects.toThrow('start_line and end_line')
    expect(missingLine.calls).toHaveLength(0)
  })

  it('does not write an existing chapter unless replace lists it', async () => {
    const second = card(2, '夜谈', '乙')
    const { result, calls } = run({
      'Extract 2': second,
      'Write 2': written(2),
    }, { existing: [1, 2], replace: [2] })
    expect(await result).toMatchObject({
      written: [{ chapter: 2, path: summaryPath(2) }],
      failed: [],
      skipped: [{ chapter: 1, path: summaryPath(1) }],
    })
    expect(calls.map(call => call.label)).toEqual(['Extract 2', 'Write 2'])
    expect(calls[1]!.prompt).toContain(summaryPath(2))
    expect(calls[1]!.prompt).toContain('replace')
    expect(calls.some(call => call.prompt.includes(summaryPath(1)))).toBe(false)
  })

  it('does not write a chapter that was not passed in the batch', async () => {
    const second = card(2, '夜谈', '乙')
    const { result, calls } = run({
      'Extract 2': second,
      'Write 2': written(2),
    }, {
      chapters: [chapter(2, '夜谈')],
      existing: [1, 2],
      replace: [1, 2],
    })
    expect(await result).toMatchObject({ written: [{ chapter: 2 }] })
    expect(calls.map(call => call.label)).toEqual(['Extract 2', 'Write 2'])
    expect(calls.some(call => call.prompt.includes(summaryPath(1)))).toBe(false)
  })

  it('fails only the chapter whose extract throws or whose card is invalid', async () => {
    const second = card(2, '夜谈', '乙')
    const thrown = run({
      'Extract 2': second,
      'Write 2': written(2),
    }, {}, 'Extract 1')
    expect(await thrown.result).toMatchObject({
      written: [{ chapter: 2 }],
      failed: [{ chapter: 1, reason: 'boom Extract 1' }],
    })
    expect(thrown.calls.map(call => call.label)).toEqual(['Extract 1', 'Extract 2', 'Write 2'])

    const invalid = run({
      'Extract 1': { ...card(1, '衙门', '甲'), summary: '太短' },
      'Extract 2': second,
      'Write 2': written(2),
    })
    expect(await invalid.result).toMatchObject({
      written: [{ chapter: 2 }],
      failed: [{ chapter: 1, reason: 'summary must be 100 to 300 characters' }],
    })
    expect(invalid.calls.map(call => call.label)).not.toContain('Write 1')
  })

  it('rejects a relative path before any child starts', async () => {
    const { result, calls } = run({}, { source: '原文.txt' })
    await expect(result).rejects.toThrow('absolute path')
    expect(calls).toHaveLength(0)
  })
})
