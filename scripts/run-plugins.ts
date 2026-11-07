/** Run a command in each plugin workspace, stopping at the first failure. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pluginWorkspaces } from './plugin-workspaces.ts'

const root = resolve(import.meta.dirname, '..')
const [command, ...extra] = process.argv.slice(2)
if (!command || !['install', 'typecheck', 'build', 'test', 'clean'].includes(command)) {
  console.error('Usage: tsx scripts/run-plugins.ts <install|typecheck|build|test|clean> [arguments]')
  process.exit(2)
}
const paths = pluginWorkspaces(root)
for (const path of paths) {
  console.log(`\n${path}: ${command}`)
  const args = command === 'install' ? ['install', '--frozen-lockfile', ...extra] : ['run', command, ...extra]
  const result = spawnSync('pnpm', args, { cwd: resolve(root, path), stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
