/**
 * Book-level `设定/写作检查.json`.
 *
 * `punctuation` may be omitted and then means `preserve`, so `forbidden`,
 * `era`, `void_terms`, `rule_sources`, and `rule_audit` can be set on their own.
 * Unknown keys are rejected so a typo cannot drop a check silently. A missing
 * file means the punctuation default and `rule_audit` off. The Python oracle
 * still requires `punctuation` and rejects every other key.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Keys a book may set. Anything else is a configuration error. */
export const WRITING_CHECK_KEYS = ['punctuation', 'rule_sources', 'forbidden', 'era', 'void_terms', 'rule_audit'] as const

const PUNCTUATION = ['preserve', 'normalize-narration'] as const
const RULE_AUDIT = ['off', 'required'] as const

/** Whether a commit must have a verified rule audit. Absence means `off`. */
export type RuleAuditMode = typeof RULE_AUDIT[number]

/** A readable writing-check file with a valid punctuation policy and rule-audit mode. */
export interface WritingCheckFile {
  readonly path: string
  readonly value: Record<string, unknown>
  readonly punctuation: 'preserve' | 'normalize-narration'
  readonly ruleAudit: RuleAuditMode
}

/** The writing-check file is missing, unreadable, or not the expected object. */
export class WritingCheckError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WritingCheckError'
  }
}

/**
 * Read `设定/写作检查.json`.
 * @param project - the book directory.
 * @returns the file, or `undefined` when it does not exist.
 * @throws WritingCheckError when the file is unreadable, not the expected object, uses an unknown key, or its punctuation or rule_audit value is invalid.
 */
export function readWritingCheck(project: string): WritingCheckFile | undefined {
  const settingsPath = join(project, '设定', '写作检查.json')
  let source: string
  try {
    source = readFileSync(settingsPath, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw new WritingCheckError(`Unable to read ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
  let settings: unknown
  try {
    settings = JSON.parse(source)
  } catch {
    throw new WritingCheckError(`Invalid JSON in ${settingsPath}`)
  }
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    throw new WritingCheckError(`${settingsPath}: expected a JSON object; supported keys: ${WRITING_CHECK_KEYS.join(', ')}`)
  }
  const record = settings as Record<string, unknown>
  const allowed = new Set<string>(WRITING_CHECK_KEYS)
  const unknown = Object.keys(record).filter(key => !allowed.has(key))
  if (unknown.length > 0) {
    throw new WritingCheckError(`${settingsPath}: unknown key ${unknown.map(key => `"${key}"`).join(', ')}; supported keys: ${WRITING_CHECK_KEYS.join(', ')}`)
  }
  const policy = record.punctuation
  if (policy !== undefined && (typeof policy !== 'string' || !(PUNCTUATION as readonly string[]).includes(policy))) {
    throw new WritingCheckError(`${settingsPath}: expected {"punctuation":"preserve"|"normalize-narration"}`)
  }
  const ruleAudit = record.rule_audit
  if (ruleAudit !== undefined && (typeof ruleAudit !== 'string' || !(RULE_AUDIT as readonly string[]).includes(ruleAudit))) {
    throw new WritingCheckError(`${settingsPath}: rule_audit must be "off" or "required"`)
  }
  return {
    path: settingsPath,
    value: record,
    punctuation: (policy ?? 'preserve') as WritingCheckFile['punctuation'],
    ruleAudit: (ruleAudit ?? 'off') as RuleAuditMode,
  }
}

/**
 * The book's rule-audit commit mode.
 * @param project - the book directory.
 * @returns `required` only when `设定/写作检查.json` sets that value. A missing file is `off`.
 * @throws WritingCheckError when the writing-check file is invalid.
 */
export function ruleAuditMode(project: string): RuleAuditMode {
  return readWritingCheck(project)?.ruleAudit ?? 'off'
}
