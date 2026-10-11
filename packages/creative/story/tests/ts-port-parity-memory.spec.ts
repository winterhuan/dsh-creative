/**
 * Differential parity of the TypeScript author-memory module against the
 * Python reference: records, commits, replays, queries and checks run on two
 * workspaces and must leave identical files (timestamps aside) and report
 * identical JSON.
 */
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { memoryCheck, memoryCommit, memoryInit, memoryQuery, memoryRecord } from '../src/core/memory.ts'

const reference = resolve(import.meta.dirname, 'reference')
const python = process.platform === 'win32' ? 'python' : 'python3'
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:all|http|https)_proxy$/iu.test(key)))

async function cli(args: readonly string[], cwd: string): Promise<{ readonly exitCode: number; readonly stderr: string; readonly value: unknown }> {
  const result = await execa(python, ['-B', join(reference, 'cli.py'), ...args, '--json'], { cwd, env, extendEnv: false, reject: false })
  return { exitCode: result.exitCode ?? -1, stderr: result.stderr, value: JSON.parse(result.stdout) }
}

async function workspace(context: TestContext): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-memory-parity-')))
  context.onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  return directory
}

const TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:\+00:00|Z)/gu

function scrub(value: unknown, root: string): unknown {
  if (typeof value === 'string') return value.replace(TIME, '<time>').split(root).join('<root>')
  if (Array.isArray(value)) return value.map(item => scrub(item, root))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, scrub(item, root)]))
  return value
}

async function tree(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) Object.assign(files, Object.fromEntries(Object.entries(await tree(path)).map(([key, text]) => [`${entry.name}/${key}`, text])))
    else files[entry.name] = (await readFile(path, 'utf8')).replace(TIME, '<time>')
  }
  return files
}

const preference = (overrides: Record<string, unknown>): Record<string, unknown> => ({
  kind: 'prose_style', scope: { level: 'book', value: '雾港来信' }, assertion: '短句开场，少用破折号', quote: '以后开头都用短句',
  source_ref: '会话 1', source: 'explicit_user', confidence: 'high', importance: 'high', reason: '作者明确要求', status: 'active', ...overrides,
})
const events = {
  first: { schema_version: 1, event_id: 'evt-1', operation: { action: 'remember', preference: preference({}) } },
  pending: { schema_version: 1, event_id: 'evt-2', operation: { action: 'remember', preference: preference({ kind: 'story_design', scope: { level: 'global', value: null }, assertion: '反派要有可理解的动机', quote: '反派别太脸谱', source_ref: null, source: 'inferred_pattern', confidence: 'medium', importance: 'medium', reason: '两次修改都在补动机', status: 'pending' }) } },
  reinforce: { schema_version: 1, event_id: 'evt-3', operation: { action: 'remember', preference: preference({ quote: '对，开头短句', confidence: 'medium', importance: 'medium' }) } },
}
const transactions = {
  first: { schema_version: 1, transaction_id: 'tx-1', expected_state_revision: 3, operations: [
    { action: 'decide', item_id: 'AP002', decision: 'activate', quote: '对，就这样', reason: '作者确认' },
    { action: 'remember', preference: preference({ assertion: '允许用破折号表示打断', quote: '打断的地方用破折号', source_ref: null, confidence: 'medium', importance: 'low', reason: '与 AP001 冲突', status: 'conflict', conflicts_with: ['AP001'] }) },
  ] },
  second: { schema_version: 1, transaction_id: 'tx-2', expected_state_revision: 4, operations: [
    { action: 'replace', old_ids: ['AP001'], preference: { kind: 'prose_style', scope: { level: 'book', value: '雾港来信' }, assertion: '短句开场；打断处可用破折号', quote: '合并一下', source: 'explicit_user', confidence: 'high', importance: 'high', reason: '合并两条' } },
    { action: 'forget', item_id: 'AP002', quote: '这条先不要了', reason: '作者撤回' },
  ] },
}

