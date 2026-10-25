/**
 * `text` commands. A book path is present only when both --workspace and --book were passed.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { type AiPatternsDocument, aiPatternsDocument, scanAiPatterns } from '../../core/checks/ai-patterns.ts'
import { scanDegeneration } from '../../core/checks/degeneration.ts'
import { checkOutlineCopy } from '../../core/checks/outline-copy.ts'
import { normalizePunctuation, readProjectPunctuationPolicy, type PunctuationPolicy, type QuoteMode } from '../../core/checks/punctuation.ts'
import { measureStyleBaseline } from '../../core/style.ts'
import { checkpointWordcount, evaluateWordcount, measureWordcount } from '../../core/wordcount.ts'
import { chapterSpan, CliError, filePath, integer, text } from '../guards.ts'

/** Run one text action. */
export async function runText(action: string, values: Record<string, unknown>, project: string | undefined): Promise<[unknown, number]> {
  if (action === 'style-baseline') {
    if (project === undefined) throw new CliError('use --workspace and --book together when scoping a text operation')
    const [from, to] = chapterSpan(text(values, 'chapters'))
    return [measureStyleBaseline(project, from, to, values.apply === true), 0]
  }
  if (action === 'count') {
    const body = readFileSync(filePath(text(values, 'file'), project), 'utf8')
    const target = values.target
    if (values.checkpoint === true && target === undefined) throw new CliError('--checkpoint requires --target')
    const identity = { chapter: integer(values, 'chapter') ?? null, caseId: typeof values['case-id'] === 'string' ? values['case-id'] : null }
    const result = target === undefined ? measureWordcount(body, identity)
      : values.checkpoint === true ? checkpointWordcount(body, target, identity) : evaluateWordcount(body, target, identity)
    return [result, 'status' in result && result.status === 'invalid' ? 2 : 0]
  }
  const files = (values.file as string[]).map(file => filePath(file, project))
  if (action === 'normalize') {
    const policy = (typeof values.policy === 'string' ? values.policy : undefined) as PunctuationPolicy | undefined
    const resolvedPolicy: PunctuationPolicy = policy ?? (project === undefined ? undefined : readProjectPunctuationPolicy(project)) ?? 'preserve'
    const quoteMode = values['quote-mode'] as QuoteMode
    const apply = values.apply === true
    const changed: string[] = []
    const diagnostics: string[] = []
    let findings = 0
    for (const file of files) {
      const input = readFileSync(file, 'utf8')
      const result = normalizePunctuation(input, { policy: resolvedPolicy, quoteMode })
      findings += result.findings.length
      if (!apply) {
        diagnostics.push(...result.findings.map(finding => `${file}:${String(finding.line)}:${String(finding.column)}: ${finding.type}: ${finding.message}`))
        continue
      }
      if (result.output !== input) {
        writeFileSync(file, result.output, 'utf8')
        changed.push(file)
        diagnostics.push(`${file}: normalized (${String(result.findings.length)} issue${result.findings.length === 1 ? '' : 's'})`)
      }
    }
    if (apply) diagnostics.push(`Done. Changed files: ${String(changed.length)}`)
    return [{ schema: 'story-text-normalize/v1', applied: apply, changed_files: changed, diagnostics }, apply ? 0 : findings > 0 ? 1 : 0]
  }
  const patterns: Record<string, unknown>[] = []
  const documents: AiPatternsDocument[] = []
  const degeneration: Record<string, unknown>[] = []
  const advisories: string[] = []
  const policy = project === undefined ? 'preserve' : readProjectPunctuationPolicy(project) ?? 'preserve'
  for (const file of files) {
    const input = readFileSync(file, 'utf8')
    const found = scanAiPatterns(input).map(finding => ({ file, ...finding }))
    patterns.push(...found)
    documents.push(aiPatternsDocument(file, input, found.length))
    degeneration.push(...scanDegeneration(input).map(finding => ({ file, ...finding })))
    advisories.push(...normalizePunctuation(input, { policy, quoteMode: 'keep' }).findings.map(finding => `${file}:${String(finding.line)}:${String(finding.column)}: ${finding.type}: ${finding.message}`))
  }
  if (typeof values.outline === 'string') {
    const outline = filePath(values.outline, project)
    for (const file of files) {
      const copied = checkOutlineCopy(file, outline)
      if (copied.status === 1) advisories.push(...copied.output.trim().split('\n'))
    }
  }
  const reports = { patterns: { findings: patterns, documents }, degeneration: { findings: degeneration } }
  const blocking = [...patterns, ...degeneration].filter(finding => finding.severity === 'blocking')
  return [{ schema: 'story-text-check/v1', ok: blocking.length === 0, reports, advisories }, blocking.length > 0 ? 1 : 0]
}
