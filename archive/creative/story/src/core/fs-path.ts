/**
 * Path resolution shared by the CLI guards and the core readers.
 *
 * `looseRealpath` follows symlinks only as far as the path exists, matching
 * Python's non-strict `Path.resolve()`. Callers still decide which error to throw.
 */
import { realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Resolve symlinks as far as the path exists.
 * @param path - an absolute or relative path.
 * @returns the resolved path, or the original path when no ancestor exists.
 */
export function looseRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(looseRealpath(parent), basename(path))
  }
}
