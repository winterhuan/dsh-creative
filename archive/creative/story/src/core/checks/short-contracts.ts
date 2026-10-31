/**
 * Deterministic contract verifiers for short fiction: the Phase 2 planning
 * artifacts (`设定.md`, `小节大纲.md`) and the delivered `正文.md`.
 *
 * Port of `tests/reference/check-phase2-contract.js` and `tests/reference/check-delivery-contract.js`.
 * Both are mechanical: they check fields, table shape, size and section
 * markers, never story quality.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** One contract check. */
export interface ContractCheck {
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
export type ContractRepair = Pick<ContractCheck, 'id' | 'file' | 'evidence' | 'expected' | 'references' | 'repair'>

/** The Phase 2 planning report. */
export interface Phase2Report {
  readonly schema_version: 1
  readonly verifier: 'story-short-write.phase2-contract'
  readonly project: string
  readonly ok: boolean
  readonly checks: readonly ContractCheck[]
  readonly failures: readonly ContractCheck[]
  readonly repair_scope: readonly ContractRepair[]
}

/** The user-visible size and shape a short story must deliver. */
export interface DeliveryContract {
  readonly minChars: number
  readonly maxChars: number
  readonly sections: number
}

/** The delivery report. */
export interface DeliveryReport {
  readonly schema_version: 1
  readonly verifier: 'story-short-write.delivery-contract'
  readonly project: string
  readonly contract: { readonly metric: 'non_whitespace_unicode_chars_v1'; readonly min_chars: number; readonly max_chars: number; readonly sections: number }
  readonly ok: boolean
  readonly checks: readonly ContractCheck[]
  readonly failures: readonly ContractCheck[]
  readonly repair_scope: readonly ContractRepair[]
}

const OUTLINE_HEADERS = ['结构段/五段功能', '主事件', '情节推进', '情绪', '人物/关系变化', '因果/逻辑链', '读者新获知什么', '结尾承接/钩子', '伏笔/物件', '场景形态', '对白作用', '目标字数'] as const
const FUNCTION_TAG = /\{(?:对话|冲突|伏笔|回忆|发现|递进)\}/

interface Marker { readonly style: string; readonly pattern: RegExp }
const MARKERS: readonly Marker[] = [
  { style: 'numeric-heading', pattern: /^###\s*\d+\.$/ },
  { style: 'chapter-heading', pattern: /^###\s*第[一二三四五六七八九十百千万两〇零0-9]+章$/ },
  { style: 'zhihu-numeric', pattern: /^\d+\.$/ },
]

function cleanCell(value: string): string {
  return value.replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function parseTableLine(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  return trimmed.slice(1, -1).split('|').map(cleanCell)
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell))
}

function readUtf8(file: string): { readonly ok: boolean; readonly text: string; readonly error?: string } {
  try {
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
    return { ok: text.trim().length > 0, text }
  } catch (error) {
    return { ok: false, text: '', error: error instanceof Error ? error.message : String(error) }
  }
}

function makeCheck(id: string, ok: boolean, file: string, evidence: string, expected: string, references: readonly string[], repair: string): ContractCheck {
  return { id, ok, severity: 'blocking', file, evidence, expected, references, repair }
}

function repairScope(failures: readonly ContractCheck[]): ContractRepair[] {
  return failures.map(({ id, file, evidence, expected, references, repair }) => ({ id, file, evidence, expected, references, repair }))
}

/**
 * Verify the Phase 2 planning artifacts of a short story.
 * @param projectDir - the story directory holding `设定.md` and `小节大纲.md`.
 * @param skillRoot - the `story-write` Skill directory whose references the settings may cite.
 * @returns the report.
 */
export function verifyPhase2(projectDir: string, skillRoot: string): Phase2Report {
  const project = resolve(projectDir)
  const skill = resolve(skillRoot)
  const settingsRead = readUtf8(join(project, '设定.md'))
  const outlineRead = readUtf8(join(project, '小节大纲.md'))
  const checks: ContractCheck[] = []
  const report = (): Phase2Report => {
    const failures = checks.filter(check => !check.ok)
    return { schema_version: 1, verifier: 'story-short-write.phase2-contract', project, ok: failures.length === 0, checks, failures, repair_scope: repairScope(failures) }
  }

  checks.push(makeCheck('phase2.settings-readable', settingsRead.ok, '设定.md',
    settingsRead.ok ? '文件存在且非空' : (settingsRead.error ?? '文件为空'),
    '项目目录下存在非空的 设定.md', ['references/short/writing-workflow.md'], '只补建或补全 设定.md，不改动已通过的 小节大纲.md。'))
  checks.push(makeCheck('phase2.outline-readable', outlineRead.ok, '小节大纲.md',
    outlineRead.ok ? '文件存在且非空' : (outlineRead.error ?? '文件为空'),
    '项目目录下存在非空的 小节大纲.md', ['references/short/writing-workflow.md'], '只补建或补全 小节大纲.md，不改动已通过的 设定.md。'))
  if (!settingsRead.ok || !outlineRead.ok) return report()

  const settings = settingsRead.text
  const outline = outlineRead.text

  const platformMatch = settings.match(/目标平台[ \t]*[：:][ \t]*(\S[^\r\n]*)/)
  checks.push(makeCheck('phase2.platform-declared', platformMatch !== null, '设定.md',
    platformMatch !== null ? `目标平台：${platformMatch[1] ?? ''}` : '未找到可识别的目标平台字段',
    '写明目标平台；未指定平台时可写“通用短篇”', ['references/short/submission-craft.md'], '只在 设定.md 的基本信息或 Phase 2 设计校验区补目标平台。'))

  const genreMatch = settings.match(/(?:题材参考|题材包)\s*[：:]\s*`?(references\/(?:writing\/)?short\/(?:genre-styles\/[^`\s|]+\.md|genre-writing-formulas\.md))`?/)
  let genreEvidence = '未找到题材参考路径'
  let genreOk = false
  if (genreMatch !== null) {
    const cited = genreMatch[1] ?? ''
    const resolved = resolve(skill, cited.replace('references/writing/', 'references/'))
    const insideSkill = resolved.startsWith(`${skill}${sep}`)
    genreOk = insideSkill && existsSync(resolved) && statSync(resolved).isFile()
    genreEvidence = genreOk ? `题材参考：${cited}` : `题材参考不可读：${cited}`
  }
  checks.push(makeCheck('phase2.genre-reference-declared', genreOk, '设定.md', genreEvidence,
    '写明一个真实存在的 references/short/genre-styles/{题材}.md；冷门题材写 references/short/genre-writing-formulas.md',
    ['references/short/writing-workflow.md', 'references/short/short-craft.md'], '只补题材参考路径与从该参考选出的 适用的核心招式，不重写故事框架。'))

  const movesMatch = settings.match(/核心招式\s*[：:]\s*([^\n]+)/)
  const moves = movesMatch !== null ? (movesMatch[1] ?? '').split(/[；;]|\s\/\s/).map(item => item.trim()).filter(item => item !== '') : []
  checks.push(makeCheck('phase2.genre-moves-declared', moves.length >= 1, '设定.md',
    moves.length > 0 ? `识别到 ${String(moves.length)} 个核心招式` : '未找到核心招式字段',
    '写明实际采用的核心招式，多个条目用分号分隔', ['references/short/writing-workflow.md'], '只补本篇实际采用的核心招式，并保持已选题材参考不变。'))

  const villainSkipped = /反派(?:设计)?\s*[：:]\s*(?:无|不适用)\s*[（(][^)）]+[)）]/.test(settings)
  const villainFields = ['身份', '动机', '作恶方式', '致命弱点', '报应']
  const missingVillainFields = villainFields.filter(field => !new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${field}\\s*[：:]`, 'm').test(settings))
  const villainOk = villainSkipped || missingVillainFields.length === 0
  checks.push(makeCheck('phase2.villain-contract', villainOk, '设定.md',
    villainSkipped ? '已明确反派不适用' : (villainOk ? '反派五字段齐全' : `缺字段：${missingVillainFields.join('、')}`),
    '无反派时写“反派设计：不适用（原因）”；有反派时填写身份、动机、作恶方式、致命弱点、报应',
    ['references/short/villain-and-reveal.md'], '只补反派缺失字段；若确无反派，改为带原因的不适用声明。'))

  const placeholderFields = ['题材参考', '核心招式', '反派设计', '反转类型', '反转位置', '付费点', '目标平台', '目标字数']
  const placeholderLines = settings.split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter(entry => placeholderFields.some(field => entry.text.includes(`${field}：`) || entry.text.includes(`${field}:`)))
    .filter(entry => /\{[^}]*\}/.test(entry.text))
  checks.push(makeCheck('phase2.no-template-placeholders', placeholderLines.length === 0, '设定.md',
    placeholderLines.length > 0 ? `仍是模板占位符的行：${placeholderLines.map(entry => String(entry.line)).join('、')}` : '契约字段没有未填写的 {} 占位符',
    'Phase 2 契约字段写实际设计内容，不保留 {} 模板占位符', ['references/short/writing-workflow.md'], '只把报告行的占位符替换成本篇的实际设计，不重写其他字段。'))

  const lines = outline.split(/\r?\n/)
  let headerAt = -1
  let headerCells: string[] | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const cells = parseTableLine(lines[index] ?? '')
    if (cells !== null && cells[0] === OUTLINE_HEADERS[0]) {
      headerAt = index
      headerCells = cells
      break
    }
  }
  const headerOk = headerCells !== null && headerCells.length === OUTLINE_HEADERS.length && headerCells.every((cell, index) => cell === OUTLINE_HEADERS[index])
  checks.push(makeCheck('phase2.outline-12-columns', headerOk, '小节大纲.md',
    headerCells !== null ? `表头 ${String(headerCells.length)} 列：${headerCells.join(' | ')}` : '未找到以“结构段/五段功能”开头的 Markdown 表格',
    `使用固定 12 列表头：${OUTLINE_HEADERS.join(' | ')}`, ['references/short/writing-workflow.md'], '只修表头和错位单元格，不改动各节已经成立的剧情内容。'))

  const rows: { readonly line: number; readonly cells: string[] }[] = []
  if (headerAt >= 0) {
    for (let index = headerAt + 1; index < lines.length; index += 1) {
      const cells = parseTableLine(lines[index] ?? '')
      if (cells === null) {
        if (rows.length > 0) break
        continue
      }
      if (isSeparatorRow(cells)) continue
      rows.push({ line: index + 1, cells })
    }
  }
  const rowShapeFailures = rows.filter(row => row.cells.length !== OUTLINE_HEADERS.length)
  checks.push(makeCheck('phase2.outline-data-rows', rows.length > 0 && rowShapeFailures.length === 0, '小节大纲.md',
    rows.length === 0 ? '固定表头下没有数据行' : (rowShapeFailures.length > 0 ? `列数错误行：${rowShapeFailures.map(row => String(row.line)).join('、')}` : `识别到 ${String(rows.length)} 节，均为 12 列`),
    '固定表头下至少一行数据，且每节恰好 12 列', ['references/short/writing-workflow.md'], '只补缺失节或修复报告行的列错位。'))

  const progressionFailures: number[] = []
  const progressionRows = rows.filter(item => item.cells.length === OUTLINE_HEADERS.length)
  for (const row of progressionRows) {
    const progression = (row.cells[2] ?? '').split(/\s*(?:->|→)\s*/).filter(item => item !== '')
    if (progression.length < 1 || progression.some(item => !FUNCTION_TAG.test(item))) progressionFailures.push(row.line)
  }
  checks.push(makeCheck('phase2.outline-subevents', rows.length > 0 && progressionFailures.length === 0, '小节大纲.md',
    progressionFailures.length > 0
      ? `情节推进为空或功能标签错误行：${progressionFailures.map(String).join('、')}`
      : (progressionRows.length === rows.length
        ? `所有 ${String(rows.length)} 节均有至少一个带功能标签的真实推进`
        : `已检查 ${String(progressionRows.length)}/${String(rows.length)} 行；其余行由 phase2.outline-data-rows 报告列错位`),
    '每节至少一个真实推进；有先后关系时以 -> 连接，每个含 {对话/冲突/伏笔/回忆/发现/递进} 标签之一，不设固定数量',
    ['references/short/writing-workflow.md', 'references/short/short-craft.md'], '只修报告行的“情节推进”单元格，不重写其他列或其他节；不要为数量补事件。'))

  const targetMatch = settings.match(/目标字数\s*[：:]\s*(?:约\s*)?([\d,，]+)\s*(?:字)?\s*(?:[-–—~～]|到|至)\s*([\d,，]+)\s*字?/)
    ?? settings.match(/目标字数\s*[：:]\s*(?:约\s*)?([\d,，]+)\s*字?/)
  const toNumber = (value: string): number => Number(value.replace(/[,，]/g, ''))
  const targetLow = targetMatch !== null ? toNumber(targetMatch[1] ?? '') : null
  const targetHigh = targetMatch !== null && targetMatch[2] !== undefined ? toNumber(targetMatch[2]) : targetLow
  const statedTarget = targetLow
  const rowTargets = progressionRows.map((row) => {
    const match = (row.cells[11] ?? '').match(/([\d,，]+)/)
    return match !== null ? Number((match[1] ?? '').replace(/[,，]/g, '')) : null
  })
  const targetSum = rowTargets.every(value => value !== null && Number.isFinite(value))
    ? rowTargets.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null
  const isRange = targetHigh !== null && targetHigh !== targetLow
  const targetOk = statedTarget !== null && targetHigh !== null && targetLow !== null && statedTarget >= 1000 && targetHigh <= 200000
    && targetHigh >= targetLow && progressionRows.length === rows.length && targetSum !== null
    && (isRange ? targetSum >= targetLow && targetSum <= targetHigh : Math.abs(targetSum - statedTarget) <= statedTarget * 0.05)
  checks.push(makeCheck('phase2.target-word-sum', targetOk, '设定.md、小节大纲.md',
    `设定目标：${statedTarget === null ? '未识别' : (isRange ? `${String(targetLow)}-${String(targetHigh)}` : String(statedTarget))}；大纲合计：${targetSum === null ? '有非数字目标字数' : String(targetSum)}`,
    '设定.md 的目标字数为 1000-200000 的正整数或区间（用户明确范围优先，未指定时默认 8000-20000）；大纲每行目标字数可解析，写区间时合计落在区间内，写单值时误差不超过 5%',
    ['references/short/writing-workflow.md', 'references/short/submission-craft.md'], '只修目标字数字段或各节“目标字数”单元格，使合计匹配；不要用增删剧情绕过数字错误。'))

  const reversalMatch = settings.match(/反转位置\s*[：:]\s*第?\s*(\d+)\s*节?\s*(?:÷|\/)\s*(?:共|全文)?\s*(\d+)\s*节?\s*=\s*(\d+(?:\.\d+)?)\s*%/)
  const noReversal = /反转类型\s*[：:]\s*无反转/.test(settings) && /反转位置\s*[：:]\s*不适用\s*[（(][^)）]+[)）]/.test(settings)
  let reversalOk = false
  let reversalEvidence = '未找到“反转位置：第 X 节 ÷ 共 Y 节 = Z%”'
  if (noReversal) {
    reversalOk = true
    reversalEvidence = '反转类型为无反转，位置已带原因标为不适用'
  } else if (reversalMatch !== null) {
    const reveal = Number(reversalMatch[1])
    const total = Number(reversalMatch[2])
    const stated = Number(reversalMatch[3])
    const calculated = total > 0 ? (reveal / total) * 100 : Number.NaN
    reversalOk = reveal >= 1 && reveal <= total && total === rows.length && Math.abs(stated - calculated) <= 0.6
    reversalEvidence = `声明第 ${String(reveal)} 节 ÷ 共 ${String(total)} 节 = ${String(stated)}%；大纲识别 ${String(rows.length)} 节`
  }
  checks.push(makeCheck('phase2.reversal-position', reversalOk, '设定.md', reversalEvidence,
    '有反转时写明揭穿节号、全文总节数和计算百分比；总节数须与大纲一致，计算误差不超过 0.6%。无反转时写明“反转类型：无反转”和带原因的“反转位置：不适用（…）”',
    ['references/short/writing-workflow.md', 'references/methods/short-reversal.md'], '只修正反转位置计算或对应节次；位置质量按 short-reversal.md 的误判决策与揭示后果功能链判断，不为跨过固定百分比而搬节。'))

  const paywallMatch = settings.match(/付费点\s*[：:]\s*第?\s*(\d+)\s*节末/)
  const paywallSection = paywallMatch !== null ? Number(paywallMatch[1]) : null
  const paywallRows = rows.map((row, index) => ({ section: index + 1, hook: row.cells[7] ?? '' })).filter(row => /付费点/.test(row.hook))
  const noPaywall = /付费点\s*[：:]\s*不适用[（(][^）)\n]+[）)]/.test(settings)
  const paywallOk = noPaywall
    ? paywallSection === null && paywallRows.length === 0
    : paywallSection !== null && paywallRows.length === 1 && paywallRows[0]?.section === paywallSection
  let paywallEvidence = '设定.md 未按“付费点：第 X 节末”声明'
  if (noPaywall) paywallEvidence = `设定.md 声明不适用；大纲付费点数量 ${String(paywallRows.length)}`
  else if (paywallSection !== null && paywallRows.length === 0) paywallEvidence = `设定.md 声明第 ${String(paywallSection)} 节末；大纲“结尾承接/钩子”列未标出付费点`
  else if (paywallSection !== null && paywallRows.length > 0) paywallEvidence = `设定.md 声明第 ${String(paywallSection)} 节末；大纲标在第 ${paywallRows.map(row => String(row.section)).join('、')} 节`
  checks.push(makeCheck('phase2.paywall-in-both', paywallOk, '设定.md、小节大纲.md', paywallEvidence,
    '付费作品在设定与大纲中标同一个节末付费点；免费作品写“付费点：不适用（原因）”且大纲不标付费点',
    ['references/short/submission-craft.md', 'references/short/writing-workflow.md'], '按发布方式修正设定与大纲的付费声明，不为免费作品添加付费断点。'))

  return report()
}

