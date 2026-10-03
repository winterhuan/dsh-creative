import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'

const knowledge = resolve(import.meta.dirname, '../knowledge/story')
const python = process.platform === 'win32' ? 'python' : 'python3'
const cleanProse = '她推开木门，把篮子放在桌边。\n'
const validLongOutline = `- 核心事件：主角必须亲自取回账册
- 字数目标：500
- 字数口径：visible_chars_v1
- 阶段位置：开篇
- 单元ID/位置：U001/1
- 目标情绪：受压后夺回主动
- 读者期待：主角能否在封门前拿到账册
- 主角目标：进入库房并取回账册
- 主要阻碍：管事封门且要求交出钥匙
- 关键选择：主角公开质疑封门命令并承担得罪管事的后果
- 代价或后果：主角暴露自己掌握账册线索
- 局部兑现：主角拿到账册并确认第一笔假账
- 章尾问题：账册缺失的最后一页被谁拿走
- 章节定位：首次主动反击
- 本章结构公式：目标—阻碍—选择—后果
- 章首钩子：库房将在一刻钟后封门
- 爽点：主角用管事自己的签押打开库门
- 本章禁止提前释放：幕后主使身份
- 契约风险：不能让帮手替主角拿到账册

### 内容概括
- 起因：库房即将封门
- 发展：主角寻找合法进入方式
- 转折：管事要求交出钥匙
- 高潮：主角公开签押漏洞
- 结尾：主角发现账册缺页

### 情节安排
- 主角进入库房并取回账册。

### 人物关系和出场顺序
- 主角先出场，管事随后阻拦。

### 情节细化
| # | 情节点 | 功能标签 | 执行边界 |
|---|---|---|---|
| 1 | 主角用签押打开库门 | 主角选择 | 不新增帮手或幕后揭示 |
`

function script(filename: string): string {
  return join(knowledge, 'scripts', filename)
}

