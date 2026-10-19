/**
 * The `dsh-story` command face: argument parsing, workspace and book guards,
 * dispatch into the core modules, JSON results and exit codes.
 *
 * Port of `tests/reference/cli.py`. Results are one JSON document on stdout; failures
 * are `story-cli-error/v1` documents. Exit codes: 0 success, 1 check findings,
 * 2 invalid input, 3 execution failure; `detect zhuque` also uses 4 for service
 * errors.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditBook, BOOK_AUDIT_MAX_SPAN, defaultAuditReportPath, issuesFromAudit, renderBookAudit } from '../core/audit.ts'
import { inspectAnalysis, writeAnalysisCards } from '../core/analysis.ts'
import { chapterCheck, chapterCommit, chapterSnapshot } from '../core/chapter.ts'
import { extractChapterRules } from '../core/rules.ts'
import { ruleAuditRelativePath, verifyRuleAudit } from '../core/rule-audit.ts'
import { diffFacts, FACT_KINDS, queryFacts, recordFacts, staleFacts } from '../core/facts.ts'
import { archiveReaderValue, retireContextItem } from '../core/legacy.ts'
import { checkRhythm } from '../core/rhythm.ts'
import { checkPlan } from '../core/plan.ts'
import { lookupReference, writeRhythmCard } from '../core/reference.ts'
import { checkCast } from '../core/cast.ts'
import { measureStyleBaseline } from '../core/style.ts'
import { type AiPatternsDocument, scanAiPatterns, aiPatternsDocument } from '../core/checks/ai-patterns.ts'
import { scanDegeneration } from '../core/checks/degeneration.ts'
import { checkOutlineCopy } from '../core/checks/outline-copy.ts'
import { normalizePunctuation, readProjectPunctuationPolicy, type PunctuationPolicy, type QuoteMode } from '../core/checks/punctuation.ts'
import { verifyDelivery, verifyPhase2 } from '../core/checks/short-contracts.ts'
import { buildContext } from '../core/context.ts'
import { LOOKUP_DEFAULT_LIMIT, lookupSettings } from '../core/settings-lookup.ts'
import { exportNovel } from '../core/export.ts'
import { LEDGER_NAME, recordEdge } from '../core/lineage.ts'
import { MEMORY_KINDS, memoryCheck, memoryCommit, memoryInit, memoryQuery, memoryRecord, memoryRoot } from '../core/memory.ts'
import { verifyOutline } from '../core/outline-contract.ts'
import { QUERY_FILTERS, QUERY_KINDS, projectQuery, type QueryFilter, type QueryKind } from '../core/tracking/query.ts'
import { normalizeInitialDocument, type TrackingState } from '../core/tracking/schema.ts'
import { checkProject, initialize, statePath } from '../core/tracking/store.ts'
import { checkpointWordcount, evaluateWordcount, findChapterFile, measureWordcount } from '../core/wordcount.ts'
import { DEFAULT_MAX_CHARS, DEFAULT_TARGET, detectChapter, readKeyPool, writeReport } from '../core/zhuque.ts'

const RESERVED_BOOKS = new Set(['长篇', '短篇', '拆文库', '正文', '大纲', '设定', '追踪', '对标', '参考资料'])
const EXIT_HELP = 'Exit codes: 0 success, 1 check findings, 2 invalid input, 3 execution failure. Zhuque also uses 4 for service errors. Results are JSON.'

/** An argument or guard failure reported as a `story-cli-error/v1` document. */
export class CliError extends Error {
  constructor(message: string, readonly code = 'INVALID_ARGUMENT', readonly exitCode = 2) {
    super(message)
    this.name = 'CliError'
  }
}

interface OptionSpec {
  readonly kind: 'flag' | 'value' | 'append' | 'optional-value'
  readonly required?: boolean
  readonly choices?: readonly string[]
  readonly type?: 'int' | 'float'
  readonly default?: unknown
}

type Options = Record<string, OptionSpec>

const WORKSPACE: Options = { workspace: { kind: 'value', required: true } }
const BOOK: Options = { book: { kind: 'value', required: true } }
const CHAPTER: Options = { chapter: { kind: 'value', type: 'int', required: true } }

