/** Setting-library lookup: Chinese matching, aliases, provenance, budget and a read-only CLI. */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it, type TestContext } from 'vitest'
import { LOOKUP_MAX_BYTES, lookupSettings, SettingsLookupError } from '../src/core/settings-lookup.ts'

async function book(context: TestContext, name = '雾港来信'): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-lookup-'))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  return directory
}

async function writeSetting(directory: string, relative: string, body: string): Promise<void> {
  const path = join(directory, relative)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, body)
}

it('matches an unspaced realm name by keyword and ignores an unrelated style file', async (context) => {
  const directory = await book(context)
  await writeSetting(directory, '设定/世界观/境界.md', '# 境界\n\n炼气之后是筑基，筑基之后是金丹期，金丹期之后是元婴。\n')
  await writeSetting(directory, '设定/文风.md', '# 文风\n\n叙述用短句。对话保持口语。\n')
  const result = lookupSettings(directory, '洞中寂静，他终于踏入金丹期。')
  expect(result.items.map(item => item.source)).toEqual(['设定/世界观/境界.md'])
  expect(result.items[0]).toMatchObject({ match: 'keyword', title: '境界' })
  expect(result.items[0]?.matched).toContain('金丹期')
  expect(result.items[0]?.excerpt).toContain('金丹期')
  expect(result.items[0]?.line_start).toBeGreaterThan(0)
  expect(result.items[0]?.line_end).toBeGreaterThanOrEqual(result.items[0]?.line_start ?? 0)
  expect(result.omitted).toBe(0)
})

it('prefers the longer name and does not also return the shorter name inside it', async (context) => {
  const directory = await book(context)
  await writeSetting(directory, '设定/角色/林动.md', '# 林动\n\n林动独自离开。\n')
  await writeSetting(directory, '设定/角色/林动娘.md', '# 林动娘\n\n林动娘在家等候。\n')
  const result = lookupSettings(directory, '林动娘回了家。')
  expect(result.items.map(item => [item.source, item.match])).toEqual([['设定/角色/林动娘.md', 'exact']])
})

it('reads aliases from a header line and from front matter', async (context) => {
  const directory = await book(context)
  await writeSetting(directory, '设定/角色/林动.md', '# 林动\n\n别名：林师兄、废物\n\n林动是雾港账房学徒。\n')
  await writeSetting(directory, '设定/角色/管事.md', '---\naliases:\n  - 账房先生\n---\n# 管事\n\n管事守着库房大门。\n')
  const alias = lookupSettings(directory, '废物推开门。')
  expect(alias.items[0]).toMatchObject({ source: '设定/角色/林动.md', title: '林动', match: 'alias', line_start: 1 })
  expect(alias.items[0]?.excerpt).toContain('废物')
  expect(alias.items[0]?.line_end).toBeGreaterThanOrEqual(3)
  const frontMatter = lookupSettings(directory, '账房先生没有说话。')
  expect(frontMatter.items[0]).toMatchObject({ source: '设定/角色/管事.md', match: 'alias', title: '管事' })
})

it('does not treat a later 别名 line as a declaration', async (context) => {
  const directory = await book(context)
  await writeSetting(directory, '设定/角色/林动.md', '# 林动\n\n## 经历\n\n别名：林师兄\n')
  const result = lookupSettings(directory, '林师兄入城。')
  expect(result.items.every(item => item.match !== 'alias')).toBe(true)
  expect(result.items.map(item => item.source)).toContain('设定/角色/林动.md')
})

it('does not exact-match a generic two-character section title inside an outline label', async (context) => {
  const directory = await book(context)
  await writeSetting(directory, '设定/关系.md', '# 关系\n\n师徒之间保持距离。\n')
  const result = lookupSettings(directory, '人物关系变化')
  expect(result.items).toEqual([])
  expect(result.settings_present).toBe(true)
})

it('marks two files that share an alias', async (context) => {
  const directory = await book(context)
  await writeSetting(directory, '设定/势力/甲.md', '# 青云甲\n\n别名：青云\n')
  await writeSetting(directory, '设定/势力/乙.md', '# 青云乙\n\n别名：青云\n')
  const result = lookupSettings(directory, '青云来了。')
  expect(result.items.map(item => item.source)).toEqual(['设定/势力/乙.md', '设定/势力/甲.md'])
  expect(result.items.every(item => item.ambiguous === true && item.match === 'alias')).toBe(true)
})

it('returns an empty page for an empty library and for a book without tracking', async (context) => {
  const empty = await book(context)
  await mkdir(join(empty, '设定'), { recursive: true })
  const missing = lookupSettings(empty, '林动走进库房。')
  expect(missing).toMatchObject({ schema: 'story-project-lookup/v1', source: '设定/', settings_present: false, indexed_files: 0, total: 0, items: [], omitted: 0, next_offset: null })
  const untracked = await book(context, '无追踪')
  await writeSetting(untracked, '设定/角色/林动.md', '# 林动\n\n林动离开雾港。\n')
  const found = lookupSettings(untracked, '林动离开。')
  expect(found.items[0]).toMatchObject({ source: '设定/角色/林动.md', match: 'exact' })
  await expect(readFile(join(untracked, '追踪/_tracking-state.json'))).rejects.toThrow()
})

