/** The code-selected writing context: mention scanning and bundle assembly from committed tracking. */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { buildContext, scanMentions } from '../src/core/context.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-context-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '雾港来信')
  await mkdir(directory, { recursive: true })
  initialize(directory, {
    schema_version: 1, book_title: '雾港来信', last_chapter: 2,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房外' },
      long_term_constraints: ['账册不能离开库房'], active_character_names: ['阿澜'], continuity_risks: ['管事是否认出她'],
      recent_chapters: [{ chapter: 2, summary: '发现缺页' }], next_chapter_commitments: ['追查缺页'],
    },
    character_snapshots: {
      阿澜: { identity: '账房学徒', location: '库房', goal: '取回账册', state: '紧张' },
      管事: { identity: '库房管事', location: '门口', goal: '封门', state: '警惕' },
      阿澜娘: { identity: '阿澜的母亲', location: '家中', goal: '等女儿回家', state: '担忧' },
    },
    foreshadow: [
      { id: 'F001', summary: '缺页的账册', planted_chapter: 2, planned_resolution_chapter: 3, status: '已埋', importance: '高' },
      { id: 'F002', summary: '袖口里的钥匙', planted_chapter: 1, planned_resolution_chapter: 9, status: '已埋', importance: '中' },
    ],
    timeline_events: [
      { id: 'E001', story_time: '清晨', objective_fact: '管事奉命封门', reader_knowledge: '门被封了', reveal_status: '部分揭示', reveal_chapter: 1, characters: ['管事'] },
      { id: 'E002', story_time: '前夜', objective_fact: '账册被撕去三页', reader_knowledge: '账册缺页', reveal_status: '未揭示', reveal_chapter: null, characters: ['阿澜娘'] },
    ],
  })
  return directory
}

describe('writing context', () => {
  it('counts mentions longest-name first without double counting', () => {
    expect(scanMentions('阿澜娘让阿澜别去，阿澜还是去了。', ['阿澜', '阿澜娘', '管事'])).toEqual([
      { name: '阿澜娘', count: 1, first_line: 1 },
      { name: '阿澜', count: 2, first_line: 1 },
    ])
    expect(scanMentions('第一行\n管事来了', ['管事'])).toEqual([{ name: '管事', count: 1, first_line: 2 }])
    expect(scanMentions('没有人', [])).toEqual([])
  })

  it('selects active and mentioned characters, due foreshadow and their timeline facts', async (context) => {
    const directory = await book(context)
    const bundle = buildContext(directory, { text: '管事把钥匙收进袖口，说今日的账早已封存。' })
    expect(bundle).toMatchObject({ schema: 'story-context/v1', book_title: '雾港来信', chapter: 3, through_chapter: 2, state_revision: 0 })
    expect(bundle.hot_context).toContain('# 写作连续性上下文 — 雾港来信')
    expect(bundle.mentions).toEqual([{ name: '管事', count: 1, first_line: 1 }])
    expect(bundle.characters.map(item => [item.name, item.selected_by])).toEqual([['阿澜', 'active'], ['管事', 'mention']])
    expect(bundle.due_foreshadow.map(row => row.id)).toEqual(['F001'])
    expect(bundle.timeline.map(row => row.id)).toEqual(['E001'])
    expect(bundle.omitted).toEqual({ characters: 0, due_foreshadow: 0, timeline: 0 })
    const later = buildContext(directory, { chapter: 9 })
    expect(later.due_foreshadow.map(row => row.id)).toEqual(['F001', 'F002'])
    expect(later.characters.map(item => item.name)).toEqual(['阿澜'])
    expect(later.timeline).toEqual([])
  })
})