function specFor(family: string, action: string): Options | undefined {
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
      context: { ...WORKSPACE, ...BOOK, chapter: { kind: 'value', type: 'int' }, text: { kind: 'value' } },
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
      commit: { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true } },
      'accept-current-length': { ...WORKSPACE, ...BOOK, ...CHAPTER, input: { kind: 'value', required: true } },
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
      'rhythm-card': { ...WORKSPACE, title: { kind: 'value', required: true }, chapters: { kind: 'value', required: true } },
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
    },
  }
  return families[family]?.[action]
}

/** Parsed arguments keyed by option name (with dashes), plus the command pair. */
interface Parsed {
  readonly family: string
  readonly action: string
  readonly values: Record<string, unknown>
}

function usageError(message: string): CliError {
  return new CliError(`${message}\n${EXIT_HELP}`)
}

function normalizeArgv(argv: readonly string[]): string[] {
  const copy = [...argv]
  const phrase = (family: string, left: string, right: string, joined: string): void => {
    if (copy[0] === family && copy[1] === left && copy[2] === right) copy.splice(1, 2, joined)
  }
  phrase('project', 'plan', 'check', 'plan-check')
  phrase('project', 'cast', 'check', 'cast-check')
  phrase('project', 'legacy', 'archive', 'legacy-archive')
  phrase('project', 'context', 'retire', 'context-retire')
  return copy
}

function convert(name: string, raw: string, spec: OptionSpec): unknown {
  if (spec.type === 'int') {
    if (!/^-?\d+$/.test(raw)) throw usageError(`argument --${name}: invalid int value: '${raw}'`)
    return Number(raw)
  }
  if (spec.type === 'float') {
    const value = Number(raw)
    if (raw.trim() === '' || Number.isNaN(value)) throw usageError(`argument --${name}: invalid float value: '${raw}'`)
    return value
  }
  if (spec.choices !== undefined && !spec.choices.includes(raw)) {
    throw usageError(`argument --${name}: invalid choice: '${raw}' (choose from ${spec.choices.map(choice => `'${choice}'`).join(', ')})`)
  }
  return raw
}

/**
 * Parse the command line the way the Python dispatcher did.
 * @param argv - arguments after the program name.
 * @returns the command pair and option values.
 * @throws CliError for an unknown command, option, value or a missing required option.
 */
export function parseArguments(argv: readonly string[]): Parsed {
  const normalized = normalizeArgv(argv)
  const [family, action, ...rest] = normalized
  const spec = family === undefined || action === undefined ? undefined : specFor(family, action)
  if (spec === undefined || family === undefined || action === undefined) {
    const known = ['project', 'outline', 'chapter', 'short', 'text', 'memory', 'analysis', 'export', 'lineage', 'detect', 'book', 'facts']
    throw usageError(family === undefined || !known.includes(family)
      ? `unknown command: ${family ?? '(none)'}; choose from ${known.join(', ')}`
      : `unknown action for ${family}: ${action ?? '(none)'}`)
  }
  const values: Record<string, unknown> = {}
  for (const [name, option] of Object.entries(spec)) {
    if (option.kind === 'append') values[name] = []
    else if (option.default !== undefined) values[name] = option.default
  }
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? ''
    if (token === '--json') continue
    if (!token.startsWith('--')) throw usageError(`unrecognized arguments: ${token}`)
    const equals = token.indexOf('=')
    const name = (equals === -1 ? token : token.slice(0, equals)).slice(2)
    const option = spec[name]
    if (option === undefined) throw usageError(`unrecognized arguments: ${token}`)
    if (option.kind === 'flag') {
      if (equals !== -1) throw usageError(`argument --${name}: ignored explicit argument '${token.slice(equals + 1)}'`)
      values[name] = true
      continue
    }
    if (option.kind === 'optional-value') {
      let raw: string | undefined
      if (equals !== -1) raw = token.slice(equals + 1)
      else {
        const next = rest[index + 1]
        if (next !== undefined && !next.startsWith('--')) {
          index += 1
          raw = next
        }
      }
      if (raw === '') throw usageError(`argument --${name}: expected one argument`)
      values[name] = raw ?? true
      continue
    }
    let raw: string
    if (equals !== -1) raw = token.slice(equals + 1)
    else {
      index += 1
      const next = rest[index]
      if (next === undefined) throw usageError(`argument --${name}: expected one argument`)
      raw = next
    }
    const value = convert(name, raw, option)
    if (option.kind === 'append') (values[name] as unknown[]).push(value)
    else values[name] = value
  }
  const missing = Object.entries(spec).filter(([name, option]) => option.required === true && (option.kind === 'append' ? (values[name] as unknown[]).length === 0 : values[name] === undefined)).map(([name]) => `--${name}`)
  if (missing.length > 0) throw usageError(`the following arguments are required: ${missing.join(', ')}`)
  return { family, action, values }
}

