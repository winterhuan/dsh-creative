/**
 * Differential parity of the TypeScript tracking layer against the Python
 * runtime: initialization, chapter checks, snapshots, commits, revisions,
 * project checks and bounded queries run on two identical books and must
 * leave identical `追踪/` trees and report identical JSON.
 */
import { cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { chapterCheck, chapterCommit, chapterSnapshot } from '../src/core/chapter.ts'
import { projectQuery, type QueryFilter, type QueryKind } from '../src/core/tracking/query.ts'
import { checkProject, initialize } from '../src/core/tracking/store.ts'

const runtime = resolve(import.meta.dirname, 'reference')
const fixtures = resolve(import.meta.dirname, 'fixtures')
const python = process.platform === 'win32' ? 'python' : 'python3'
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:all|http|https)_proxy$/iu.test(key)))
const BOOK = '雾港来信'

interface Run { readonly exitCode: number; readonly stdout: string; readonly stderr: string }

async function cli(args: readonly string[], cwd: string): Promise<Run & { readonly value: unknown }> {
  const result = await execa(python, ['-B', join(runtime, 'cli.py'), ...args, '--json'], { cwd, env, extendEnv: false, reject: false })
  return { exitCode: result.exitCode ?? -1, stdout: result.stdout, stderr: result.stderr, value: JSON.parse(result.stdout) }
}

async function workspace(context: TestContext): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-tracking-parity-')))
  context.onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  return directory
}

/** Every file under a directory, keyed by relative path; lock artifacts are implementation details. */
async function tree(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.tracking-commit.lock')) continue
      const path = join(directory, entry.name)
      const key = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) await walk(path, key)
      else files[key] = await readFile(path, 'utf8')
    }
  }
  await walk(root, '')
  return files
}

/** Replace a workspace root inside every string so two copies compare equal. */
function anonymize(value: unknown, root: string): unknown {
  if (typeof value === 'string') return value.split(root).join('<root>')
  if (Array.isArray(value)) return value.map(item => anonymize(item, root))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, anonymize(item, root)]))
  }
  return value
}

/** Drop file-version tuples, which legitimately differ between two copies, keeping only their shape. */
function withoutVersions(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  if (!('file_versions' in record)) return record
  const versions = record.file_versions as Record<string, string[]>
  return { ...record, file_versions: Object.fromEntries(Object.entries(versions).map(([name, parts]) => [name, parts.map(part => /^\d+$/u.test(part))])) }
}

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

async function prepare(root: string): Promise<string> {
  const book = join(root, BOOK)
  for (const directory of ['正文', '大纲', '设定']) await mkdir(join(book, directory), { recursive: true })
  await cp(join(fixtures, 'workflow-outline.md'), join(book, '大纲/细纲_第003章.md'))
  await cp(join(fixtures, 'workflow-body.md'), join(book, '正文/第003章_账册.md'))
  await writeFile(join(root, 'initial.json'), JSON.stringify(initialDocument))
  return book
}

