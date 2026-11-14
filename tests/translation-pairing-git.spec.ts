import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { gitIndexPaths, readGitIndexBlob } from '../scripts/translation-pairing-git.ts'
import { isTranslationScopeFile } from '../scripts/translation-pairing.ts'

it('includes plugin user-guide pairs while excluding copied upstream guides', () => {
  expect(isTranslationScopeFile('plugins/dsh-media-desk/GUIDE.md')).toBe(true)
  expect(isTranslationScopeFile('plugins/dsh-media-desk/GUIDE.zh.md')).toBe(true)
  expect(isTranslationScopeFile('plugins/dsh-media-desk/GUIDE.i18n.yaml')).toBe(true)
  expect(isTranslationScopeFile('plugins/dsh-media-desk/upstream/GUIDE.md')).toBe(false)
})

it('reads linked documentation from the staged submodule commit', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pairing-index-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const plugin = join(root, 'plugins/example')
  mkdirSync(plugin, { recursive: true })
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  for (const cwd of [root, plugin]) git(cwd, 'init', '--quiet')
  const commit = () => git(plugin, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Documentation')
  writeFileSync(join(plugin, 'README.md'), 'Published documentation\n')
  writeFileSync(join(plugin, 'README.zh.md'), '已发布文档\n')
  git(plugin, 'add', 'README.md', 'README.zh.md')
  commit()
  const published = git(plugin, 'rev-parse', 'HEAD')
  git(root, 'update-index', '--add', '--cacheinfo', `160000,${published},plugins/example`)
  writeFileSync(join(plugin, 'README.md'), 'New documentation\n')
  writeFileSync(join(plugin, 'unpublished.md'), 'Not published\n')
  git(plugin, 'add', 'README.md', 'unpublished.md')
  commit()
  const paths = gitIndexPaths(root)
  expect(paths.has('plugins/example/README.zh.md')).toBe(true)
  expect(paths.has('plugins/example/unpublished.md')).toBe(false)
  expect(readGitIndexBlob(root, 'plugins/example/README.md')?.toString()).toBe('Published documentation\n')
  expect(readGitIndexBlob(root, 'plugins/example/unpublished.md')).toBeUndefined()
})
