import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { checkBlockingQuality } from '../src/core/chapter.ts'
import { readProjectPunctuationPolicy } from '../src/core/checks/punctuation.ts'
import { CHAPTER_RULES_SCHEMA, extractChapterRules, formatRuleLine, RULES_MAX_BYTES, type ChapterRules } from '../src/core/rules.ts'

const fixture = resolve(import.meta.dirname, 'fixtures/regression/chapter-rules')
const entry = resolve(import.meta.dirname, '../src/cli.ts')
const loader = import.meta.resolve('tsx')

async function bookDir(context: TestContext): Promise<{ root: string; book: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-rules-'))
  context.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const book = join(root, '样书')
  await mkdir(root, { recursive: true })
  await cp(fixture, book, { recursive: true })
  return { root, book }
}

describe('chapter rules', () => {
  it('extracts stable ids from the synthetic book and keeps a punctuation-only file readable', async context => {
    const { book } = await bookDir(context)
    const first = extractChapterRules(book, 3)
    const second = extractChapterRules(book, 3)
    expect(first.schema).toBe(CHAPTER_RULES_SCHEMA)
    expect(first.rules.map(rule => rule.id)).toEqual([
      'OUT-003-P1', 'OUT-003-P2', 'OUT-003-P3', 'OUT-003-P4',
      'OUT-003-NR-1', 'OUT-003-NR-2',
      'OUT-003-CAST',
      'OUT-003-GOAL',
      'VOL-1-1-NR-1', 'VOL-1-1-NR-2',
      'VOL-1-1-BAN',
      'VOL-BAN',
      'VOL-OLD-1', 'VOL-OLD-2',
      'CORE-1', 'CORE-2',
      'CARD-禁止漂移-1', 'CARD-禁止漂移-2',
      'CARD-问种边界-1', 'CARD-问种边界-2',
      'STYLE-1', 'STYLE-2',
      'STATE-1',
    ])
    expect(first.rules.find(rule => rule.id === 'OUT-003-P1')?.text).toBe('账房打开库门｜边界：只进门，不点破幕后')
    expect(first.rules.find(rule => rule.id === 'OUT-003-P2')?.text).toBe('管事拦住去路｜边界：不交出钥匙')
    expect(first.rules.find(rule => rule.id === 'OUT-003-P3')?.text).toBe('空边界')
    expect(first.rules.find(rule => rule.id === 'OUT-003-P4')?.text).toBe('只写边界')
    expect(first.rules.some(rule => rule.id === 'OUT-003-P5')).toBe(false)
    expect(first.rules.find(rule => rule.id === 'OUT-003-GOAL')?.text).toBe('查清库门为何封上')
    expect(first.rules.find(rule => rule.id === 'OUT-003-CAST')?.text).toBe('账房、管事')
    expect(first.rules.find(rule => rule.id === 'VOL-BAN')?.text).toBe('幕后主使的真名')
    expect(first.rules.find(rule => rule.id === 'VOL-OLD-1')?.text).toBe('第一章就揭示真名；后置到卷末')
    expect(first.rules.find(rule => rule.id === 'STATE-1')?.text).toBe('旧钥匙仍在柜中')
    expect(first.rules.map(rule => rule.text).join('\n')).not.toContain('后单元秘密')
    expect(first.rules.map(rule => rule.text).join('\n')).not.toContain('后卷秘密')
    expect(first.warnings).toEqual([])
    expect(first.omitted).toBe(0)
    expect(first.state_revision).toBe(3)
    expect(first.rules_sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(second.rules).toEqual(first.rules)
    expect(second.rules_sha256).toBe(first.rules_sha256)
    expect(readProjectPunctuationPolicy(book)).toBe('preserve')
    const goalLine = first.rules.find(rule => rule.id === 'OUT-003-GOAL')
    expect(goalLine?.source).toEqual({ path: '大纲/细纲_第003章.md', line: 7 })
    expect(first.rules.find(rule => rule.id === 'OUT-003-P1')?.source.line).toBe(19)

    const outline = await readFile(join(book, '大纲/细纲_第003章.md'), 'utf8')
    await writeFile(join(book, '大纲/细纲_第003章.md'), outline.replace('- 主角目标：查清库门为何封上\n', ''))
    const missingGoal = extractChapterRules(book, 3)
    expect(missingGoal.rules.some(rule => rule.id.endsWith('-GOAL'))).toBe(false)
    expect(missingGoal.warnings).toEqual([expect.objectContaining({ heading: '主角目标', path: '大纲/细纲_第003章.md' })])
  })

  it('reports blocking hits and hints without treating hints as blocking', async context => {
    const { book } = await bookDir(context)
    const outline = join(book, '大纲/细纲_第003章.md')
    const body = join(book, '正文/第003章.md')
    const quality = checkBlockingQuality(outline, body, book)
    const rows = [...quality.blocking_findings, ...quality.advisories].filter(row => row.source === 'chapter-rules')
    expect(quality.blocking_findings.filter(row => row.source === 'chapter-rules').map(row => row.id)).toEqual(['empty-hook', 'era:手机'])
    expect(quality.advisories.filter(row => row.source === 'chapter-rules').map(row => row.severity)).toEqual(['hint', 'hint', 'hint', 'hint', 'hint', 'hint'])
    expect(rows.filter(row => row.kind === undefined).map(row => row.type)).toEqual([
      'FORBIDDEN', 'ERA_DENY', 'FORBIDDEN', 'CAST', 'CAST', 'CAST', 'VOID_TERM', 'VOID_TERM',
    ])
    expect(quality.status).toBe('fail')
    const report = extractChapterRules(book, 3)
    expect(report.scan.map(hit => hit.id)).toEqual([
      'empty-hook', 'soft', 'era:手机', 'cast:守门', 'cast:闲汉', 'cast:账差',
      'void:long_term_constraints[0]:旧钥匙', 'void:continuity_risks[0]:班次',
    ])
    expect(report.scan.find(hit => hit.id === 'cast:闲汉')?.message).toContain('正文提到但细纲出场名单未列')
    expect(report.scan.find(hit => hit.id === 'soft')?.severity).toBe('hint')
    expect(report.scan.find(hit => hit.id === 'empty-hook')?.severity).toBe('blocking')
  })

  it('warns for a missing heading, applies a source override, and omits past 16 KiB', async context => {
    const { book } = await bookDir(context)
    await writeFile(join(book, '设定/题材正文提示卡.md'), '# 题材正文提示卡\n\n## 禁止漂移\n\n不要写成说明文。\n')
    const missing = extractChapterRules(book, 3)
    expect(missing.warnings).toEqual([expect.objectContaining({ heading: '问种边界', path: '设定/题材正文提示卡.md' })])
    expect(missing.rules.some(rule => rule.id.startsWith('CARD-问种边界'))).toBe(false)
    expect(missing.rules.some(rule => rule.id === 'CARD-禁止漂移-1')).toBe(true)

    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({
      punctuation: 'preserve',
      rule_sources: [{ file: '大纲/细纲_第{chapter}章.md', heading: '核心事件', prefix: 'OUT-GOAL' }],
    }))
    const retargeted = extractChapterRules(book, 3)
    expect(retargeted.warnings).toEqual([])
    expect(retargeted.rules.map(rule => ({ id: rule.id, text: rule.text }))).toEqual([{ id: 'OUT-003-GOAL', text: '账房进门' }])

    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({
      punctuation: 'preserve',
      rule_sources: [{ file: '大纲/细纲_第{chapter}章.md', heading: '主角目标', prefix: 'GOAL' }],
    }))
    const unknown = extractChapterRules(book, 3)
    expect(unknown.rules).toEqual([])
    expect(unknown.warnings.some(warning => warning.message.includes('未知规则前缀 GOAL'))).toBe(true)

    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({
      punctuation: 'preserve',
      rule_sources: [{ file: '设定/核心设定.md', heading: '不存在的标题', prefix: 'CORE' }],
    }))
    const overridden = extractChapterRules(book, 3)
    expect(overridden.rules).toEqual([])
    expect(overridden.warnings.some(warning => warning.heading === '不存在的标题')).toBe(true)
    expect(readProjectPunctuationPolicy(book)).toBe('preserve')

    const huge = Array.from({ length: 80 }, (_, index) => `${String(index + 1)}. 边界${String(index)} ${'边界'.repeat(40)}`).join('\n')
    await writeFile(join(book, '设定/核心设定.md'), `# 核心设定\n\n## 病根\n\n${huge}\n`)
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({
      punctuation: 'preserve',
      rule_sources: [{ file: '设定/核心设定.md', heading: '病根', prefix: 'CORE' }],
    }))
    const packed = extractChapterRules(book, 3)
    expect(packed.omitted).toBeGreaterThan(0)
    expect(Buffer.byteLength(`${JSON.stringify(packed)}\n`, 'utf8')).toBeLessThanOrEqual(RULES_MAX_BYTES)
    expect(packed.rules[0]?.id).toBe('CORE-1')
    expect(packed.rules_sha256).toBe(extractChapterRules(book, 3).rules_sha256)
    const fullCount = 80
    expect(packed.rules.length + packed.omitted).toBe(fullCount)
  })

  it('skips a missing body and an invalid pattern without failing the command', async context => {
    const { root, book } = await bookDir(context)
    await rm(join(book, '正文/第003章.md'))
    const bare = extractChapterRules(book, 3)
    expect(bare.rules.some(rule => rule.id === 'OUT-003-CAST')).toBe(true)
    expect(bare.scan.map(hit => hit.kind)).toEqual(['void-term', 'void-term'])
    const config = JSON.parse(await readFile(join(book, '设定/写作检查.json'), 'utf8')) as { forbidden: { id: string; pattern: string; severity: string }[] }
    config.forbidden.push({ id: 'broken', pattern: '(', severity: 'blocking' })
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({ ...config, punctuation: 'preserve' }))
    await writeFile(join(book, '正文/第003章.md'), '账房进门。\n')
    const scanned = extractChapterRules(book, 3)
    expect(scanned.warnings.some(warning => warning.message.includes('broken'))).toBe(true)
    expect(scanned.scan.some(hit => hit.id === 'broken')).toBe(false)

    const child = execa(process.execPath, ['--import', loader, entry, 'chapter', 'rules', '--workspace', root, '--book', '样书', '--chapter', '3', '--json'], {
      cwd: root, reject: false, cancelSignal: context.signal,
    })
    context.onTestFinished(async () => { child.kill('SIGTERM'); await child })
    const result = await child
    expect(result.exitCode).toBe(0)
    const payload = JSON.parse(result.stdout) as ChapterRules
    expect(payload.schema).toBe(CHAPTER_RULES_SCHEMA)
    expect(payload.chapter).toBe(3)
  })

  it('leaves chapter check unchanged when the book has no new writing-check keys and no cast field', async context => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-story-rules-plain-'))
    context.onTestFinished(() => rm(root, { recursive: true, force: true }))
    const book = join(root, '样书')
    await mkdir(join(book, '大纲'), { recursive: true })
    await mkdir(join(book, '设定'), { recursive: true })
    await mkdir(join(book, '正文'), { recursive: true })
    const outline = join(book, '大纲/细纲_第003章.md')
    const body = join(book, '正文/第003章.md')
    await writeFile(outline, await readFile(resolve(import.meta.dirname, 'fixtures/workflow-outline.md'), 'utf8'))
    await writeFile(body, await readFile(resolve(import.meta.dirname, 'fixtures/workflow-body.md'), 'utf8'))
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({ punctuation: 'preserve' }))
    const withProject = checkBlockingQuality(outline, body, book)
    const withoutProject = checkBlockingQuality(outline, body)
    expect(withProject).toEqual(withoutProject)
    expect(readProjectPunctuationPolicy(book)).toBe('preserve')
  })

  it('matches narrative cast lines, skips quoted mentions, and numbers void entries', async context => {
    const { book } = await bookDir(context)
    const report = extractChapterRules(book, 4)
    const cast = report.scan.filter(hit => hit.kind === 'cast').map(hit => hit.id)
    expect(cast).toEqual(['cast:闲汉'])
    expect(report.rules.find(rule => rule.id === 'OUT-004-P1')?.text).toBe('结算处见面')
    expect(report.rules.some(rule => rule.id.endsWith('-GOAL'))).toBe(false)
    expect(report.warnings.some(warning => warning.heading === '主角目标')).toBe(false)
    expect(report.scan.find(hit => hit.id === 'cast:闲汉')?.message).toBe('正文提到但细纲出场名单未列「闲汉」')
    const state = JSON.parse(await readFile(join(book, '追踪/_tracking-state.json'), 'utf8')) as {
      context: { continuity_risks: string[] }
    }
    state.context.continuity_risks = ['守门人的班次未核', '省港旧线仍写在风险里', '另一条省港班次未删']
    await writeFile(join(book, '追踪/_tracking-state.json'), JSON.stringify(state))
    const config = JSON.parse(await readFile(join(book, '设定/写作检查.json'), 'utf8')) as { void_terms: string[] }
    config.void_terms = ['省港']
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify(config))
    const voids = extractChapterRules(book, 4).scan.filter(hit => hit.kind === 'void-term')
    expect(voids.map(hit => hit.id)).toEqual(['void:continuity_risks[1]:省港', 'void:continuity_risks[2]:省港'])
    expect(voids[0]?.message).toContain('省港旧线仍写在风险里')
    expect(voids[1]?.message).toContain('另一条省港班次未删')
  })

  it('dedupes the same sentence, defaults a missing punctuation key, and names unknown keys', async context => {
    const { book } = await bookDir(context)
    const outline = await readFile(join(book, '大纲/细纲_第003章.md'), 'utf8')
    await writeFile(join(book, '大纲/细纲_第003章.md'), outline.replace('幕后身份、库房钥匙的来历', '幕后主使的真名。'))
    const state = JSON.parse(await readFile(join(book, '追踪/_tracking-state.json'), 'utf8')) as {
      context: { long_term_constraints: string[] }
    }
    state.context.long_term_constraints = ['幕后主使的真名']
    await writeFile(join(book, '追踪/_tracking-state.json'), JSON.stringify(state))
    const first = extractChapterRules(book, 3)
    const kept = first.rules.find(rule => rule.id === 'OUT-003-NR')
    expect(kept?.text).toBe('幕后主使的真名。')
    expect(kept?.also).toEqual(['VOL-BAN', 'STATE-1'])
    expect(formatRuleLine(kept ?? first.rules[0]!)).toBe('OUT-003-NR: 幕后主使的真名。 also: VOL-BAN, STATE-1')
    const canonical = first.rules.map(rule => ({
      id: rule.id,
      text: rule.also === undefined || rule.also.length === 0 ? rule.text : `${rule.text} also: ${rule.also.join(', ')}`,
      source: rule.source,
    }))
    expect(first.rules_sha256).toBe(createHash('sha256').update(JSON.stringify(canonical)).digest('hex'))
    expect(first.rules.some(rule => rule.id === 'VOL-BAN' || rule.id === 'STATE-1')).toBe(false)
    expect(extractChapterRules(book, 3)).toEqual(first)

    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify({
      forbidden: [{ id: 'empty-hook', pattern: '一切才刚刚开始', severity: 'blocking' }],
      void_terms: ['旧钥匙'],
    }))
    expect(readProjectPunctuationPolicy(book)).toBe('preserve')
    const withoutPunctuation = extractChapterRules(book, 3)
    expect(withoutPunctuation.scan.some(hit => hit.id === 'empty-hook' && hit.severity === 'blocking')).toBe(true)
    expect(withoutPunctuation.warnings).toEqual([])
    const outlinePath = join(book, '大纲/细纲_第003章.md')
    const bodyPath = join(book, '正文/第003章.md')
    const quality = checkBlockingQuality(outlinePath, bodyPath, book)
    expect(quality.blocking_findings.some(row => row.source === 'punctuation' && row.type === 'TOOL_ERROR')).toBe(false)

    await writeFile(join(book, '设定/写作检查.json'), '{"punctuation":"typo"}')
    expect(() => extractChapterRules(book, 3)).toThrow('expected {"punctuation"')
    await writeFile(join(book, '设定/写作检查.json'), '{"punct":"preserve"}')
    expect(() => readProjectPunctuationPolicy(book)).toThrow(/unknown key "punct"/u)
    expect(() => readProjectPunctuationPolicy(book)).toThrow(/void_terms/u)
  })
})
