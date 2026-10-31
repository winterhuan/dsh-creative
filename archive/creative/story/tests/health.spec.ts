/** Health risks: classification, thresholds, empty tracking, and the query byte budget. */
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { assessHealth, type HealthState } from '../src/core/tracking/health.ts'
import { QUERY_MAX_BYTES, projectQuery } from '../src/core/tracking/query.ts'
import { normalizeState } from '../src/core/tracking/schema.ts'
import { jsonPayload } from '../src/core/tracking/store.ts'

const fixture = new URL('./fixtures/continuity-state.json', import.meta.url)

function character(openThreads: readonly string[] = []): HealthState['characters'][string] {
  return { identity: '调查员', state: '健康', open_threads: openThreads }
}

function hook(id: string, fields: Partial<HealthState['foreshadow'][string]> = {}): HealthState['foreshadow'][string] {
  return {
    id, summary: id, planted_chapter: 1, planned_resolution_chapter: 20, status: '已埋', importance: '低', ...fields,
  }
}

function base(overrides: Partial<HealthState> = {}): HealthState {
  return {
    last_committed_chapter: 40,
    context: { active_character_names: ['阿澜'] },
    characters: { 阿澜: character(['钥匙去向']) },
    foreshadow: {},
    timeline: {},
    ...overrides,
  }
}

async function book(context: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-health-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '书')
  await mkdir(join(directory, '追踪'), { recursive: true })
  return directory
}

describe('health classification', () => {
  it('lists the four risks and skips closed, recent, and unstamped facts', async () => {
    const state = normalizeState(JSON.parse(await readFile(fixture, 'utf8')))
    const report = assessHealth(state)
    expect(report.at_chapter).toBe(501)
    expect(report.thresholds).toEqual({ stale_planted: 30, stale_character: 20, stale_thread: 40 })
    expect(report.items.map(item => [item.risk, item.id, item.age, item.source])).toEqual([
      ['overdue-foreshadow', 'F002', 2, '追踪/伏笔.md'],
      ['unscheduled-foreshadow', 'F011', 491, '追踪/伏笔.md'],
    ])
    expect(report.counts).toEqual({ overdue_foreshadow: 1, unscheduled_foreshadow: 1, stale_character: 0, stale_thread: 0 })
    const rich = assessHealth(base({
      foreshadow: {
        F002: hook('F002', { planned_resolution_chapter: 10, importance: '低' }),
        F010: hook('F010', { planned_resolution_chapter: 10, importance: '高' }),
        F003: hook('F003', { planned_resolution_chapter: 41, summary: '本章到期' }),
        F004: hook('F004', { planned_resolution_chapter: null, planted_chapter: 10, importance: '低' }),
        F005: hook('F005', { planned_resolution_chapter: null, planted_chapter: 10, importance: '高' }),
        F006: hook('F006', { planned_resolution_chapter: null, planted_chapter: 30, summary: '刚埋下' }),
        F007: hook('F007', { status: '已回收', planned_resolution_chapter: 5 }),
        F008: hook('F008', { status: '已过期', planned_resolution_chapter: 5 }),
        F009: hook('F009', { status: '放弃', planned_resolution_chapter: 5 }),
      },
      characters: {
        阿澜: character(['钥匙去向']),
        管事: character(['封门']),
        伙计: character(['看门']),
      },
      context: { active_character_names: ['阿澜'] },
      timeline: {
        E001: {
          id: 'E001', objective_fact: '账册缺页', reveal_status: '未揭示', characters: ['管事'],
          first_recorded_chapter: 1, updated_chapter: 10,
        },
        E002: {
          id: 'E002', objective_fact: '船已离港', reveal_status: '部分揭示', characters: ['阿澜'],
          first_recorded_chapter: 1, updated_chapter: 10,
        },
        E003: {
          id: 'E003', objective_fact: '已经说明', reveal_status: '已揭示', characters: [],
          first_recorded_chapter: 1, updated_chapter: 40,
        },
      },
    }))
    expect(rich.items.map(item => [item.risk, item.id, item.summary])).toEqual([
      ['overdue-foreshadow', 'F010', 'F010'],
      ['overdue-foreshadow', 'F002', 'F002'],
      ['unscheduled-foreshadow', 'F005', 'F005'],
      ['unscheduled-foreshadow', 'F004', 'F004'],
      ['stale-character', '阿澜', '调查员｜健康'],
      ['stale-character', '管事', '调查员｜健康'],
      ['stale-thread', 'E001', '账册缺页'],
      ['stale-thread', 'E002', '船已离港'],
    ])
    expect(rich.items.find(item => item.id === '阿澜' && item.risk === 'stale-character')?.active).toBe(true)
    expect(rich.items.find(item => item.id === '管事' && item.risk === 'stale-character')?.active).toBe(false)
    expect(rich.items.some(item => item.id === '伙计' || item.summary === '本章到期' || item.summary === '钥匙去向')).toBe(false)
    expect(assessHealth(base({ last_committed_chapter: 0, characters: {}, context: { active_character_names: [] } })).items).toEqual([])
  })

  it('honors threshold overrides', () => {
    const state = base({
      foreshadow: { F001: hook('F001', { planned_resolution_chapter: null, planted_chapter: 30 }) },
      timeline: {
        E001: {
          id: 'E001', objective_fact: '旧事', reveal_status: '未揭示', characters: ['阿澜'],
          first_recorded_chapter: 30, updated_chapter: 30,
        },
      },
    })
    expect(assessHealth(state, { stalePlanted: 12, staleCharacter: 12, staleThread: 12 }).items).toEqual([])
    const tight = assessHealth(state, { stalePlanted: 11, staleCharacter: 11, staleThread: 11 })
    expect(tight.items.map(item => item.risk).sort()).toEqual(['stale-character', 'stale-thread', 'stale-thread', 'unscheduled-foreshadow'])
    expect(tight.thresholds).toEqual({ stale_planted: 11, stale_character: 11, stale_thread: 11 })
  })
})

