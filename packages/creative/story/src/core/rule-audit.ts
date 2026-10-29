/**
 * Deterministic check of one chapter's rule-audit file.
 *
 * The auditor writes `story-rule-audit/v1` under `草稿/审稿/`. This module
 * does not call a model and does not write. It checks that every id in the
 * current `chapter rules` list has one verdict, that each `violate` cites a
 * line in the current body, and that both hashes match those bytes.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { paddedChapterNumber } from './chapter-names.ts'
import { WordcountError, chapterSourceDigests, chapterSourceSnapshot } from './wordcount.ts'
import { extractChapterRules, normalizeRuleSentence, type ExtractedRule } from './rules.ts'
import { acceptedFindingsOf, type AcceptedFinding } from './tracking/schema.ts'
import { ruleAuditMode } from './writing-check.ts'

/** Schema of the file an auditor writes. */
export const RULE_AUDIT_SCHEMA = 'story-rule-audit/v1'
/** Schema of {@link verifyRuleAudit}. */
export const RULE_AUDIT_VERIFY_SCHEMA = 'story-rule-audit-verify/v1'

const VERDICTS = ['pass', 'violate', 'not_applicable', 'unclear'] as const

/** One verdict in a rule audit. `line` is 1-based in the chapter body. */
export interface RuleAuditEvidence {
  readonly line: number
  readonly quote: string
}

/** One rule's conclusion. `violate` must include evidence. */
export interface RuleAuditVerdict {
  readonly rule_id: string
  readonly verdict: typeof VERDICTS[number]
  readonly evidence?: readonly RuleAuditEvidence[]
  readonly reason?: string
  readonly fix?: string
}

/** A verified audit, or the reasons it was rejected. */
export type RuleAuditVerification =
  | {
    readonly schema: typeof RULE_AUDIT_VERIFY_SCHEMA
    readonly verified: true
    readonly chapter: number
    readonly path: string
    readonly body_sha256: string
    readonly rules_sha256: string
    readonly violate: readonly string[]
    readonly unclear: readonly string[]
  }
  | {
    readonly schema: typeof RULE_AUDIT_VERIFY_SCHEMA
    readonly verified: false
    readonly chapter: number
    readonly path: string
    readonly reasons: readonly string[]
  }

/**
 * Book-relative path of the audit file for one chapter.
 * @param chapter - the 1-based chapter number.
 * @returns `草稿/审稿/第NNN章.rules.json`, padded to at least three digits.
 */
export function ruleAuditRelativePath(chapter: number): string {
  return `草稿/审稿/第${paddedChapterNumber(chapter)}章.rules.json`
}

