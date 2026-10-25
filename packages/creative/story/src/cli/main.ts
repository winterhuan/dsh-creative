/**
 * The `dsh-story` command face: argument parsing, path guards, and dispatch.
 *
 * Family work lives in `./runners/`. This file resolves the workspace and
 * the book, then hands the command to that family. Results are one JSON
 * document on stdout. Exit codes: 0 success, 1 check findings, 2 invalid
 * input, 3 execution failure; `detect zhuque` also uses 4 for service errors.
 */
import { bookPath, CliError, text, workspacePath } from './guards.ts'
import { runChapter } from './runners/chapter.ts'
import { runFacts } from './runners/facts.ts'
import { runProject } from './runners/project.ts'
import { runAnalysis, runBook, runDetect, runExport, runLineage, runMemory, runShort } from './runners/rest.ts'
import { runText } from './runners/text.ts'
import { specFor, type OptionSpec } from './specs.ts'

export { CliError }

const EXIT_HELP = 'Exit codes: 0 success, 1 check findings, 2 invalid input, 3 execution failure. Zhuque also uses 4 for service errors. Results are JSON.'

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


const BOOK_FAMILIES = new Set(['project', 'outline', 'chapter', 'short', 'export', 'detect', 'book', 'facts'])

async function run(parsed: Parsed): Promise<[unknown, number]> {
  const { family, action, values } = parsed
  const workspace = typeof values.workspace === 'string' ? workspacePath(values.workspace) : undefined
  let project: string | undefined
  if (BOOK_FAMILIES.has(family)) project = bookPath(workspace ?? '', text(values, 'book'), family === 'project' && action === 'init')
  if (family === 'text') {
    if ((workspace !== undefined) !== (typeof values.book === 'string')) throw new CliError('use --workspace and --book together when scoping a text operation')
    if (typeof values.book === 'string') project = bookPath(workspace ?? '', values.book)
    return runText(action, values, project)
  }
  if (project === undefined && workspace === undefined) throw new CliError('the following arguments are required: --workspace')
  if (family === 'project') return runProject(project ?? '', workspace, action, values)
  if (family === 'outline' || family === 'chapter') return runChapter(project ?? '', family, action, values)
  if (family === 'facts') return runFacts(project ?? '', action, values)
  if (family === 'short') return runShort(project ?? '', action, values)
  if (family === 'memory') return runMemory(workspace ?? '', action, values)
  if (family === 'analysis') return runAnalysis(workspace ?? '', action, values)
  if (family === 'export') return runExport(project ?? '', values)
  if (family === 'lineage') return runLineage(workspace ?? '', values)
  if (family === 'book') return runBook(project ?? '', values)
  return runDetect(project ?? '', values)
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
