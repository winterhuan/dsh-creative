/**
 * Registered book-audit checks.
 *
 * {@link auditBook} runs {@link BOOK_AUDIT_CHECKS} in order. Each check returns
 * the same result shape. Types stay in `audit.ts`; this file imports them as
 * types so the two modules do not load each other at runtime.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { checkBlockingQuality, type QualityRow } from './chapter.ts'
import { declaredAliases } from './settings-lookup.ts'
import { staleFacts } from './facts.ts'
import { checkRhythm } from './rhythm.ts'
import { checkPlan } from './plan.ts'
import { checkCast } from './cast.ts'
import { styleFindings } from './style.ts'
import { assessHealth } from './tracking/health.ts'
import { findChapterFile } from './wordcount.ts'
import { readWritingCheck } from './writing-check.ts'
import type { BookAuditCheck, BookAuditContext, BookAuditFinding } from './audit.ts'

const SHA256_RE = /^[0-9a-f]{64}$/u

function bookRelative(project: string, path: string): string {
  const value = relative(project, path)
  if (value.startsWith(`..${sep}`) || value === '..') return path
  return value.split(sep).join('/')
}

function fileExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true
}

function chapters(context: BookAuditContext): number[] {
  const values: number[] = []
  for (let chapter = context.from; chapter <= context.to; chapter += 1) values.push(chapter)
  return values
}

function chapterFile(project: string, chapter: number, outline: boolean): string {
  const directory = join(project, outline ? '大纲' : '正文')
  return findChapterFile(directory, chapter, { outline, allowMissing: true })
}

function finding(partial: BookAuditFinding): BookAuditFinding {
  return partial
}

const chapterCheck: BookAuditCheck = {
  id: 'chapter',
  run(context) {
    const findings: BookAuditFinding[] = []
    let scanned = 0
    let missing = 0
    let blockingChapters = 0
    for (const chapter of chapters(context)) {
      const body = chapterFile(context.project, chapter, false)
      if (!fileExists(body)) {
        missing += 1
        findings.push(finding({
          check: 'chapter', severity: 'hint', chapter, category: 'missing-body',
          message: `第${String(chapter)}章没有正文，跳过质量扫描`,
        }))
        continue
      }
      const outline = chapterFile(context.project, chapter, true)
      if (!fileExists(outline)) {
        findings.push(finding({
          check: 'chapter', severity: 'hint', chapter, category: 'missing-outline',
          message: `第${String(chapter)}章没有细纲，跳过照搬比对`,
        }))
      }
      const quality = checkBlockingQuality(outline, body, context.project, { missingOutline: 'skip' })
      scanned += 1
      let chapterBlocking = false
      const rows = [
        ...quality.blocking_findings.map(row => ({ row, severity: 'blocking' as const })),
        ...quality.advisories.map(row => ({ row, severity: 'hint' as const })),
      ]
      for (const { row, severity } of rows) {
        if (row.type === 'VOID_TERM') continue
        if (severity === 'blocking') chapterBlocking = true
        findings.push(qualityFinding(context.project, chapter, row, severity))
      }
      if (chapterBlocking) blockingChapters += 1
    }
    const status = scanned === 0 ? 'skip' : blockingChapters > 0 ? 'fail' : findings.length > 0 ? 'warn' : 'pass'
    const summary = scanned === 0
      ? `范围内 ${String(missing)} 章没有正文，未做质量扫描`
      : `${String(scanned)} 章已扫描，${String(blockingChapters)} 章有阻断项，${String(missing)} 章没有正文`
    return { status, summary, findings }
  },
}

function qualityFinding(project: string, chapter: number, row: QualityRow, severity: 'blocking' | 'hint'): BookAuditFinding {
  const message = typeof row.message === 'string' ? row.message : row.type
  const evidence = typeof row.id === 'string' ? row.id : undefined
  const file = typeof row.file === 'string' ? bookRelative(project, row.file) : undefined
  const line = typeof row.line === 'number' ? row.line : undefined
  return finding({
    check: 'chapter',
    severity,
    chapter,
    category: row.type,
    message,
    ...(evidence === undefined ? {} : { evidence }),
    ...(file === undefined ? {} : { source: { path: file, ...(line === undefined ? {} : { line }) } }),
  })
}

const healthCheck: BookAuditCheck = {
  id: 'health',
  run(context) {
    if (context.state === undefined) return { status: 'skip', summary: '没有追踪状态，未做伏笔与人物健康检查', findings: [] }
    const report = assessHealth(context.state, { chapter: context.to })
    const findings = report.items.map(item => finding({
      check: 'health',
      severity: 'hint' as const,
      chapter: item.anchor_chapter,
      category: item.risk,
      message: `${item.id}：${item.summary}`,
      evidence: `age=${String(item.age)}`,
      source: { path: item.source },
    }))
    return {
      status: findings.length === 0 ? 'pass' : 'warn',
      summary: findings.length === 0 ? '没有伏笔或人物风险' : `${String(findings.length)} 条伏笔或人物风险`,
      findings,
    }
  },
}

function cardNames(project: string): Set<string> {
  const directory = join(project, '设定', '角色')
  const names = new Set<string>()
  const info = lstatSync(directory, { throwIfNoEntry: false })
  if (info === undefined || info.isSymbolicLink() || !info.isDirectory()) return names
  const files = readdirSync(directory).filter(name => name.endsWith('.md')).sort((left, right) => left.localeCompare(right, 'zh'))
  for (const fileName of files) {
    const path = join(directory, fileName)
    const fileInfo = lstatSync(path, { throwIfNoEntry: false })
    if (fileInfo === undefined || fileInfo.isSymbolicLink() || !fileInfo.isFile()) continue
    names.add(fileName.slice(0, -'.md'.length))
    try {
      for (const alias of declaredAliases(readFileSync(path, 'utf8'))) names.add(alias)
    } catch {
      // An unreadable card still counts by its filename.
    }
  }
  return names
}

const castCardsCheck: BookAuditCheck = {
  id: 'cast-cards',
  run(context) {
    if (context.state === undefined) return { status: 'skip', summary: '没有追踪状态，未核对角色卡', findings: [] }
    const names = Object.keys(context.state.characters).sort((left, right) => left.localeCompare(right, 'zh'))
    if (names.length === 0) return { status: 'pass', summary: '追踪里没有角色快照', findings: [] }
    const cards = cardNames(context.project)
    const findings = names.filter(name => !cards.has(name)).map(name => finding({
      check: 'cast-cards',
      severity: 'hint' as const,
      category: 'missing-card',
      message: `追踪有角色快照「${name}」，设定/角色/ 没有同名或别名卡`,
      evidence: name,
      source: { path: '追踪/_tracking-state.json' },
    }))
    return {
      status: findings.length === 0 ? 'pass' : 'warn',
      summary: findings.length === 0 ? '角色快照都有对应的角色卡' : `${String(findings.length)} 个角色快照没有角色卡`,
      findings,
    }
  },
}

function bodyDigest(path: string): string | undefined {
  try {
    if (!fileExists(path)) return undefined
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return undefined
  }
}

function readerHashes(value: unknown, from: number, to: number): { chapter: number; hash: string }[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  const rows: { chapter: number; hash: string }[] = []
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[1-9]\d*$/u.test(key)) continue
    const chapter = Number(key)
    if (chapter < from || chapter > to) continue
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const hash = (entry as Record<string, unknown>).body_sha256
    if (typeof hash !== 'string' || !SHA256_RE.test(hash)) continue
    rows.push({ chapter, hash })
  }
  rows.sort((left, right) => left.chapter - right.chapter)
  return rows
}

const readerValueCheck: BookAuditCheck = {
  id: 'reader-value-stale',
  run(context) {
    if (context.state === undefined) return { status: 'skip', summary: '没有追踪状态，未对照历史读者价值记录', findings: [] }
    if (!Object.hasOwn(context.state, 'reader_value_records')) {
      return { status: 'pass', summary: '没有历史读者价值记录', findings: [] }
    }
    const records = context.state.reader_value_records
    if (typeof records !== 'object' || records === null || Array.isArray(records)) {
      return { status: 'skip', summary: '历史读者价值记录不是对象，未对照', findings: [] }
    }
    const rows = readerHashes(records, context.from, context.to)
    if (rows.length === 0) return { status: 'pass', summary: '范围内没有带正文哈希的读者价值记录', findings: [] }
    const findings: BookAuditFinding[] = []
    for (const row of rows) {
      const body = bodyDigest(chapterFile(context.project, row.chapter, false))
      const wordcount = context.state.wordcount_records[String(row.chapter)]?.body_sha256
      const sides: string[] = []
      const evidence = [`record=${row.hash}`]
      if (body !== undefined && body !== row.hash) {
        sides.push('当前正文')
        evidence.push(`body=${body}`)
      }
      if (wordcount !== undefined && wordcount !== row.hash) {
        sides.push('字数记录')
        evidence.push(`wordcount=${wordcount}`)
      }
      if (sides.length === 0) continue
      findings.push(finding({
        check: 'reader-value-stale', severity: 'hint', chapter: row.chapter, category: 'stale-hash',
        message: `第${String(row.chapter)}章读者价值记录的正文哈希与${sides.join('、')}不一致`,
        evidence: evidence.join(' '),
        source: { path: '追踪/_tracking-state.json' },
      }))
    }
    return {
      status: findings.length === 0 ? 'pass' : 'warn',
      summary: findings.length === 0 ? '范围内的读者价值正文哈希与当前正文和字数记录一致' : `${String(findings.length)} 条读者价值记录的正文哈希不一致`,
      findings,
    }
  },
}

function voidTerms(project: string): readonly string[] {
  const value = readWritingCheck(project)?.value.void_terms
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
}

function entryPreview(entry: string): string {
  return entry.length <= 24 ? entry : `${entry.slice(0, 24)}…`
}

const voidEntriesCheck: BookAuditCheck = {
  id: 'void-entries',
  run(context) {
    if (context.state === undefined) return { status: 'skip', summary: '没有追踪状态，未检查作废条目', findings: [] }
    const findings: BookAuditFinding[] = []
    const seen = new Set<string>()
    const push = (id: string, message: string): void => {
      if (seen.has(id)) return
      seen.add(id)
      findings.push(finding({
        check: 'void-entries', severity: 'hint', category: 'void', message, evidence: id,
        source: { path: '追踪/_tracking-state.json' },
      }))
    }
    const fields = [
      ['long_term_constraints', context.state.context.long_term_constraints],
      ['continuity_risks', context.state.context.continuity_risks],
    ] as const
    const terms = [...voidTerms(context.project)].sort((left, right) => left.localeCompare(right, 'zh'))
    for (const term of terms) {
      for (const [field, entries] of fields) {
        entries.forEach((entry, index) => {
          if (!entry.includes(term)) return
          push(`void:${field}[${String(index)}]:${term}`, `作废条目仍在：「${term}」命中 ${field}[${String(index)}]「${entryPreview(entry)}」`)
        })
      }
    }
    for (const [field, entries] of fields) {
      entries.forEach((entry, index) => {
        if (!entry.includes('作废')) return
        push(`void:${field}[${String(index)}]:作废`, `条目含作废：${field}[${String(index)}]「${entryPreview(entry)}」`)
      })
    }
    const abandoned = Object.values(context.state.foreshadow).sort((left, right) => left.id.localeCompare(right.id, 'zh'))
    for (const row of abandoned) {
      const status = row.status as string
      if (status !== '放弃' && status !== '作废') continue
      push(`void:foreshadow[${row.id}]:${status}`, `伏笔 ${row.id} 状态为${status}，仍留在追踪里`)
    }
    return {
      status: findings.length === 0 ? 'pass' : 'warn',
      summary: findings.length === 0 ? '没有仍留在追踪里的作废条目' : `${String(findings.length)} 条作废条目仍留在追踪里`,
      findings,
    }
  },
}

const factsStaleCheck: BookAuditCheck = {
  id: 'facts-stale',
  run(context) {
    let report: ReturnType<typeof staleFacts>
    try {
      report = staleFacts(context.project)
    } catch (error) {
      return {
        status: 'fail',
        summary: '事实账本无法读取',
        findings: [finding({ check: 'facts-stale', severity: 'blocking', category: 'ledger', message: error instanceof Error ? error.message : String(error), source: { path: '追踪/事实账本.json' } })],
      }
    }
    if (!report.present) return { status: 'skip', summary: '没有事实账本', findings: [] }
    const findings: BookAuditFinding[] = []
    for (const row of report.stale) {
      if (row.chapter < context.from || row.chapter > context.to) continue
      findings.push(finding({
        check: 'facts-stale', severity: 'hint', chapter: row.chapter, category: 'stale',
        message: `${row.id} 的来源章正文已变化`,
        evidence: `source=${row.source_body_sha256} current=${row.current_body_sha256 ?? 'missing'}`,
        source: { path: '追踪/事实账本.json' },
      }))
    }
    for (const chapter of report.missing_chapters) {
      if (chapter < context.from || chapter > context.to) continue
      findings.push(finding({
        check: 'facts-stale', severity: 'hint', chapter, category: 'missing-chapter',
        message: `账本缺第 ${String(chapter)} 章`,
        evidence: String(chapter),
        source: { path: '追踪/事实账本.json' },
      }))
    }
    return {
      status: findings.length === 0 ? 'pass' : 'warn',
      summary: findings.length === 0 ? '范围内的事实账本与来源章正文一致' : `${String(findings.length)} 条事实账本过期或缺章`,
      findings,
    }
  },
}

const rhythmAuditCheck: BookAuditCheck = {
  id: 'rhythm',
  run(context) {
    const report = checkRhythm(context.project, context.from, context.to)
    if (!report.applicable) return { status: 'skip', summary: '没有卖点表、爽点字段或情绪弧线', findings: [] }
    const findings = report.findings.map(item => finding({
      check: 'rhythm', severity: 'hint', ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
      category: item.category, message: item.message,
    }))
    return {
      status: findings.length === 0 ? 'pass' : 'warn',
      summary: findings.length === 0 ? '承诺与节奏未超限' : `${String(findings.length)} 条承诺或节奏提示`,
      findings,
    }
  },
}

const planAuditCheck: BookAuditCheck = {
  id: 'plan',
  run(context) {
    const report = checkPlan(context.project, context.to)
    if (!report.applicable) return { status: 'skip', summary: '没有卷纲，未做规划检查', findings: [] }
    const findings = report.findings.map(item => finding({
      check: 'plan', severity: item.severity, ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
      category: item.category, message: item.message,
    }))
    return {
      status: findings.some(item => item.severity === 'blocking') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      summary: findings.length === 0 ? '卷纲范围连续，近卷末的下一卷已登记' : `${String(findings.length)} 条规划问题`,
      findings,
    }
  },
}

const castLimitsCheck: BookAuditCheck = {
  id: 'cast-limits',
  run(context) {
    const report = checkCast(context.project, { from: context.from, to: context.to })
    const extra = report.findings.filter(item => item.category !== 'missing-card')
    if (extra.length === 0) return { status: 'skip', summary: '没有力量、关系阶段或反复出场的新增发现', findings: [] }
    const findings = extra.map(item => finding({
      check: 'cast-limits', severity: item.severity, category: item.category, message: item.message,
      ...(item.evidence === undefined ? {} : { evidence: item.evidence }),
    }))
    return {
      status: findings.some(item => item.severity === 'blocking') ? 'fail' : 'warn',
      summary: `${String(findings.length)} 条力量、关系或出场发现`,
      findings,
    }
  },
}

const styleAuditCheck: BookAuditCheck = {
  id: 'style',
  run(context) {
    const configured = readWritingCheck(context.project)?.style
    if (configured === undefined) return { status: 'skip', summary: '没有文风指标', findings: [] }
    const findings: BookAuditFinding[] = []
    for (const chapter of chapters(context)) {
      for (const item of styleFindings(context.project, chapter)) {
        findings.push(finding({
          check: 'style', severity: item.severity, chapter, category: item.metric, message: item.message, evidence: item.metric,
        }))
      }
    }
    return {
      status: findings.some(item => item.severity === 'blocking') ? 'fail' : findings.length > 0 ? 'warn' : 'pass',
      summary: findings.length === 0 ? '文风指标未超限' : `${String(findings.length)} 条文风指标超限`,
      findings,
    }
  },
}

/**
 * Checks run for every audit, in this order.
 * Append a {@link BookAuditCheck} here to report it in the same document.
 */
export const BOOK_AUDIT_CHECKS: readonly BookAuditCheck[] = [
  chapterCheck,
  healthCheck,
  castCardsCheck,
  readerValueCheck,
  voidEntriesCheck,
  factsStaleCheck,
  rhythmAuditCheck,
  planAuditCheck,
  castLimitsCheck,
  styleAuditCheck,
]