/** Resolve symlinks as far as the path exists, like Python's non-strict `Path.resolve()`. */
function looseRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(looseRealpath(parent), basename(path))
  }
}

function within(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep)
}

function workspacePath(raw: string): string {
  const path = looseRealpath(resolve(raw))
  if (statSync(path, { throwIfNoEntry: false })?.isDirectory() !== true) throw new CliError(`workspace directory does not exist: ${raw}`)
  return path
}

function filePath(raw: string, project: string | undefined, output = false): string {
  const base = project === undefined ? undefined : looseRealpath(project)
  const path = looseRealpath(base !== undefined && !isAbsolute(raw) ? join(base, raw) : resolve(raw))
  if (base !== undefined && !within(base, path)) throw new CliError(`file leaves selected book: ${raw}`)
  if (!output && statSync(path, { throwIfNoEntry: false })?.isFile() !== true) throw new CliError(`file does not exist: ${path}`)
  return path
}

function bookPath(workspace: string, name: string, create = false): string {
  if (name === '' || name !== name.trim() || name.startsWith('.') || RESERVED_BOOKS.has(name) || /[/\\:\0]/.test(name)) {
    throw new CliError('--book must be one work name, not a path, category, or shared library')
  }
  const path = join(workspace, name)
  const resolved = looseRealpath(path)
  if (resolved !== path || dirname(resolved) !== workspace) throw new CliError('book must be a real direct child of the selected workspace')
  const info = statSync(path, { throwIfNoEntry: false })
  if (info !== undefined && !info.isDirectory()) throw new CliError(`book is not a directory: ${path}`)
  if (info === undefined && !create) throw new CliError(`book directory does not exist: ${path}`)
  // These are the roots used by the internal chapter and tracking operations.
  for (const child of ['正文', '大纲', '设定', '追踪']) {
    if (!within(path, looseRealpath(join(path, child)))) throw new CliError(`book resource leaves the selected work: ${child}`)
  }
  filePath(join(path, '设定/写作检查.json'), path, true)
  return path
}

function readObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(filePath(path, undefined), 'utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CliError('input JSON must be an object')
  return value as Record<string, unknown>
}

/** Protect generated views and existing transaction files from symlink escapes. */
function containedTree(root: string, directory: string): void {
  const base = looseRealpath(root)
  const check = (path: string): void => {
    if (!within(base, looseRealpath(path))) throw new CliError(`resource leaves selected scope: ${path}`)
  }
  check(directory)
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) return
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      check(path)
      if (statSync(path, { throwIfNoEntry: false })?.isDirectory() === true) walk(path)
    }
  }
  walk(directory)
}

function reportParts(relative: string, extension = '.md'): string[] {
  if (relative === '' || relative.includes('\0') || isAbsolute(relative)) throw new CliError(`report path must stay inside the book: ${relative}`)
  const parts = relative.replaceAll('\\', '/').split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) throw new CliError(`report path must stay inside the book: ${relative}`)
  if (!parts[parts.length - 1]?.endsWith(extension) || parts[0] === '追踪') {
    throw new CliError(`report path must be a ${extension} file inside the book and outside 追踪: ${relative}`)
  }
  return parts
}

function pathInfo(path: string, relative: string) {
  try {
    return lstatSync(path, { throwIfNoEntry: false })
  } catch {
    throw new CliError(`report path is not a directory: ${relative}`)
  }
}

/** Reject a report path that leaves the book, uses a symlink, or is not Markdown. Does not create directories. */
function assertReportPath(book: string, relative: string, extension = '.md'): void {
  const root = looseRealpath(book)
  let current = root
  for (const part of reportParts(relative, extension)) {
    const next = join(current, part)
    const info = pathInfo(next, relative)
    if (info?.isSymbolicLink() === true) throw new CliError(`report path contains a symlink: ${relative}`)
    if (info === undefined) return
    if (!within(root, looseRealpath(next))) throw new CliError(`report path leaves the book: ${relative}`)
    current = next
  }
  const leaf = pathInfo(current, relative)
  if (leaf?.isSymbolicLink() === true) throw new CliError(`report path contains a symlink: ${relative}`)
  if (leaf?.isFile() !== true) throw new CliError(`report path is not a file: ${relative}`)
}