function failure(chapter: number, path: string, reasons: readonly string[]): RuleAuditVerification {
  return { schema: RULE_AUDIT_VERIFY_SCHEMA, verified: false, chapter, path, reasons }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function unknownKeys(record: Record<string, unknown>, allowed: readonly string[]): string[] {
  const names = new Set<string>(allowed)
  return Object.keys(record).filter(key => !names.has(key)).sort()
}

function bodyLines(text: string): string[] {
  return text.split('\n').map(line => line.endsWith('\r') ? line.slice(0, -1) : line)
}

function quoteFound(lines: readonly string[], line: number, quote: string): boolean {
  const normalized = normalizeRuleSentence(quote)
  if (normalized === '') return false
  const source = lines[line - 1]
  if (source === undefined) return false
  return normalizeRuleSentence(source).includes(normalized)
}

interface PendingQuote {
  readonly ruleId: string
  readonly line: number
  readonly quote: string
}

function pushVerdictReasons(
  reasons: string[],
  rules: readonly ExtractedRule[],
  value: unknown,
  quotesOut: PendingQuote[],
): { violate: string[]; unclear: string[] } | undefined {
  if (!Array.isArray(value)) {
    reasons.push('verdicts must be an array')
    return undefined
  }
  const expected = new Map(rules.map(rule => [rule.id, rule]))
  const seen = new Set<string>()
  const violate: string[] = []
  const unclear: string[] = []
  value.forEach((raw, index) => {
    const label = `verdicts[${String(index)}]`
    const item = asRecord(raw)
    if (item === undefined) {
      reasons.push(`${label} must be an object`)
      return
    }
    const extra = unknownKeys(item, ['rule_id', 'verdict', 'evidence', 'reason', 'fix'])
    if (extra.length > 0) reasons.push(`${label} contains unsupported fields: ${extra.join(', ')}`)
    const ruleId = item.rule_id
    if (typeof ruleId !== 'string' || ruleId.trim() === '') {
      reasons.push(`${label}.rule_id must be a non-empty string`)
      return
    }
    if (!expected.has(ruleId)) reasons.push(`${ruleId} is not in the current chapter rules`)
    if (seen.has(ruleId)) reasons.push(`duplicate verdict for ${ruleId}`)
    seen.add(ruleId)
    const verdict = item.verdict
    if (typeof verdict !== 'string' || !(VERDICTS as readonly string[]).includes(verdict)) {
      reasons.push(`${ruleId} verdict must be pass, violate, not_applicable, or unclear`)
      return
    }
    if (item.reason !== undefined && typeof item.reason !== 'string') reasons.push(`${ruleId} reason must be a string`)
    if (item.fix !== undefined && typeof item.fix !== 'string') reasons.push(`${ruleId} fix must be a string`)
    const evidence = item.evidence
    if (evidence !== undefined && !Array.isArray(evidence)) {
      reasons.push(`${ruleId} evidence must be an array`)
      return
    }
    const quotes = evidence ?? []
    if (verdict === 'violate' && quotes.length === 0) reasons.push(`${ruleId} violate has no evidence`)
    if (verdict === 'violate') violate.push(ruleId)
    if (verdict === 'unclear') unclear.push(ruleId)
    quotes.forEach((rawQuote, quoteIndex) => {
      const quoteLabel = `${ruleId} evidence[${String(quoteIndex)}]`
      const quote = asRecord(rawQuote)
      if (quote === undefined) {
        reasons.push(`${quoteLabel} must be an object`)
        return
      }
      const quoteExtra = unknownKeys(quote, ['line', 'quote'])
      if (quoteExtra.length > 0) reasons.push(`${quoteLabel} contains unsupported fields: ${quoteExtra.join(', ')}`)
      if (typeof quote.line !== 'number' || !Number.isInteger(quote.line) || quote.line < 1) {
        reasons.push(`${quoteLabel}.line must be a positive integer`)
        return
      }
      if (typeof quote.quote !== 'string' || quote.quote.trim() === '') {
        reasons.push(`${quoteLabel}.quote must not be empty`)
        return
      }
      if (normalizeRuleSentence(quote.quote) === '') {
        reasons.push(`${quoteLabel}.quote must contain more than punctuation`)
        return
      }
      quotesOut.push({ ruleId, line: quote.line, quote: quote.quote })
    })
  })
  for (const id of expected.keys()) {
    if (!seen.has(id)) reasons.push(`missing verdict for ${id}`)
  }
  return { violate, unclear }
}

/**
 * Check one audit file against the current body and chapter rules.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @param inputPath - the audit JSON. The caller has already confined it to the book.
 * @returns a verified result, or `verified: false` with every reason found.
 * @throws WritingCheckError when `设定/写作检查.json` is unreadable or invalid.
 */
export function verifyRuleAudit(project: string, chapter: number, inputPath: string): RuleAuditVerification {
  const reasons: string[] = []
  const quotes: PendingQuote[] = []
  const rules = extractChapterRules(project, chapter)
  if (!existsSync(inputPath)) return failure(chapter, inputPath, [`audit file does not exist: ${inputPath}`])
  if (statSync(inputPath).isFile() !== true) return failure(chapter, inputPath, [`audit file is not a file: ${inputPath}`])
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(inputPath, 'utf8'))
  } catch {
    return failure(chapter, inputPath, ['audit file is not valid JSON'])
  }
  const document = asRecord(parsed)
  if (document === undefined) return failure(chapter, inputPath, ['audit file must be a JSON object'])
  const extra = unknownKeys(document, ['schema', 'body_sha256', 'rules_sha256', 'verdicts'])
  if (extra.length > 0) reasons.push(`audit file contains unsupported fields: ${extra.join(', ')}`)
  if (document.schema !== RULE_AUDIT_SCHEMA) reasons.push(`schema must be ${RULE_AUDIT_SCHEMA}`)
  const claimedRules = document.rules_sha256
  if (typeof claimedRules !== 'string' || claimedRules !== rules.rules_sha256) {
    reasons.push('rules_sha256 does not match the current chapter rules')
  }
  let bodyHash = ''
  let lines: string[] = []
  try {
    const snapshot = chapterSourceSnapshot(project, chapter)
    bodyHash = chapterSourceDigests(snapshot).body_sha256
    lines = bodyLines(snapshot.contents.body.toString('utf8'))
  } catch (error) {
    reasons.push(error instanceof WordcountError ? error.message : 'chapter body could not be read')
  }
  const claimedBody = document.body_sha256
  if (bodyHash === '' || typeof claimedBody !== 'string' || claimedBody !== bodyHash) {
    reasons.push('body_sha256 does not match the current body')
  }
  const counted = pushVerdictReasons(reasons, rules.rules, document.verdicts, quotes)
  if (lines.length > 0) {
    for (const quote of quotes) {
      if (quote.line > lines.length) {
        reasons.push(`${quote.ruleId} evidence line ${String(quote.line)} is outside the body`)
        continue
      }
      if (!quoteFound(lines, quote.line, quote.quote)) {
        reasons.push(`${quote.ruleId} evidence line ${String(quote.line)} quote was not found on that line`)
      }
    }
  }
  if (reasons.length > 0 || counted === undefined) return failure(chapter, inputPath, reasons)
  return {
    schema: RULE_AUDIT_VERIFY_SCHEMA,
    verified: true,
    chapter,
    path: inputPath,
    body_sha256: bodyHash,
    rules_sha256: rules.rules_sha256,
    violate: counted.violate,
    unclear: counted.unclear,
  }
}

/**
 * Refuse a commit when `rule_audit` is `required` and the default audit file
 * is missing, stale, or still has a violate the transaction does not accept.
 * @param project - the book directory.
 * @param chapter - the chapter being committed.
 * @param document - the transaction JSON, including optional `accepted_findings`.
 * @throws WordcountError when the gate fails.
 * @throws WritingCheckError when the writing-check file is invalid.
 * @throws TrackingError when `accepted_findings` is present but invalid.
 */
export function assertRuleAuditForCommit(project: string, chapter: number, document: Record<string, unknown>): readonly AcceptedFinding[] {
  const accepted = acceptedFindingsOf(document)
  if (ruleAuditMode(project) !== 'required') return accepted
  const path = join(project, ruleAuditRelativePath(chapter))
  const verified = verifyRuleAudit(project, chapter, path)
  if (!verified.verified) {
    throw new WordcountError(`rule audit is required: ${verified.reasons.join('; ')}`)
  }
  const acceptedIds = new Set(accepted.map(item => item.rule_id))
  const open = verified.violate.filter(id => !acceptedIds.has(id))
  if (open.length > 0) throw new WordcountError(`rule audit is required: unresolved violate ${open.join(', ')}`)
  return accepted
}
