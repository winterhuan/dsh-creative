import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'

const cli = resolve(import.meta.dirname, '../src/cli.ts')
type Chapter = { chapter: number; title: string; start_line: number; end_line: number; exists?: boolean; path?: string }
type Inspection = { source: string; source_sha256: string; source_version: string[]; chapters: Chapter[]; replace: number[] }
type Result = { written: { chapter: number; path: string; bytes: number }[]; failed: { chapter: number; reason: string }[]; skipped: { chapter: number }[] }
const chapters: Chapter[] = [
  { chapter: 1, title: '归家', start_line: 1, end_line: 3 },
  { chapter: 2, title: '夜谈', start_line: 4, end_line: 6 },
]
const card = (number: number) => ({
  chapter: number, title: chapters[number - 1]!.title, summary: '甲'.repeat(120),
  key_events: ['主角回家'], characters: [{ name: '主角', importance: 'major' }],
  turning_points: [{ title: '回家', type: '行动', event: '主角推门而入。', tone: '轻松', locator: number === 1 ? 'L2' : '灯下夜谈。' }],
})

async function fixture(test: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'story-analysis-cli-'))
  test.onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const workspace = join(directory, 'workspace')
  await mkdir(workspace)
  const source = join(directory, '原文.txt')
  await writeFile(source, '第一章\n主角回家。\n门合上。\n第二章\n灯下夜谈。\n话音落下。\n')
  let sequence = 0
  async function run(action: string, document: object, extra: string[] = []) {
    const input = join(directory, `input-${sequence++}.json`)
    await writeFile(input, JSON.stringify(document))
    const processResult = await execa(process.execPath, ['--import', 'tsx', cli, 'analysis', action,
      '--workspace', workspace, '--title', '参考书', '--source', source, '--input', input, '--json', ...extra],
    { reject: false, cancelSignal: test.signal })
    expect(processResult.signal).toBeUndefined()
    expect(processResult.timedOut).toBe(false)
    return { status: processResult.exitCode, value: JSON.parse(processResult.stdout), stderr: processResult.stderr }
  }
  async function inspect() {
    const result = await run('inspect', { chapters })
    expect(result.status, result.stderr).toBe(0)
    return result.value as Inspection
  }
  return { directory, workspace, source, run, inspect, output: join(workspace, '拆文库/参考书/章节') }
}

