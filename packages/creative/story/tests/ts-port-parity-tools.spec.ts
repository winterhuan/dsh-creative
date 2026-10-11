/**
 * Differential parity of the TypeScript export, lineage, analysis-card and
 * short-contract modules against the reference Python and JavaScript scripts.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { inspectAnalysis, writeAnalysisCards } from '../src/core/analysis.ts'
import { verifyDelivery, verifyPhase2 } from '../src/core/checks/short-contracts.ts'
import { exportNovel } from '../src/core/export.ts'
import { recordEdge } from '../src/core/lineage.ts'

const reference = resolve(import.meta.dirname, 'reference')
const packageRoot = resolve(import.meta.dirname, '..')
const python = process.platform === 'win32' ? 'python' : 'python3'
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:all|http|https)_proxy$/iu.test(key)))

async function run(file: string, args: readonly string[], cwd: string): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const result = await execa(file, [...args], { cwd, env, extendEnv: false, reject: false })
  return { exitCode: result.exitCode ?? -1, stdout: result.stdout, stderr: result.stderr }
}

async function cli(args: readonly string[], cwd: string): Promise<{ readonly exitCode: number; readonly stderr: string; readonly value: unknown }> {
  const result = await run(python, ['-B', join(reference, 'cli.py'), ...args, '--json'], cwd)
  return { exitCode: result.exitCode, stderr: result.stderr, value: JSON.parse(result.stdout) as unknown }
}

async function workspace(context: TestContext): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-tools-parity-')))
  context.onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  return directory
}

function anonymize(value: unknown, roots: readonly string[]): unknown {
  if (typeof value === 'string') return roots.reduce((text, root) => text.split(root).join('<root>'), value)
  if (Array.isArray(value)) return value.map(item => anonymize(item, roots))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, anonymize(item, roots)]))
  return value
}

async function book(root: string, chapters: Readonly<Record<string, string>>): Promise<string> {
  const directory = join(root, '雾港来信')
  await mkdir(join(directory, '正文'), { recursive: true })
  for (const [name, text] of Object.entries(chapters)) await writeFile(join(directory, '正文', name), text)
  return directory
}

const chapters = {
  '第001章_开篇.md': '第1章 开篇\n\n　　春天来了。\n',
  '第002章_转折.md': '﻿第2章 转折\r\n\r\n　　雨停了。\r\n\r\n　　他出门了。\r\n\r\n',
  '第００３章_尾声.md': '第3章 尾声\n　　灯灭了。',
}

describe('TypeScript source-tool parity with the reference scripts', () => {
  it('exports the same novel text and chapter map', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    await book(rootA, chapters)
    const bookB = await book(rootB, chapters)
    const exported = await cli(['export', 'txt', '--workspace', rootA, '--book', '雾港来信', '--out-dir', join(rootA, '导出')], rootA)
    expect(exported.exitCode, exported.stderr).toBe(0)
    const summary = exportNovel(bookB, join(rootB, '导出'))
    expect(anonymize(exported.value, [rootA])).toEqual(anonymize(summary, [rootB]))
    for (const name of ['原著.txt', '章节映射.json']) {
      expect(await readFile(join(rootB, '导出', name), 'utf8'), name).toBe(await readFile(join(rootA, '导出', name), 'utf8'))
    }
    for (const [label, bad] of Object.entries({
      duplicates: { '第001章_a.md': '第1章 a\n\n　　甲。\n', '第001章_b.md': '第1章 b\n\n　　乙。\n' },
      unmatched: { '楔子.md': '楔子\n\n　　前情。\n' },
      'bad-heading': { '第001章_x.md': '很久很久以前。\n' },
      renumbered: { '第003章_x.md': '第5章 x\n\n　　错位。\n' },
      'stray-file': { '第001章_x.md': '第1章 x\n\n　　正文。\n', '草稿.txt': '草稿。\n' },
    })) {
      const badA = await workspace(context)
      const badB = await workspace(context)
      await book(badA, bad)
      const badBook = await book(badB, bad)
      const rejected = await cli(['export', 'txt', '--workspace', badA, '--book', '雾港来信', '--out-dir', join(badA, '导出')], badA)
      expect(rejected.exitCode, label).toBe(2)
      expect(() => exportNovel(badBook, join(badB, '导出')), label).toThrow((rejected.value as { message: string }).message.split(badA).join(badB))
    }
  }, 120_000)

  it('records the same lineage edges and fingerprints', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    for (const root of [rootA, rootB]) {
      await book(root, chapters)
      await mkdir(join(root, '剧集/EP001/制作成果'), { recursive: true })
      await writeFile(join(root, '剧集/EP001/剧本.md'), '# EP001\n')
      await writeFile(join(root, '剧集/EP001/制作成果/SHOT-001.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]))
      await mkdir(join(root, '剧集/EP001/a-b'))
      await writeFile(join(root, '剧集/EP001/a-b/x.md'), 'x\n')
      await mkdir(join(root, '剧集/EP001/a'))
      await writeFile(join(root, '剧集/EP001/a/b.md'), 'y\n')
    }
    const edges: readonly { readonly args: readonly string[]; readonly options: Parameters<typeof recordEdge>[1] }[] = [
      { args: ['--from-domain', 'novel', '--from-path', '雾港来信/正文/第001章_开篇.md', '--to-domain', 'drama', '--to-path', '剧集/EP001', '--decision', '合并人物甲/乙', '--decision', 'EP001覆盖第1章'], options: { fromDomain: 'novel', fromPath: '雾港来信/正文/第001章_开篇.md', toDomain: 'drama', toPath: '剧集/EP001', decisions: ['合并人物甲/乙', 'EP001覆盖第1章'] } },
      { args: ['--from-domain', 'drama', '--from-path', '剧集/EP001', '--to-domain', 'video', '--to-path', 'video-recaps\\demo', '--by', '编剧'], options: { fromDomain: 'drama', fromPath: '剧集/EP001', toDomain: 'video', toPath: 'video-recaps\\demo', by: '编剧' } },
    ]
    for (const edge of edges) {
      const recorded = await cli(['lineage', 'record', '--workspace', rootA, ...edge.args], rootA)
      expect(recorded.exitCode, recorded.stderr).toBe(0)
      const { at: _atA, ...entryA } = recorded.value as { at: string }
      const { at: _atB, ...entryB } = recordEdge(rootB, edge.options)
      expect(entryA).toEqual(entryB)
    }
    const ledgerA = (await readFile(join(rootA, '改编谱系.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    const ledgerB = (await readFile(join(rootB, '改编谱系.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(ledgerB.map(({ at: _at, ...rest }) => rest)).toEqual(ledgerA.map(({ at: _at, ...rest }) => rest))
    for (const [label, args] of Object.entries({
      domain: ['--from-domain', 'opera', '--from-path', '雾港来信/正文/第001章_开篇.md', '--to-domain', 'drama', '--to-path', '剧集/EP001'],
      missing: ['--from-domain', 'novel', '--from-path', '雾港来信/正文/缺失.md', '--to-domain', 'drama', '--to-path', '剧集/EP001'],
      escape: ['--from-domain', 'novel', '--from-path', '../escape.md', '--to-domain', 'drama', '--to-path', '剧集/EP001'],
      absolute: ['--from-domain', 'novel', '--from-path', '雾港来信/正文/第001章_开篇.md', '--to-domain', 'drama', '--to-path', '/abs/path'],
      dot: ['--from-domain', 'novel', '--from-path', '雾港来信/正文/第001章_开篇.md', '--to-domain', 'drama', '--to-path', '.'],
      blank: ['--from-domain', 'novel', '--from-path', '雾港来信/正文/第001章_开篇.md', '--to-domain', 'drama', '--to-path', '剧集/EP001', '--decision', '  '],
    })) {
      const rejected = await cli(['lineage', 'record', '--workspace', rootA, ...args], rootA)
      expect(rejected.exitCode, label).toBe(2)
      const read = (name: string): string => { const index = args.indexOf(name); return args[index + 1] ?? '' }
      const decisions = args.filter((_, index) => args[index - 1] === '--decision')
      expect(() => recordEdge(rootB, { fromDomain: read('--from-domain'), fromPath: read('--from-path'), toDomain: read('--to-domain'), toPath: read('--to-path'), decisions }), label)
        .toThrow((rejected.value as { message: string }).message)
    }
  }, 120_000)

  it('inspects and publishes the same analysis cards', async (context) => {
    const rootA = await workspace(context)
    const rootB = await workspace(context)
    const source = join(await workspace(context), '来源.txt')
    const lines = Array.from({ length: 12 }, (_, index) => `第${String(index + 1)}行：她推开木门，把篮子放在桌边，灶上的水开了。`)
    await writeFile(source, `﻿${lines.join('\n')}\r\n`)
    const selection = { chapters: [{ chapter: 1, title: '推门', start_line: 1, end_line: 6 }, { chapter: 2, title: '水开', start_line: 7, end_line: 12 }] }
    const inspectArgs = (root: string): string[] => ['analysis', 'inspect', '--workspace', root, '--title', '参考书', '--source', source, '--input', join(root, 'selection.json')]
    await writeFile(join(rootA, 'selection.json'), JSON.stringify(selection))
    const inspected = await cli(inspectArgs(rootA), rootA)
    expect(inspected.exitCode, inspected.stderr).toBe(0)
    const inspectedB = inspectAnalysis(rootB, '参考书', source, selection)
    expect(anonymize(inspected.value, [rootA])).toEqual(anonymize(inspectedB, [rootB]))
    const summary = '她推开木门，把篮子放在桌边，灶上的水开了，壶盖一下一下地跳，她没去管，院门外有人喊她的小名，喊了两声就不喊了，夜色压下来的时候她才想起篮子里还有没拿出来的东西，于是又回到桌边，把东西一件件摆在灯下，直到听见院门被风吹开的声音。'
    const card = (chapter: number, title: string, locator: string): Record<string, unknown> => ({
      chapter, title, summary, key_events: ['推门进屋', '水开了'], characters: [{ name: '她', importance: 'major' }],
      turning_points: [{ title: '推门', type: '行动', event: '她推开了门', tone: '轻松', locator }],
    })
    const cardsDocument = { ...selection, source, source_sha256: inspectedB.source_sha256, source_version: inspectedB.source_version, cards: [card(1, '推门', 'L2-L3'), card(2, '水开', '灶上的水开了')], failed: [] }
    for (const root of [rootA, rootB]) await writeFile(join(root, 'cards.json'), JSON.stringify(cardsDocument))
    const writeArgs = (root: string): string[] => ['analysis', 'write-cards', '--workspace', root, '--title', '参考书', '--source', source, '--input', join(root, 'cards.json')]
    const written = await cli(writeArgs(rootA), rootA)
    expect(written.exitCode, written.stderr).toBe(0)
    expect(anonymize(written.value, [rootA])).toEqual(anonymize(writeAnalysisCards(rootB, '参考书', source, cardsDocument), [rootB]))
    for (const name of ['第001章_摘要.md', '第002章_摘要.md']) {
      expect(await readFile(join(rootB, '拆文库/参考书/章节', name), 'utf8'), name).toBe(await readFile(join(rootA, '拆文库/参考书/章节', name), 'utf8'))
    }
    const partial = { ...cardsDocument, replace: [1], cards: [card(1, '推门', 'L1')], failed: [{ chapter: 2, reason: 'extractor timed out' }] }
    for (const root of [rootA, rootB]) await writeFile(join(root, 'cards.json'), JSON.stringify(partial))
    const second = await cli(writeArgs(rootA), rootA)
    expect(second.exitCode).toBe(0)
    expect(anonymize(second.value, [rootA])).toEqual(anonymize(writeAnalysisCards(rootB, '参考书', source, partial), [rootB]))
    const failing = { ...cardsDocument, replace: [1, 2], cards: [card(1, '推门', 'L9'), card(2, '别的标题', 'L8')] }
    for (const root of [rootA, rootB]) await writeFile(join(root, 'cards.json'), JSON.stringify(failing))
    const third = await cli(writeArgs(rootA), rootA)
    expect(third.exitCode).toBe(1)
    expect(anonymize(third.value, [rootA])).toEqual(anonymize(writeAnalysisCards(rootB, '参考书', source, failing), [rootB]))
    const stale = { ...cardsDocument, source_sha256: 'f'.repeat(64) }
    await writeFile(join(rootA, 'cards.json'), JSON.stringify(stale))
    const rejected = await cli(writeArgs(rootA), rootA)
    expect(rejected.exitCode).toBe(2)
    expect(() => writeAnalysisCards(rootB, '参考书', source, stale)).toThrow((rejected.value as { message: string }).message)
  }, 120_000)

  it('verifies short-story contracts like the reference scripts', async (context) => {
    const root = await workspace(context)
    const scripts = reference
    const skillRoot = join(packageRoot, 'knowledge/story/skills/story-write')
    const settings = [
      '# 设定', '- 目标平台：知乎盐言', '- 题材参考：`references/short/genre-styles/甜宠.md`', '- 核心招式：误会；双向暗恋', '- 反派设计：不适用（无反派）',
      '- 反转类型：无反转', '- 反转位置：不适用（无反转）', '- 付费点：不适用（免费连载）', '- 目标字数：8000-20000',
    ].join('\n')
    const header = '| 结构段/五段功能 | 主事件 | 情节推进 | 情绪 | 人物/关系变化 | 因果/逻辑链 | 读者新获知什么 | 结尾承接/钩子 | 伏笔/物件 | 场景形态 | 对白作用 | 目标字数 |'
    const outline = [header, '|---|---|---|---|---|---|---|---|---|---|---|---|',
      '| 起因 | 相遇 | 撞见{对话} -> 误会{冲突} | 尴尬 | 初识 | 因撞见而误会 | 他是邻居 | 她决定道歉 | 伞 | 走廊 | 推动 | 4000 |',
      '| 发展 | 道歉 | 送伞{递进} | 暖 | 关系缓和 | 因道歉而靠近 | 他记得她 | 约定 | 伞 | 门口 | 试探 | 6000 |'].join('\n')
    const projects: Readonly<Record<string, readonly [string, string]>> = {
      valid: [settings, outline],
      broken: [settings.replace('- 目标平台：知乎盐言\n', '').replace('核心招式：误会；双向暗恋', '核心招式：{招式}'), outline.replace('4000', '400')],
      missing: ['', ''],
    }
    for (const [label, [settingsText, outlineText]] of Object.entries(projects)) {
      const project = join(root, label)
      await mkdir(project)
      if (settingsText !== '') await writeFile(join(project, '设定.md'), settingsText)
      if (outlineText !== '') await writeFile(join(project, '小节大纲.md'), outlineText)
      const checked = await run(process.execPath, [join(scripts, 'check-phase2-contract.js'), '--json', project], root)
      const ported = verifyPhase2(project, skillRoot)
      expect(checked.exitCode, `${label}: ${checked.stderr}`).toBe(ported.ok ? 0 : 1)
      expect(JSON.parse(checked.stdout), label).toEqual(ported)
    }
    const bodies: Readonly<Record<string, string>> = {
      numeric: '### 1.\n她停下。\n推开门。\n\n### 2.\n他在。\n',
      chapters: '### 第一章\n她停下。\n### 第二章\n他在。\n',
      zhihu: '1.\n她停下。\n\n2.\n他在。\n3.\n灯灭。\n',
      mixed: '### 1.\n她停下。\n\n她坐下。\n2.\n他在。\n',
      empty: '',
    }
    for (const [label, body] of Object.entries(bodies)) {
      const project = join(root, `body-${label}`)
      await mkdir(project)
      if (body !== '') await writeFile(join(project, '正文.md'), body)
      for (const contract of [{ minChars: 1, maxChars: 40, sections: 2 }, { minChars: 10, maxChars: 12, sections: 3 }]) {
        const args = ['--json', '--min-chars', String(contract.minChars), '--max-chars', String(contract.maxChars), '--sections', String(contract.sections), project]
        const checked = await run(process.execPath, [join(scripts, 'check-delivery-contract.js'), ...args], root)
        const ported = verifyDelivery(project, contract)
        expect(checked.exitCode, `${label}: ${checked.stderr}`).toBe(ported.ok ? 0 : 1)
        expect(JSON.parse(checked.stdout), label).toEqual(ported)
      }
    }
  }, 120_000)
})
