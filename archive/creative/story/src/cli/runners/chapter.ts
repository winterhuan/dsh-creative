/**
 * `outline` and `chapter` commands. The book path has already passed the workspace guard.
 */
import { join } from 'node:path'
import { chapterCheck, chapterCommit, chapterSnapshot } from '../../core/chapter.ts'
import { finishChapter } from '../../core/chapter-finish.ts'
import { verifyOutline } from '../../core/outline-contract.ts'
import { ruleAuditRelativePath, verifyRuleAudit } from '../../core/rule-audit.ts'
import { extractChapterRules } from '../../core/rules.ts'
import { statePath } from '../../core/tracking/store.ts'
import { findChapterFile } from '../../core/wordcount.ts'
import { positiveChapter, withFindings, type CliOutcome } from '../outcome.ts'
import { containedTree, filePath, text } from '../guards.ts'

/** Run one outline or chapter action. */
export function runChapter(book: string, family: string, action: string, values: Record<string, unknown>): CliOutcome {
  const chapter = positiveChapter(values)
  if (family === 'outline') {
    const path = findChapterFile(join(book, '大纲'), chapter, { outline: true, allowMissing: true })
    filePath(path, book, true)
    const report = verifyOutline(path)
    return withFindings(report, !report.ok)
  }
  if (action === 'rules') return [extractChapterRules(book, chapter), 0]
  if (action === 'audit-verify') {
    const relative = typeof values.input === 'string' ? values.input : ruleAuditRelativePath(chapter)
    const path = filePath(relative, book, true)
    const verified = verifyRuleAudit(book, chapter, path)
    return withFindings(verified, !verified.verified)
  }
  if (action === 'snapshot') {
    const stateFile = statePath(book)
    filePath(stateFile, book)
    filePath(join(book, '追踪/.tracking-commit.lock'), book, true)
    return [chapterSnapshot(book, chapter, values['outline-only'] === true), 0]
  }
  for (const [directory, outline] of [['大纲', true], ['正文', false]] as const) {
    filePath(findChapterFile(join(book, directory), chapter, { outline }), book)
  }
  if (action === 'check') {
    const result = chapterCheck(book, chapter)
    return withFindings(result, result.outline_readiness.status !== 'pass' || result.quality.status !== 'pass')
  }
  containedTree(book, join(book, '追踪'))
  const inputPath = filePath(text(values, 'input'), undefined)
  const withFacts = action === 'finish' || values['with-facts'] === true
  if (withFacts) {
    const report = finishChapter(book, chapter, inputPath, action === 'accept-current-length' || values['accept-current-length'] === true)
    const auditBlocking = report.book_audit.ran && (report.book_audit.blocking ?? 0) > 0
    const failed = !report.committed || report.facts_error !== undefined || (report.claims_present && !report.facts_recorded) || auditBlocking
    return withFindings(report, failed)
  }
  return [chapterCommit(book, chapter, inputPath, action === 'accept-current-length'), 0]
}
