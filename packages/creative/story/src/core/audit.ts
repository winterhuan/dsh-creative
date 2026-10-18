/**
 * Read-only book audit over a chapter range.
 *
 * Each check implements {@link BookAuditCheck} and is listed in {@link BOOK_AUDIT_CHECKS}.
 * A later check — a fact ledger, pacing, character, or style pass — joins that list
 * and returns the same result shape. The command writes nothing; the CLI stores
 * the Markdown rendering only when `--write` is set.
 *
 * `chapter` reuses {@link checkBlockingQuality}. Void-term advisories from that
 * scan are omitted here and reported once by `void-entries`.
 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { checkBlockingQuality, type QualityRow } from './chapter.ts'
import { declaredAliases } from './settings-lookup.ts'
import { assessHealth } from './tracking/health.ts'
import { type TrackingState } from './tracking/schema.ts'
import { loadState, statePath } from './tracking/store.ts'
import { findChapterFile } from './wordcount.ts'
import { readWritingCheck } from './writing-check.ts'

/** Schema of {@link auditBook} results. */
export const BOOK_AUDIT_SCHEMA = 'story-book-audit/v1'
/** Largest inclusive chapter span one audit accepts. */
export const BOOK_AUDIT_MAX_SPAN = 2000
const SHA256_RE = /^[0-9a-f]{64}$/u

/** The audit range is not two positive chapter numbers within {@link BOOK_AUDIT_MAX_SPAN}. */
export class BookAuditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BookAuditError'
  }
}

/** Inclusive chapter range. */
export interface BookAuditRange {
  readonly from: number
  readonly to: number
}

/** One registered check's outcome. Hints do not make `status` `fail`. */
export interface BookAuditCheckResult {
  readonly id: string
  readonly status: 'pass' | 'fail' | 'skip'
  readonly summary: string
}

/** One stable finding. `source.line` is 1-based when the check has a line. */
export interface BookAuditFinding {
  readonly check: string
  readonly severity: 'blocking' | 'hint'
  readonly chapter?: number
  readonly category: string
  readonly message: string
  readonly evidence?: string
  readonly source?: { readonly path: string; readonly line?: number }
}

/** Check statuses and finding severities, including rows a summary does not repeat. */
export interface BookAuditCounts {
  readonly pass: number
  readonly fail: number
  readonly skip: number
  readonly blocking: number
  readonly hint: number
}

/** The `story-book-audit/v1` document. */
export interface BookAuditReport {
  readonly schema: typeof BOOK_AUDIT_SCHEMA
  readonly range: BookAuditRange
  readonly state_revision: number | null
  readonly checks: readonly BookAuditCheckResult[]
  readonly findings: readonly BookAuditFinding[]
  readonly counts: BookAuditCounts
}

/** What every check may read. The audit does not write. */
export interface BookAuditContext {
  readonly project: string
  readonly from: number
  readonly to: number
  readonly state: TrackingState | undefined
}

/** One pluggable check. `run` must be deterministic for the same files. */
export interface BookAuditCheck {
  readonly id: string
  run(context: BookAuditContext): { readonly status: 'pass' | 'fail' | 'skip'; readonly summary: string; readonly findings: readonly BookAuditFinding[] }
}

/** Markdown path used when `--write` omits a path. */
export function defaultAuditReportPath(from: number, to: number): string {
  return `草稿/体检_第${String(from)}-${String(to)}章.md`
}

function requireRange(from: number, to: number): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
    throw new BookAuditError('--from and --to must be positive integers')
  }
  if (from > to) throw new BookAuditError('--from cannot exceed --to')
  if (to - from + 1 > BOOK_AUDIT_MAX_SPAN) throw new BookAuditError(`book audit accepts at most ${String(BOOK_AUDIT_MAX_SPAN)} chapters`)
}

function bookRelative(project: string, path: string): string {
  const value = relative(project, path)
  if (value.startsWith(`..${sep}`) || value === '..') return path
  return value.split(sep).join('/')
}

function fileExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true
}

