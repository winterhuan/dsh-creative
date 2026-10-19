import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
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
  initialize(book, {
    schema_version: 1, book_title: '样书', last_chapter: 1,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
      long_term_constraints: [], active_character_names: [], continuity_risks: [],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {}, foreshadow: [], timeline_events: [],
  })
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
  })
})
