import { existsSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { main } from '../src/cli/main.ts'
import { chapterCheck } from '../src/core/chapter.ts'
import { finishChapter } from '../src/core/chapter-finish.ts'
import { loadFacts } from '../src/core/facts.ts'
import { checkProject, initialize } from '../src/core/tracking/store.ts'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const BOOK = '雾港来信'

const initialDocument = {
  schema_version: 1, book_title: BOOK, last_chapter: 2,
  context: {
    position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房外' },
    long_term_constraints: ['账册不能离开库房'], active_character_names: ['阿澜'], continuity_risks: ['管事是否认出她'],
    recent_chapters: [{ chapter: 1, summary: '取得账册' }, { chapter: 2, summary: '发现缺页' }],
    next_chapter_commitments: ['追查缺页'],
  },
  character_snapshots: {
    阿澜: { identity: '账房学徒', location: '库房', goal: '取回账册', state: '紧张', abilities_resources: ['识字'], relationships: ['管事：对立'], knowledge: ['账册缺页'], open_threads: ['钥匙去向'] },
    管事: { identity: '库房管事', location: '库房门口', goal: '封门', state: '警惕', abilities_resources: [], relationships: [], knowledge: [], open_threads: [] },
  },
  foreshadow: [
    { id: 'F001', summary: '缺页的账册', planted_chapter: 2, planned_resolution_chapter: 5, status: '已埋', importance: '高' },
    { id: 'F002', summary: '袖口里的钥匙', planted_chapter: 1, planned_resolution_chapter: null, status: '已埋', importance: '中' },
    { id: 'F003', summary: '运废纸的车', planted_chapter: 1, planned_resolution_chapter: 2, status: '已回收', importance: '低' },
  ],
  timeline_events: [
    { id: 'E001', story_time: '清晨', objective_fact: '管事奉命封门', reader_knowledge: '门被封了', reveal_status: '部分揭示', reveal_chapter: 1, characters: ['管事'] },
    { id: 'E002', story_time: '前夜', objective_fact: '账册被人撕去三页', reader_knowledge: '账册缺页', reveal_status: '未揭示', reveal_chapter: null, characters: [] },
  ],
}

async function workspace(context: TestContext): Promise<{ root: string; book: string }> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-finish-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const book = join(root, BOOK)
  for (const directory of ['正文', '大纲', '设定']) await mkdir(join(book, directory), { recursive: true })
  await cp(join(fixtures, 'workflow-outline.md'), join(book, '大纲/细纲_第003章.md'))
  await cp(join(fixtures, 'workflow-body.md'), join(book, '正文/第003章_账册.md'))
  initialize(book, initialDocument)
  return { root, book }
}

function transaction(check: ReturnType<typeof chapterCheck>, extra: Record<string, unknown> = {}) {
  return {
    schema_version: 1, mode: 'append', chapter: 3, chapter_title: '缺页账册', expected_state_revision: 0,
    expected_body_sha256: check.body_sha256, expected_outline_sha256: check.outline_sha256,
    delta: {
      result: '取得账册并发现缺页',
      character_changes: [{ name: '阿澜', change: '把账册藏进衣襟' }, { name: '管事', change: '被调离库房' }, { name: '伙计', change: '目睹封门' }],
      foreshadow_changes: [
        { id: 'F001', summary: '缺页的账册', planted_chapter: 2, planned_resolution_chapter: 6, status: '已埋', importance: '高' },
        { action: 'delete', id: 'F003' },
        { id: 'F004', summary: '账册夹层的纸条', planted_chapter: 3, planned_resolution_chapter: null, status: '已埋', importance: '低' },
      ],
      timeline_events: [
        { id: 'E002', story_time: '前夜', objective_fact: '账册被管事撕去三页', reader_knowledge: '账册缺页，有人动过', reveal_status: '部分揭示', reveal_chapter: 3, characters: ['管事'] },
        { id: 'E003', story_time: '清晨稍后', objective_fact: '管事被调离', reader_knowledge: '管事不见了', reveal_status: '已揭示', reveal_chapter: 3, characters: ['管事'] },
      ],
      constraints: ['账册不能离开库房', '不能让伙计知道夹层'],
      next_chapter_commitments: ['查纸条来历'],
      retired_context_items: ['管事是否认出她'],
      retired_characters: ['管事'],
    },
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨稍后', scene: '库房内' },
      long_term_constraints: ['账册不能离开库房', '不能让伙计知道夹层'], active_character_names: ['阿澜'], continuity_risks: [],
    },
    character_snapshots: {
      阿澜: { identity: '账房学徒', location: '库房内', goal: '查纸条来历', state: '警觉', abilities_resources: ['识字'], relationships: ['伙计：旁观者'], knowledge: ['账册缺页', '夹层有纸条'], open_threads: ['钥匙去向', '纸条来历'] },
    },
    ...extra,
  }
}