function visibleChars(text: string): number {
  return Array.from(text).filter(character => !/\s/u.test(character)).length
}

function markerFor(line: string): Marker | null {
  const trimmed = line.trim()
  return MARKERS.find(entry => entry.pattern.test(trimmed)) ?? null
}

function deliveryCheck(id: string, ok: boolean, evidence: string, expected: string, repair: string): ContractCheck {
  return { id, ok, severity: 'blocking', file: '正文.md', evidence, expected, references: ['references/short/short-format.md'], repair }
}

/**
 * Verify the delivered body of a short story against the user's size and section contract.
 * @param projectDir - the story directory holding `正文.md`.
 * @param contract - the required size and section count.
 * @returns the report.
 */
export function verifyDelivery(projectDir: string, contract: DeliveryContract): DeliveryReport {
  const project = resolve(projectDir)
  const bodyRead = readUtf8(join(project, '正文.md'))
  const checks: ContractCheck[] = []
  const report = (): DeliveryReport => {
    const failures = checks.filter(check => !check.ok)
    return {
      schema_version: 1, verifier: 'story-short-write.delivery-contract', project,
      contract: { metric: 'non_whitespace_unicode_chars_v1', min_chars: contract.minChars, max_chars: contract.maxChars, sections: contract.sections },
      ok: failures.length === 0, checks, failures, repair_scope: repairScope(failures),
    }
  }

  checks.push(deliveryCheck('delivery.body-readable', bodyRead.ok,
    bodyRead.ok ? '正文.md 存在且非空' : (bodyRead.error ?? '正文.md 为空'),
    '项目目录下存在非空的 正文.md', '只补建或恢复 正文.md；不要改动设定与大纲。'))
  if (!bodyRead.ok) return report()

  const actual = visibleChars(bodyRead.text)
  checks.push(deliveryCheck('delivery.visible-chars', actual >= contract.minChars && actual <= contract.maxChars,
    `非空白 Unicode 字符：${String(actual)}`, `用户要求 ${String(contract.minChars)}-${String(contract.maxChars)} 个非空白字符`,
    actual < contract.minChars ? '只扩写既有情节点的行动、后果或对话，不新增支线。' : '只压缩重复解释、复述和无功能过场，不删关键证据或结算。'))

  const lines = bodyRead.text.replace(/\r\n?/g, '\n').replace(/\n+$/, '\n').split('\n')
  const markers = lines
    .map((line, index) => ({ line: index + 1, marker: markerFor(line), text: line.trim() }))
    .filter((entry): entry is { line: number; marker: Marker; text: string } => entry.marker !== null)
  checks.push(deliveryCheck('delivery.section-count', markers.length === contract.sections,
    `识别到 ${String(markers.length)} 个小节标记：${markers.map(entry => entry.text).join('、') || '无'}`,
    `正文恰好 ${String(contract.sections)} 节`, '只校正缺失、多余或误写的小节标记；不要为凑节数新开支线。'))

  const styles = new Set(markers.map(entry => entry.marker.style))
  checks.push(deliveryCheck('delivery.section-style', markers.length > 0 && styles.size === 1,
    markers.length > 0 ? `小节标记样式：${Array.from(styles).join('、')}` : '没有可识别的小节标记',
    '全文统一使用 short-format.md 允许的一种小节标记', '只统一小节标记的样式，不改正文内容。'))

  const numericSequence = markers.map((entry) => {
    const match = entry.text.match(/\d+/)
    return match !== null ? Number(match[0]) : null
  })
  const sequenceOk = markers.length > 0 && (
    numericSequence.every(number => number !== null)
      ? numericSequence.every((number, index) => number === index + 1)
      : new Set(markers.map(entry => entry.text)).size === markers.length)
  checks.push(deliveryCheck('delivery.section-sequence', sequenceOk,
    `小节序列：${markers.map(entry => entry.text).join('、') || '无'}`,
    '数字小节从 1 连续递增；中文章名不得重复', '只修正小节标记编号，不改正文内容。'))

  const markerLines = new Set(markers.map(entry => entry.line - 1))
  const invalidBlankLines: number[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim() !== '') continue
    const isEdge = index === 0 || index === lines.length - 1
    const touchesMarker = markerLines.has(index - 1) || markerLines.has(index + 1)
    if (!isEdge && !touchesMarker) invalidBlankLines.push(index + 1)
  }
  checks.push(deliveryCheck('delivery.blank-lines', invalidBlankLines.length === 0,
    invalidBlankLines.length > 0 ? `正文段落间空行：${invalidBlankLines.map(String).join('、')}` : '正文段落间无空行',
    '只允许文件边缘或小节标记相邻处出现空行，正文段落之间紧密单换行', '只删除报告行的多余空行。'))

  return report()
}
