/**
 * `facts` commands. The book path has already passed the workspace guard.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractFacts, type ExtractFrom } from '../../core/facts-extract.ts'
import { diffFacts, queryFacts, recordFacts, staleFacts } from '../../core/facts.ts'
import { CliError, containedTree, filePath, integer, text } from '../guards.ts'

/** Run one facts action. */
export function runFacts(book: string, action: string, values: Record<string, unknown>): [unknown, number] {
    if (action === 'query') {
      const kind = typeof values.kind === 'string' ? values.kind : undefined
      const subject = typeof values.subject === 'string' ? values.subject : undefined
      return [queryFacts(book, { ...(kind === undefined ? {} : { kind }), ...(subject === undefined ? {} : { subject }) }), 0]
    }
    if (action === 'stale') {
      const report = staleFacts(book)
      return [report, report.stale.length > 0 || report.missing_chapters.length > 0 ? 1 : 0]
    }
    if (action === 'extract') {
      const chapter = integer(values, 'chapter') ?? 0
      if (chapter < 1) throw new CliError('--chapter must be positive')
      return [extractFacts(book, chapter, { from: values.from as ExtractFrom, dryRun: values['dry-run'] === true }), 0]
    }
    const chapter = integer(values, 'chapter') ?? 0
    if (chapter < 1) throw new CliError('--chapter must be positive')
    const input: unknown = JSON.parse(readFileSync(filePath(text(values, 'input'), book), 'utf8'))
    if (action === 'diff') {
      const report = diffFacts(book, chapter, input)
      return [report, report.ok ? 0 : 1]
    }
    containedTree(book, join(book, '追踪'))
    return [recordFacts(book, chapter, input, { allowReference: values['allow-reference'] === true }), 0]
}
