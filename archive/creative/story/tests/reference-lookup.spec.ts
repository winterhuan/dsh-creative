import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { sampleTrackingInput } from './support/tracking-input.ts'
import { main } from '../src/cli/main.ts'
import { contextFacts, factsPath, loadFacts, recordFacts, recordReferenceFacts, staleFacts } from '../src/core/facts.ts'
import { lookupReference } from '../src/core/reference.ts'
import { extractChapterRules } from '../src/core/rules.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function layout(context: TestContext): Promise<{ root: string; book: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-ref-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const book = join(root, '样书')
  await mkdir(join(book, '大纲'), { recursive: true })
  await mkdir(join(book, '设定'), { recursive: true })
  await mkdir(join(book, '正文'), { recursive: true })
  await mkdir(join(root, '拆文库/样例书/角色'), { recursive: true })
  await mkdir(join(root, '拆文库/样例书/原文'), { recursive: true })
  await mkdir(join(root, '拆文库/样例书/剧情'), { recursive: true })
  initialize(book, sampleTrackingInput())
  await writeFile(join(book, '设定/题材定位.md'), `# 题材定位

## 对标登记

| 卷 | 主对标 | 状态 |
| --- | --- | --- |
| 第一卷 | 样例书 | 已核 |
`)
  await writeFile(join(root, '拆文库/样例书/角色/铁匠.md'), '# 铁匠\n\n铁匠守着北门。\n')
  await writeFile(join(root, '拆文库/样例书/原文/第001章.md'), '只有原文里有暗语青梧。\n')
  await writeFile(join(root, '拆文库/样例书/剧情/_章节摘要汇总.md'), '汇总里有暗语青梧。\n')
  await writeFile(join(root, '拆文库/样例书/剧情/剧情单元_开局.md'), '# 开局\n\n北门换岗。\n')
  await writeFile(join(book, '大纲/卷纲_第一卷.md'), `# 第一卷

## 剧情单元 开局

- 单元ID：U1
- 章节范围：第1章-第10章
- 兑现方式与归属：第一拳归甲

## 原著事实校正与改编边界

1. 铁匠在第1章只守门。

## 第一卷写作口径

1. 北门的钥匙在第1章归甲。
`)
  await writeFile(join(book, '大纲/细纲_第001章.md'), '- 爽点：无\n铁匠在北门。\n')
  await writeFile(join(book, '正文/第001章.md'), '甲看见铁匠。\n')
  return { root, book }
}

describe('reference lookup', () => {
  it('reads the analysis library and skips source text and rollups', async context => {
    const { root, book } = await layout(context)
    const hit = lookupReference(root, book, '铁匠')
    expect(hit.source).toBe('reference')
    expect(hit.items.every(item => item.source === 'reference')).toBe(true)
    expect(hit.items.some(item => item.path.includes('角色/铁匠.md'))).toBe(true)
    const skipped = lookupReference(root, book, '暗语青梧')
    expect(skipped.items).toEqual([])
    const rules = extractChapterRules(book, 1)
    expect(rules.rules.map(rule => rule.id)).toEqual(expect.arrayContaining(['CANON-1', 'OWN-1', 'OWN-U1']))
    expect(existsSync(factsPath(book))).toBe(false)
  })

  it('records a reference hit only when asked and marks it stale when the file changes', async context => {
    const { root, book } = await layout(context)
    const hit = lookupReference(root, book, '铁匠')
    expect(hit.title).toBe('样例书')
    const recorded = recordReferenceFacts(book, hit.items, `拆文库/${hit.title ?? ''}/`)
    expect(recorded.recorded).toBeGreaterThan(0)
    const ledger = loadFacts(book)
    const row = ledger.entries.find(entry => entry.kind === '对标')
    expect(row?.source.origin).toBe('reference')
    expect(row?.source.reference_path).toContain('角色/铁匠.md')
    expect(row?.source.chapter).toBe(0)
    expect(ledger.covered_chapters).toEqual([])
    const skipped = recordFacts(book, 1, {
      entries: [{
        id: 'REF-manual', kind: '对标', subject: '铁匠', origin: 'reference',
        reference_path: '拆文库/样例书/角色/铁匠.md', attrs: { 摘录: '守门' }, reason: '不该自动入账',
      }],
    })
    expect(skipped.skipped_reference).toBe(1)
    expect(skipped.added).toBe(0)
    expect(loadFacts(book).entries.some(entry => entry.id === 'REF-manual')).toBe(false)
    expect(contextFacts(book, { chapter: 1, text: '铁匠守着北门', activeNames: [] }).items).toEqual([])
    await writeFile(join(root, '拆文库/样例书/角色/铁匠.md'), '# 铁匠\n\n铁匠离开了北门。\n')
    expect(staleFacts(book).stale.map(item => item.id)).toEqual(expect.arrayContaining([...recorded.ids]))

    let out = ''
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      const quiet = await main(['project', 'lookup', '--workspace', root, '--book', '样书', '--text', '铁匠', '--reference'])
      expect(quiet).toBe(0)
      expect(JSON.parse(out)).not.toHaveProperty('reference_recorded')
      out = ''
      const stored = await main(['project', 'lookup', '--workspace', root, '--book', '样书', '--text', '铁匠', '--reference', '--record'])
      expect(stored).toBe(0)
      const value = JSON.parse(out) as { reference_recorded?: { recorded: number } }
      expect(value.reference_recorded?.recorded).toBeGreaterThan(0)
      out = ''
      const refused = await main(['project', 'lookup', '--workspace', root, '--book', '样书', '--text', '铁匠', '--record'])
      expect(refused).toBe(2)
      expect(JSON.parse(out)).toMatchObject({ ok: false, message: expect.stringContaining('lookup --record requires --reference') })
    } finally {
      process.stdout.write = write
    }
  })
})
