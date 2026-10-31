/**
 * Differential parity between the TypeScript core and the Python/JavaScript
 * runtime it replaces. Every case runs the shipped script and the ported
 * function on the same input and compares the structured output, so the
 * runtime can be retired only when this file stays green.
 */
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { aiPatternsDocument, scanAiPatterns } from '../src/core/checks/ai-patterns.ts'
import { scanDegeneration } from '../src/core/checks/degeneration.ts'
import { checkOutlineCopy } from '../src/core/checks/outline-copy.ts'
import { normalizePunctuation, readProjectPunctuationPolicy, type PunctuationPolicy, type QuoteMode } from '../src/core/checks/punctuation.ts'
import { verifyOutline } from '../src/core/outline-contract.ts'
import { checkpointWordcount, evaluateWordcount, findChapterFile, measureWordcount, WordcountError } from '../src/core/wordcount.ts'

const runtime = resolve(import.meta.dirname, 'reference')
const fixtures = resolve(import.meta.dirname, 'fixtures')
const python = process.platform === 'win32' ? 'python' : 'python3'
// Proxy variables make Node print an experimental-proxy warning on stderr; the scripts stay offline.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:all|http|https)_proxy$/iu.test(key)))

interface Run { readonly exitCode: number; readonly stdout: string; readonly stderr: string }

async function run(file: string, args: readonly string[], cwd: string): Promise<Run> {
  const result = await execa(file, [...args], { cwd, env, extendEnv: false, reject: false, stripFinalNewline: false })
  return { exitCode: result.exitCode ?? -1, stdout: result.stdout, stderr: result.stderr }
}

async function workspace(context: TestContext): Promise<string> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-parity-')))
  context.onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  return directory
}

interface ProseCase { readonly id: string; readonly text: string }

async function proseCases(): Promise<ProseCase[]> {
  const corpus = JSON.parse(await readFile(join(fixtures, 'novel-pattern-corpus.json'), 'utf8')) as { cases: { id: string; text: string }[] }
  const cases: ProseCase[] = [
    ...corpus.cases.map(({ id, text }) => ({ id, text })),
    { id: 'workflow-body', text: await readFile(join(fixtures, 'workflow-body.md'), 'utf8') },
    { id: 'clean', text: '她推开木门，把篮子放在桌边。\n' },
    { id: 'planted-contrast-newline', text: '这不是归途，而是牢笼。\n' },
    { id: 'todo', text: 'TODO：补完这一段。\n' },
    { id: 'repeat-lines', text: '她在河边等了整整一个下午也没有等到人。\n她在河边等了整整一个下午也没有等到人。\n' },
    { id: 'repeat-sentence', text: '那个人到底去了哪里没人知道。那个人到底去了哪里没人知道。那个人到底去了哪里没人知道。\n' },
    { id: 'truncated', text: '她推开木门，把篮子放在桌边\n' },
    { id: 'meta-leak', text: '第三章 夜访\n\n按照细纲，本章要写她推开木门。\n“下一章再说吧。”她说。\n' },
    { id: 'ai-refusal', text: '作为AI，我无法继续写下去。\n' },
    { id: 'fences-frontmatter', text: '---\ntitle: 测试\n---\n```\n这不是归途，而是牢笼。\n```\n正文开始了。\n' },
    { id: 'em-dash-dialogue', text: '她停住——门还开着。\n“等等……别关门——”\n' },
    { id: 'stutter', text: '他走。她停。门开。风来。灯灭。人散。\n' },
    { id: 'long-paragraph', text: `${'她'.repeat(201)}。\n` },
    { id: 'voice-contrast', text: '声音不高，却压住了整个大厅。\n' },
    { id: 'negation-parade', text: '没有伴奏，没有和声，没有提词器。\n' },
    { id: 'reverse-not-is', text: '是真嗓子，不是修音修出来的。\n' },
    { id: 'cross-negation', text: '不是因为害怕。\n也不是因为累了。\n只是不想再等了。\n' },
    { id: 'quote-emphasis', text: '他是被请来“把关”的，所谓“专家”，其实“水货”。\n' },
    { id: 'notice-lines', text: '【当前规则：不得离开本区域】\n【必须在天黑前执行指令】\n【违规者将被视为放弃权限】\n【本系统提示：任务失败将计入责任】\n' },
    { id: 'crlf-bom', text: '﻿她推开木门。\r\n“等等——”\r\n' },
    { id: 'html-comment', text: '她停下——推开门。<!-- 去味:跳过 --\n还没关上。\n' },
    { id: 'digits', text: '从1——3点之间，他……没有出现。\n' },
  ]
  // Cases share one directory per test, so a duplicate id would race on the same file.
  expect(new Set(cases.map(item => item.id)).size).toBe(cases.length)
  return cases
}

