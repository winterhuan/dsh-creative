import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { main } from '../src/cli/main.ts'
import { projectCheckReport } from '../src/core/project-check.ts'
import { initialize } from '../src/core/tracking/store.ts'

async function book(context: TestContext, lastChapter = 1): Promise<{ root: string; directory: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-check-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(join(directory, '设定'), { recursive: true })
  initialize(directory, {
    schema_version: 1, book_title: '样书', last_chapter: lastChapter,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '街' },
      long_term_constraints: [], active_character_names: [], continuity_risks: [],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {}, foreshadow: [], timeline_events: [],
  })
  return { root, directory }
}

describe('project check facts gap', () => {
  it('keeps the two progress fields and lists committed chapters when the ledger file is absent', async context => {
    const { root, directory } = await book(context)
    const statePath = join(directory, '追踪/_tracking-state.json')
    const state = JSON.parse(await (await import('node:fs/promises')).readFile(statePath, 'utf8')) as {
      wordcount_records: Record<string, unknown>
    }
    state.wordcount_records['1'] = {
      metric: 'visible_chars_v1', target: 4, actual: 4, status: 'internal_pass', resolution: 'within_user_band',
      body_sha256: 'ab'.repeat(32),
    }
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
    const report = projectCheckReport(directory)
    expect(report.last_committed_chapter).toBe(1)
    expect(report.state_revision).toBe(0)
    expect(report.facts).toEqual({
      present: false, covered_chapters: [], missing_chapters: [1], stale_count: 0, stale: [],
    })
    let out = ''
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      expect(await main(['project', 'check', '--workspace', root, '--book', '样书'])).toBe(0)
    } finally {
      process.stdout.write = write
    }
    expect(JSON.parse(out)).toMatchObject({ schema: 'story-project-check/v1', last_committed_chapter: 1, state_revision: 0 })
  })

  it('summarizes a stale ledger row and a covered gap', async context => {
    const { directory } = await book(context, 2)
    await mkdir(join(directory, '正文'), { recursive: true })
    await writeFile(join(directory, '正文/第001章.md'), '街上空无一人。')
    const statePath = join(directory, '追踪/_tracking-state.json')
    const { readFile } = await import('node:fs/promises')
    const state = JSON.parse(await readFile(statePath, 'utf8')) as { wordcount_records: Record<string, unknown> }
    state.wordcount_records['1'] = {
      metric: 'visible_chars_v1', target: 6, actual: 6, status: 'internal_pass', resolution: 'within_user_band',
      body_sha256: 'cd'.repeat(32),
    }
    state.wordcount_records['2'] = {
      metric: 'visible_chars_v1', target: 2, actual: 2, status: 'internal_pass', resolution: 'within_user_band',
      body_sha256: 'ef'.repeat(32),
    }
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`)
    await writeFile(join(directory, '追踪/事实账本.json'), JSON.stringify({
      schema: 'story-facts/v1',
      covered_chapters: [1],
      entries: [{
        id: 'VENUE-街', kind: '场地', subject: '街', attrs: { 地面: '石板' }, since: 1,
        source: { chapter: 1, body_sha256: '11'.repeat(32) },
        changes: [],
      }],
    }))
    const report = projectCheckReport(directory)
    expect(report.facts.present).toBe(true)
    expect(report.facts.covered_chapters).toEqual([1])
    expect(report.facts.missing_chapters).toEqual([2])
    expect(report.facts.stale_count).toBe(1)
    expect(report.facts.stale).toEqual([{ id: 'VENUE-街', chapter: 1 }])
  })

  it('reports a ledger error without dropping the progress fields', async context => {
    const { directory } = await book(context)
    await writeFile(join(directory, '追踪/事实账本.json'), '{"schema":"nope"}')
    const report = projectCheckReport(directory)
    expect(report).toMatchObject({ last_committed_chapter: 1, state_revision: 0 })
    expect(report.facts.error).toEqual(expect.any(String))
    expect(report.facts.stale).toEqual([])
  })
})
