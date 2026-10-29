/**
 * `facts` commands. The book path has already passed the workspace guard.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractFacts, type ExtractFrom } from '../../core/facts-extract.ts'
import { diffFacts, queryFacts, recordFacts, staleFacts } from '../../core/facts.ts'
import { positiveChapter, withFindings, type CliOutcome } from '../outcome.ts'
import { containedTree, filePath, text } from '../guards.ts'

/** Run one facts action. */
export function runFacts(book: string, action: string, values: Record<string, unknown>): CliOutcome {
  if (action === 'query') {
    const kind = typeof values.kind === 'string' ? values.kind : undefined
    const subject = typeof values.subject === 'string' ? values.subject : undefined
    return [queryFacts(book, { ...(kind === undefined ? {} : { kind }), ...(subject === undefined ? {} : { subject }) }), 0]
  }
  if (action === 'stale') {
    const report = staleFacts(book)
    return withFindings(report, report.stale.length > 0 || report.missing_chapters.length > 0)
  }
  if (action === 'extract') {
    const chapter = positiveChapter(values)
    return [extractFacts(book, chapter, { from: values.from as ExtractFrom, dryRun: values['dry-run'] === true }), 0]
  }
  const chapter = positiveChapter(values)
  const input: unknown = JSON.parse(readFileSync(filePath(text(values, 'input'), book), 'utf8'))
  if (action === 'diff') {
    const report = diffFacts(book, chapter, input)
    return withFindings(report, !report.ok)
  }
  containedTree(book, join(book, '追踪'))
  return [recordFacts(book, chapter, input, { allowReference: values['allow-reference'] === true }), 0]
}
