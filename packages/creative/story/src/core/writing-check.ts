/**
 * Book-level `设定/写作检查.json`.
 *
 * The file still requires `punctuation`. Optional keys select chapter-rule
 * sources and deterministic scans. Unknown keys are rejected so a typo cannot
 * drop a check silently. A missing file means the punctuation default.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Keys a book may set. Anything else is a configuration error. */
export const WRITING_CHECK_KEYS = ['punctuation', 'rule_sources', 'forbidden', 'era', 'void_terms'] as const

const PUNCTUATION = ['preserve', 'normalize-narration'] as const

/** A readable writing-check file with a valid punctuation policy. */
export interface WritingCheckFile {
  readonly path: string
  readonly value: Record<string, unknown>
  readonly punctuation: 'preserve' | 'normalize-narration'
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
 * @throws WritingCheckError when the file is unreadable, not the expected object, or its punctuation value is invalid.
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
  const allowed = new Set<string>(WRITING_CHECK_KEYS)
  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)
    || Object.keys(settings).some(key => !allowed.has(key))) {
    throw new WritingCheckError(`${settingsPath}: expected {"punctuation":"preserve"|"normalize-narration"}`)
  }
  const policy = (settings as { readonly punctuation?: unknown }).punctuation
  if (typeof policy !== 'string' || !(PUNCTUATION as readonly string[]).includes(policy)) {
    throw new WritingCheckError(`${settingsPath}: expected {"punctuation":"preserve"|"normalize-narration"}`)
  }
  return {
    path: settingsPath,
    value: settings as Record<string, unknown>,
    punctuation: policy as WritingCheckFile['punctuation'],
  }
}
