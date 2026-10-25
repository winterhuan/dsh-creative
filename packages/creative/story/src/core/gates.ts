/**
 * Effective writing gates for one book.
 *
 * A missing `设定/写作检查.json`, or a missing key inside it, is `off`.
 * This module does not write and does not add a third mode.
 */
import { loadFacts, staleFacts } from './facts.ts'
import { readWritingCheck, type RuleAuditMode } from './writing-check.ts'

/** Schema of {@link projectGates}. */
export const PROJECT_GATES_SCHEMA = 'story-project-gates/v1'

/** The modes a commit will actually enforce, plus whether `style` is configured. */
export interface GateView {
  readonly rule_audit: RuleAuditMode
  readonly facts_diff: RuleAuditMode
  readonly style: 'off' | 'active'
  readonly streak: number | null
}

/**
 * Read `rule_audit`, `facts_diff`, and whether `style` is present.
 * @param project - the book directory.
 * @returns `off` for each missing gate. `streak` is null when `style` is absent, otherwise the configured value or 3.
 * @throws WritingCheckError when the writing-check file exists but is invalid.
 */
export function writingGates(project: string): GateView {
  const file = readWritingCheck(project)
  const style = file?.style
  return {
    rule_audit: file?.ruleAudit ?? 'off',
    facts_diff: file?.factsDiff ?? 'off',
    style: style === undefined ? 'off' : 'active',
    streak: style === undefined ? null : style.streak ?? 3,
  }
}

/**
 * Report gate modes, covered chapters, and the stale summary.
 * @param project - the book directory.
 * @returns a read-only snapshot. It does not change `设定/写作检查.json`.
 * @throws WritingCheckError when the writing-check file exists but is invalid.
 * @throws FactsError when the ledger exists but is not `story-facts/v1`.
 */
export function projectGates(project: string): {
  schema: typeof PROJECT_GATES_SCHEMA
  rule_audit: RuleAuditMode
  facts_diff: RuleAuditMode
  style: 'off' | 'active'
  streak: number | null
  facts_present: boolean
  covered_chapters: readonly number[]
  stale: { readonly present: boolean; readonly stale_count: number; readonly missing_chapters: readonly number[] }
} {
  const gates = writingGates(project)
  const ledger = loadFacts(project)
  const stale = staleFacts(project)
  return {
    schema: PROJECT_GATES_SCHEMA,
    ...gates,
    facts_present: ledger.present,
    covered_chapters: ledger.covered_chapters,
    stale: { present: stale.present, stale_count: stale.stale.length, missing_chapters: stale.missing_chapters },
  }
}
