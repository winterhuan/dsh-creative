import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { authoredGitFiles, pluginWorkspaces } from '../scripts/plugin-workspaces.ts'
import { computeTranslationPairingRecord, renderTranslationPairingRecord, translationPairPaths } from '../scripts/translation-pairing-record.ts'
import { parseTranslationMarkdown, translationStructureSignature } from '../scripts/translation-pairing.ts'

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-submodule-check-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, '.gitmodules'), '[submodule "upstream"]\npath = upstream\n[submodule "plugins/example"]\npath = plugins/example\n')
  return root
}

it('rejects an uninitialized plugin instead of reporting an empty successful run', () => {
  expect(() => pluginWorkspaces(fixture())).toThrow('git submodule update --init --recursive')
})

it('finds authored plugin files without treating release output as source', () => {
  const root = fixture()
  const plugin = join(root, 'plugins/example')
  mkdirSync(plugin, { recursive: true })
  for (const cwd of [root, plugin]) execFileSync('git', ['init', '--quiet'], { cwd })
  writeFileSync(join(root, 'AGENTS.md'), 'Instructions\n')
  writeFileSync(join(plugin, 'package.json'), '{}\n')
  mkdirSync(join(plugin, 'src'))
  writeFileSync(join(plugin, 'src/index.ts'), 'export {}\n')
  mkdirSync(join(plugin, 'lib'))
  writeFileSync(join(plugin, 'lib/index.js'), 'export {}\n')
  execFileSync('git', ['add', 'package.json', 'src', 'lib'], { cwd: plugin })
  expect(pluginWorkspaces(root)).toEqual(['plugins/example'])
  const files = authoredGitFiles(root, true)
  expect(files).toContain('AGENTS.md')
  expect(files).toContain('plugins/example/src/index.ts')
  expect(files).not.toContain('plugins/example/lib/index.js')
})

it('preserves plugin translation hashes when the repository is checked as a submodule', () => {
  const root = fixture()
  const plugin = join(root, 'plugins/example')
  mkdirSync(join(plugin, '.git'), { recursive: true })
  for (const file of ['guide.md', 'guide.zh.md']) writeFileSync(join(plugin, file), '# Guide\n')
  const en = '# Plugin\n\n[Guide](guide.md)\n'
  const zh = '# 插件\n\n[指南](guide.zh.md)\n'
  const context = (repoRoot: string) => ({
    repoRoot,
    isTranslationPairSource: () => true,
    repositoryFileExists: (path: string) => existsSync(join(repoRoot, path)),
  })
  const standalone = computeTranslationPairingRecord(translationPairPaths('README.md'), en, zh, context(plugin))
  const nested = computeTranslationPairingRecord(translationPairPaths('plugins/example/README.md'), en, zh, context(root))
  expect(nested).toEqual(standalone)
  expect(renderTranslationPairingRecord(translationPairPaths('plugins/example/README.md'), nested))
    .toEqual(renderTranslationPairingRecord(translationPairPaths('README.md'), standalone))
})

it('matches parent documentation locales without ignoring a different repository or anchor', () => {
  const root = fixture()
  mkdirSync(join(root, 'docs'))
  for (const file of ['guide.md', 'guide.zh.md']) writeFileSync(join(root, 'docs', file), '# Guide\n')
  const prefix = 'https://github.com/winterhuan/dsh-creative/blob/main/docs/'
  const signature = (url: string) => {
    const markdown = `[Guide](${url})\n`
    return translationStructureSignature(parseTranslationMarkdown(markdown), [], {
      repoRoot: root, sourcePath: 'README.md', isTranslationPairSource: () => true, markdown,
    })
  }
  expect(signature(`${prefix}guide.md#section`)).toEqual(signature(`${prefix}guide.zh.md#section`))
  expect(signature(`${prefix}guide.md#section`)).not.toEqual(signature(`${prefix}guide.zh.md#other`))
  expect(signature(`${prefix}guide.md`)).not.toEqual(signature(`${prefix.replace('winterhuan', 'another-owner')}guide.zh.md`))
})
