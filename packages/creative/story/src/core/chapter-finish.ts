/**
 * One chapter close: optional audit, fact diff, commit, record, then stale.
 *
 * The ledger stays beside tracking. A failed commit does not record.
 * A failed record does not roll the chapter back. `project check` is not called.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chapterCommit, type ChapterCheck } from './chapter.ts'
import { claimsRelativePath, diffFacts, FactsError, recordFacts, staleFacts, type FactConflict } from './facts.ts'
import { writingGates, type GateView } from './gates.ts'
import { ruleAuditRelativePath, verifyRuleAudit } from './rule-audit.ts'
import { TrackingError } from './tracking/schema.ts'
import { WritingCheckError } from './writing-check.ts'
import { WordcountError } from './wordcount.ts'

/** Schema of {@link finishChapter}. */
export const FINISH_SCHEMA = 'story-chapter-finish/v1'

/** The step {@link finishChapter} stopped on, or `done` after stale. */
export type FinishPhase = 'audit' | 'diff' | 'commit' | 'record' | 'stale' | 'done'

/**
 * Commit one chapter and record its claims when that file exists.
 * @param project - the book directory.
 * @param chapter - the chapter number.
 * @param inputPath - the tracking transaction JSON.
 * @param acceptCurrentLength - pass through to {@link chapterCommit} when the length is intentionally out of band.
 * @returns one document. `committed: false` means the ledger was not written. `facts_recorded: false` after a commit leaves the chapter in place.
 * @throws WritingCheckError when `设定/写作检查.json` exists but is invalid.
 */
export function finishChapter(project: string, chapter: number, inputPath: string, acceptCurrentLength: boolean): {
  schema: typeof FINISH_SCHEMA
  chapter: number
  phase: FinishPhase
  committed: boolean
  facts_recorded: boolean
  claims_present: boolean
  rules_sha256: string | null
  gates: GateView
  stale: ReturnType<typeof staleFacts>
  diff?: { readonly ok: boolean; readonly conflicts: readonly FactConflict[] }
  commit_error?: string
  facts_error?: string
  check?: ChapterCheck
} {
  const gates = writingGates(project)
  const claims = readClaims(project, chapter)
  const base: {
    schema: typeof FINISH_SCHEMA
    chapter: number
    claims_present: boolean
    gates: GateView
    rules_sha256: string | null
  } = {
    schema: FINISH_SCHEMA,
    chapter,
    claims_present: claims.present,
    gates,
    rules_sha256: null,
  }
  if (gates.rule_audit === 'required') {
    const verified = verifyRuleAudit(project, chapter, join(project, ruleAuditRelativePath(chapter)))
    if (!verified.verified) {
      return { ...base, phase: 'audit', committed: false, facts_recorded: false, stale: readStale(project), commit_error: verified.reasons.join('；') }
    }
    base.rules_sha256 = verified.rules_sha256
  }
  let diff: { ok: boolean; conflicts: readonly FactConflict[] } | undefined
  if (claims.present) {
    if (claims.error !== undefined) {
      if (gates.facts_diff === 'required') {
        return { ...base, phase: 'diff', committed: false, facts_recorded: false, stale: readStale(project), commit_error: claims.error }
      }
    } else {
      const report = diffFacts(project, chapter, claims.input)
      diff = { ok: report.ok, conflicts: report.conflicts }
      if (!report.ok && gates.facts_diff === 'required') {
        return {
          ...base, phase: 'diff', committed: false, facts_recorded: false, diff, stale: readStale(project),
          commit_error: report.conflicts.map(item => item.message).join('；'),
        }
      }
    }
  }
  let check: ChapterCheck
  try {
    check = chapterCommit(project, chapter, inputPath, acceptCurrentLength)
  } catch (error) {
    if (!isCommitFailure(error)) throw error
    return {
      ...base, phase: 'commit', committed: false, facts_recorded: false, ...(diff === undefined ? {} : { diff }),
      stale: readStale(project), commit_error: error.message,
    }
  }
  if (!claims.present || claims.input === undefined) {
    return {
      ...base, phase: 'done', committed: true, facts_recorded: false, ...(diff === undefined ? {} : { diff }),
      ...(claims.error === undefined ? {} : { facts_error: claims.error }),
      stale: readStale(project), check,
    }
  }
  try {
    recordFacts(project, chapter, claims.input)
  } catch (error) {
    if (!isCommitFailure(error)) throw error
    return {
      ...base, phase: 'record', committed: true, facts_recorded: false, ...(diff === undefined ? {} : { diff }),
      stale: readStale(project), facts_error: error.message, check,
    }
  }
  return {
    ...base, phase: 'done', committed: true, facts_recorded: true, ...(diff === undefined ? {} : { diff }),
    stale: readStale(project), check,
  }
}

function readStale(project: string): ReturnType<typeof staleFacts> {
  return staleFacts(project)
}

function readClaims(project: string, chapter: number): { present: boolean; input?: unknown; error?: string } {
  const path = join(project, claimsRelativePath(chapter))
  if (!existsSync(path)) return { present: false }
  try {
    return { present: true, input: JSON.parse(readFileSync(path, 'utf8')) as unknown }
  } catch (error) {
    return { present: true, error: `unable to read ${claimsRelativePath(chapter)}: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function isCommitFailure(error: unknown): error is Error {
  return error instanceof WordcountError || error instanceof FactsError || error instanceof TrackingError || error instanceof WritingCheckError
}