async function runCli(args: string[]): Promise<{ code: number; value: Record<string, unknown> }> {
  let out = ''
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    const code = await main(args)
    return { code, value: JSON.parse(out) as Record<string, unknown> }
  } finally {
    process.stdout.write = write
  }
}

describe('chapter finish', () => {
  it('commits, records claims, and reports stale in one result', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction(check)))
    await mkdir(join(book, '草稿/事实'), { recursive: true })
    await writeFile(join(book, '草稿/事实/第003章.claims.json'), JSON.stringify({
      claims: [{ id: 'VENUE-库房', attrs: { 地面: '石台' } }],
      entries: [{ id: 'VENUE-库房', kind: '场地', subject: '库房', attrs: { 地面: '石台' } }],
    }))
    const body = await readFile(join(book, '正文/第003章_账册.md'), 'utf8')
    const report = finishChapter(book, 3, input, false)
    expect(report.phase).toBe('done')
    expect(report.committed).toBe(true)
    expect(report.facts_recorded).toBe(true)
    expect(report.claims_present).toBe(true)
    expect(report.gates).toMatchObject({ rule_audit: 'off', facts_diff: 'off', style: 'off', streak: null })
    expect(report.stale.present).toBe(true)
    expect(report.stale.stale).toEqual([])
    expect(report.stale.missing_chapters).toEqual([])
    expect(loadFacts(book).covered_chapters).toContain(3)
    expect(loadFacts(book).entries.find(entry => entry.id === 'VENUE-库房')?.attrs).toEqual({ 地面: '石台' })
    expect(await readFile(join(book, '正文/第003章_账册.md'), 'utf8')).toBe(body)
    expect(checkProject(book)).toMatchObject({ last_committed_chapter: 3, state_revision: 1 })
  })

  it('does not write the ledger when the commit fails', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'stale.json')
    await writeFile(input, JSON.stringify({ ...transaction(check), expected_body_sha256: 'f'.repeat(64) }))
    await mkdir(join(book, '草稿/事实'), { recursive: true })
    await writeFile(join(book, '草稿/事实/第003章.claims.json'), JSON.stringify({
      entries: [{ id: 'VENUE-库房', kind: '场地', attrs: { 地面: '石台' } }],
    }))
    const report = finishChapter(book, 3, input, false)
    expect(report.committed).toBe(false)
    expect(report.facts_recorded).toBe(false)
    expect(report.phase).toBe('commit')
    expect(report.commit_error).toBeTruthy()
    expect(existsSync(join(book, '追踪/事实账本.json'))).toBe(false)
    expect(checkProject(book).state_revision).toBe(0)
  })

  it('keeps the committed chapter when record fails', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction(check)))
    await mkdir(join(book, '草稿/事实'), { recursive: true })
    await writeFile(join(book, '草稿/事实/第003章.claims.json'), JSON.stringify({
      claims: [],
      entries: [{ id: 'VENUE-库房', kind: 'nope', attrs: {} }],
    }))
    const body = await readFile(join(book, '正文/第003章_账册.md'), 'utf8')
    const report = finishChapter(book, 3, input, false)
    expect(report.committed).toBe(true)
    expect(report.facts_recorded).toBe(false)
    expect(report.phase).toBe('record')
    expect(report.facts_error).toContain('kind')
    expect(existsSync(join(book, '追踪/事实账本.json'))).toBe(false)
    expect(await readFile(join(book, '正文/第003章_账册.md'), 'utf8')).toBe(body)
    expect(checkProject(book).last_committed_chapter).toBe(3)
  })

  it('commits without a claims file and leaves facts_recorded false', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction(check)))
    const report = finishChapter(book, 3, input, false)
    expect(report).toMatchObject({ phase: 'done', committed: true, facts_recorded: false, claims_present: false })
    expect(report.stale).toMatchObject({ present: false, missing_chapters: [] })
    expect(existsSync(join(book, '追踪/事实账本.json'))).toBe(false)
  })

  it('stops before commit when facts_diff is required and the claims conflict', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction(check)))
    await mkdir(join(book, '草稿/事实'), { recursive: true })
    const claimsPath = join(book, '草稿/事实/第003章.claims.json')
    await writeFile(claimsPath, JSON.stringify({
      claims: [{ id: 'VENUE-库房', attrs: { 地面: '石台' } }],
      entries: [{ id: 'VENUE-库房', kind: '场地', attrs: { 地面: '石台' } }],
    }))
    expect(finishChapter(book, 3, input, false).facts_recorded).toBe(true)
    const ledger = readFileSync(join(book, '追踪/事实账本.json'), 'utf8')
    const revision = {
      schema_version: 1, mode: 'revision', chapter: 3, chapter_title: '缺页账册（修订）', expected_state_revision: 1,
      expected_body_sha256: check.body_sha256, expected_outline_sha256: check.outline_sha256,
      delta: {
        result: '取得账册并发现缺页；纸条上有半个印章',
        character_changes: [{ name: '阿澜', change: '认出印章' }],
        foreshadow_changes: [{ id: 'F004', summary: '账册夹层的纸条上有半个印章', planted_chapter: 3, planned_resolution_chapter: 8, status: '已埋', importance: '中' }],
        timeline_events: [], constraints: [], next_chapter_commitments: ['查印章'], retired_context_items: [], retired_characters: [],
      },
      context: {
        position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨稍后', scene: '库房内' },
        long_term_constraints: ['账册不能离开库房', '不能让伙计知道夹层'], active_character_names: ['阿澜'], continuity_risks: [],
      },
      character_snapshots: {
        阿澜: { identity: '账房学徒', location: '库房内', goal: '查印章', state: '警觉', abilities_resources: ['识字'], relationships: ['伙计：旁观者'], knowledge: ['账册缺页', '夹层有纸条', '纸条有半个印章'], open_threads: ['钥匙去向', '印章来历'] },
      },
    }
    await writeFile(input, JSON.stringify(revision))
    await writeFile(claimsPath, JSON.stringify({
      claims: [{ id: 'VENUE-库房', attrs: { 地面: '水泥地' } }],
      entries: [{ id: 'VENUE-库房', kind: '场地', attrs: { 地面: '水泥地' }, reason: '地面改了' }],
    }))
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({ facts_diff: 'required' }))
    const blocked = finishChapter(book, 3, input, false)
    expect(blocked.phase).toBe('diff')
    expect(blocked.committed).toBe(false)
    expect(blocked.facts_recorded).toBe(false)
    expect(blocked.diff?.ok).toBe(false)
    expect(readFileSync(join(book, '追踪/事实账本.json'), 'utf8')).toBe(ledger)
    expect(checkProject(book).state_revision).toBe(1)
  })

  it('stops on a missing audit when rule_audit is required', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction(check)))
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({ rule_audit: 'required' }))
    const report = finishChapter(book, 3, input, false)
    expect(report.phase).toBe('audit')
    expect(report.committed).toBe(false)
    expect(report.rules_sha256).toBeNull()
    expect(report.gates.rule_audit).toBe('required')
    expect(checkProject(book).state_revision).toBe(0)
  })

  it('exits 1 from the CLI when claims exist but were not recorded', async context => {
    const { root, book } = await workspace(context)
    const check = chapterCheck(book, 3)
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction(check)))
    await mkdir(join(book, '草稿/事实'), { recursive: true })
    await writeFile(join(book, '草稿/事实/第003章.claims.json'), '{')
    const finished = await runCli(['chapter', 'finish', '--workspace', root, '--book', BOOK, '--chapter', '3', '--input', input])
    expect(finished.code).toBe(1)
    expect(finished.value.committed).toBe(true)
    expect(finished.value.facts_recorded).toBe(false)
    expect(finished.value.facts_error).toEqual(expect.any(String))
    const checked = await runCli(['project', 'check', '--workspace', root, '--book', BOOK])
    expect(checked.code).toBe(0)
    expect(checked.value).toEqual({ last_committed_chapter: 3, state_revision: 1 })
  })
})
