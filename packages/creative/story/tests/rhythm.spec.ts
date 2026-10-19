import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { extractChapterRules } from '../src/core/rules.ts'
import { checkRhythm, DEFAULT_RHYTHM } from '../src/core/rhythm.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-rhythm-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(join(directory, '大纲'), { recursive: true })
  await mkdir(join(directory, '设定'), { recursive: true })
  await mkdir(join(directory, '正文'), { recursive: true })
  initialize(directory, {
    schema_version: 1, book_title: '样书', last_chapter: 1,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
      long_term_constraints: [], active_character_names: [], continuity_risks: [],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {}, foreshadow: [], timeline_events: [],
  })
  await writeFile(join(directory, '设定/题材定位.md'), `# 题材定位

## 卖点承诺

| 承诺 | 首次 | 兑现 | 间隔 | 触达 |
| --- | --- | --- | --- | --- |
| 残卷 | 1 | 41 | 8 | 问种、征兆 |
`)
  await writeFile(join(directory, '大纲/卷纲_第一卷.md'), `# 第一卷

## 情绪弧线

| 章 | 强度 |
| --- | --- |
| 1 | 8 |
| 12 | 9 |
`)
  return directory
}

describe('rhythm', () => {
  it('uses the long-form defaults and reports payoff, promise, peak and position gaps', async context => {
    const directory = await book(context)
    for (const chapter of [1, 2, 3]) {
      await writeFile(join(directory, '大纲', `细纲_第00${String(chapter)}章.md`), `- 爽点：无\n- 章节定位：铺垫\n`)
    }
    const report = checkRhythm(directory, 1, 12)
    expect(report.source).toBe(DEFAULT_RHYTHM.source)
    expect(report.findings.some(item => item.category === 'no-payoff' && item.chapter === 2)).toBe(true)
    expect(report.findings.some(item => item.category === 'same-position')).toBe(true)
    expect(report.findings.some(item => item.category === 'peak-gap')).toBe(true)
    expect(report.findings.some(item => item.category === 'promise')).toBe(true)
    expect(report.ok).toBe(false)
    await writeFile(join(directory, '设定/写作检查.json'), JSON.stringify({ rhythm: { max_no_payoff: 3, max_peak_gap: 20, max_same_position: 5 } }))
    const widened = checkRhythm(directory, 1, 3)
    expect(widened.findings.some(item => item.category === 'no-payoff')).toBe(false)
  })

  it('turns the payoff field into OUT-NNN-PAY', async context => {
    const directory = await book(context)
    await writeFile(join(directory, '大纲/细纲_第001章.md'), '- 爽点：打开库门\n')
    await writeFile(join(directory, '正文/第001章.md'), '他打开库门。\n')
    const rules = extractChapterRules(directory, 1)
    expect(rules.rules.map(rule => rule.id)).toContain('OUT-001-PAY')
  })
})
