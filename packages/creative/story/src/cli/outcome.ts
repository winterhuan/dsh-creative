/**
 * Exit codes shared by the chapter and facts runners.
 *
 * `main` prints one JSON document either way. Exit 0 is success. Exit 1 is a
 * check finding. Argument errors stay `CliError` (exit 2). Service failures
 * stay at the call site.
 */
import { CliError, integer } from './guards.ts'

/** One JSON document and the process exit code. */
export type CliOutcome = [unknown, number]

/**
 * Require `--chapter` to be a positive integer already parsed by the CLI.
 * @param values - parsed options.
 * @returns the chapter number.
 * @throws CliError when the option is missing or below 1.
 */
export function positiveChapter(values: Record<string, unknown>): number {
  const chapter = integer(values, 'chapter') ?? 0
  if (chapter < 1) throw new CliError('--chapter must be positive')
  return chapter
}

/**
 * Return a document with exit 1 when the check failed.
 * @param value - the JSON document.
 * @param failed - whether the command found a blocking result.
 */
export function withFindings(value: unknown, failed: boolean): CliOutcome {
  return [value, failed ? 1 : 0]
}
