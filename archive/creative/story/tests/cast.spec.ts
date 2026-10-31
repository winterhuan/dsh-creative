import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { checkCast } from '../src/core/cast.ts'
import { initialize } from '../src/core/tracking/store.ts'

describe('cast check', () => {
  it('reports a missing card, a realm above the cap, and a relationship past the card', async context => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-cast-')))
    context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
    const directory = join(root, '样书')
    await mkdir(join(directory, '设定/角色'), { recursive: true })
    await mkdir(join(directory, '设定/世界观'), { recursive: true })
    await mkdir(join(directory, '正文'), { recursive: true })
    initialize(directory, {
      schema_version: 1, book_title: '样书', last_chapter: 1,
      context: {
        position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
        long_term_constraints: [], active_character_names: [], continuity_risks: [],
        recent_chapters: [], next_chapter_commitments: [],
      },
      character_snapshots: {
        路人: { identity: '看客', location: '街', goal: '看热闹', state: '闲' },
      },
      foreshadow: [],
      timeline_events: [],
    })
    await writeFile(join(directory, '设定/角色/甲.md'), `# 甲

定位：主角
自己的目标：过街
底线或算盘：不先动手
关系阶段：乙＝相识
阶段序：相识、同盟
`)
    await writeFile(join(directory, '设定/世界观/力量体系.md'), `# 力量体系

## 境界

| 境界 | 序号 | 可用手段 | 禁用手段 | 本卷上限 |
| --- | --- | --- | --- | --- |
| 明劲 | 1 | 推掌 | 致命杀招 | 是 |
| 暗劲 | 2 | 内劲 | 致命杀招 | 否 |
`)
    const hash = 'a'.repeat(64)
    await writeFile(join(directory, '追踪/事实账本.json'), JSON.stringify({
      schema: 'story-facts/v1',
      covered_chapters: [],
      entries: [{
        id: 'SKILL-甲-暗劲', kind: '能力', subject: '甲', since: 1, attrs: { 境界: '暗劲', 手段: '致命杀招' },
        source: { chapter: 1, body_sha256: hash }, changes: [],
      }],
    }))
    for (const chapter of [1, 2, 3]) {
      await writeFile(join(directory, '正文', `第00${String(chapter)}章.md`), '路人在街口。乙＝同盟。\n')
    }
    const report = checkCast(directory, { from: 1, to: 3 })
    expect(report.findings.some(item => item.category === 'missing-card' && item.evidence === '路人')).toBe(true)
    expect(report.findings.some(item => item.category === 'appearance' && item.evidence === '路人')).toBe(true)
    expect(report.findings.some(item => item.category === 'realm-cap')).toBe(true)
    expect(report.findings.some(item => item.category === 'forbidden-means')).toBe(true)
    expect(report.findings.some(item => item.category === 'relationship')).toBe(true)
    expect(report.ok).toBe(false)
  })

  it('hints when the outline cast list names someone without a card', async context => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-cast-list-')))
    context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
    const directory = join(root, '样书')
    await mkdir(join(directory, '设定/角色'), { recursive: true })
    await mkdir(join(directory, '大纲'), { recursive: true })
    await writeFile(join(directory, '设定/角色/甲.md'), '# 甲\n\n定位：主角\n别名：阿甲\n')
    await writeFile(join(directory, '大纲/细纲_第001章.md'), '# 细纲\n\n- 出场顺序：甲、账房、阿甲\n')
    const report = checkCast(directory, { from: 1, to: 1 })
    const hints = report.findings.filter(item => item.category === 'outline-cast')
    expect(hints.map(item => item.evidence)).toEqual(['账房'])
    expect(hints.every(item => item.severity === 'hint')).toBe(true)
  })

  it('hints at body names that are missing from cards, aliases, and the outline cast', async context => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-cast-body-')))
    context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
    const directory = join(root, '样书')
    await mkdir(join(directory, '设定/角色'), { recursive: true })
    await mkdir(join(directory, '设定'), { recursive: true })
    await mkdir(join(directory, '大纲'), { recursive: true })
    await mkdir(join(directory, '正文'), { recursive: true })
    await writeFile(join(directory, '设定/角色/甲.md'), '# 甲\n\n定位：主角\n别名：阿甲\n')
    await writeFile(join(directory, '大纲/细纲_第001章.md'), '# 细纲\n\n- 出场顺序：甲、账房\n')
    await writeFile(join(directory, '正文/第001章.md'), '甲说道：「开门。」阿甲看向门口。有人叫账房。铁柱道：「让路。」林姑娘在街口。他知道：门没锁。\n')
    const hinted = checkCast(directory, { from: 1, to: 1 })
    expect(hinted.findings.filter(item => item.category === 'body-name').map(item => item.evidence)).toEqual(['林姑娘', '铁柱'])
    expect(hinted.findings.filter(item => item.category === 'body-name').every(item => item.severity === 'hint')).toBe(true)
    await writeFile(join(directory, '设定/写作检查.json'), JSON.stringify({ cast_body_names: 'off' }))
    expect(checkCast(directory, { from: 1, to: 1 }).findings.some(item => item.category === 'body-name')).toBe(false)
    await writeFile(join(directory, '设定/写作检查.json'), JSON.stringify({ cast_body_names: 'blocking' }))
    const blocking = checkCast(directory, { from: 1, to: 1 })
    expect(blocking.ok).toBe(false)
    expect(blocking.findings.filter(item => item.category === 'body-name').every(item => item.severity === 'blocking')).toBe(true)
  })
})