/** Create missing parent directories and return the file to write. Rechecks symlinks. */
function prepareReportFile(book: string, relative: string, extension = '.md'): string {
  const root = looseRealpath(book)
  const parts = reportParts(relative, extension)
  let current = root
  for (let index = 0; index < parts.length; index += 1) {
    const next = join(current, parts[index] ?? '')
    const info = pathInfo(next, relative)
    if (info?.isSymbolicLink() === true) throw new CliError(`report path contains a symlink: ${relative}`)
    const last = index === parts.length - 1
    if (!last) {
      if (info === undefined) mkdirSync(next)
      else if (!info.isDirectory()) throw new CliError(`report path is not a directory: ${relative}`)
    } else if (info !== undefined && !info.isFile()) throw new CliError(`report path is not a file: ${relative}`)
    const real = last && info === undefined ? looseRealpath(current) : looseRealpath(next)
    if (!within(root, real)) throw new CliError(`report path leaves the book: ${relative}`)
    current = next
  }
  return current
}

/** Locate the package root (holding `knowledge/`) from either the source tree or the built `lib/`. */
function packageRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join(directory, 'package.json')) && existsSync(join(directory, 'knowledge'))) return directory
    directory = dirname(directory)
  }
  throw new CliError('dsh-story package root is missing its knowledge directory', 'TOOL_UNAVAILABLE', 3)
}

function text(values: Record<string, unknown>, name: string): string {
  const value = values[name]
  return typeof value === 'string' ? value : ''
}

function integer(values: Record<string, unknown>, name: string): number | undefined {
  const value = values[name]
  return typeof value === 'number' ? value : undefined
}

function chapterSpan(raw: string): [number, number] {
  const matched = /^(\d+)-(\d+)$/u.exec(raw.trim())
  if (matched?.[1] === undefined || matched[2] === undefined) throw new CliError('--chapters must be FROM-TO')
  const from = Number(matched[1])
  const to = Number(matched[2])
  if (from < 1 || to < from) throw new CliError('--chapters must be a positive range')
  return [from, to]
}

