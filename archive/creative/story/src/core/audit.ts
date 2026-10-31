/**
 * Read-only book audit over a chapter range.
 *
 * Each check implements {@link BookAuditCheck} and is listed in {@link BOOK_AUDIT_CHECKS}
 * (`audit-checks.ts`). A new check joins that list and returns the same result
 * shape. This module orders the checks, sorts findings, and renders Markdown.
 * The command writes nothing; the CLI stores the rendering only when `--write`
 * is set, and a problem list only when `--issues` is set.
 *
 * The `chapter` check reuses {@link checkBlockingQuality}. Void-term advisories
 * from that scan are omitted there and reported once by `void-entries`.
 */
import { existsSync } from 'node:fs'
import { type TrackingState } from './tracking/schema.ts'
import { loadState, statePath } from './tracking/store.ts'
import { BOOK_AUDIT_CHECKS } from './audit-checks.ts'

export { BOOK_AUDIT_CHECKS }

/** Schema of {@link auditBook} results. */
export const BOOK_AUDIT_SCHEMA = 'story-book-audit/v1'
/** Largest inclusive chapter span one audit accepts. */
export const BOOK_AUDIT_MAX_SPAN = 2000

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

/** One registered check's outcome. `warn` means hints and no blocking finding. */
export interface BookAuditCheckResult {
  readonly id: string
  readonly status: 'pass' | 'fail' | 'skip' | 'warn'
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
  readonly warn: number
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
  /** Book-relative Markdown path. Present only after `--write` succeeds. */
  readonly report_path?: string
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
  run(context: BookAuditContext): { readonly status: 'pass' | 'fail' | 'skip' | 'warn'; readonly summary: string; readonly findings: readonly BookAuditFinding[] }
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


function countsOf(checks: readonly BookAuditCheckResult[], findings: readonly BookAuditFinding[]): BookAuditCounts {
  const countStatus = (status: BookAuditCheckResult['status']): number => checks.filter(check => check.status === status).length
  const countSeverity = (severity: BookAuditFinding['severity']): number => findings.filter(item => item.severity === severity).length
  return {
    pass: countStatus('pass'),
    fail: countStatus('fail'),
    skip: countStatus('skip'),
    warn: countStatus('warn'),
    blocking: countSeverity('blocking'),
    hint: countSeverity('hint'),
  }
}

function chapterRank(chapter: number | undefined): number {
  return chapter ?? Number.MAX_SAFE_INTEGER
}

function lineRank(line: number | undefined): number {
  return line ?? Number.MAX_SAFE_INTEGER
}

/** Blocking before hint, then check, chapter, path, numeric line, category, message. */
function compareFindings(order: ReadonlyMap<string, number>, left: BookAuditFinding, right: BookAuditFinding): number {
  if (left.severity !== right.severity) return left.severity === 'blocking' ? -1 : 1
  const rank = (order.get(left.check) ?? order.size) - (order.get(right.check) ?? order.size)
  if (rank !== 0) return rank
  const chapter = chapterRank(left.chapter) - chapterRank(right.chapter)
  if (chapter !== 0) return chapter
  const path = (left.source?.path ?? '').localeCompare(right.source?.path ?? '', 'zh')
  if (path !== 0) return path
  const line = lineRank(left.source?.line) - lineRank(right.source?.line)
  if (line !== 0) return line
  return left.category.localeCompare(right.category, 'zh')
    || left.message.localeCompare(right.message, 'zh')
    || (left.evidence ?? '').localeCompare(right.evidence ?? '', 'zh')
}

function readAuditState(project: string): TrackingState | undefined {
  if (!existsSync(statePath(project))) return undefined
  return loadState(project)
}

/** A skipped check stays skipped. Hints without a blocking finding are `warn`. */
function settleStatus(declared: BookAuditCheckResult['status'], findings: readonly BookAuditFinding[]): BookAuditCheckResult['status'] {
  if (declared === 'skip') return 'skip'
  if (findings.some(item => item.severity === 'blocking')) return 'fail'
  if (findings.length > 0) return 'warn'
  return 'pass'
}

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
    results.push({ id: check.id, status: settleStatus(outcome.status, outcome.findings), summary: outcome.summary })
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

const HASH64 = /\b[0-9a-f]{64}\b/gu
/** How many line numbers one grouped hint line prints before an ellipsis. */
const HINT_LINE_PREVIEW = 12

function shortenHashes(text: string): string {
  return text.replace(HASH64, value => value.slice(0, 8))
}

function renderBlocking(item: BookAuditFinding): string {
  const where = item.chapter === undefined ? '' : `第${String(item.chapter)}章 `
  const evidence = item.evidence === undefined ? '' : ` [${item.evidence}]`
  const source = item.source === undefined ? '' : ` (${item.source.path}${item.source.line === undefined ? '' : `:${String(item.source.line)}`})`
  return shortenHashes(`- ${item.check} ${where}${item.category}：${item.message}${evidence}${source}`)
}

function renderHintGroup(group: readonly BookAuditFinding[]): string {
  const first = group[0]
  if (first === undefined) return '- （无）'
  const where = first.chapter === undefined ? '' : `第${String(first.chapter)}章 `
  const lines = [...new Set(group.flatMap(item => item.source?.line === undefined ? [] : [item.source.line]))].sort((left, right) => left - right)
  const shown = lines.slice(0, HINT_LINE_PREVIEW)
  const lineText = lines.length === 0 ? '' : `第 ${shown.join('、')}${lines.length > shown.length ? '…' : ''}行：`
  const evidenceValues = [...new Set(group.flatMap(item => item.evidence === undefined ? [] : [item.evidence]))]
  const evidence = evidenceValues.length === 1 ? ` [${evidenceValues[0]}]` : ''
  const paths = [...new Set(group.flatMap(item => item.source?.path === undefined ? [] : [item.source.path]))]
  const source = paths.length === 1 ? ` (${paths[0]})` : ''
  return shortenHashes(`- ${first.check} ${where}${first.category} ${String(group.length)} 处：${lineText}${first.message}${evidence}${source}`)
}

function hintGroups(rows: readonly BookAuditFinding[]): BookAuditFinding[][] {
  const groups: BookAuditFinding[][] = []
  const index = new Map<string, BookAuditFinding[]>()
  for (const item of rows) {
    const key = `${item.check}\0${item.chapter === undefined ? '' : String(item.chapter)}\0${item.category}\0${item.message}`
    const existing = index.get(key)
    if (existing === undefined) {
      const created = [item]
      index.set(key, created)
      groups.push(created)
      continue
    }
    existing.push(item)
  }
  return groups
}

/**
 * Render one audit as Markdown. JSON findings stay one row each.
 * Hints that share a chapter, category and message become one line, and a 64-character hash prints as its first eight characters.
 * @param report - a report from {@link auditBook}, plus `report_path` when the CLI wrote the file.
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
    ...(report.report_path === undefined ? [] : [`- report_path: ${report.report_path}`]),
    '',
    '## 检查',
    '',
    ...report.checks.map(check => `- ${check.id}: ${check.status} — ${check.summary}`),
  ]
  lines.push('', '## blocking', '')
  const blocking = report.findings.filter(item => item.severity === 'blocking')
  if (blocking.length === 0) lines.push('- （无）')
  else for (const item of blocking) lines.push(renderBlocking(item))
  lines.push('', '## hint', '')
  const hints = hintGroups(report.findings.filter(item => item.severity === 'hint'))
  if (hints.length === 0) lines.push('- （无）')
  else for (const group of hints) lines.push(renderHintGroup(group))
  lines.push('')
  return lines.join('\n')
}

/** Problem list derived from one audit. The audit itself does not write this file. */
export function issuesFromAudit(report: BookAuditReport): {
  schema: 'story-issues/v1'
  range: BookAuditRange
  items: readonly { readonly chapter?: number; readonly line?: number; readonly id: string; readonly suggestion: string }[]
} {
  return {
    schema: 'story-issues/v1',
    range: report.range,
    items: report.findings.map(item => ({
      ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
      ...(item.source?.line === undefined ? {} : { line: item.source.line }),
      id: item.evidence ?? `${item.check}:${item.category}`,
      suggestion: item.message,
    })),
  }
}
