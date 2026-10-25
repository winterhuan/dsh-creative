/**
 * Commands outside project, chapter, facts and text.
 * Host code calls these runners; it does not judge novel rules itself.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inspectAnalysis, writeAnalysisCards } from '../../core/analysis.ts'
import { auditBook, BOOK_AUDIT_MAX_SPAN, defaultAuditReportPath, issuesFromAudit, renderBookAudit } from '../../core/audit.ts'
import { verifyDelivery, verifyPhase2 } from '../../core/checks/short-contracts.ts'
import { exportNovel } from '../../core/export.ts'
import { LEDGER_NAME, recordEdge } from '../../core/lineage.ts'
import { memoryCheck, memoryCommit, memoryInit, memoryQuery, memoryRecord, memoryRoot } from '../../core/memory.ts'
import { writeRhythmCard } from '../../core/reference.ts'
import { DEFAULT_MAX_CHARS, detectChapter, readKeyPool, writeReport } from '../../core/zhuque.ts'
import { assertReportPath, chapterSpan, CliError, containedTree, filePath, integer, packageRoot, prepareReportFile, readObject, sectionNames, text } from '../guards.ts'

/** Short-story plan and delivery checks. */
export function runShort(book: string, action: string, values: Record<string, unknown>): [unknown, number] {
    for (const name of action === 'delivery-check' ? ['正文.md'] : ['设定.md', '小节大纲.md']) filePath(name, book, true)
    if (action === 'plan-check') {
      const report = verifyPhase2(book, join(packageRoot(), 'knowledge/story/skills/story-write'))
      return [report, report.ok ? 0 : 1]
    }
    const minChars = integer(values, 'min-chars') ?? 0
    const maxChars = integer(values, 'max-chars') ?? 0
    const sections = integer(values, 'sections') ?? 0
    if (!(0 < minChars && minChars <= maxChars && maxChars <= Number.MAX_SAFE_INTEGER) || !(0 < sections && sections <= Number.MAX_SAFE_INTEGER)) {
      throw new CliError('short delivery requires 0 < min-chars <= max-chars and positive sections within Number.MAX_SAFE_INTEGER')
    }
    const report = verifyDelivery(book, { minChars, maxChars, sections })
    return [report, report.ok ? 0 : 1]
}

/** Workspace author-memory commands. */
export function runMemory(workspace: string, action: string, values: Record<string, unknown>): [unknown, number] {
  const root = workspace
    containedTree(root, memoryRoot(root))
    if (action === 'query') {
      const kinds = values.kind as string[]
      return [memoryQuery(root, kinds.length === 0 ? null : kinds, typeof values.book === 'string' ? values.book : null, typeof values.genre === 'string' ? values.genre : null, typeof values.workflow === 'string' ? values.workflow : null), 0]
    }
    if (action === 'record') return [memoryRecord(root, filePath(text(values, 'input'), undefined)), 0]
    if (action === 'commit') return [memoryCommit(root, filePath(text(values, 'input'), undefined)), 0]
    if (action === 'init') return [memoryInit(root), 0]
    return [memoryCheck(root), 0]
}

/** Analysis-library commands. */
export function runAnalysis(workspace: string, action: string, values: Record<string, unknown>): [unknown, number] {
  const root = workspace
    if (action === 'rhythm-card') {
      const [from, to] = chapterSpan(text(values, 'chapters'))
      const sections = sectionNames(values.sections)
      return [writeRhythmCard(root, text(values, 'title'), from, to, sections === undefined ? {} : { sections }), 0]
    }
    const source = filePath(text(values, 'source'), undefined)
    const document = readObject(text(values, 'input'))
    if (action === 'inspect') return [inspectAnalysis(root, text(values, 'title'), source, document), 0]
    const result = writeAnalysisCards(root, text(values, 'title'), source, document)
    return [result, result.failed.length > 0 ? 1 : 0]
}

/** Export committed chapter files. */
export function runExport(book: string, values: Record<string, unknown>): [unknown, number] {
    containedTree(book, join(book, '正文'))
    return [exportNovel(book, resolve(text(values, 'out-dir'))), 0]
}

/** Record one lineage edge. */
export function runLineage(workspace: string, values: Record<string, unknown>): [unknown, number] {
  const root = workspace
    filePath(join(root, LEDGER_NAME), root, true)
    return [recordEdge(root, {
      fromDomain: text(values, 'from-domain'), fromPath: text(values, 'from-path'), toDomain: text(values, 'to-domain'), toPath: text(values, 'to-path'),
      decisions: values.decision as string[], by: text(values, 'by'),
    }), 0]
}

/** Ranged book audit. */
export function runBook(book: string, values: Record<string, unknown>): [unknown, number] {
    const from = integer(values, 'from') ?? 0
    const to = integer(values, 'to') ?? 0
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) throw new CliError('--from and --to must be positive integers')
    if (from > to) throw new CliError('--from cannot exceed --to')
    if (to - from + 1 > BOOK_AUDIT_MAX_SPAN) throw new CliError(`book audit accepts at most ${String(BOOK_AUDIT_MAX_SPAN)} chapters`)
    const write = values.write
    const relative = write === undefined ? undefined : write === true ? defaultAuditReportPath(from, to) : text(values, 'write')
    if (relative !== undefined) assertReportPath(book, relative)
    const issues = values.issues
    const issuesRelative = issues === undefined ? undefined : issues === true ? '草稿/问题单.json' : text(values, 'issues')
    if (issuesRelative !== undefined) assertReportPath(book, issuesRelative, '.json')
    const report = auditBook(book, { from, to })
    const document = {
      ...report,
      ...(relative === undefined ? {} : { report_path: relative }),
      ...(issuesRelative === undefined ? {} : { issues_path: issuesRelative }),
    }
    if (relative !== undefined) writeFileSync(prepareReportFile(book, relative), renderBookAudit({ ...report, ...(relative === undefined ? {} : { report_path: relative }) }), 'utf8')
    if (issuesRelative !== undefined) writeFileSync(prepareReportFile(book, issuesRelative, '.json'), `${JSON.stringify(issuesFromAudit(report), null, 2)}\n`, 'utf8')
    return [document, report.findings.some(item => item.severity === 'blocking') ? 1 : 0]
}

/** Zhuque detection. */
export async function runDetect(book: string, values: Record<string, unknown>): Promise<[unknown, number]> {
  const source = filePath(text(values, 'file'), book)
  const output = typeof values.out === 'string' ? filePath(values.out, book, true) : undefined
  const outcome = await detectChapter({
    file: source, target: values.target as number, maxChars: integer(values, 'max-chars') ?? DEFAULT_MAX_CHARS,
    ...(values['credential-pool-stdin'] === true ? { keyPool: readKeyPool(readFileSync(0, 'utf8')) } : {}),
  })
  if (outcome.report.ok === true && output !== undefined) {
    try {
      writeReport(output, outcome.report)
    } catch (error) {
      throw new CliError(error instanceof Error ? error.message : String(error), 'REPORT_WRITE_FAILED', 3)
    }
  }
  return [outcome.report, outcome.exitCode]
}