async function textCommand(action: string, values: Record<string, unknown>, project: string | undefined): Promise<[unknown, number]> {
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

async function run(parsed: Parsed): Promise<[unknown, number]> {
  const { family, action, values } = parsed
  const workspace = typeof values.workspace === 'string' ? workspacePath(values.workspace) : undefined
  let project: string | undefined
  if (['project', 'outline', 'chapter', 'short', 'export', 'detect', 'book', 'facts'].includes(family)) {
    project = bookPath(workspace ?? '', text(values, 'book'), family === 'project' && action === 'init')
  }
  if (family === 'text') {
    if ((workspace !== undefined) !== (typeof values.book === 'string')) throw new CliError('use --workspace and --book together when scoping a text operation')
    if (typeof values.book === 'string') project = bookPath(workspace ?? '', values.book)
    return textCommand(action, values, project)
  }
  if (project === undefined && workspace === undefined) throw new CliError('the following arguments are required: --workspace')
  if (family === 'project') {
    const book = project ?? ''
    if (action === 'init') {
      if (values.kind === 'short' && values.input !== undefined) throw new CliError('short initialization does not accept long-form tracking input')
      const document = typeof values.input === 'string' ? readObject(values.input) : null
      if (document !== null) {
        containedTree(book, join(book, '追踪'))
        normalizeInitialDocument(document)
        if (existsSync(statePath(book))) throw new CliError('tracking state already exists; initialization never overwrites it')
      }
      const created = !existsSync(book)
      mkdirSync(book, { recursive: true })
      if (values.kind === 'long') for (const directory of ['正文', '大纲', '设定']) mkdirSync(join(book, directory), { recursive: true })
      let state: TrackingState | undefined
      if (document !== null) {
        const written = initialize(book, document)
        state = written.state
        for (const warning of written.warnings) process.stderr.write(`${warning}\n`)
      }
      return [{
        schema: 'story-project-init/v1', book: values.book, project: book, kind: values.kind,
        initialized: existsSync(statePath(book)), created,
        ...(state === undefined ? {} : { last_committed_chapter: state.last_committed_chapter, state_revision: state.state_revision }),
      }, 0]
    }
    if (action === 'check') {
      containedTree(book, join(book, '追踪'))
      const state = checkProject(book)
      return [{ last_committed_chapter: state.last_committed_chapter, state_revision: state.state_revision }, 0]
    }
    if (action === 'context') {
      const source = typeof values.text === 'string' ? readFileSync(filePath(values.text, book), 'utf8') : undefined
      return [buildContext(book, { ...(integer(values, 'chapter') === undefined ? {} : { chapter: integer(values, 'chapter') as number }), ...(source === undefined ? {} : { text: source }) }), 0]
    }
    if (action === 'lookup') {
      const hasText = typeof values.text === 'string'
      const hasFile = typeof values.file === 'string'
      if (hasText === hasFile) throw new CliError('project lookup requires exactly one of --text or --file')
      const queryText = hasFile ? readFileSync(filePath(text(values, 'file'), book), 'utf8') : text(values, 'text')
      const revision = typeof values.revision === 'string' ? values.revision : undefined
      const limit = integer(values, 'limit') ?? LOOKUP_DEFAULT_LIMIT
      const settings = lookupSettings(book, queryText, {
        offset: integer(values, 'offset') ?? 0,
        limit,
        ...(revision === undefined ? {} : { expectedIndex: revision }),
      })
      if (values.reference !== true) return [settings, 0]
      return [{ ...settings, references: lookupReference(workspace ?? '', book, queryText, { limit }) }, 0]
    }
    if (action === 'rhythm') {
      const from = integer(values, 'from') ?? 0
      const to = integer(values, 'to') ?? 0
      try {
        const report = checkRhythm(book, from, to)
        return [report, report.findings.length > 0 ? 1 : 0]
      } catch (error) {
        if (error instanceof RangeError) throw new CliError(error.message)
        throw error
      }
    }
    if (action === 'plan-check') {
      const report = checkPlan(book, integer(values, 'chapter') ?? 1)
      return [report, report.ok ? 0 : 1]
    }
    if (action === 'cast-check') {
      const from = integer(values, 'from')
      const to = integer(values, 'to')
      const report = checkCast(book, { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) })
      return [report, report.findings.length > 0 ? 1 : 0]
    }
    if (action === 'legacy-archive') {
      containedTree(book, join(book, '追踪'))
      return [archiveReaderValue(book), 0]
    }
    if (action === 'context-retire') {
      containedTree(book, join(book, '追踪'))
      return [retireContextItem(book, text(values, 'item'), text(values, 'reason')), 0]
    }
    const expectedRevision = integer(values, 'revision') ?? null
    if (action === 'status') return [projectQuery(book, { expectedRevision }), 0]
    const stalePlanted = integer(values, 'stale-planted')
    const staleCharacter = integer(values, 'stale-character')
    const staleThread = integer(values, 'stale-thread')
    return [projectQuery(book, {
      kind: values.kind as QueryKind, search: text(values, 'search'), selection: values.filter as QueryFilter,
      chapter: integer(values, 'chapter') ?? null, offset: integer(values, 'offset') ?? 0, limit: integer(values, 'limit') ?? 20, expectedRevision,
      ...(stalePlanted === undefined ? {} : { stalePlanted }),
      ...(staleCharacter === undefined ? {} : { staleCharacter }),
      ...(staleThread === undefined ? {} : { staleThread }),
    }), 0]
  }
  if (family === 'outline' || family === 'chapter') {
    const book = project ?? ''
    const chapter = integer(values, 'chapter') ?? 0
    if (chapter < 1) throw new CliError('--chapter must be positive')
    if (family === 'outline') {
      const path = findChapterFile(join(book, '大纲'), chapter, { outline: true, allowMissing: true })
      filePath(path, book, true)
      const report = verifyOutline(path)
      return [report, report.ok ? 0 : 1]
    }
    if (action === 'rules') return [extractChapterRules(book, chapter), 0]
    if (action === 'audit-verify') {
      const relative = typeof values.input === 'string' ? values.input : ruleAuditRelativePath(chapter)
      const path = filePath(relative, book, true)
      const verified = verifyRuleAudit(book, chapter, path)
      return [verified, verified.verified ? 0 : 1]
    }
    if (action === 'snapshot') {
      const stateFile = statePath(book)
      filePath(stateFile, book)
      filePath(join(book, '追踪/.tracking-commit.lock'), book, true)
      return [chapterSnapshot(book, chapter, values['outline-only'] === true), 0]
    }
    for (const [directory, outline] of [['大纲', true], ['正文', false]] as const) {
      filePath(findChapterFile(join(book, directory), chapter, { outline }), book)
    }
    if (action === 'check') {
      const result = chapterCheck(book, chapter)
      return [result, result.outline_readiness.status === 'pass' && result.quality.status === 'pass' ? 0 : 1]
    }
    containedTree(book, join(book, '追踪'))
    return [chapterCommit(book, chapter, filePath(text(values, 'input'), undefined), action === 'accept-current-length'), 0]
  }
  if (family === 'short') {
    const book = project ?? ''
    for (const name of action === 'delivery-check' ? ['正文.md'] : ['设定.md', '小节大纲.md']) filePath(name, book, true)
    if (action === 'plan-check') {
      const report = verifyPhase2(book, join(packageRoot(), 'knowledge/story/skills/story-write'))
      return [report, report.ok ? 0 : 1]
    }
    const minChars = integer(values, 'min-chars') ?? 0
    const maxChars = integer(values, 'max-chars') ?? 0
    const sections = integer(values, 'sections') ?? 0
    if (!(0 < minChars && minChars <= maxChars && maxChars <= Number.MAX_SAFE_INTEGER) || !(0 < sections && sections <= Number.MAX_SAFE_INTEGER)) {
      throw new CliError('short delivery requires 0 < min-chars <= max-chars and positive sections within Number.MAX_SAFE_INTEGER')
    }
    const report = verifyDelivery(book, { minChars, maxChars, sections })
    return [report, report.ok ? 0 : 1]
  }
  if (family === 'memory') {
    const root = workspace ?? ''
    containedTree(root, memoryRoot(root))
    if (action === 'query') {
      const kinds = values.kind as string[]
      return [memoryQuery(root, kinds.length === 0 ? null : kinds, typeof values.book === 'string' ? values.book : null, typeof values.genre === 'string' ? values.genre : null, typeof values.workflow === 'string' ? values.workflow : null), 0]
    }
    if (action === 'record') return [memoryRecord(root, filePath(text(values, 'input'), undefined)), 0]
    if (action === 'commit') return [memoryCommit(root, filePath(text(values, 'input'), undefined)), 0]
    if (action === 'init') return [memoryInit(root), 0]
    return [memoryCheck(root), 0]
  }
  if (family === 'analysis') {
    const root = workspace ?? ''
    if (action === 'rhythm-card') {
      const [from, to] = chapterSpan(text(values, 'chapters'))
      return [writeRhythmCard(root, text(values, 'title'), from, to), 0]
    }
    const source = filePath(text(values, 'source'), undefined)
    const document = readObject(text(values, 'input'))
    if (action === 'inspect') return [inspectAnalysis(root, text(values, 'title'), source, document), 0]
    const result = writeAnalysisCards(root, text(values, 'title'), source, document)
    return [result, result.failed.length > 0 ? 1 : 0]
  }
  if (family === 'export') {
    const book = project ?? ''
    containedTree(book, join(book, '正文'))
    return [exportNovel(book, resolve(text(values, 'out-dir'))), 0]
  }
  if (family === 'lineage') {
    const root = workspace ?? ''
    filePath(join(root, LEDGER_NAME), root, true)
    return [recordEdge(root, {
      fromDomain: text(values, 'from-domain'), fromPath: text(values, 'from-path'), toDomain: text(values, 'to-domain'), toPath: text(values, 'to-path'),
      decisions: values.decision as string[], by: text(values, 'by'),
    }), 0]
  }
  if (family === 'book') {
    const book = project ?? ''
    const from = integer(values, 'from') ?? 0
    const to = integer(values, 'to') ?? 0
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) throw new CliError('--from and --to must be positive integers')
    if (from > to) throw new CliError('--from cannot exceed --to')
    if (to - from + 1 > BOOK_AUDIT_MAX_SPAN) throw new CliError(`book audit accepts at most ${String(BOOK_AUDIT_MAX_SPAN)} chapters`)
    const write = values.write
    const relative = write === undefined ? undefined : write === true ? defaultAuditReportPath(from, to) : text(values, 'write')
    if (relative !== undefined) assertReportPath(book, relative)
    const issues = values.issues
    const issuesRelative = issues === undefined ? undefined : issues === true ? '草稿/问题单.json' : text(values, 'issues')
    if (issuesRelative !== undefined) assertReportPath(book, issuesRelative, '.json')
    const report = auditBook(book, { from, to })
    const document = {
      ...report,
      ...(relative === undefined ? {} : { report_path: relative }),
      ...(issuesRelative === undefined ? {} : { issues_path: issuesRelative }),
    }
    if (relative !== undefined) writeFileSync(prepareReportFile(book, relative), renderBookAudit({ ...report, ...(relative === undefined ? {} : { report_path: relative }) }), 'utf8')
    if (issuesRelative !== undefined) writeFileSync(prepareReportFile(book, issuesRelative, '.json'), `${JSON.stringify(issuesFromAudit(report), null, 2)}\n`, 'utf8')
    return [document, report.findings.some(item => item.severity === 'blocking') ? 1 : 0]
  }
  if (family === 'facts') {
    const book = project ?? ''
    if (action === 'query') {
      const kind = typeof values.kind === 'string' ? values.kind : undefined
      const subject = typeof values.subject === 'string' ? values.subject : undefined
      return [queryFacts(book, { ...(kind === undefined ? {} : { kind }), ...(subject === undefined ? {} : { subject }) }), 0]
    }
    if (action === 'stale') {
      const report = staleFacts(book)
      return [report, report.stale.length > 0 || report.missing_chapters.length > 0 ? 1 : 0]
    }
    const chapter = integer(values, 'chapter') ?? 0
    if (chapter < 1) throw new CliError('--chapter must be positive')
    const input: unknown = JSON.parse(readFileSync(filePath(text(values, 'input'), book), 'utf8'))
    if (action === 'diff') {
      const report = diffFacts(book, chapter, input)
      return [report, report.ok ? 0 : 1]
    }
    containedTree(book, join(book, '追踪'))
    return [recordFacts(book, chapter, input), 0]
  }
  const book = project ?? ''
  const source = filePath(text(values, 'file'), book)
  const output = typeof values.out === 'string' ? filePath(values.out, book, true) : undefined
  const outcome = await detectChapter({
    file: source, target: values.target as number, maxChars: integer(values, 'max-chars') ?? DEFAULT_MAX_CHARS,
    ...(values['credential-pool-stdin'] === true ? { keyPool: readKeyPool(readFileSync(0, 'utf8')) } : {}),
  })
  if (outcome.report.ok === true && output !== undefined) {
    try {
      writeReport(output, outcome.report)
    } catch (error) {
      throw new CliError(error instanceof Error ? error.message : String(error), 'REPORT_WRITE_FAILED', 3)
    }
  }
  return [outcome.report, outcome.exitCode]
}

