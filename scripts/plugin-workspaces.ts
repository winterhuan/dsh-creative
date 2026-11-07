/** Discover initialized plugin repositories registered by the parent Git repository. */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Return plugin submodule paths; fail before a command can silently skip an uninitialized repository. */
export function pluginWorkspaces(root: string): string[] {
  const paths = execFileSync('git', ['config', '--file', resolve(root, '.gitmodules'), '--get-regexp', '^submodule\\..*\\.path$'], { encoding: 'utf8' })
    .trim().split('\n').map(line => line.slice(line.indexOf(' ') + 1)).filter(path => path.startsWith('plugins/'))
  if (paths.length === 0) throw new Error('No plugin submodules registered in .gitmodules')
  for (const path of paths) {
    if (!existsSync(resolve(root, path, '.git')) || !existsSync(resolve(root, path, 'package.json'))) {
      throw new Error(`${path} is not initialized; run git submodule update --init --recursive`)
    }
  }
  return paths
}

/** List parent and plugin Git files, excluding compiled and bundled dependency trees in plugin releases. */
export function authoredGitFiles(root: string, includeUntracked = false): string[] {
  const args = ['ls-files', '-z', ...(includeUntracked ? ['--cached', '--others', '--exclude-standard'] : [])]
  const list = (cwd: string): string[] => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean)
  return [...new Set([
    ...list(root),
    ...pluginWorkspaces(root).flatMap(path => list(resolve(root, path))
      .filter(file => !file.split('/').some(part => ['lib', 'node_modules', 'plugin', '.artifacts'].includes(part)))
      .map(file => `${path}/${file}`)),
  ])]
}