describe('TypeScript core parity with the bundled runtime', () => {
  it('reports the same AI-pattern findings and document summary', async (context) => {
    const cwd = await workspace(context)
    await Promise.all((await proseCases()).map(async ({ id, text }) => {
      const file = `${id}.md`
      await writeFile(join(cwd, file), text)
      const reference = await run(process.execPath, [join(runtime, 'check-ai-patterns.js'), '--check', '--json', '--fail-on=blocking', file], cwd)
      expect(reference.exitCode, `${id}: ${reference.stderr}`).toBe(0)
      const findings = scanAiPatterns(text).map(finding => ({ file, ...finding }))
      expect(JSON.parse(reference.stdout), id).toEqual({ findings, documents: [aiPatternsDocument(file, text, findings.length)] })
    }))
  }, 120_000)

  it('reports the same degeneration findings and exit status', async (context) => {
    const cwd = await workspace(context)
    await Promise.all((await proseCases()).map(async ({ id, text }) => {
      const file = `${id}.md`
      await writeFile(join(cwd, file), text)
      const reference = await run(process.execPath, [join(runtime, 'check-degeneration.js'), '--check', '--json', '--fail-on=blocking', file], cwd)
      const findings = scanDegeneration(text).map(finding => ({ file, ...finding }))
      expect(reference.exitCode, `${id}: ${reference.stderr}`).toBe(findings.some(finding => finding.severity === 'blocking') ? 1 : 0)
      expect(JSON.parse(reference.stdout), id).toEqual({ findings })
    }))
  }, 120_000)

  it('normalizes punctuation identically under every policy and quote mode', async (context) => {
    const cwd = await workspace(context)
    const modes: readonly { readonly policy: PunctuationPolicy; readonly quoteMode: QuoteMode }[] = [
      { policy: 'preserve', quoteMode: 'keep' },
      { policy: 'normalize-narration', quoteMode: 'keep' },
      { policy: 'normalize-narration', quoteMode: 'ascii' },
      { policy: 'normalize-narration', quoteMode: 'yan' },
    ]
    const entry = join(runtime, 'normalize-punctuation.js')
    await Promise.all((await proseCases()).flatMap(({ id, text }) => modes.map(async (mode, index) => {
      const file = `${id}-${String(index)}.md`
      await writeFile(join(cwd, file), text)
      const options = ['--policy', mode.policy, '--quote-mode', mode.quoteMode]
      const checked = await run(process.execPath, [entry, '--check', ...options, file], cwd)
      const expected = normalizePunctuation(text, mode)
      expect(checked.exitCode, `${file}: ${checked.stderr}`).toBe(expected.findings.length > 0 ? 1 : 0)
      const lines = expected.findings.map(finding => `${file}:${String(finding.line)}:${String(finding.column)}: ${finding.type}: ${finding.message}`)
      expect(checked.stdout, file).toBe(lines.length > 0 ? `${lines.join('\n')}\n` : '')
      const written = await run(process.execPath, [entry, ...options, file], cwd)
      expect(written.exitCode, `${file}: ${written.stderr}`).toBe(0)
      expect(await readFile(join(cwd, file), 'utf8'), file).toBe(expected.output)
    })))
  }, 120_000)

  it('reads the project punctuation policy like the script', async (context) => {
    const cwd = await workspace(context)
    const body = join(cwd, '正文.md')
    const text = '她停下——推开门。\n'
    await writeFile(body, text)
    expect(readProjectPunctuationPolicy(cwd)).toBeUndefined()
    await mkdir(join(cwd, '设定'))
    await writeFile(join(cwd, '设定/写作检查.json'), JSON.stringify({ punctuation: 'normalize-narration' }))
    expect(readProjectPunctuationPolicy(cwd)).toBe('normalize-narration')
    const checked = await run(process.execPath, [join(runtime, 'normalize-punctuation.js'), '--project', cwd, '--check', body], cwd)
    expect(checked.exitCode).toBe(1)
    const expected = normalizePunctuation(text, { policy: 'normalize-narration', quoteMode: 'keep' })
    expect(checked.stdout).toBe(`${expected.findings.map(f => `${body}:${String(f.line)}:${String(f.column)}: ${f.type}: ${f.message}`).join('\n')}\n`)
    await writeFile(join(cwd, '设定/写作检查.json'), '{"punctuation":"typo"}')
    expect(() => readProjectPunctuationPolicy(cwd)).toThrow('expected {"punctuation"')
    expect((await run(process.execPath, [join(runtime, 'normalize-punctuation.js'), '--project', cwd, '--check', body], cwd)).exitCode).toBe(2)
  })

  it('finds the same outline overlaps, anchors and auto-discovered outlines', async (context) => {
    const cwd = await workspace(context)
    const entry = join(runtime, 'check-outline-copy.js')
    const prose = '远处的老人背着竹篓沿着河岸慢慢走了过来，身后跟着一条瘦得只剩骨架的黄狗。\n他在桥头停下，把竹篓放到石阶上，从怀里掏出半块干粮掰给狗。\n'
    const copied = join(cwd, '抄写.md')
    const outline = join(cwd, '细纲.md')
    await writeFile(copied, `# 第一章\n\n${prose}`)
    await writeFile(outline, `- 内容概括：${prose}`)
    const anchored = join(cwd, '锚句.md')
    await writeFile(anchored, `${prose}- 复沓锚句：\n  1. 远处的老人背着竹篓沿着河岸慢慢走了过来\n  - 点2：把竹篓放到石阶上，从怀里掏出半块干粮掰给狗\n`)
    const book = join(cwd, '书')
    await mkdir(join(book, '正文'), { recursive: true })
    await mkdir(join(book, '大纲'))
    await writeFile(join(book, '正文/第001章_桥头.md'), prose)
    await writeFile(join(book, '大纲/细纲_第001章_桥头.md'), `- 情节安排：${prose}`)
    await writeFile(join(book, '正文/第002章.md'), prose)
    const short = join(cwd, '短篇')
    await mkdir(short)
    await writeFile(join(short, '正文.md'), prose)
    await writeFile(join(short, '小节大纲.md'), prose)
    const cases: readonly { readonly args: readonly string[]; readonly prose: string; readonly outline?: string }[] = [
      { args: ['--outline', outline, copied], prose: copied, outline },
      { args: ['--outline', anchored, copied], prose: copied, outline: anchored },
      { args: [join(book, '正文/第001章_桥头.md')], prose: join(book, '正文/第001章_桥头.md') },
      { args: [join(book, '正文/第002章.md')], prose: join(book, '正文/第002章.md') },
      { args: [join(short, '正文.md')], prose: join(short, '正文.md') },
    ]
    for (const item of cases) {
      const reference = await run(process.execPath, [entry, ...item.args], cwd)
      const ported = checkOutlineCopy(item.prose, item.outline)
      expect(reference.exitCode, `${item.args.join(' ')}: ${reference.stderr}`).toBe(ported.status)
      expect(reference.stdout, item.args.join(' ')).toBe(ported.output)
    }
    expect(() => checkOutlineCopy(copied, join(cwd, '不存在.md'))).toThrow('ENOENT')
  })

  it('measures, evaluates and checkpoints wordcounts like the CLI', async (context) => {
    const cwd = await workspace(context)
    const body = await readFile(join(fixtures, 'workflow-body.md'), 'utf8')
    const bodies: readonly { readonly id: string; readonly text: string }[] = [
      { id: 'fixture', text: body },
      { id: 'bom-crlf-frontmatter', text: `﻿---\ntitle: 章\n---\r\n\r\n# 第一章\r\n${body.replaceAll('\n', '\r\n')}` },
      { id: 'heading-only', text: '# 第一章\n' },
      { id: 'empty', text: '' },
      { id: 'whitespace', text: ' 　\n\t\n' },
      ...[849, 850, 879, 880, 1000, 1120, 1121, 1150, 1151].map(length => ({ id: `len-${String(length)}`, text: `${'字'.repeat(length)}\n` })),
    ]
    const targets: readonly (string | undefined)[] = [undefined, '1000', '0', '约 500', '3,000', '-5', '1e3', '9007199254740992']
    const cli = join(runtime, 'cli.py')
    await Promise.all(bodies.flatMap(({ id, text }) => targets.map(async (target, index) => {
      const file = join(cwd, `${id}-${String(index)}.md`)
      await writeFile(file, text)
      const identity = index === 1 ? ['--chapter', '7', '--case-id', 'parity'] : []
      const counted = await run(python, ['-B', cli, 'text', 'count', '--file', file, '--json', ...(target === undefined ? [] : ['--target', target]), ...identity], cwd)
      const ported = target === undefined
        ? measureWordcount(text, index === 1 ? { chapter: 7, caseId: 'parity' } : {})
        : evaluateWordcount(text, target, index === 1 ? { chapter: 7, caseId: 'parity' } : {})
      expect(counted.exitCode, `${id} target=${String(target)}: ${counted.stderr}`).toBe(ported.status === 'invalid' ? 2 : 0)
      expect(JSON.parse(counted.stdout), `${id} target=${String(target)}`).toEqual(ported)
      if (target === undefined) return
      const checkpoint = await run(python, ['-B', cli, 'text', 'count', '--file', file, '--json', '--target', target, '--checkpoint'], cwd)
      if (checkpoint.exitCode === 0) expect(JSON.parse(checkpoint.stdout), `${id} checkpoint ${target}`).toEqual(checkpointWordcount(text, target))
      else {
        expect(checkpoint.exitCode).toBe(2)
        expect(() => checkpointWordcount(text, target)).toThrow(WordcountError)
      }
    })))
  }, 120_000)

  it('verifies outlines like the Python contract checker', async (context) => {
    const cwd = await workspace(context)
    const valid = await readFile(join(fixtures, 'workflow-outline.md'), 'utf8')
    const variants: readonly { readonly id: string; readonly text: string }[] = [
      { id: 'valid', text: valid },
      { id: 'bom', text: `﻿${valid}` },
      { id: 'missing-field', text: valid.replace(/^- 章首钩子：.*\n/mu, '') },
      { id: 'hollow-intent', text: valid.replace(/^- 读者期待：.*$/mu, '- 读者期待：[待补充]、TODO') },
      { id: 'missing-subsection', text: valid.replace(/^#{3,4}\s*情节细化.*$/mu, '### 细化') },
      { id: 'missing-act', text: valid.replace(/^(\s*[-*+]\s*\*{0,2})转折(\*{0,2}[ \t]*[：:])/mu, '$1转机$2') },
      { id: 'table-header', text: valid.replace('功能标签', '标签') },
      { id: 'target-low', text: valid.replace('字数目标：575', '字数目标：400') },
      { id: 'target-high', text: valid.replace('字数目标：575', '字数目标：25000') },
      { id: 'target-text', text: valid.replace('字数目标：575', '字数目标：约 500') },
      { id: 'target-twice', text: valid.replace('字数目标：575', '字数目标：575\n- 字数目标：800') },
      { id: 'metric-wrong', text: valid.replace('字数口径：visible_chars_v1', '字数口径：chars') },
      { id: 'empty', text: '' },
      { id: 'blank', text: '  \n\t\n' },
    ]
    await Promise.all(variants.map(async ({ id, text }) => {
      const file = join(cwd, `${id}.md`)
      await writeFile(file, text)
      const reference = await run(python, ['-B', join(runtime, 'check_outline_contract.py'), '--json', file], cwd)
      const ported = verifyOutline(file)
      expect(reference.exitCode, `${id}: ${reference.stderr}`).toBe(ported.ok ? 0 : 1)
      expect(JSON.parse(reference.stdout), id).toEqual(ported)
    }))
    const missing = join(cwd, '缺失.md')
    const reference = await run(python, ['-B', join(runtime, 'check_outline_contract.py'), '--json', missing], cwd)
    const ported = verifyOutline(missing)
    expect(reference.exitCode).toBe(1)
    const report = JSON.parse(reference.stdout) as { ok: boolean; failures: { id: string }[] }
    expect(ported.ok).toBe(false)
    expect(ported.failures.map(failure => failure.id)).toEqual(report.failures.map(failure => failure.id))
  }, 120_000)

  it('resolves chapter outlines through the CLI like the Python resolver', async (context) => {
    const cwd = await workspace(context)
    const book = join(cwd, '雾港来信')
    await mkdir(join(book, '大纲'), { recursive: true })
    await mkdir(join(book, '正文'))
    await writeFile(join(book, '大纲/细纲_第001章_港口.md'), await readFile(join(fixtures, 'workflow-outline.md'), 'utf8'))
    const cli = join(runtime, 'cli.py')
    const scope = ['--workspace', cwd, '--book', '雾港来信']
    const checked = await run(python, ['-B', cli, 'outline', 'check', ...scope, '--chapter', '1', '--json'], cwd)
    expect(checked.exitCode, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout)).toEqual(verifyOutline(findChapterFile(join(book, '大纲'), 1, { outline: true, allowMissing: true })))
    const proposed = findChapterFile(join(book, '大纲'), 2, { outline: true, allowMissing: true })
    expect(proposed).toBe(join(book, '大纲', '细纲_第002章.md'))
    const missing = await run(python, ['-B', cli, 'outline', 'check', ...scope, '--chapter', '2', '--json'], cwd)
    expect(missing.exitCode).toBe(1)
    expect((JSON.parse(missing.stdout) as { file: string; ok: boolean }).file).toBe(proposed)
    await writeFile(join(book, '大纲/细纲_第001章_重复.md'), '')
    const ambiguous = await run(python, ['-B', cli, 'outline', 'check', ...scope, '--chapter', '1', '--json'], cwd)
    expect(ambiguous.exitCode).toBe(2)
    expect(() => findChapterFile(join(book, '大纲'), 1, { outline: true })).toThrow((JSON.parse(ambiguous.stdout) as { message: string }).message)
  })
})
