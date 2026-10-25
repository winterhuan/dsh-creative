import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { buildContext } from '../src/core/context.ts'
import { checkPlan, VOLUME_CONTEXT_MAX_BYTES } from '../src/core/plan.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-plan-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(join(directory, '大纲'), { recursive: true })
  await mkdir(join(directory, '设定'), { recursive: true })
  initialize(directory, {
    schema_version: 1, book_title: '样书', last_chapter: 1,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
      long_term_constraints: [], active_character_names: [], continuity_risks: [],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {}, foreshadow: [], timeline_events: [],
  })
  return directory
}

describe('plan check', () => {
  it('requires the next volume and a settled reference near a volume end', async context => {
    const directory = await book(context)
    await writeFile(join(directory, '大纲/卷纲_第一卷.md'), `# 第一卷

- 章节范围：1-40

## 卷契约与终局储备

本卷只写街面。

- 本卷禁碰的终局底牌：总闸

## 剧情单元 开局

- 单元ID：U1
- 章节范围：1-40
- 兑现方式与归属：第一拳归甲
`)
    const early = checkPlan(directory, 20)
    expect(early.ok).toBe(true)
    const alarm = checkPlan(directory, 30)
    expect(alarm.findings.map(item => item.category)).toContain('next-volume')
    await writeFile(join(directory, '大纲/卷纲_第二卷.md'), `# 第二卷

- 章节范围：41-80
`)
    await writeFile(join(directory, '设定/题材定位.md'), `# 题材定位

## 创作参考登记

| 卷 | 主对标 | 状态 |
| --- | --- | --- |
| 第二卷 | 样例书 | 扩卷前核实 |
`)
    const pending = checkPlan(directory, 30)
    expect(pending.findings.map(item => item.category)).toEqual(['reference-status'])
    await writeFile(join(directory, '大纲/卷纲_第三卷.md'), `# 第三卷

- 章节范围：90-100
`)
    const gap = checkPlan(directory, 1)
    expect(gap.findings.some(item => item.category === 'volume-gap')).toBe(true)
    const slice = buildContext(directory, { chapter: 30 })
    expect(slice.volume?.text).toContain('本卷只写街面')
    expect(slice.volume?.text).toContain('总闸')
    expect(Buffer.byteLength(slice.volume?.text ?? '', 'utf8')).toBeLessThanOrEqual(VOLUME_CONTEXT_MAX_BYTES)
  })

  it('hints when the volume range is not labeled at the top and still uses the full span', async context => {
    const directory = await book(context)
    await writeFile(join(directory, '大纲/卷纲_第一卷.md'), `# 第一卷

## 剧情单元 开局

- 章节范围：1-20

## 剧情单元 未标范围

- 单元ID：U2
`)
    const report = checkPlan(directory, 5)
    expect(report.ok).toBe(true)
    expect(report.findings.map(item => item.category)).toEqual(['volume-range', 'unit-range'])
    expect(report.findings.every(item => item.severity === 'hint')).toBe(true)
    const covered = checkPlan(directory, 20)
    expect(covered.findings.filter(item => item.severity === 'blocking').map(item => item.category)).toEqual(['next-volume'])
    expect(covered.findings.filter(item => item.category === 'volume-range' || item.category === 'unit-range').every(item => item.severity === 'hint')).toBe(true)
  })
})
