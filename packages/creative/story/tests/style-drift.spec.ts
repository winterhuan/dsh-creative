import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { measureStyleBaseline, styleFindings } from '../src/core/style.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-style-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(join(directory, '正文'), { recursive: true })
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

describe('style drift', () => {
  it('measures a baseline and blocks a metric that stays over the limit', async context => {
    const directory = await book(context)
    await writeFile(join(directory, '正文/第001章.md'), '他推开门。开门看见灯。\n')
    await writeFile(join(directory, '正文/第002章.md'), '灯还亮着。亮着就好。\n')
    const baseline = measureStyleBaseline(directory, 1, 2, true)
    expect(baseline.applied).toBe(true)
    expect(baseline.style.anadiplosis_per_kilo).toBeGreaterThan(0)
    const saved = JSON.parse(await readFile(join(directory, '设定/写作检查.json'), 'utf8')) as { style: { forbid_blank_lines: boolean } }
    expect(saved.style.forbid_blank_lines).toBe(true)
    await writeFile(join(directory, '设定/写作检查.json'), `${JSON.stringify({
      style: {
        paragraph_median: [1, 80],
        dash_per_kilo: 0,
        anadiplosis_per_kilo: 0,
        metaphor_limit: 0,
        metaphors: ['像铁'],
        forbid_blank_lines: true,
        streak: 3,
      },
    }, null, 2)}\n`)
    const line = '他转身。转身像铁。\n\n下一段还说——走。'
    for (const chapter of [1, 2, 3]) await writeFile(join(directory, '正文', `第00${String(chapter)}章.md`), line)
    expect(styleFindings(directory, 1).find(item => item.metric === 'dash')?.severity).toBe('hint')
    expect(styleFindings(directory, 1).find(item => item.metric === 'blank-lines')?.severity).toBe('blocking')
    const third = styleFindings(directory, 3)
    expect(third.find(item => item.metric === 'dash')?.severity).toBe('blocking')
    expect(third.find(item => item.metric === 'anadiplosis')?.severity).toBe('blocking')
    expect(third.find(item => item.metric === 'metaphor')?.severity).toBe('blocking')
  })
})