describe('TypeScript author-memory parity with the Python runtime', () => {
  it('records, commits, replays, queries and checks identically', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    const compare = async (label: string): Promise<void> => {
      expect(await tree(join(rootB, '.story')), label).toEqual(await tree(join(rootA, '.story')))
    }
    for (const [name, event] of Object.entries(events)) {
      await writeFile(join(rootA, `${name}.json`), JSON.stringify(event))
      await writeFile(join(rootB, `${name}.json`), JSON.stringify(event))
      const recorded = await cli(['memory', 'record', '--workspace', rootA, '--input', join(rootA, `${name}.json`)], rootA)
      expect(recorded.exitCode, `${name}: ${recorded.stderr}`).toBe(0)
      expect(scrub(recorded.value, rootA), name).toEqual(scrub(memoryRecord(rootB, join(rootB, `${name}.json`)), rootB))
      await compare(name)
    }
    const replayed = await cli(['memory', 'record', '--workspace', rootA, '--input', join(rootA, 'first.json')], rootA)
    expect(scrub(replayed.value, rootA)).toEqual(scrub(memoryRecord(rootB, join(rootB, 'first.json')), rootB))
    expect((replayed.value as { replayed: boolean }).replayed).toBe(true)
    await compare('replay')

    const initA = await cli(['memory', 'init', '--workspace', rootA], rootA)
    expect(scrub(initA.value, rootA)).toEqual(scrub(memoryInit(rootB), rootB))
    for (const [name, transaction] of Object.entries(transactions)) {
      await writeFile(join(rootA, `${name}.json`), JSON.stringify(transaction))
      await writeFile(join(rootB, `${name}.json`), JSON.stringify(transaction))
      const committed = await cli(['memory', 'commit', '--workspace', rootA, '--input', join(rootA, `${name}.json`)], rootA)
      expect(committed.exitCode, `${name}: ${committed.stderr}`).toBe(0)
      expect(scrub(committed.value, rootA), name).toEqual(scrub(memoryCommit(rootB, join(rootB, `${name}.json`)), rootB))
      await compare(name)
    }
    const again = await cli(['memory', 'commit', '--workspace', rootA, '--input', join(rootA, 'second.json')], rootA)
    expect((again.value as { replayed: boolean }).replayed).toBe(true)
    expect(scrub(again.value, rootA)).toEqual(scrub(memoryCommit(rootB, join(rootB, 'second.json')), rootB))
    await writeFile(join(rootA, 'stale.json'), JSON.stringify({ ...transactions.second, transaction_id: 'tx-3' }))
    await writeFile(join(rootB, 'stale.json'), JSON.stringify({ ...transactions.second, transaction_id: 'tx-3' }))
    const stale = await cli(['memory', 'commit', '--workspace', rootA, '--input', join(rootA, 'stale.json')], rootA)
    expect(stale.exitCode).toBe(2)
    expect(() => memoryCommit(rootB, join(rootB, 'stale.json'))).toThrow((stale.value as { message: string }).message)
    await compare('stale')

    const queries: readonly { readonly args: readonly string[]; readonly call: () => unknown }[] = [
      { args: [], call: () => memoryQuery(rootB, null, null, null, null) },
      { args: ['--book', '雾港来信'], call: () => memoryQuery(rootB, null, '雾港来信', null, null) },
      { args: ['--kind', 'prose_style', '--book', '雾港来信'], call: () => memoryQuery(rootB, ['prose_style'], '雾港来信', null, null) },
      { args: ['--kind', 'story_design', '--kind', 'delivery', '--genre', '悬疑'], call: () => memoryQuery(rootB, ['story_design', 'delivery'], null, '悬疑', null) },
      { args: ['--book', '雾港来信', '--workflow', 'daily'], call: () => memoryQuery(rootB, null, '雾港来信', null, 'daily') },
    ]
    for (const query of queries) {
      const queried = await cli(['memory', 'query', '--workspace', rootA, ...query.args], rootA)
      expect(queried.exitCode, query.args.join(' ')).toBe(0)
      expect(queried.value, query.args.join(' ')).toEqual(query.call())
    }
    const checked = await cli(['memory', 'check', '--workspace', rootA], rootA)
    expect(checked.value).toEqual(memoryCheck(rootB))
    // AP001 replaced by AP004, AP002 forgotten, AP003 released from its conflict back to pending.
    expect((checked.value as { counts: Record<string, number> }).counts).toEqual({ active: 1, pending: 1, conflict: 0, rejected: 0, superseded: 2 })
  }, 120_000)

  it('reports an uninitialized workspace and malformed input identically', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    expect((await cli(['memory', 'query', '--workspace', rootA], rootA)).value).toEqual(memoryQuery(rootB, null, null, null, null))
    const checkedA = await cli(['memory', 'check', '--workspace', rootA], rootA)
    expect(checkedA.exitCode).toBe(2)
    expect(() => memoryCheck(rootB)).toThrow((checkedA.value as { message: string }).message)
    for (const [label, event] of Object.entries({
      'active inferred': { ...events.first, operation: { action: 'remember', preference: preference({ source: 'inferred_pattern' }) } },
      'unknown action': { ...events.first, operation: { action: 'rename' } },
      'global with value': { ...events.first, operation: { action: 'remember', preference: preference({ scope: { level: 'global', value: 'x' } }) } },
      'conflict without targets': { ...events.first, operation: { action: 'remember', preference: preference({ status: 'conflict' }) } },
    })) {
      await writeFile(join(rootA, 'bad.json'), JSON.stringify(event))
      await writeFile(join(rootB, 'bad.json'), JSON.stringify(event))
      const rejected = await cli(['memory', 'record', '--workspace', rootA, '--input', join(rootA, 'bad.json')], rootA)
      expect(rejected.exitCode, label).toBe(2)
      expect(() => memoryRecord(rootB, join(rootB, 'bad.json')), label).toThrow((rejected.value as { message: string }).message)
    }
  })
})
