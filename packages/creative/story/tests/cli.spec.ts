import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'

const entry = resolve(import.meta.dirname, '../src/cli.ts')
const loader = import.meta.resolve('tsx')
const fixtures = resolve(import.meta.dirname, 'fixtures')
const runtime = resolve(import.meta.dirname, '../runtime')

async function workspace(context: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-story-cli-'))
  context.onTestFinished(() => rm(path, { recursive: true, force: true }))
  return realpath(path)
}

async function call<T = Record<string, unknown>>(context: TestContext, cwd: string, args: string[]) {
  const child = execa(process.execPath, ['--import', loader, entry, ...args, '--json'], {
    cwd, reject: false, cancelSignal: context.signal,
    env: { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', MAKERS_API_KEY: '' },
  })
  context.onTestFinished(async () => { child.kill('SIGTERM'); await child })
  const result = await child
  expect(result.timedOut).toBe(false)
  expect(result.isCanceled).toBe(false)
  expect(result.signal).toBeUndefined()
  return { ...result, value: JSON.parse(result.stdout) as T }
}

function scope(workspace: string, book: string): string[] {
  return ['--workspace', workspace, '--book', book]
}

async function initialized(context: TestContext, root: string, book = '雾港来信') {
  const input = join(root, 'initial.json')
  await writeFile(input, JSON.stringify({
    schema_version: 1, book_title: book, last_chapter: 0,
    context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房外' } },
  }))
  const result = await call(context, root, ['project', 'init', ...scope(root, book), '--kind', 'long', '--input', input])
  expect(result.exitCode, result.stderr).toBe(0)
  const project = join(root, book)
  await cp(join(fixtures, 'workflow-outline.md'), join(project, '大纲/细纲_第001章.md'))
  return project
}

interface Snapshot {
  body_path: string
  outline_path: string
  body_sha256?: string
  outline_sha256: string
  state_revision: number
  file_versions: Record<string, string[]>
}

describe('packaged story CLI', () => {
  it('requires an explicit direct-child work and never initializes root, categories or escaped paths', async context => {
    const root = await workspace(context)
    for (const book of ['.', '..', '长篇', '短篇', '拆文库', '长篇/甲', '../外部', '甲\\乙', root]) {
      const result = await call(context, root, ['project', 'init', ...scope(root, book), '--kind', 'long'])
      expect(result.exitCode, book).toBe(2)
      expect(result.value.error_code).toBe('INVALID_ARGUMENT')
    }
    const missing = await call(context, root, ['project', 'status', '--workspace', root])
    expect(missing.exitCode).toBe(2)
    expect(await readdir(root)).toEqual([])
    const short = await call(context, root, ['project', 'init', ...scope(root, '短篇作品'), '--kind', 'short'])
    expect(short.exitCode, short.stderr).toBe(0)
    expect(await readdir(join(root, '短篇作品'))).toEqual([])
    const uninitialized = await call(context, root, ['project', 'status', ...scope(root, '短篇作品')])
    expect(uninitialized.value).toMatchObject({ initialized: false })
    expect(await readdir(join(root, '短篇作品'))).toEqual([])
    const manuscript = join(root, '短篇作品/正文.md')
    await writeFile(manuscript, '保留原稿。')
    const repeated = await call(context, root, ['project', 'init', ...scope(root, '短篇作品'), '--kind', 'short'])
    expect(repeated.value.created).toBe(false)
    expect(await readFile(manuscript, 'utf8')).toBe('保留原稿。')
  })

  it('rejects symlinked books and resources before producing files', async context => {
    const root = await workspace(context)
    const outside = await workspace(context)
    await symlink(outside, join(root, '别名'), process.platform === 'win32' ? 'junction' : 'dir')
    expect((await call(context, root, ['project', 'init', ...scope(root, '别名'), '--kind', 'long'])).exitCode).toBe(2)
    await mkdir(join(root, '书'))
    await symlink(outside, join(root, '书', '追踪'), process.platform === 'win32' ? 'junction' : 'dir')
    expect((await call(context, root, ['project', 'init', ...scope(root, '书'), '--kind', 'long'])).exitCode).toBe(2)
    expect(await readdir(outside)).toEqual([])
  })

  it('captures source identity without a body, detects later edits, and commits only the inspected chapter', async context => {
    const root = await workspace(context)
    const book = '雾港来信'
    const project = await initialized(context, root, book)
    const args = [...scope(root, book), '--chapter', '1']
    const prepared = await call<Snapshot>(context, root, ['chapter', 'snapshot', ...args, '--outline-only'])
    expect(prepared.exitCode, prepared.stderr).toBe(0)
    expect(prepared.value.body_sha256).toBeUndefined()
    expect(prepared.value.body_path).toBe(join(project, '正文/第001章.md'))
    expect(prepared.value.file_versions.outline).toEqual(expect.arrayContaining([expect.stringMatching(/^\d+$/u)]))
    const body = join(project, '正文/第001章.md')
    await cp(join(fixtures, 'workflow-body.md'), body)
    const checked = await call(context, root, ['chapter', 'check', ...args])
    expect(checked.exitCode, checked.stderr).toBe(0)
    const snapshot = await call<Snapshot>(context, root, ['chapter', 'snapshot', ...args])
    expect(snapshot.value.body_sha256).toBe(createHash('sha256').update(await readFile(body)).digest('hex'))
    const before = await readFile(join(project, '追踪/_tracking-state.json'))
    const repeated = await call(context, root, ['project', 'init', ...scope(root, book), '--kind', 'long', '--input', join(root, 'initial.json')])
    expect(repeated.exitCode).toBe(2)
    expect(await readFile(join(project, '追踪/_tracking-state.json'))).toEqual(before)
    const original = await readFile(body, 'utf8')
    await writeFile(body, original.replace('一刻钟', '半刻钟'))
    const changed = await call<Snapshot>(context, root, ['chapter', 'snapshot', ...args])
    expect(changed.value.body_sha256).not.toBe(snapshot.value.body_sha256)
    const transaction = {
      schema_version: 1, mode: 'append', chapter: 1, chapter_title: '缺页账册', expected_state_revision: 0,
      expected_body_sha256: snapshot.value.body_sha256, expected_outline_sha256: snapshot.value.outline_sha256,
      delta: { result: '取得账册并发现缺页', character_changes: [], foreshadow_changes: [], timeline_events: [], constraints: [],
        next_chapter_commitments: ['追查缺页'], retired_context_items: [], retired_characters: [] },
      context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房内' },
        long_term_constraints: [], active_character_names: [], continuity_risks: [] },
      character_snapshots: {},
    }
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(transaction))
    const stale = await call(context, root, ['chapter', 'commit', ...args, '--input', input])
    expect(stale.exitCode).toBe(2)
    expect(stale.value.message).toContain('stale')
    expect(await readFile(join(project, '追踪/_tracking-state.json'))).toEqual(before)
    await writeFile(input, JSON.stringify({ ...transaction, expected_body_sha256: changed.value.body_sha256 }))
    const committed = await call(context, root, ['chapter', 'commit', ...args, '--input', input])
    expect(committed.exitCode, committed.stderr).toBe(0)
    expect(committed.value.tracking_committed).toBe(true)
    const verified = await call(context, root, ['project', 'check', ...scope(root, book)])
    expect(verified.value).toEqual({ last_committed_chapter: 1, state_revision: 1 })
    expect(await readdir(project)).not.toContain('__pycache__')
    const other = await call(context, root, ['project', 'init', ...scope(root, '另一部书'), '--kind', 'long'])
    expect(other.exitCode).toBe(0)
    expect((await call(context, root, ['project', 'status', ...scope(root, '另一部书')])).value.initialized).toBe(false)
  })

  it('keeps bounded queries read-only and separates reader knowledge from author facts', async context => {
    const root = await workspace(context)
    const project = join(root, '续写')
    await mkdir(join(project, '追踪'), { recursive: true })
    const statePath = join(project, '追踪/_tracking-state.json')
    await cp(join(fixtures, 'continuity-state.json'), statePath)
    const before = await readFile(statePath)
    const first = await call(context, root, ['project', 'query', ...scope(root, '续写'), '--kind', 'foreshadow', '--filter', 'due', '--chapter', '501', '--limit', '1'])
    expect(first.exitCode, first.stderr).toBe(0)
    expect(first.value).toMatchObject({ state_revision: 7, next_offset: 1 })
    const stale = await call(context, root, ['project', 'query', ...scope(root, '续写'), '--kind', 'foreshadow', '--revision', '6'])
    expect(stale.exitCode).toBe(2)
    const reader = await call(context, root, ['project', 'query', ...scope(root, '续写'), '--kind', 'reader-timeline'])
    expect(reader.exitCode).toBe(0)
    expect(reader.stdout).not.toContain('objective_fact')
    expect(await readFile(statePath)).toEqual(before)
    expect(await readdir(join(project, '追踪'))).toEqual(['_tracking-state.json'])
  })

  it('runs short and text checks from explicit files and changes punctuation only with apply', async context => {
    const root = await workspace(context)
    await call(context, root, ['project', 'init', ...scope(root, '短故事'), '--kind', 'short'])
    const body = join(root, '短故事/正文.md')
    const prose = '### 1.\n她停下——推开门。\n'
    await writeFile(body, prose)
    const short = await call(context, root, ['short', 'delivery-check', ...scope(root, '短故事'), '--min-chars', '1', '--max-chars', '40', '--sections', '1'])
    expect(short.exitCode, short.stderr).toBe(0)
    const count = await call(context, root, ['text', 'count', '--file', body])
    expect(count.value).toMatchObject({ actual: 9, metric: 'visible_chars_v1' })
    const preview = await call(context, root, ['text', 'normalize', '--file', body, '--policy', 'normalize-narration'])
    expect(preview.exitCode).toBe(1)
    expect(await readFile(body, 'utf8')).toBe(prose)
    const applied = await call(context, root, ['text', 'normalize', '--file', body, '--policy', 'normalize-narration', '--apply'])
    expect(applied.exitCode).toBe(0)
    expect(applied.value.changed_files).toEqual([body])
    expect(await readFile(body, 'utf8')).toBe(prose.replace('——', '，'))
    await writeFile(body, 'TODO：补完。\n')
    const blocked = await call(context, root, ['text', 'check', '--file', body])
    expect(blocked.exitCode).toBe(1)
    expect(blocked.value.ok).toBe(false)
  })

  it('initializes workspace memory, exports mapped chapters, records lineage, and diagnoses absent detection credentials', async context => {
    const root = await workspace(context)
    const project = await initialized(context, root)
    const body = join(project, '正文/第001章.md')
    await writeFile(body, `第1章 库房\n${await readFile(join(fixtures, 'workflow-body.md'), 'utf8')}`)
    const memory = await call(context, root, ['memory', 'init', '--workspace', root])
    expect(memory.exitCode, memory.stderr).toBe(0)
    expect((await call(context, root, ['memory', 'check', '--workspace', root])).exitCode).toBe(0)
    expect(await readdir(root)).toContain('.story')
    const out = join(root, '导出')
    const exported = await call(context, root, ['export', 'txt', ...scope(root, '雾港来信'), '--out-dir', out])
    expect(exported.exitCode, exported.stderr).toBe(0)
    expect(await readdir(out)).toEqual(expect.arrayContaining(['原著.txt', '章节映射.json']))
    const recorded = await call(context, root, ['lineage', 'record', '--workspace', root, '--from-domain', 'novel', '--from-path', '导出', '--to-domain', 'game', '--to-path', '游戏'])
    expect(recorded.exitCode, recorded.stderr).toBe(0)
    expect(await readFile(join(root, '改编谱系.jsonl'), 'utf8')).toContain('sha256')
    const detected = await call(context, root, ['detect', 'zhuque', ...scope(root, '雾港来信'), '--file', '正文/第001章.md'])
    expect(detected.exitCode).not.toBe(0)
    expect(detected.value).toMatchObject({ ok: false, error: { code: 'missing_credential' } })
  })

  it('rejects source changes during snapshot collection', async context => {
    const root = await workspace(context)
    const child = execa('python3', ['-B', join(fixtures, 'cli-snapshot.py'), runtime], { cwd: root, reject: false, cancelSignal: context.signal })
    context.onTestFinished(async () => { child.kill('SIGTERM'); await child })
    const result = await child
    expect(result.timedOut).toBe(false)
    expect(result.signal).toBeUndefined()
    expect(result.exitCode, result.stderr).toBe(0)
  })
})