describe('analysis cards through the packaged CLI dispatcher', () => {
  it('inspects real boundaries and source identity without creating library files', async test => {
    const fixtureData = await fixture(test)
    const inspected = await fixtureData.inspect()
    expect(inspected.source_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(inspected.source_version).toHaveLength(5)
    expect(inspected.source_version.every(item => /^\d+$/.test(item))).toBe(true)
    expect(inspected.chapters.map(item => item.exists)).toEqual([false, false])
    expect(await readdir(fixtureData.workspace)).toEqual([])
  })

  it('uses native read line boundaries for CRLF and embedded Unicode separators', async test => {
    const { source, run } = await fixture(test)
    await writeFile(source, '第一章\u2028继续。\r\n主角回家。\r\n')
    const valid = await run('inspect', { chapters: [{ ...chapters[0], end_line: 2 }] })
    expect(valid.status).toBe(0)
    expect((await run('inspect', { chapters: [{ ...chapters[0], end_line: 3 }] })).status).not.toBe(0)
  })

  it('writes sparse cards deterministically and reports actual bytes', async test => {
    const { inspect, run } = await fixture(test)
    const inspected = await inspect()
    const first = card(1)
    const second = { ...card(2), key_events: [], turning_points: [], characters: [] }
    const response = await run('write-cards', { ...inspected, cards: [first, second] })
    expect(response.status, response.stderr).toBe(0)
    const result = response.value as Result
    expect(result.failed).toEqual([])
    expect(result.skipped).toEqual([])
    expect(result.written.map(item => item.chapter)).toEqual([1, 2])
    for (const item of result.written) {
      const bytes = await readFile(item.path)
      expect(bytes.length).toBe(item.bytes)
      expect(bytes.toString()).toContain(`## 第${item.chapter}章 ${chapters[item.chapter - 1]!.title}`)
    }
    expect(await readFile(result.written[1]!.path, 'utf8')).toContain('无转折锚点。')
  })

  it('isolates an invalid locator and a failed extraction from valid chapter writes', async test => {
    const { inspect, run } = await fixture(test)
    const inspected = await inspect()
    const invalid = { ...card(1), turning_points: [{ ...card(1).turning_points[0], locator: 'L5' }] }
    const response = await run('write-cards', { ...inspected, cards: [invalid, card(2)] })
    expect(response.status).toBe(1)
    expect(response.value).toMatchObject({ written: [{ chapter: 2 }], failed: [{ chapter: 1, reason: expect.stringContaining('locator') }] })
    const failed = await run('write-cards', { ...inspected, cards: [], failed: [{ chapter: 1, reason: 'extract returned no result' }] })
    expect(failed.status).toBe(1)
    expect(failed.value).toMatchObject({ written: [], skipped: [{ chapter: 2 }], failed: [{ chapter: 1, reason: 'extract returned no result' }] })
  })

  it('preserves an output created after inspection and replaces only explicitly selected chapters', async test => {
    const { inspect, run, output } = await fixture(test)
    const inspected = await inspect()
    await mkdir(output, { recursive: true })
    const firstPath = join(output, '第001章_摘要.md')
    await writeFile(firstPath, '作者修订版')
    const preserved = await run('write-cards', { ...inspected, cards: [card(1), card(2)] })
    expect(preserved.status).toBe(0)
    expect(preserved.value).toMatchObject({ written: [{ chapter: 2 }], skipped: [{ chapter: 1 }] })
    expect(await readFile(firstPath, 'utf8')).toBe('作者修订版')
    const replaced = await run('write-cards', { ...inspected, replace: [1], cards: [card(1)] })
    expect(replaced.status).toBe(0)
    expect(replaced.value).toMatchObject({ written: [{ chapter: 1 }], skipped: [{ chapter: 2 }] })
    expect(await readFile(firstPath, 'utf8')).toContain('## 第1章 归家')
  })

  it.for(['changed bytes', 'replaced identity'])('rejects %s before any card is published', async (change, test) => {
    const { inspect, run, source, workspace, directory } = await fixture(test)
    const inspected = await inspect()
    if (change === 'changed bytes') await writeFile(source, (await readFile(source, 'utf8')).replace('回家', '离家'))
    else {
      const replacement = join(directory, 'replacement.txt')
      await writeFile(replacement, await readFile(source))
      await rename(replacement, source)
    }
    const result = await run('write-cards', { ...inspected, cards: [card(1), card(2)] })
    expect(result.status).not.toBe(0)
    expect(JSON.stringify(result.value)).toContain('source identity')
    expect(await readdir(workspace)).toEqual([])
  })

  it('rejects out-of-source and overlapping ranges and cards outside the batch', async test => {
    const { run, inspect, workspace } = await fixture(test)
    for (const document of [
      { chapters: [{ ...chapters[0], end_line: 7 }] },
      { chapters: [chapters[0], { ...chapters[1], start_line: 3 }] },
      { chapters, replace: [3] },
    ]) expect((await run('inspect', document)).status).not.toBe(0)
    const inspected = await inspect()
    expect((await run('write-cards', { ...inspected, cards: [{ ...card(1), chapter: 3 }] })).status).not.toBe(0)
    expect(await readdir(workspace)).toEqual([])
  })

  it('publishes at most one result per chapter when independent CLI processes overlap', async test => {
    const { inspect, run, output } = await fixture(test)
    const inspected = await inspect()
    const input = { ...inspected, cards: [card(1), card(2)] }
    const results = await Promise.all([run('write-cards', input), run('write-cards', input)])
    expect(results.map(result => result.status)).toEqual([0, 0])
    const written = results.flatMap(result => (result.value as Result).written)
    expect(written.map(item => item.chapter).sort()).toEqual([1, 2])
    expect(results.flatMap(result => (result.value as Result).skipped)).toHaveLength(2)
    expect(await readdir(output)).toEqual(['第001章_摘要.md', '第002章_摘要.md'])
  })
})
