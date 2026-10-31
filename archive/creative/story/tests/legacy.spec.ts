import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { archiveReaderValue, retireContextItem } from '../src/core/legacy.ts'
import { checkProject, initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-legacy-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(directory, { recursive: true })
  initialize(directory, {
    schema_version: 1, book_title: '样书', last_chapter: 1,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
      long_term_constraints: ['旧港风险'], active_character_names: [], continuity_risks: ['作废的省港风险'],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {}, foreshadow: [], timeline_events: [],
  })
  return directory
}

describe('revision maintenance', () => {
  it('archives reader-value rows and retires one context item', async context => {
    const directory = await book(context)
    const statePath = join(directory, '追踪/_tracking-state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8')) as { reader_value_records?: unknown }
    state.reader_value_records = { '1': { body_sha256: 'a'.repeat(64) } }
    await writeFile(statePath, JSON.stringify(state))
    const archived = archiveReaderValue(directory)
    expect(archived.archived).toBe(1)
    expect(archived.state_revision).toBe(1)
    const moved = JSON.parse(await readFile(join(directory, '追踪/_legacy/reader_value_records.json'), 'utf8')) as { schema: string }
    expect(moved.schema).toBe('story-reader-value-legacy/v1')
    const current = JSON.parse(await readFile(statePath, 'utf8')) as { reader_value_records?: unknown }
    expect(current.reader_value_records).toBeUndefined()
    const retired = retireContextItem(directory, '作废的省港风险', '作者确认作废')
    expect(retired.removed).toEqual(['continuity_risks'])
    expect(retired.state_revision).toBe(2)
    const log = await readFile(join(directory, '追踪/维护记录.md'), 'utf8')
    expect(log).toContain('作废的省港风险')
    expect(checkProject(directory).state_revision).toBe(2)
    expect(() => archiveReaderValue(directory)).not.toThrow()
  })
})