describe('health query', () => {
  it('pages inside the byte budget and does not write', async (context) => {
    const directory = await book(context)
    const foreshadow = Object.fromEntries(Array.from({ length: 40 }, (_, index) => {
      const id = `F${String(index + 1).padStart(3, '0')}`
      return [id, {
        id, summary: '钥'.repeat(100), planted_chapter: 1, planned_resolution_chapter: 2,
        status: '已埋', importance: '低', updated_chapter: 10,
      }]
    }))
    const statePath = join(directory, '追踪/_tracking-state.json')
    await writeFile(statePath, jsonPayload({
      schema_version: 5, book_title: '预算', last_committed_chapter: 10, imported_through_chapter: 0, state_revision: 1,
      context: {
        position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '港' },
        long_term_constraints: [], active_character_names: ['林舟'], continuity_risks: [],
        recent_chapters: [], next_chapter_commitments: [],
      },
      characters: { 林舟: { identity: '调查员', location: '港', goal: '找人', state: '健康', abilities_resources: [], relationships: [], knowledge: [], open_threads: [] } },
      foreshadow,
      timeline: {
        E001: {
          id: 'E001', story_time: '清晨', objective_fact: '船离港', reader_knowledge: '船离港',
          reveal_status: '已揭示', reveal_chapter: 10, characters: ['林舟'], first_recorded_chapter: 10, updated_chapter: 10,
        },
      },
      wordcount_records: {},
    }))
    const before = await readFile(statePath)
    const page = projectQuery(directory, { kind: 'health', limit: 50 })
    expect(page.total).toBe(40)
    expect(page.omitted).toBeGreaterThan(0)
    expect(page.items).not.toEqual([])
    expect(page.next_offset).toBe((page.items as unknown[]).length)
    expect(Buffer.byteLength(`${JSON.stringify(page)}\n`, 'utf8')).toBeLessThanOrEqual(QUERY_MAX_BYTES)
    expect(page.counts).toMatchObject({ overdue_foreshadow: 40, unscheduled_foreshadow: 0, stale_character: 0, stale_thread: 0 })
    const searched = projectQuery(directory, { kind: 'health', search: 'F040', limit: 50 })
    expect(searched.total).toBe(1)
    expect(searched.counts).toMatchObject({ overdue_foreshadow: 1 })
    expect(await readFile(statePath)).toEqual(before)
    expect(await readdir(join(directory, '追踪'))).toEqual(['_tracking-state.json'])
    const empty = join(directory, '..', '空书')
    await mkdir(empty)
    expect(projectQuery(empty, { kind: 'health' })).toEqual({ schema: 'story-project-query/v1', initialized: false, source: '追踪/_tracking-state.json' })
    expect(await readdir(empty)).toEqual([])
  })

  it('rejects health thresholds on other kinds and out of range', async (context) => {
    const directory = await book(context)
    await writeFile(join(directory, '追踪/_tracking-state.json'), await readFile(fixture))
    expect(() => projectQuery(directory, { kind: 'foreshadow', stalePlanted: 30 })).toThrow('--stale-planted requires --kind health')
    expect(() => projectQuery(directory, { kind: 'health', selection: 'due' })).toThrow('--filter requires --kind foreshadow')
    expect(() => projectQuery(directory, { kind: 'health', stalePlanted: 0 })).toThrow('--stale-planted must be an integer from 1 to 100000')
    expect(() => projectQuery(directory, { kind: 'health', staleThread: 100_001 })).toThrow('--stale-thread must be an integer from 1 to 100000')
    const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
    const root = join(directory, '..')
    const run = (args: readonly string[]) => execa(process.execPath, ['--import', import.meta.resolve('tsx'), entry, 'project', ...args, '--workspace', root, '--book', '书'], {
      reject: false, cancelSignal: context.signal,
    })
    const widened = await run(['query', '--kind', 'health', '--stale-planted', '1000'])
    expect(widened.exitCode, widened.stderr).toBe(0)
    expect(JSON.parse(widened.stdout)).toMatchObject({ total: 1, counts: { overdue_foreshadow: 1, unscheduled_foreshadow: 0 } })
    const rejected = await run(['query', '--kind', 'health', '--stale-character', '0'])
    expect(rejected.exitCode).toBe(2)
    expect(JSON.parse(rejected.stdout).message).toContain('--stale-character must be an integer from 1 to 100000')
    const misplaced = await run(['query', '--kind', 'characters', '--stale-thread', '10'])
    expect(misplaced.exitCode).toBe(2)
    expect(JSON.parse(misplaced.stdout).message).toContain('--stale-thread requires --kind health')
  })
})