function emit(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

const INPUT_ERRORS = new Set(['WordcountError', 'TrackingError', 'SettingsLookupError', 'AuthorMemoryError', 'AnalysisError', 'ExportError', 'LineageError', 'WritingCheckError', 'BookAuditError', 'FactsError', 'LegacyError', 'PlanError', 'ReferenceError', 'StyleError', 'SyntaxError'])

/**
 * Run one command and report its result or structured error on stdout.
 * @param argv - arguments after the program name.
 * @returns the process exit code.
 */
export async function main(argv: readonly string[]): Promise<number> {
  try {
    const [result, code] = await run(parseArguments(argv))
    emit(result)
    return code
  } catch (error) {
    if (!(error instanceof Error)) throw error
    let code: number
    let errorCode: string
    if (error instanceof CliError) {
      code = error.exitCode
      errorCode = error.code
    } else if (INPUT_ERRORS.has(error.name)) {
      code = 2
      errorCode = 'INVALID_INPUT'
    } else if ('code' in error && typeof error.code === 'string') {
      code = 3
      errorCode = 'EXECUTION_FAILED'
    } else {
      throw error
    }
    emit({ schema: 'story-cli-error/v1', ok: false, command: argv.slice(0, 2).join(' '), error_code: errorCode, message: error.message })
    process.stderr.write(`dsh-story: ${error.message}\n`)
    return code
  }
}