async function workspace(context: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-knowledge-novel-'))
  context.onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function run(context: TestContext, cwd: string, command: string, args: string[]) {
  const child = execa(command, args, {
    cwd,
    cancelSignal: context.signal,
    reject: false,
    stripFinalNewline: false,
    env: { PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  })
  context.onTestFinished(async () => {
    child.kill('SIGKILL')
    await child
  })
  const result = await child
  expect(result.timedOut).toBe(false)
  expect(result.isCanceled).toBe(false)
  expect(result.signal).toBeUndefined()
  return result
}

describe('bundled novel executable scripts', () => {
  it('measures advisory precision and recall on public-domain prose and planted variants', async (context) => {
    const cwd = await workspace(context)
    const corpus = JSON.parse(await readFile(resolve(import.meta.dirname, 'fixtures/novel-pattern-corpus.json'), 'utf8')) as {
      cases: { id: string; text: string; expected: string[] }[]
    }
    const metrics = new Map<string, { tp: number; fp: number; fn: number }>()
    for (const sample of corpus.cases) {
      const file = join(cwd, `${sample.id}.md`)
      await writeFile(file, sample.text)
      const result = await run(context, cwd, process.execPath, [
        script('check-ai-patterns.js'), '--json', '--fail-on=blocking', file,
      ])
      expect(result.exitCode, result.stderr).toBe(0)
      const report = JSON.parse(result.stdout) as {
        findings: { type: string; severity: string }[]
        documents: { pattern_count: number; findings_per_kilo: number }[]
      }
      expect(report.findings.every(finding => finding.severity === 'advisory')).toBe(true)
      expect(report.documents[0]?.pattern_count).toBe(report.findings.length)
      const found = new Set(report.findings.map(finding => finding.type))
      if (sample.id === 'dialogue-pauses') expect(found.has('em-dash')).toBe(false)
      for (const rule of new Set([...found, ...sample.expected])) {
        const counts = metrics.get(rule) ?? { tp: 0, fp: 0, fn: 0 }
        if (found.has(rule)) counts[sample.expected.includes(rule) ? 'tp' : 'fp'] += 1
        else counts.fn += 1
        metrics.set(rule, counts)
      }
      expect([...found], sample.id).toEqual(expect.arrayContaining(sample.expected))
    }
    const measured = Object.fromEntries([...metrics].map(([rule, { tp, fp, fn }]) => [rule, {
      precision: tp + fp === 0 ? null : tp / (tp + fp),
      recall: tp + fn === 0 ? null : tp / (tp + fn),
    }]))
    expect(measured['not-is-comparison']).toEqual({ precision: 1, recall: 1 })
    expect(measured['repeated-sentence-link']).toEqual({ precision: 1, recall: 1 })
  })

  it('preserves punctuation by default and refuses invalid project policies', async (context) => {
    const cwd = await workspace(context)
    const body = join(cwd, '正文.md')
    const prose = '她停住——门还开着。\n“等等……别关门——”\n'
    await writeFile(body, prose)
    const entry = script('normalize-punctuation.js')
    expect((await run(context, cwd, process.execPath, [entry, body])).exitCode).toBe(0)
    expect(await readFile(body, 'utf8')).toBe(prose)
    const multiline = '“他低声说：‘别——’\n---\n我还在……这里。”\n<!-- “ -->\n她停下——推开门。\n'
    await writeFile(body, multiline)
    expect((await run(context, cwd, process.execPath, [entry, '--policy', 'normalize-narration', body])).exitCode).toBe(0)
    expect(await readFile(body, 'utf8')).toBe(multiline.replace('她停下——', '她停下，'))
    await writeFile(body, prose)
    await mkdir(join(cwd, '设定'))
    await writeFile(join(cwd, '设定/写作检查.json'), '{"punctuation":"typo"}')
    expect((await run(context, cwd, process.execPath, [entry, '--project', cwd, body])).exitCode).toBe(2)
    expect(await readFile(body, 'utf8')).toBe(prose)
  })

  it('runs shared entrypoints from a relocated novel knowledge bundle', async (context) => {
    const cwd = await workspace(context)
    const bundled = join(cwd, 'knowledge/story')
    await cp(knowledge, bundled, { recursive: true })
    await writeFile(join(cwd, 'package.json'), '{"type":"module"}\n')
    await writeFile(join(cwd, '正文.md'), cleanProse)
    const checked = await run(context, cwd, process.execPath, [
      join(bundled, 'scripts/check-ai-patterns.js'), '--check', '--json', '正文.md',
    ])
    expect(checked.exitCode, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout)).toMatchObject({ findings: [] })
    const initialized = await run(context, cwd, python, [
      '-B', join(bundled, 'scripts/author_memory_commit.py'), 'init', '--workspace', cwd,
    ])
    expect(initialized.exitCode, initialized.stderr).toBe(0)
    expect(JSON.parse(initialized.stdout)).toMatchObject({ ok: true })
  })

  for (const [filename, blockedProse] of [
    ['check-ai-patterns.js', '这不是归途，而是牢笼。\n'],
    ['check-degeneration.js', 'TODO：补完这一段。\n'],
  ] as const) {
    it(`${filename} distinguishes clean prose, findings, and unreadable input`, async (context) => {
      const cwd = await workspace(context)
      const body = join(cwd, '正文.md')
      const args = [script(filename), '--check', '--json', '--fail-on=blocking', body]
      await writeFile(body, cleanProse)
      const clean = await run(context, cwd, process.execPath, args)
      expect(clean.exitCode, clean.stderr).toBe(0)
      expect(JSON.parse(clean.stdout)).toMatchObject({ findings: [] })
      await writeFile(body, blockedProse)
      const blocked = await run(context, cwd, process.execPath, args)
      expect(blocked.exitCode, blocked.stderr).toBe(filename === 'check-ai-patterns.js' ? 0 : 1)
      expect(JSON.parse(blocked.stdout).findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: filename === 'check-ai-patterns.js' ? 'advisory' : 'blocking' }),
      ]))
      expect(await readFile(body, 'utf8')).toBe(blockedProse)
      await rm(body)
      const missing = await run(context, cwd, process.execPath, args)
      expect(missing.exitCode).toBe(2)
    })
  }

  it('checks punctuation without writing, then normalizes it through the same entrypoint', async (context) => {
    const cwd = await workspace(context)
    const body = join(cwd, '正文.md')
    const original = '她停下——推开门。\n'
    const entry = script('normalize-punctuation.js')
    await mkdir(join(cwd, '设定'))
    await writeFile(join(cwd, '设定/写作检查.json'), JSON.stringify({ punctuation: 'normalize-narration' }))
    await writeFile(body, original)
    const checked = await run(context, cwd, process.execPath, [entry, '--project', cwd, '--check', body])
    expect(checked.exitCode, checked.stderr).toBe(1)
    expect(await readFile(body, 'utf8')).toBe(original)
    const normalized = await run(context, cwd, process.execPath, [entry, '--project', cwd, body])
    expect(normalized.exitCode, normalized.stderr).toBe(0)
    expect(await readFile(body, 'utf8')).not.toContain('——')
    const clean = await run(context, cwd, process.execPath, [entry, '--project', cwd, '--check', body])
    expect(clean.exitCode, clean.stderr).toBe(0)

    const dialogue = '“别过来——我还没说完……”\n她停下——推开门。\n'
    await writeFile(body, dialogue)
    const dialogueNormalized = await run(context, cwd, process.execPath, [entry, '--project', cwd, body])
    expect(dialogueNormalized.exitCode, dialogueNormalized.stderr).toBe(0)
    expect(await readFile(body, 'utf8')).toBe('“别过来——我还没说完……”\n她停下，推开门。\n')
  })

  it('keeps outline-copy findings separate from read failures', async (context) => {
    const cwd = await workspace(context)
    const body = join(cwd, '正文.md')
    const outline = join(cwd, '小节大纲.md')
    const prose = '远处的老人背着竹篓沿着河岸慢慢走了过来。\n'
    await writeFile(body, prose)
    await writeFile(outline, prose)
    const args = [script('check-outline-copy.js'), '--outline', outline, body]
    const overlap = await run(context, cwd, process.execPath, args)
    expect(overlap.exitCode, overlap.stderr).toBe(1)
    expect(overlap.stdout).toContain('细纲照搬检测')
    await rm(outline)
    const missing = await run(context, cwd, process.execPath, args)
    expect(missing.exitCode).toBe(2)
    expect(missing.stderr).toContain('ENOENT')
    const optional = await run(context, cwd, process.execPath, [script('check-outline-copy.js'), body])
    expect(optional.exitCode, optional.stderr).toBe(0)
  })

  for (const hasOutlineDirectory of [false, true]) {
    it(`reports a missing chapter outline for preparation with outline directory ${hasOutlineDirectory}`, async (context) => {
      const cwd = await workspace(context)
      const project = join(cwd, 'book')
      await mkdir(project)
      if (hasOutlineDirectory) await mkdir(join(project, '大纲'))
      const args = [script('check-outline-contract.js'), '--json', '--project', project, '--chapter', '11']
      const missing = await run(context, cwd, process.execPath, args)
      expect(missing.exitCode, missing.stderr).toBe(1)
      const outline = join(project, '大纲/细纲_第011章.md')
      expect(JSON.parse(missing.stdout)).toMatchObject({
        ok: false, file: outline,
        failures: [{ id: 'outline.readable' }],
        repair_scope: [{ id: 'outline.readable', file: '细纲_第011章.md' }],
      })
      await expect(readFile(outline)).rejects.toMatchObject({ code: 'ENOENT' })
      await mkdir(join(project, '大纲'), { recursive: true })
      await writeFile(outline, validLongOutline, { flag: 'wx' })
      const ready = await run(context, cwd, process.execPath, args)
      expect(ready.exitCode, ready.stderr).toBe(0)
      expect(JSON.parse(ready.stdout)).toMatchObject({ ok: true, file: outline })
      expect(await readFile(outline, 'utf8')).toBe(validLongOutline)
    })
  }

  it('uses an existing outline filename and rejects ambiguous chapters or a missing project', async (context) => {
    const cwd = await workspace(context)
    const entry = script('check-outline-contract.js')
    const absent = await run(context, cwd, process.execPath, [entry, '--json', '--project', join(cwd, 'missing'), '--chapter', '11'])
    expect(absent.exitCode).toBe(2)
    await mkdir(join(cwd, '大纲'))
    const outline = join(cwd, '大纲/细纲_第11章_账册.md')
    await writeFile(outline, validLongOutline)
    const args = [entry, '--json', '--project', cwd, '--chapter', '11']
    const ready = await run(context, cwd, process.execPath, args)
    expect(ready.exitCode, ready.stderr).toBe(0)
    expect(JSON.parse(ready.stdout).file).toBe(outline)
    await writeFile(join(cwd, '大纲/细纲_第011章.md'), validLongOutline)
    const ambiguous = await run(context, cwd, process.execPath, args)
    expect(ambiguous.exitCode).toBe(2)
    expect(ambiguous.stderr).toContain('多个第 11 章细纲')
  })

  for (const [filename, args] of [
    ['check-outline-contract.js', ['--json', 'missing.md']],
    ['check-phase2-contract.js', ['--json']],
    ['check-delivery-contract.js', ['--json', '--min-chars', '1', '--max-chars', '20', '--sections', '1']],
  ] as const) {
    it(`${filename} runs as an ESM CLI and remains importable`, async (context) => {
      const cwd = await workspace(context)
      const entry = script(filename)
      const result = await run(context, cwd, process.execPath, [entry, ...args])
      expect(result.exitCode, result.stderr).toBe(1)
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false })
      const imported = await run(context, cwd, process.execPath, [
        '--input-type=module', '-e',
        `const loaded = await import(${JSON.stringify(pathToFileURL(entry).href)}); console.log(typeof loaded.verify)`,
      ])
      expect(imported.exitCode, imported.stderr).toBe(0)
      expect(imported.stdout.trim()).toBe('function')
    })
  }

  it('accepts a free short story and rejects contradictory paywall markers', async (context) => {
    const cwd = await workspace(context)
    const settings = `目标平台：通用短篇
题材参考：references/writing/short/genre-styles/悬疑.md
核心招式：选择后果
反派设计：不适用（冲突来自主角的错误判断）
反转类型：无反转
反转位置：不适用（读者随主角确认事实）
付费点：不适用（免费发布/未选择付费平台）
目标字数：1000
`
    const outline = `| 结构段/五段功能 | 主事件 | 情节推进 | 情绪 | 人物/关系变化 | 因果/逻辑链 | 读者新获知什么 | 结尾承接/钩子 | 伏笔/物件 | 场景形态 | 对白作用 | 目标字数 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 结局 | 主角找到钥匙 | 主角打开抽屉{发现} | 释然 | 主角向姐姐道歉 | 抽屉藏着失物 | 钥匙未被偷走 | 姐妹和解 | 钥匙 | 家中 | 道歉 | 1000 |
`
    const settingsPath = join(cwd, '设定.md')
    const outlinePath = join(cwd, '小节大纲.md')
    await writeFile(settingsPath, settings)
    await writeFile(outlinePath, outline)
    const args = [script('check-phase2-contract.js'), '--json', cwd]
    const free = await run(context, cwd, process.execPath, args)
    expect(free.exitCode, `${free.stdout}\n${free.stderr}`).toBe(0)
    expect(JSON.parse(free.stdout)).toMatchObject({ ok: true, failures: [] })

    for (const emptyPlatform of ['', '  \t']) {
      await writeFile(settingsPath, settings.replace('通用短篇', emptyPlatform))
      const missingPlatform = await run(context, cwd, process.execPath, args)
      expect(missingPlatform.exitCode, missingPlatform.stderr).toBe(1)
      expect(JSON.parse(missingPlatform.stdout)).toMatchObject({
        ok: false, failures: [expect.objectContaining({ id: 'phase2.platform-declared' })],
      })
    }
    await writeFile(settingsPath, settings)

    await writeFile(outlinePath, outline.replace('姐妹和解', '姐妹和解（付费点）'))
    const contradictory = await run(context, cwd, process.execPath, args)
    expect(contradictory.exitCode, contradictory.stderr).toBe(1)
    expect(JSON.parse(contradictory.stdout)).toMatchObject({
      ok: false, failures: [expect.objectContaining({ id: 'phase2.paywall-in-both' })],
    })

    await writeFile(settingsPath, settings.replace('不适用（免费发布/未选择付费平台）', '第1节末'))
    const paid = await run(context, cwd, process.execPath, args)
    expect(paid.exitCode, `${paid.stdout}\n${paid.stderr}`).toBe(0)
    await writeFile(settingsPath, settings.replace('不适用（免费发布/未选择付费平台）', '第2节末'))
    const mismatch = await run(context, cwd, process.execPath, args)
    expect(mismatch.exitCode, mismatch.stderr).toBe(1)
    expect(JSON.parse(mismatch.stdout)).toMatchObject({
      ok: false, failures: [expect.objectContaining({ id: 'phase2.paywall-in-both' })],
    })
  })

  it('initializes and checks author memory through the shared CLI', async (context) => {
    const cwd = await workspace(context)
    const initialized = await run(context, cwd, python, [
      '-B', script('author_memory_commit.py'), 'init', '--workspace', cwd,
    ])
    expect(initialized.exitCode, initialized.stderr).toBe(0)
    const checked = await run(context, cwd, python, [
      '-B', script('author_memory_commit.py'), 'check', '--workspace', cwd,
    ])
    expect(checked.exitCode, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout)).toMatchObject({ ok: true, command: 'check' })
  })

  it('loads wordcount through the shared Python module path', async (context) => {
    const cwd = await workspace(context)
    const result = await run(context, cwd, python, ['-B', '-c', [
      'import json, runpy, sys',
      'module = runpy.run_path(sys.argv[1])',
      'print(json.dumps(module["measure_wordcount"]("甲乙。"), ensure_ascii=False))',
    ].join('\n'), script('wordcount_core.py')])
    expect(result.exitCode, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ metric: 'visible_chars_v1', actual: 3, status: 'measured' })
  })

  it('runs storyctl chapter checks through shared tracking and real Node checkers', async (context) => {
    const cwd = await workspace(context)
    const input = join(cwd, 'initial.json')
    await writeFile(input, JSON.stringify({
      schema_version: 1,
      book_title: '离线回归',
      last_chapter: 0,
      context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '村口' } },
    }))
    const initialized = await run(context, cwd, python, [
      '-B', script('tracking_commit.py'), 'init', '--project', cwd, '--input', input,
    ])
    expect(initialized.exitCode, initialized.stderr).toBe(0)
    const checked = await run(context, cwd, python, [
      '-B', script('tracking_commit.py'), 'check', '--project', cwd,
    ])
    expect(checked.exitCode, checked.stderr).toBe(0)
    expect(JSON.parse(checked.stdout)).toEqual({ last_committed_chapter: 0, state_revision: 0 })

    await mkdir(join(cwd, '大纲'))
    await mkdir(join(cwd, '正文'))
    await writeFile(join(cwd, '大纲/细纲_第1章.md'), validLongOutline)
    const body = join(cwd, '正文/第1章.md')
    await writeFile(body, cleanProse)
    const args = ['-B', script('storyctl.py'), 'chapter', 'check', '--project', cwd, '--chapter', '1']
    const clean = await run(context, cwd, python, args)
    expect(clean.exitCode, clean.stderr).toBe(0)
    expect(JSON.parse(clean.stdout)).toMatchObject({
      schema: 'story-chapter-check/v1',
      outline_readiness: { status: 'pass', failures: [] },
      quality: { status: 'pass', blocking_findings: [] },
    })
    await writeFile(body, 'TODO：补完这一段。\n')
    const blocked = await run(context, cwd, python, args)
    expect(blocked.exitCode, blocked.stderr).toBe(2)
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      quality: { status: 'fail', blocking_findings: [expect.objectContaining({ source: 'degeneration', severity: 'blocking' })] },
      available_actions: [],
    })
  })

  it.for(['commit', 'accept-current-length'])('%s preserves mechanical checks without requiring a review record', async (action, context) => {
    const cwd = await workspace(context)
    const initial = join(cwd, 'initial.json')
    await writeFile(initial, JSON.stringify({
      schema_version: 1,
      book_title: '读者价值回归',
      last_chapter: 0,
      context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房外' } },
    }))
    expect((await run(context, cwd, python, [
      '-B', script('tracking_commit.py'), 'init', '--project', cwd, '--input', initial,
    ])).exitCode).toBe(0)
    await mkdir(join(cwd, '大纲'))
    await mkdir(join(cwd, '正文'))
    await writeFile(join(cwd, '大纲/细纲_第1章.md'), validLongOutline)
    const prose = '库房一刻钟后封门，账册还在里面。\n'+
      '她赶到的时候，伙计正把门板一块块搬来。最上面的横木已经落进槽里，只剩一人宽的缝隙。管事把钥匙收进袖口，说今日的账早已封存，要查就等明天。她知道等不到明天，那辆运废纸的车已经停在后院。车夫坐在辕上，拿鞭梢驱赶马背上的苍蝇，谁都没有抬头看她。\n'+
      '她没有去拦车。院里每个人都听管事调遣，单凭一句怀疑，只会让账册烧得更快。她摸到怀里那张折了四折的签押，纸角被汗浸软，红印却还清楚。这是管事昨日亲手给她的催账单，上面写着今日午前凭单核账。她本来只打算悄悄抄下数目，留一条退路，如今拿出这张纸，所有人都会知道是谁查的账。\n'+
      '门边的老伙计认出红印，手里的木板停了停。她请他照着单上日期念一遍，他望向管事，没有开口。她便自己读，声音够院里的人听见。管事伸手来取纸，她把签押翻到背后，问核账的人若不能进门，欠下的数目该由谁担。运纸的车夫放下鞭子，几个等着领工钱的伙计也围过来。没有人替她作证，但也没有人再搬门板。\n'+
      '她把账单压在门边的石台上，指着红印下那行小字等管事回答。石台上残着昨天的雨水，纸背慢慢湿透。她知道这张凭据保不住太久，今日只要退开，明天连自己都无法说明来过这里。\n'+
      '管事拦住门口，逼她交出钥匙。她把那张签押举到众人面前，明知会暴露自己，也要管事当场认账。\n门开了。她拿到账册，第一笔假账正是管事的名字，末页却已被人撕去。谁抢先取走了那页？\n'
    await writeFile(join(cwd, '正文/第1章.md'), prose)
    if (action === 'commit') {
      await writeFile(join(cwd, '大纲/细纲_第1章.md'), validLongOutline.replace('500', String(prose.replace(/\s/gu, '').length)))
    }
    if (action === 'accept-current-length') {
      await writeFile(join(cwd, '大纲/细纲_第1章.md'), validLongOutline.replace('500', '2000'))
    }
    const statePath = join(cwd, '追踪/_tracking-state.json')
    const legacy = JSON.parse(await readFile(statePath, 'utf8'))
    legacy.schema_version = 4
    delete legacy.reader_value_records
    await writeFile(statePath, JSON.stringify(legacy))
    const transactionPath = join(cwd, 'chapter.json')
    const transaction = {
      schema_version: 1,
      mode: 'append',
      chapter: 1,
      chapter_title: '缺页账册',
      expected_state_revision: 0,
      delta: {
        result: '主角亲自取得账册并发现末页缺失',
        character_changes: [],
        foreshadow_changes: [],
        timeline_events: [],
        constraints: [],
        next_chapter_commitments: ['追查账册末页去向'],
        retired_context_items: [],
        retired_characters: [],
      },
      context: {
        position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房内' },
        long_term_constraints: [],
        active_character_names: [],
        continuity_risks: [],
      },
      character_snapshots: {},
    }
    await writeFile(transactionPath, JSON.stringify(transaction))
    const command = [
      '-B', script('storyctl.py'), 'chapter', action,
      '--project', cwd, '--chapter', '1', '--input', transactionPath,
    ]
    const committed = await run(context, cwd, python, command)
    expect(committed.exitCode, `${committed.stdout}\n${committed.stderr}`).toBe(0)
    expect(JSON.parse(committed.stdout)).not.toHaveProperty('reader_value')
    const state = JSON.parse(await readFile(statePath, 'utf8'))
    expect(state.schema_version).toBe(5)
    expect(state).not.toHaveProperty('reader_value_records')
    expect(state.wordcount_records['1'].body_sha256).toBe(createHash('sha256').update(prose).digest('hex'))

    const historical = { '1': { body_sha256: state.wordcount_records['1'].body_sha256, reviewer: { model: 'historical' }, fulfilled_promise: 'LEGACY_REVIEW_MARKER' } }
    await writeFile(statePath, JSON.stringify({ ...state, reader_value_records: historical }))
    const before = await readFile(statePath, 'utf8')
    await writeFile(transactionPath, JSON.stringify({ ...transaction, mode: 'revision', expected_state_revision: 0 }))
    const stale = await run(context, cwd, python, command)
    expect(stale.exitCode).toBe(2)
    expect(stale.stdout).toContain('tracking state changed')
    expect(await readFile(statePath, 'utf8')).toBe(before)

    const revisedProse = prose.replace('一刻钟', '半刻钟')
    await writeFile(join(cwd, '正文/第1章.md'), revisedProse)
    const revised = { ...transaction, mode: 'revision', expected_state_revision: 1 }
    await writeFile(transactionPath, JSON.stringify({ ...revised, wordcount: state.wordcount_records['1'] }))
    const staleCount = await run(context, cwd, python, [
      '-B', script('tracking_commit.py'), 'commit', '--project', cwd, '--input', transactionPath,
    ])
    expect(staleCount.exitCode).not.toBe(0)
    expect(staleCount.stderr + staleCount.stdout).toContain('wordcount record is stale')
    expect(await readFile(statePath, 'utf8')).toBe(before)

    // Historical input is accepted as opaque data, never as approval or a new record.
    await writeFile(transactionPath, JSON.stringify({ ...revised, reader_value: { verdict: 'reject', unrecognized_legacy_field: true } }))
    const revision = await run(context, cwd, python, command)
    expect(revision.exitCode, revision.stdout).toBe(0)
    const afterRevision = JSON.parse(await readFile(statePath, 'utf8'))
    expect(afterRevision.reader_value_records).toEqual(historical)
    expect(afterRevision.wordcount_records['1'].body_sha256).toBe(createHash('sha256').update(revisedProse).digest('hex'))
    expect(afterRevision.state_revision).toBe(2)
    expect(await readFile(join(cwd, '追踪/上下文.md'), 'utf8')).not.toContain('LEGACY_REVIEW_MARKER')
    expect(await readFile(join(cwd, '追踪/上下文.md'), 'utf8')).toContain('追查账册末页去向')
  })

  it('rejects launch, runtime, and malformed-output errors instead of treating them as prose findings', async (context) => {
    const cwd = await workspace(context)
    const result = await run(context, cwd, python, [
      '-B', resolve(import.meta.dirname, 'fixtures/knowledge-novel-quality.py'), script('storyctl.py'),
    ])
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stderr).toContain('Ran 10 tests')
  })

  it('binds checks and guarded commits to source bytes and the tracking revision', async (context) => {
    const cwd = await workspace(context)
    const result = await run(context, cwd, python, [
      '-B', resolve(import.meta.dirname, 'fixtures/knowledge-chapter-freshness.py'), script('storyctl.py'),
    ])
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stderr).toContain('Ran 9 tests')
  })

  it('classifies Zhuque detection reports and failures offline', async (context) => {
    const cwd = await workspace(context)
    const result = await run(context, cwd, python, [
      '-B', '-W', 'error::ResourceWarning', resolve(import.meta.dirname, 'fixtures/knowledge-zhuque-detect.py'),
      script('zhuque_detect.py'),
    ])
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stderr).toContain('Ran 12 tests')
  })
})