it('pages within the byte budget and can resume from the index hash', async (context) => {
  const directory = await book(context)
  const names = Array.from({ length: 6 }, (_, index) => `地名${String.fromCharCode(0x7532 + index)}`)
  for (const name of names) {
    await writeSetting(directory, `设定/世界观/${name}.md`, `# ${name}\n\n${name}位于东海之滨，城中有旧塔。\n`)
  }
  const page = lookupSettings(directory, names.join('、'), { limit: 2 })
  expect(page.total).toBe(6)
  expect(page.items).toHaveLength(2)
  expect(page.omitted).toBe(4)
  expect(page.next_offset).toBe(2)
  expect(page.items.every(item => item.match === 'exact')).toBe(true)
  const next = lookupSettings(directory, names.join('、'), { limit: 2, offset: page.next_offset ?? 0, expectedIndex: page.index_sha256 })
  expect(next.items.map(item => item.source)).not.toEqual(page.items.map(item => item.source))
  expect([...page.items, ...next.items].map(item => item.source)).toEqual([...new Set([...page.items, ...next.items].map(item => item.source))])
  expect(() => lookupSettings(directory, names.join('、'), { expectedIndex: 'deadbeef' })).toThrow(SettingsLookupError)
  const bulky = await book(context, '长摘录')
  for (let index = 0; index < 12; index += 1) {
    const name = `长名地点${String(index)}`
    await writeSetting(bulky, `设定/世界观/${name}.md`, `${name}${'的城墙记事'.repeat(80)}\n`)
  }
  const packed = lookupSettings(bulky, Array.from({ length: 12 }, (_, index) => `长名地点${String(index)}`).join(''), { limit: 20 })
  expect(Buffer.byteLength(`${JSON.stringify(packed)}\n`, 'utf8')).toBeLessThanOrEqual(LOOKUP_MAX_BYTES)
  expect(packed.items.length).toBeGreaterThan(0)
  expect(packed.items.length).toBeLessThan(packed.total)
  expect(packed.omitted).toBe(packed.total - packed.items.length)
  expect(packed.next_offset).toBe(packed.items.length)
})

it('leaves a 500-chapter tracking file unchanged', async (context) => {
  const directory = await book(context, '长书')
  const tracking = join(directory, '追踪/_tracking-state.json')
  await mkdir(join(directory, '追踪'), { recursive: true })
  await writeFile(tracking, await readFile(new URL('./fixtures/continuity-state.json', import.meta.url)))
  await writeSetting(directory, '设定/角色/林舟.md', '# 林舟\n\n别名：铜钥匙主人\n\n林舟藏起铜钥匙。\n')
  const before = await readFile(tracking)
  const result = lookupSettings(directory, '铜钥匙主人入城。')
  expect(result.items[0]).toMatchObject({ source: '设定/角色/林舟.md', match: 'alias' })
  expect(await readFile(tracking)).toEqual(before)
})

it('rejects a setting symlink that leaves the book', async (context) => {
  const directory = await book(context)
  await mkdir(join(directory, '设定'), { recursive: true })
  await symlink('/etc/hostname', join(directory, '设定/逃.md'))
  expect(() => lookupSettings(directory, '林动')).toThrow(/leaves selected project/)
})

it('serves lookup through the CLI without a tracking file', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-lookup-cli-'))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '书')
  await writeSetting(directory, '设定/角色/林动.md', '# 林动\n\n别名：林师兄\n')
  await writeSetting(directory, '大纲/细纲_第001章.md', '林师兄在城门等候。\n')
  const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
  const loader = import.meta.resolve('tsx')
  const run = (args: readonly string[]) => execa(process.execPath, ['--import', loader, entry, 'project', 'lookup', ...args, '--workspace', root, '--book', '书'], {
    reject: false, cancelSignal: context.signal,
  })
  const byFile = await run(['--file', '大纲/细纲_第001章.md'])
  expect(byFile.exitCode, byFile.stderr).toBe(0)
  expect(JSON.parse(byFile.stdout)).toMatchObject({ schema: 'story-project-lookup/v1', total: 1, items: [{ source: '设定/角色/林动.md', match: 'alias' }] })
  const byText = await run(['--text', '林师兄'])
  expect(byText.exitCode, byText.stderr).toBe(0)
  expect(JSON.parse(byText.stdout).items[0].source).toBe('设定/角色/林动.md')
  for (const args of [[], ['--text', '林师兄', '--file', '大纲/细纲_第001章.md'], ['--text', '林师兄', '--limit', '0']]) {
    const failed = await run(args)
    expect(failed.exitCode, failed.stderr).toBe(2)
    expect(JSON.parse(failed.stdout).error_code).toMatch(/INVALID_/)
  }
})
