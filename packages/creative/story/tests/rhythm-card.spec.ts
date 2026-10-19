import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { writeRhythmCard } from '../src/core/reference.ts'

describe('rhythm card', () => {
  it('writes a card under 2 KiB with a baseline block', async context => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-card-')))
    context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
    const plot = join(root, '拆文库/样例书/剧情')
    await mkdir(plot, { recursive: true })
    await writeFile(join(plot, '剧情单元_开局.md'), `# 开局

- 章节范围：1-15

## 结构分布

三章一个小回合。

## 桥段标签

入局、受阻。

## 核心冲突

门开不开。

## 不该进入卡片的长文

${'赘'.repeat(4000)}
`)
    await writeFile(join(plot, '节奏.md'), `# 节奏

## 节奏基准

- max_no_payoff：1
- min_peak_gap：5
- max_peak_gap：8
`)
    const card = writeRhythmCard(root, '样例书', 1, 15)
    expect(card.bytes).toBeLessThanOrEqual(2048)
    expect(card.baseline).toMatchObject({ max_no_payoff: 1, min_peak_gap: 5, max_peak_gap: 8 })
    const text = await readFile(join(root, card.path), 'utf8')
    expect(text).toContain('结构分布')
    expect(text).toContain('节奏基准')
    expect(text).not.toContain('赘赘赘')
  })
})
