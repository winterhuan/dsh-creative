/** Workspace masthead helpers: short cwd name and scan health. */

export type WriterScanHealth = 'loading' | 'ok' | 'partial' | 'failed'

/**
 * Last path segment of a workspace cwd for the masthead.
 * @param cwd - absolute or relative workspace root.
 * @returns a short display name.
 */
export function workspaceShortName(cwd: string): string {
  if (/^[/\\]+$/u.test(cwd)) return '/'
  const trimmed = cwd.replace(/[/\\]+$/u, '')
  if (trimmed === '' || trimmed === '.') return trimmed === '' ? '.' : trimmed
  const parts = trimmed.split(/[/\\]/u).filter(part => part !== '')
  return parts[parts.length - 1] ?? trimmed
}

/**
 * Derive listing health from scan progress and soft/hard failures.
 * @param input - scanning flag, hard failure, roots, and soft errors.
 * @returns health for the masthead / rail footnote.
 */
export function writerScanHealth(input: {
  readonly scanning: boolean
  readonly hardFailed: boolean
  readonly libraryCount: number
  readonly projectCount: number
  readonly scanErrors: readonly string[]
}): WriterScanHealth {
  if (input.scanning) return 'loading'
  if (input.hardFailed) return 'failed'
  if (
    input.scanErrors.length > 0
    && input.libraryCount === 0
    && input.projectCount === 0
  ) return 'failed'
  if (input.scanErrors.length > 0) return 'partial'
  return 'ok'
}
