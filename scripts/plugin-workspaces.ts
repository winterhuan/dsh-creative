/** Discover initialized plugin repositories registered by the parent Git repository. */
import { execFileSync } from 'node:child_process'
import { existsSync, globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Identify imported research code checked by its own toolchain rather than Creative source-style rules.
 * README checks and workspace install/typecheck/build/test still include this repository.
 * @param file - parent-repository-relative path, using native or POSIX separators.
 * @returns whether the path is inside the Superagent reference checkout.
 */
export function isReferencePluginPath(file: string): boolean {
  return file.replaceAll('\\', '/').startsWith('plugins/dsh-superagent-prototype/')
}

/**
 * Find plugin package manifests, excluding workspace-only root manifests.
 * @param root - absolute parent repository root.
 * @returns sorted repository-relative manifests for root src and nested packages.
 */
export function pluginPackageJsons(root: string): string[] {
  return globSync(['plugins/*/package.json', 'plugins/*/packages/*/*/package.json'], {
    cwd: root, exclude: ['**/vendor/**', '**/node_modules/**'],
  })
    .map(file => file.replaceAll('\\', '/'))
    .filter(file => file.includes('/packages/') || existsSync(resolve(root, dirname(file), 'src')))
    .sort()
}

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
      .filter(file => !file.split('/').some(part => ['lib', 'dist', 'node_modules', 'plugin', '.artifacts'].includes(part)))
      .map(file => `${path}/${file}`)),
  ])]
}
