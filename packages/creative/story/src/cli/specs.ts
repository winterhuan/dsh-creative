/**
 * Command-line option tables for `dsh-story`.
 *
 * Parsing and path guards stay in `main.ts`. This module only names the
 * accepted flags so a new family does not have to grow the dispatcher file.
 */
import { FACT_KINDS } from '../core/facts.ts'
import { MEMORY_KINDS } from '../core/memory.ts'
import { LOOKUP_DEFAULT_LIMIT } from '../core/settings-lookup.ts'
import { QUERY_FILTERS, QUERY_KINDS } from '../core/tracking/query.ts'
import { DEFAULT_MAX_CHARS, DEFAULT_TARGET } from '../core/zhuque.ts'

/** One accepted option. */
export interface OptionSpec {
  readonly kind: 'flag' | 'value' | 'append' | 'optional-value'
  readonly required?: boolean
  readonly choices?: readonly string[]
  readonly type?: 'int' | 'float'
  readonly default?: unknown
}

/** Options for one command. */
export type Options = Record<string, OptionSpec>

const WORKSPACE: Options = { workspace: { kind: 'value', required: true } }
const BOOK: Options = { book: { kind: 'value', required: true } }
const CHAPTER: Options = { chapter: { kind: 'value', type: 'int', required: true } }

/**
 * Option table for one family and action.
 * @param family - the first command word.
 * @param action - the second command word, after phrase joining.
 * @returns the table, or `undefined` when the command is unknown.
 */
