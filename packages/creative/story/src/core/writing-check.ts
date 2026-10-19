/**
 * Book-level `设定/写作检查.json`.
 *
 * `punctuation` may be omitted and then means `preserve`, so `forbidden`,
 * `era`, `void_terms`, `rule_sources`, and `rule_audit` can be set on their own.
 * Unknown keys are rejected so a typo cannot drop a check silently. A missing
 * file means the punctuation default, `rule_audit` off, and `facts_diff` off.
 * The Python oracle still requires `punctuation` and rejects every other key.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Keys a book may set. Anything else is a configuration error. */
export const WRITING_CHECK_KEYS = ['punctuation', 'rule_sources', 'forbidden', 'era', 'void_terms', 'rule_audit', 'facts_diff', 'rhythm', 'style'] as const

const PUNCTUATION = ['preserve', 'normalize-narration'] as const
const GATE = ['off', 'required'] as const
const RHYTHM_KEYS = ['max_no_payoff', 'min_peak_gap', 'max_peak_gap', 'peak_intensity', 'max_same_position', 'source'] as const
const STYLE_KEYS = ['paragraph_median', 'dash_per_kilo', 'anadiplosis_per_kilo', 'metaphor_limit', 'metaphors', 'forbid_blank_lines', 'streak'] as const

/** Whether a commit must have a verified rule audit or a clean fact diff. Absence means `off`. */
export type RuleAuditMode = typeof GATE[number]

/** Measurable style limits from `style`. */
export interface StyleConfig {
  readonly paragraph_median?: readonly [number, number]
  readonly dash_per_kilo?: number
  readonly anadiplosis_per_kilo?: number
  readonly metaphor_limit?: number
  readonly metaphors?: readonly string[]
  readonly forbid_blank_lines?: boolean
  readonly streak?: number
}

/** A readable writing-check file with a valid punctuation policy and gate modes. */
export interface WritingCheckFile {
  readonly path: string
  readonly value: Record<string, unknown>
  readonly punctuation: 'preserve' | 'normalize-narration'
  readonly ruleAudit: RuleAuditMode
  readonly factsDiff: RuleAuditMode
  readonly style?: StyleConfig
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
 * @throws WritingCheckError when the file is unreadable, not the expected object, uses an unknown key, or a gate, rhythm, or style value is invalid.
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
  const ruleAudit = gateMode(record.rule_audit, settingsPath, 'rule_audit')
  const factsDiff = gateMode(record.facts_diff, settingsPath, 'facts_diff')
  if (record.rhythm !== undefined) assertRhythm(record.rhythm, settingsPath)
  const style = record.style === undefined ? undefined : assertStyle(record.style, settingsPath)
  return {
    path: settingsPath,
    value: record,
    punctuation: (policy ?? 'preserve') as WritingCheckFile['punctuation'],
    ruleAudit,
    factsDiff,
    ...(style === undefined ? {} : { style }),
  }
}

function gateMode(value: unknown, settingsPath: string, key: string): RuleAuditMode {
  if (value === undefined) return 'off'
  if (typeof value !== 'string' || !(GATE as readonly string[]).includes(value)) {
    throw new WritingCheckError(`${settingsPath}: ${key} must be "off" or "required"`)
  }
  return value as RuleAuditMode
}

function assertRhythm(value: unknown, settingsPath: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new WritingCheckError(`${settingsPath}: rhythm must be an object`)
  const record = value as Record<string, unknown>
  const allowed = new Set<string>(RHYTHM_KEYS)
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new WritingCheckError(`${settingsPath}: unknown rhythm key "${key}"`)
  }
  for (const key of ['max_no_payoff', 'min_peak_gap', 'max_peak_gap', 'peak_intensity', 'max_same_position'] as const) {
    const item = record[key]
    if (item !== undefined && (typeof item !== 'number' || !Number.isInteger(item) || item < 0)) {
      throw new WritingCheckError(`${settingsPath}: rhythm.${key} must be a non-negative integer`)
    }
  }
  if (record.source !== undefined && typeof record.source !== 'string') throw new WritingCheckError(`${settingsPath}: rhythm.source must be a string`)
}

function assertStyle(value: unknown, settingsPath: string): StyleConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new WritingCheckError(`${settingsPath}: style must be an object`)
  const record = value as Record<string, unknown>
  const allowed = new Set<string>(STYLE_KEYS)
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new WritingCheckError(`${settingsPath}: unknown style key "${key}"`)
  }
  const style: {
    paragraph_median?: [number, number]
    dash_per_kilo?: number
    anadiplosis_per_kilo?: number
    metaphor_limit?: number
    metaphors?: string[]
    forbid_blank_lines?: boolean
    streak?: number
  } = {}
  if (record.paragraph_median !== undefined) {
    const band = record.paragraph_median
    if (!Array.isArray(band) || band.length !== 2 || band.some(item => typeof item !== 'number' || !Number.isInteger(item) || item < 0) || band[0] > band[1]) {
      throw new WritingCheckError(`${settingsPath}: style.paragraph_median must be [min, max]`)
    }
    style.paragraph_median = [band[0], band[1]]
  }
  for (const key of ['dash_per_kilo', 'anadiplosis_per_kilo', 'metaphor_limit'] as const) {
    const item = record[key]
    if (item === undefined) continue
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0) throw new WritingCheckError(`${settingsPath}: style.${key} must be a non-negative integer`)
    style[key] = item
  }
  if (record.metaphors !== undefined) {
    if (!Array.isArray(record.metaphors) || record.metaphors.some(item => typeof item !== 'string' || item.trim() === '')) {
      throw new WritingCheckError(`${settingsPath}: style.metaphors must be an array of strings`)
    }
    style.metaphors = record.metaphors
  }
  if (record.forbid_blank_lines !== undefined) {
    if (typeof record.forbid_blank_lines !== 'boolean') throw new WritingCheckError(`${settingsPath}: style.forbid_blank_lines must be a boolean`)
    style.forbid_blank_lines = record.forbid_blank_lines
  }
  if (record.streak !== undefined) {
    if (typeof record.streak !== 'number' || !Number.isInteger(record.streak) || record.streak < 1) {
      throw new WritingCheckError(`${settingsPath}: style.streak must be a positive integer`)
    }
    style.streak = record.streak
  }
  return style
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
