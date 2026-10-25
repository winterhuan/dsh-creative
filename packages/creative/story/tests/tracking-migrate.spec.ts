import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { main } from '../src/cli/main.ts'
import { loadFacts, recordFacts } from '../src/core/facts.ts'
import { normalizeState } from '../src/core/tracking/schema.ts'
import { checkProject, initialize, loadState, migrateTracking } from '../src/core/tracking/store.ts'

async function book(context: TestContext): Promise<{ root: string; directory: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-migrate-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
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
  return { root, directory }
}

describe('tracking schema 6', () => {
  it('keeps a schema 5 file byte-for-byte until migrate, then downgrades without the ledger', async context => {
    const { root, directory } = await book(context)
    const statePath = join(directory, '追踪/_tracking-state.json')
    const created = JSON.parse(await readFile(statePath, 'utf8')) as { schema_version: number; facts: { entry_count: number }; state_revision: number }
    expect(created.schema_version).toBe(6)
    expect(created.facts).toEqual({ ledger_path: '追踪/事实账本.json', ledger_schema: 'story-facts/v1', covered_chapters: [], entry_count: 0 })
    expect(await readFile(join(directory, '追踪/上下文.md'), 'utf8')).not.toContain('事实账本')

    const legacy = { ...created }
    delete (legacy as { facts?: unknown }).facts
    legacy.schema_version = 5
    await writeFile(statePath, `${JSON.stringify(legacy, null, 2)}\n`)
    const before = await readFile(statePath)
    const loaded = loadState(directory)
    expect(loaded.schema_version).toBe(6)
    expect(loaded.facts.entry_count).toBe(0)
    expect(await readFile(statePath)).toEqual(before)
    expect(() => normalizeState({ ...legacy, schema_version: 3 })).toThrow('unsupported')
    const withoutFacts = { ...created, schema_version: 6 }
    delete (withoutFacts as { facts?: unknown }).facts
    expect(() => normalizeState(withoutFacts)).toThrow('requires facts')

    await writeFile(join(directory, '正文/第001章.md'), '铁板。')
    const state = JSON.parse(await readFile(statePath, 'utf8')) as { wordcount_records: Record<string, unknown> }
    state.wordcount_records['1'] = {
      metric: 'visible_chars_v1', target: 3, actual: 3, status: 'internal_pass',
      resolution: 'within_user_band', body_sha256: 'ab'.repeat(32),
    }
    await writeFile(statePath, JSON.stringify(state))
    await writeFile(join(directory, '正文/第001章.md'), 'x')
    // The body hash above is intentionally not the file hash; record after fixing the hash.
    const text = '铁板。'
    const { createHash } = await import('node:crypto')
    const hash = createHash('sha256').update(text).digest('hex')
    await writeFile(join(directory, '正文/第001章.md'), text)
    state.wordcount_records['1'] = {
      metric: 'visible_chars_v1', target: 3, actual: 3, status: 'internal_pass',
      resolution: 'within_user_band', body_sha256: hash,
    }
    await writeFile(statePath, JSON.stringify({ ...state, schema_version: 5 }))
    recordFacts(directory, 1, { entries: [{ id: 'VENUE-街', kind: '场地', subject: '街', attrs: { 地面: '石' }, since: 1 }] })
    const ledgerBefore = await readFile(join(directory, '追踪/事实账本.json'))
    const contextBefore = await readFile(join(directory, '追踪/上下文.md'))
    const revision = loadState(directory).state_revision
    const upgraded = migrateTracking(directory)
    expect(upgraded).toMatchObject({ from: 5, to: 6, state_revision: revision, ledger_kept: true })
    const v6 = JSON.parse(await readFile(statePath, 'utf8')) as { schema_version: number; state_revision: number; facts: { entry_count: number; covered_chapters: number[] } }
    expect(v6.schema_version).toBe(6)
    expect(v6.state_revision).toBe(revision)
    expect(v6.facts).toMatchObject({ entry_count: 1, covered_chapters: [1] })
    expect(await readFile(join(directory, '追踪/事实账本.json'))).toEqual(ledgerBefore)
    expect(await readFile(join(directory, '追踪/上下文.md'))).toEqual(contextBefore)
    expect(checkProject(directory).last_committed_chapter).toBe(1)

    const downgraded = migrateTracking(directory, 5)
    expect(downgraded.to).toBe(5)
    const v5 = JSON.parse(await readFile(statePath, 'utf8')) as { schema_version: number; facts?: unknown }
    expect(v5.schema_version).toBe(5)
    expect(v5.facts).toBeUndefined()
    expect(loadFacts(directory).entries).toHaveLength(1)
    expect(await readFile(join(directory, '追踪/事实账本.json'))).toEqual(ledgerBefore)

    await writeFile(join(directory, '追踪/事实账本.json'), '{')
    const broken = migrateTracking(directory, 6)
    expect(broken.from).toBe(5)
    const unreadable = JSON.parse(await readFile(statePath, 'utf8')) as { facts: { unreadable?: true; entry_count: number } }
    expect(unreadable.facts.unreadable).toBe(true)
    expect(unreadable.facts.entry_count).toBe(0)
    expect(readFileSync(join(directory, '追踪/事实账本.json'), 'utf8')).toBe('{')

    let out = ''
    const write = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      out += String(chunk)
      return true
    }) as typeof process.stdout.write
    try {
      const code = await main(['project', 'migrate', '--workspace', root, '--book', '样书', '--to', '5'])
      expect(code).toBe(0)
      expect(JSON.parse(out)).toMatchObject({ to: 5, ledger_kept: true })
    } finally {
      process.stdout.write = write
    }
  })
})