export function specFor(family: string, action: string): Options | undefined {
  const families: Record<string, Record<string, Options>> = {
    project: {
      init: { ...WORKSPACE, ...BOOK, kind: { kind: 'value', choices: ['long', 'short'], required: true }, input: { kind: 'value' } },
      status: { ...WORKSPACE, ...BOOK, revision: { kind: 'value', type: 'int' } },
      query: {
        ...WORKSPACE, ...BOOK, revision: { kind: 'value', type: 'int' }, kind: { kind: 'value', choices: QUERY_KINDS, required: true },
        search: { kind: 'value', default: '' }, filter: { kind: 'value', choices: QUERY_FILTERS, default: 'all' },
        chapter: { kind: 'value', type: 'int' }, offset: { kind: 'value', type: 'int', default: 0 }, limit: { kind: 'value', type: 'int', default: 20 },
        'stale-planted': { kind: 'value', type: 'int' }, 'stale-character': { kind: 'value', type: 'int' }, 'stale-thread': { kind: 'value', type: 'int' },
      },
      check: { ...WORKSPACE, ...BOOK },
      gates: { ...WORKSPACE, ...BOOK },
      context: { ...WORKSPACE, ...BOOK, chapter: { kind: 'value', type: 'int' }, text: { kind: 'value' }, profile: { kind: 'value', choices: ['full', 'lite'], default: 'full' } },
      lookup: {
        ...WORKSPACE, ...BOOK, text: { kind: 'value' }, file: { kind: 'value' }, revision: { kind: 'value' }, reference: { kind: 'flag' },
        offset: { kind: 'value', type: 'int', default: 0 }, limit: { kind: 'value', type: 'int', default: LOOKUP_DEFAULT_LIMIT },
      },
      rhythm: { ...WORKSPACE, ...BOOK, from: { kind: 'value', type: 'int', required: true }, to: { kind: 'value', type: 'int', required: true } },
      'plan-check': { ...WORKSPACE, ...BOOK, chapter: { kind: 'value', type: 'int' } },
      'cast-check': { ...WORKSPACE, ...BOOK, from: { kind: 'value', type: 'int' }, to: { kind: 'value', type: 'int' } },
      'legacy-archive': { ...WORKSPACE, ...BOOK, 'reader-value': { kind: 'flag', required: true } },
      'context-retire': { ...WORKSPACE, ...BOOK, item: { kind: 'value', required: true }, reason: { kind: 'value', required: true } },
    },
    outline: { check: { ...WORKSPACE, ...BOOK, ...CHAPTER } },
    chapter: {
      check: { ...WORKSPACE, ...BOOK, ...CHAPTER },
      rules: { ...WORKSPACE, ...BOOK, ...CHAPTER },
      snapshot: { ...WORKSPACE, ...BOOK, ...CHAPTER, 'outline-only': { kind: 'flag' } },
      commit: { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true }, 'with-facts': { kind: 'flag' } },
      'accept-current-length': { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true }, 'with-facts': { kind: 'flag' } },
      finish: { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true }, 'accept-current-length': { kind: 'flag' } },
      'audit-verify': { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value' } },
    },
    short: {
      'plan-check': { ...WORKSPACE, ...BOOK },
      'delivery-check': { ...WORKSPACE, ...BOOK, 'min-chars': { kind: 'value', type: 'int', required: true }, 'max-chars': { kind: 'value', type: 'int', required: true }, sections: { kind: 'value', type: 'int', required: true } },
    },
    text: {
      count: { file: { kind: 'value', required: true }, workspace: { kind: 'value' }, book: { kind: 'value' }, target: { kind: 'value' }, checkpoint: { kind: 'flag' }, chapter: { kind: 'value', type: 'int' }, 'case-id': { kind: 'value' } },
      check: { file: { kind: 'append', required: true }, workspace: { kind: 'value' }, book: { kind: 'value' }, outline: { kind: 'value' } },
      normalize: { file: { kind: 'append', required: true }, workspace: { kind: 'value' }, book: { kind: 'value' }, apply: { kind: 'flag' }, policy: { kind: 'value', choices: ['preserve', 'normalize-narration'] }, 'quote-mode': { kind: 'value', choices: ['keep', 'ascii', 'yan'], default: 'keep' } },
      'style-baseline': { ...WORKSPACE, ...BOOK, chapters: { kind: 'value', required: true }, apply: { kind: 'flag' } },
    },
    memory: {
      init: { ...WORKSPACE },
      query: { ...WORKSPACE, kind: { kind: 'append', choices: MEMORY_KINDS }, book: { kind: 'value' }, genre: { kind: 'value' }, workflow: { kind: 'value' } },
      record: { ...WORKSPACE, input: { kind: 'value', required: true } },
      commit: { ...WORKSPACE, input: { kind: 'value', required: true } },
      check: { ...WORKSPACE },
    },
    analysis: {
      inspect: { ...WORKSPACE, title: { kind: 'value', required: true }, source: { kind: 'value', required: true }, input: { kind: 'value', required: true } },
      'write-cards': { ...WORKSPACE, title: { kind: 'value', required: true }, source: { kind: 'value', required: true }, input: { kind: 'value', required: true } },
      'rhythm-card': { ...WORKSPACE, title: { kind: 'value', required: true }, chapters: { kind: 'value', required: true }, sections: { kind: 'value' } },
    },
    export: { txt: { ...WORKSPACE, ...BOOK, 'out-dir': { kind: 'value', required: true } } },
    lineage: { record: { ...WORKSPACE, 'from-domain': { kind: 'value', required: true }, 'from-path': { kind: 'value', required: true }, 'to-domain': { kind: 'value', required: true }, 'to-path': { kind: 'value', required: true }, decision: { kind: 'append' }, by: { kind: 'value', default: 'agent' } } },
    detect: { zhuque: { ...WORKSPACE, ...BOOK, file: { kind: 'value', required: true }, out: { kind: 'value' }, target: { kind: 'value', type: 'float', default: DEFAULT_TARGET }, 'max-chars': { kind: 'value', type: 'int', default: DEFAULT_MAX_CHARS }, 'credential-pool-stdin': { kind: 'flag' } } },
    book: {
      audit: {
        ...WORKSPACE, ...BOOK,
        from: { kind: 'value', type: 'int', required: true }, to: { kind: 'value', type: 'int', required: true },
        write: { kind: 'optional-value' },
        issues: { kind: 'optional-value' },
      },
    },
    facts: {
      record: { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true } },
      query: { ...WORKSPACE, ...BOOK, kind: { kind: 'value', choices: FACT_KINDS }, subject: { kind: 'value' } },
      diff: { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true } },
      stale: { ...WORKSPACE, ...BOOK },
      extract: { ...WORKSPACE, ...BOOK, ...CHAPTER, from: { kind: 'value', choices: ['outline', 'body', 'both'], default: 'both' }, 'dry-run': { kind: 'flag' } },
    },
  }
  return families[family]?.[action]
}