describe('TypeScript tracking parity with the Python runtime', () => {
  it('initializes, checks, snapshots, commits, revises and verifies identically', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    const bookA = await prepare(rootA)
    const bookB = await prepare(rootB)
    const scopeA = ['--workspace', rootA, '--book', BOOK]

    const initA = await cli(['project', 'init', ...scopeA, '--kind', 'long', '--input', join(rootA, 'initial.json')], rootA)
    expect(initA.exitCode, initA.stderr).toBe(0)
    const initB = initialize(bookB, initialDocument)
    expect(initB.state.state_revision).toBe(0)
    expect(await tree(join(bookB, '追踪'))).toEqual(await tree(join(bookA, '追踪')))
    expect(() => initialize(bookB, initialDocument)).toThrow('never overwrites')

    const checkA = await cli(['chapter', 'check', ...scopeA, '--chapter', '3'], rootA)
    const checkB = chapterCheck(bookB, 3)
    expect(checkA.exitCode, checkA.stderr).toBe(checkB.outline_readiness.status === 'pass' && checkB.quality.status === 'pass' ? 0 : 1)
    expect(anonymize(checkA.value, rootA)).toEqual(anonymize(checkB, rootB))

    for (const outlineOnly of [false, true]) {
      const snapshotA = await cli(['chapter', 'snapshot', ...scopeA, '--chapter', '3', ...(outlineOnly ? ['--outline-only'] : [])], rootA)
      expect(snapshotA.exitCode, snapshotA.stderr).toBe(0)
      expect(withoutVersions(anonymize(snapshotA.value, rootA))).toEqual(withoutVersions(anonymize(chapterSnapshot(bookB, 3, outlineOnly), rootB)))
    }

    const transaction = {
      schema_version: 1, mode: 'append', chapter: 3, chapter_title: '缺页账册', expected_state_revision: 0,
      expected_body_sha256: checkB.body_sha256, expected_outline_sha256: checkB.outline_sha256,
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
    }
    const stale = { ...transaction, expected_body_sha256: 'f'.repeat(64) }
    await writeFile(join(rootA, 'stale.json'), JSON.stringify(stale))
    const staleA = await cli(['chapter', 'commit', ...scopeA, '--chapter', '3', '--input', join(rootA, 'stale.json')], rootA)
    expect(staleA.exitCode).toBe(2)
    await writeFile(join(rootB, 'stale.json'), JSON.stringify(stale))
    expect(() => chapterCommit(bookB, 3, join(rootB, 'stale.json'), false)).toThrow((staleA.value as { message: string }).message)
    expect(await tree(join(bookB, '追踪'))).toEqual(await tree(join(bookA, '追踪')))

    await writeFile(join(rootA, 'transaction.json'), JSON.stringify(transaction))
    await writeFile(join(rootB, 'transaction.json'), JSON.stringify(transaction))
    const commitA = await cli(['chapter', 'commit', ...scopeA, '--chapter', '3', '--input', join(rootA, 'transaction.json')], rootA)
    expect(commitA.exitCode, commitA.stderr).toBe(0)
    const commitB = chapterCommit(bookB, 3, join(rootB, 'transaction.json'), false)
    expect(anonymize(commitA.value, rootA)).toEqual(anonymize(commitB, rootB))
    expect(await tree(join(bookB, '追踪'))).toEqual(await tree(join(bookA, '追踪')))
    expect(Object.keys(await tree(join(bookB, '追踪')))).toEqual(expect.arrayContaining(['_tracking-state.json', '上下文.md', '伏笔.md', '逐章记录/第003章.md', '角色状态/阿澜.md']))

    const revision = {
      schema_version: 1, mode: 'revision', chapter: 3, chapter_title: '缺页账册（修订）', expected_state_revision: 1,
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
    await writeFile(join(rootA, 'revision.json'), JSON.stringify(revision))
    await writeFile(join(rootB, 'revision.json'), JSON.stringify(revision))
    const reviseA = await cli(['chapter', 'commit', ...scopeA, '--chapter', '3', '--input', join(rootA, 'revision.json')], rootA)
    expect(reviseA.exitCode, reviseA.stderr).toBe(0)
    const reviseB = chapterCommit(bookB, 3, join(rootB, 'revision.json'), false)
    expect(anonymize(reviseA.value, rootA)).toEqual(anonymize(reviseB, rootB))
    expect(await tree(join(bookB, '追踪'))).toEqual(await tree(join(bookA, '追踪')))

    const verifiedA = await cli(['project', 'check', ...scopeA], rootA)
    expect(verifiedA.exitCode, verifiedA.stderr).toBe(0)
    const verifiedB = checkProject(bookB)
    expect(verifiedA.value).toEqual({ last_committed_chapter: verifiedB.last_committed_chapter, state_revision: verifiedB.state_revision })
    expect(verifiedB.state_revision).toBe(2)

    const statusA = await cli(['project', 'status', ...scopeA], rootA)
    expect(statusA.exitCode, statusA.stderr).toBe(0)
    expect(statusA.value).toEqual(projectQuery(bookB))
    const kinds: readonly { readonly kind: QueryKind; readonly args: readonly string[]; readonly options: Parameters<typeof projectQuery>[1] }[] = [
      { kind: 'characters', args: [], options: {} },
      { kind: 'characters', args: ['--search', '印章'], options: { search: '印章' } },
      { kind: 'author-timeline', args: [], options: {} },
      { kind: 'reader-timeline', args: ['--limit', '1'], options: { limit: 1 } },
      { kind: 'reader-timeline', args: ['--offset', '1', '--limit', '1'], options: { offset: 1, limit: 1 } },
      { kind: 'chapter', args: ['--chapter', '3'], options: { chapter: 3 } },
      { kind: 'chapter', args: ['--chapter', '1'], options: { chapter: 1 } },
      ...(['all', 'open', 'due', 'overdue', 'unscheduled', 'resolved'] as const).map(filter => ({ kind: 'foreshadow' as const, args: ['--filter', filter, '--chapter', '6'], options: { selection: filter as QueryFilter, chapter: 6 } })),
    ]
    for (const item of kinds) {
      const queried = await cli(['project', 'query', ...scopeA, '--kind', item.kind, ...item.args], rootA)
      expect(queried.exitCode, `${item.kind} ${item.args.join(' ')}: ${queried.stderr}`).toBe(0)
      expect(queried.value, `${item.kind} ${item.args.join(' ')}`).toEqual(projectQuery(bookB, { kind: item.kind, ...item.options }))
    }
    const staleQuery = await cli(['project', 'query', ...scopeA, '--kind', 'foreshadow', '--revision', '1'], rootA)
    expect(staleQuery.exitCode).toBe(2)
    expect(() => projectQuery(bookB, { kind: 'foreshadow', expectedRevision: 1 })).toThrow((staleQuery.value as { message: string }).message)
    const beyond = await cli(['project', 'query', ...scopeA, '--kind', 'chapter', '--chapter', '9'], rootA)
    expect(beyond.exitCode).toBe(2)
    expect(() => projectQuery(bookB, { kind: 'chapter', chapter: 9 })).toThrow((beyond.value as { message: string }).message)
  }, 180_000)

  it('reports an uninitialized book and rejects malformed input identically', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    const bookA = await prepare(rootA)
    const bookB = await prepare(rootB)
    const status = await cli(['project', 'status', '--workspace', rootA, '--book', BOOK], rootA)
    expect(status.value).toEqual(projectQuery(bookB))
    for (const [label, document] of Object.entries({
      'unknown field': { ...initialDocument, extra: 1 },
      'future reveal': { ...initialDocument, timeline_events: [{ ...initialDocument.timeline_events[1], reveal_status: '已揭示' }] },
      'duplicate character': { ...initialDocument, character_snapshots: { ...initialDocument.character_snapshots, 阿澜: initialDocument.character_snapshots.阿澜, 阿澜2: { ...initialDocument.character_snapshots.阿澜 } }, context: { ...initialDocument.context, active_character_names: ['阿澜', '阿澜2', '阿澜', '管事', 'x', 'y', 'z'] } },
      'bad target chapter': { ...initialDocument, foreshadow: [{ ...initialDocument.foreshadow[0], planted_chapter: 9 }] },
    })) {
      await writeFile(join(rootA, 'bad.json'), JSON.stringify(document))
      const rejected = await cli(['project', 'init', '--workspace', rootA, '--book', BOOK, '--kind', 'long', '--input', join(rootA, 'bad.json')], rootA)
      expect(rejected.exitCode, label).toBe(2)
      expect(() => initialize(bookB, document), label).toThrow((rejected.value as { message: string }).message)
      expect(await readdir(join(bookA)).then(names => names.includes('追踪') ? readdir(join(bookA, '追踪')) : []), label).toEqual([])
    }
  }, 120_000)
})
