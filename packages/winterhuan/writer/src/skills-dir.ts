import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Absolute directory of the skills shipped in this package.
 * The preset uses the same resolution: `createRequire(baseUrl).resolve` the package manifest, then join `skills`.
 * @param baseUrl - a file URL or path from which this package can be resolved. Defaults to this module.
 * @returns the absolute `skills` directory.
 */
export function packageSkillsDir(baseUrl: string = import.meta.url): string {
  const manifest = createRequire(baseUrl).resolve('@winterhuan/dsh-writer/package.json')
  return join(dirname(manifest), 'skills')
}
