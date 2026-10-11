/**
 * Outline structure checks shared by chapter preparation and submission.
 *
 * Port of `tests/reference/check_outline_contract.py`. The report fields match the
 * Python verifier byte for byte; the checks never judge whether the outlined
 * actions make a good story.
 */
import { basename, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { METRIC, targetFromOutline, WordcountError } from './wordcount.ts'

// The outline template lives in references/long/workflow-setup.md.
const FIELDS = [
  '核心事件', '字数目标', '字数口径', '阶段位置', '单元ID/位置', '目标情绪',
  '读者期待', '主角目标', '主要阻碍', '关键选择', '代价或后果', '局部兑现', '章尾问题',
  '章节定位', '本章结构公式', '章首钩子', '爽点', '本章禁止提前释放', '契约风险',
] as const
const SUBSECTIONS = ['内容概括', '情节安排', '人物关系和出场顺序', '情节细化'] as const
const FIVE_ACT = ['起因', '发展', '转折', '高潮', '结尾'] as const
const INTENT_FIELDS = ['目标情绪', '读者期待', '主角目标', '主要阻碍', '关键选择', '代价或后果', '局部兑现', '章尾问题'] as const
const REFERENCES = ['references/long/workflow-setup.md', 'references/long/artifact-protocols.md'] as const
const PLACEHOLDER_RE = /\[(?:待补充|待定|TODO)\]|\{[^}]*\}|待补充|待定|TODO|TBD|___/gi
const SEPARATOR_RE = /[\s、，,。;；]/g

/** One structural check of an outline. */
export interface OutlineCheck {
  readonly id: string
  readonly ok: boolean
  readonly severity: 'blocking'
  readonly file: string
  readonly evidence: string
  readonly expected: string
  readonly references: readonly string[]
  readonly repair: string
}

/** The repair instructions of one failed check. */
export type OutlineRepair = Pick<OutlineCheck, 'id' | 'file' | 'evidence' | 'expected' | 'references' | 'repair'>