function readAuditState(project: string): TrackingState | undefined {
  if (!existsSync(statePath(project))) return undefined
  return loadState(project)
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

function countsOf(checks: readonly BookAuditCheckResult[], findings: readonly BookAuditFinding[]): BookAuditCounts {
  const countStatus = (status: BookAuditCheckResult['status']): number => checks.filter(check => check.status === status).length
  const countSeverity = (severity: BookAuditFinding['severity']): number => findings.filter(item => item.severity === severity).length
  return {
    pass: countStatus('pass'),
    fail: countStatus('fail'),
    skip: countStatus('skip'),
    blocking: countSeverity('blocking'),
    hint: countSeverity('hint'),
  }
}

function compareFindings(order: ReadonlyMap<string, number>, left: BookAuditFinding, right: BookAuditFinding): number {
  const rank = (order.get(left.check) ?? order.size) - (order.get(right.check) ?? order.size)
  if (rank !== 0) return rank
  const leftChapter = left.chapter ?? Number.MAX_SAFE_INTEGER
  const rightChapter = right.chapter ?? Number.MAX_SAFE_INTEGER
  if (leftChapter !== rightChapter) return leftChapter - rightChapter
  if (left.severity !== right.severity) return left.severity === 'blocking' ? -1 : 1
  return left.category.localeCompare(right.category, 'zh')
    || left.message.localeCompare(right.message, 'zh')
    || (left.evidence ?? '').localeCompare(right.evidence ?? '', 'zh')
    || (left.source?.path ?? '').localeCompare(right.source?.path ?? '', 'zh')
    || (left.source?.line ?? 0) - (right.source?.line ?? 0)
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
    const status = scanned === 0 ? 'skip' : blockingChapters > 0 ? 'fail' : 'pass'
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
      status: 'pass',
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
      status: 'pass',
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
      if (body !== undefined && body !== row.hash) {
        findings.push(finding({
          check: 'reader-value-stale', severity: 'hint', chapter: row.chapter, category: 'body-hash',
          message: `第${String(row.chapter)}章读者价值记录的正文哈希与当前正文不一致`,
          evidence: `record=${row.hash} body=${body}`,
          source: { path: '追踪/_tracking-state.json' },
        }))
      }
      if (wordcount !== undefined && wordcount !== row.hash) {
        findings.push(finding({
          check: 'reader-value-stale', severity: 'hint', chapter: row.chapter, category: 'wordcount-hash',
          message: `第${String(row.chapter)}章读者价值记录的正文哈希与字数记录不一致`,
          evidence: `record=${row.hash} wordcount=${wordcount}`,
          source: { path: '追踪/_tracking-state.json' },
        }))
      }
    }
    return {
      status: 'pass',
      summary: findings.length === 0 ? '范围内的读者价值正文哈希与当前正文和字数记录一致' : `${String(findings.length)} 条读者价值正文哈希不一致`,
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
      status: 'pass',
      summary: findings.length === 0 ? '没有仍留在追踪里的作废条目' : `${String(findings.length)} 条作废条目仍留在追踪里`,
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
]

/**
 * Audit one inclusive chapter range.
 * @param project - the book directory.
 * @param options - the range and an optional check list. The default is {@link BOOK_AUDIT_CHECKS}.
 * @returns the stable `story-book-audit/v1` document. This function does not write.
 * @throws BookAuditError when the range is not a positive span within {@link BOOK_AUDIT_MAX_SPAN}.
 * @throws TrackingError when tracking state exists but is invalid.
 * @throws WritingCheckError when `设定/写作检查.json` exists but is not a valid writing-check file.
 */
export function auditBook(project: string, options: { readonly from: number; readonly to: number; readonly checks?: readonly BookAuditCheck[] }): BookAuditReport {
  requireRange(options.from, options.to)
  const checks = options.checks ?? BOOK_AUDIT_CHECKS
  const state = readAuditState(project)
  const context: BookAuditContext = { project, from: options.from, to: options.to, state }
  const results: BookAuditCheckResult[] = []
  const findings: BookAuditFinding[] = []
  for (const check of checks) {
    const outcome = check.run(context)
    results.push({ id: check.id, status: outcome.status, summary: outcome.summary })
    findings.push(...outcome.findings)
  }
  const order = new Map(checks.map((check, index) => [check.id, index]))
  findings.sort((left, right) => compareFindings(order, left, right))
  return {
    schema: BOOK_AUDIT_SCHEMA,
    range: { from: options.from, to: options.to },
    state_revision: state?.state_revision ?? null,
    checks: results,
    findings,
    counts: countsOf(results, findings),
  }
}

/**
 * Render one audit as Markdown. The JSON document remains the source of the result.
 * @param report - a report from {@link auditBook}.
 * @returns the report text, ending in a newline.
 */
export function renderBookAudit(report: BookAuditReport): string {
  const lines = [
    `# 全书体检 第${String(report.range.from)}-${String(report.range.to)}章`,
    '',
    `- schema: ${report.schema}`,
    `- state_revision: ${report.state_revision === null ? 'null' : String(report.state_revision)}`,
    `- from: ${String(report.range.from)}`,
    `- to: ${String(report.range.to)}`,
    '',
    '## 检查',
    '',
    ...report.checks.map(check => `- ${check.id}: ${check.status} — ${check.summary}`),
  ]
  for (const severity of ['blocking', 'hint'] as const) {
    lines.push('', `## ${severity}`, '')
    const rows = report.findings.filter(item => item.severity === severity)
    if (rows.length === 0) {
      lines.push('- （无）')
      continue
    }
    for (const item of rows) {
      const where = item.chapter === undefined ? '' : `第${String(item.chapter)}章 `
      const evidence = item.evidence === undefined ? '' : ` [${item.evidence}]`
      const source = item.source === undefined ? '' : ` (${item.source.path}${item.source.line === undefined ? '' : `:${String(item.source.line)}`})`
      lines.push(`- ${item.check} ${where}${item.category}：${item.message}${evidence}${source}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