/** The verifier report for one outline file. */
export interface OutlineReport {
  readonly schema_version: 1
  readonly verifier: 'story-long-write.outline-contract'
  readonly file: string
  readonly ok: boolean
  readonly checks: readonly OutlineCheck[]
  readonly failures: readonly OutlineCheck[]
  readonly repair_scope: readonly OutlineRepair[]
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function fieldPattern(name: string, suffix = ''): RegExp {
  return new RegExp(`^\\s*[-*+]\\s*\\*{0,2}${escapeRegExp(name)}\\*{0,2}[ \\t]*[：:]${suffix}`, 'm')
}

function report(file: string, checks: readonly OutlineCheck[]): OutlineReport {
  const failures = checks.filter(check => !check.ok)
  return {
    schema_version: 1,
    verifier: 'story-long-write.outline-contract',
    file: resolve(file),
    ok: failures.length === 0,
    checks,
    failures,
    repair_scope: failures.map(({ id, file: name, evidence, expected, references, repair }) => ({ id, file: name, evidence, expected, references, repair })),
  }
}

/**
 * Verify the structure of one chapter outline.
 * @param file - the outline path; a missing or empty file fails the first check.
 * @returns the full report with every check and the failures to repair.
 */
export function verifyOutline(file: string): OutlineReport {
  const checks: OutlineCheck[] = []
  const check = (id: string, ok: boolean, evidence: string, expected: string, repair: string): void => {
    checks.push({ id, ok, severity: 'blocking', file: basename(file), evidence, expected, references: REFERENCES, repair })
  }

  let text = ''
  let readable = false
  let evidence: string
  try {
    text = readFileSync(file, 'utf8')
    if (text.startsWith('﻿')) text = text.slice(1)
    readable = text.trim() !== ''
    evidence = readable ? '文件存在且非空' : '文件为空'
  } catch (error) {
    text = ''
    readable = false
    evidence = error instanceof Error ? error.message : String(error)
  }
  check(
    'outline.readable', readable, evidence, '细纲文件存在且非空',
    '章节准备阶段先核实工程与同章文件；细纲缺失时按已确认卷纲和当前事实补建本章，检查通过后再启动写手，不改动同批其他章。',
  )
  if (!readable) return report(file, checks)

  const missingFields = FIELDS.filter(field => !fieldPattern(field).test(text))
  check(
    'outline.required-fields', missingFields.length === 0,
    missingFields.length > 0 ? `缺字段：${missingFields.join('、')}` : `${FIELDS.length} 个字段齐全`,
    `按权威模板列出全部字段：${FIELDS.join('、')}；值未知时写 [待补充]，不杜撰剧情`,
    '只补报告里缺的字段行；确实还定不下来的写 [待补充]，不为补字段新增副线或人物关系。',
  )

  const hollow: string[] = []
  for (const field of INTENT_FIELDS) {
    const match = fieldPattern(field, '[ \\t]*(.*)$').exec(text)
    if (match === null) continue
    const value = (match[1] ?? '').replace(PLACEHOLDER_RE, '')
    if (value.replace(SEPARATOR_RE, '') === '') hollow.push(field)
  }
  check(
    'outline.intent-fields-substantive', hollow.length === 0,
    hollow.length > 0 ? `只有占位符，没有实际内容：${hollow.join('、')}` : '读者价值与场景执行字段都有实际内容',
    '写清目标情绪、读者期待、主角目标、主要阻碍、关键选择、代价或后果、局部兑现和章尾问题；这些字段不接受 [待补充]',
    '只补报告列出的执行字段；若当前剧情无法给出具体答案，先修细纲，不让正文代为发明独立剧情。',
  )

  const missingSubsections = SUBSECTIONS.filter(sub => !new RegExp(`^#{3,4}\\s*${sub}`, 'm').test(text))
  check(
    'outline.subsections', missingSubsections.length === 0,
    missingSubsections.length > 0 ? `缺小节：${missingSubsections.join('、')}` : '四个小节齐全',
    '包含 内容概括 / 情节安排 / 人物关系和出场顺序 / 情节细化 四个小节',
    '只补缺失的小节标题及其条目，不重写已成立的内容。',
  )
  const missingActs = FIVE_ACT.filter(act => !fieldPattern(act).test(text))
  check(
    'outline.five-act', missingActs.length === 0,
    missingActs.length > 0 ? `五段式缺：${missingActs.join('、')}` : '五段式齐全',
    '内容概括写全 起因 / 发展 / 转折 / 高潮 / 结尾',
    '只补缺的那一段，不改其余四段。',
  )

  let header: string[] | undefined
  for (const rawLine of text.split(/\r?\n|\r/)) {
    const line = rawLine.trim()
    if (!line.startsWith('|') || !line.endsWith('|')) continue
    const cells = line.slice(1, -1).split('|').map(cell => cell.replaceAll('**', '').replaceAll('`', '').trim())
    if (cells.length === 4 && (cells[0] === '#' || cells[0] === '序号')) { header = cells; break }
  }
  check(
    'outline.plotpoint-table', header !== undefined && (header[2] ?? '').includes('功能标签') && (header[3] ?? '').includes('执行边界'),
    header !== undefined ? `表头：${header.join(' | ')}` : '未找到 | # | 情节点 | 功能标签 | 执行边界 | 表头',
    '情节细化使用四列表格：# / 情节点（谁做了什么） / 功能标签 / 执行边界',
    '只把情节点序列改成四列表格，逐点补功能标签与执行边界；不增删情节点本身。',
  )

  let targetOk: boolean
  let targetEvidence: string
  try {
    const target = targetFromOutline(text)
    targetOk = target >= 500 && target <= 20000
    targetEvidence = `字数目标：${target}；字数口径 ${METRIC}：true`
  } catch (error) {
    if (!(error instanceof WordcountError)) throw error
    targetOk = false
    targetEvidence = error.message
  }
  check(
    'outline.wordcount-target', targetOk, targetEvidence,
    `字数目标为 500-20000 的正整数，并声明 字数口径：${METRIC}`,
    '只补字数目标或字数口径行，不调整情节安排。',
  )
  return report(file, checks)
}
