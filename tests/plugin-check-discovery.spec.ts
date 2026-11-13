import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { isReferencePluginPath, pluginPackageJsons } from '../scripts/plugin-workspaces.ts'
import { packageReadmes, packageReadmeSummaryErrors } from '../scripts/verify-package-readme-summaries.ts'
import { clientUiSourceFiles, findUiI18nViolations } from '../scripts/verify-client-ui-i18n.ts'
import { collectExportJsdocViolations } from '../scripts/verify-export-jsdoc.ts'
import { scanDocReferences } from '../scripts/verify-doc-refs.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-discovery-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const write = (path: string, content: string) => {
    const file = join(root, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  return { root, write }
}

it('discovers root and nested packages without counting workspace or bundled manifests', () => {
  const { root, write } = fixture()
  write('plugins/root/package.json', '{}')
  write('plugins/root/src/index.ts', 'export {}')
  write('plugins/nested/package.json', '{}')
  write('plugins/nested/packages/owner/feature/package.json', '{}')
  write('plugins/nested/packages/owner/feature/src/index.ts', 'export {}')
  write('plugins/nested/plugin/package.json', '{}')
  write('plugins/nested/plugin/node_modules/dependency/package.json', '{}')
  write('plugins/root/src/vendor/dependency/package.json', '{}')
  expect(pluginPackageJsons(root)).toEqual([
    'plugins/nested/packages/owner/feature/package.json',
    'plugins/root/package.json',
  ])
})

it('reports an oversized root package Summary while retaining nested README discovery', () => {
  const { root, write } = fixture()
  write('plugins/root/package.json', '{}')
  write('plugins/root/src/index.ts', 'export {}')
  write('plugins/root/README.md', `## Summary\n\n${'word '.repeat(101)}\n`)
  write('plugins/nested/package.json', '{}')
  write('plugins/nested/README.md', '# Workspace overview\n')
  write('plugins/nested/packages/owner/feature/package.json', '{}')
  write('plugins/nested/packages/owner/feature/README.md', '## Summary\n\nA nested plugin.\n')
  const readmes = packageReadmes(root)
  expect(readmes).toEqual([
    'plugins/nested/packages/owner/feature/README.md',
    'plugins/root/README.md',
  ])
  const failures = readmes.flatMap(file => packageReadmeSummaryErrors(file, readFileSync(join(root, file), 'utf8')))
  expect(failures).toHaveLength(1)
  expect(failures[0]).toContain('plugins/root/README.md: Summary has 101 words')
})

it('checks root Client UI copy and helpers while excluding Host, declarations, and release output', () => {
  const { root, write } = fixture()
  write('plugins/root/src/client/Panel.tsx', 'export function Panel() { return <p>Untranslated copy</p> }')
  write('plugins/root/src/client/helpers.ts', 'export const count = 1')
  write('plugins/root/src/client/locales.ts', 'export const locale = { label: "Translated copy" }')
  write('plugins/root/src/client/types.d.ts', 'export interface Config {}')
  write('plugins/root/src/client/vendor/Panel.tsx', 'export function Panel() { return <p>Vendor copy</p> }')
  write('plugins/root/src/host/index.ts', 'export const label = "Host copy"')
  write('plugins/root/lib/client/Panel.tsx', 'export function Panel() { return <p>Built copy</p> }')
  write('plugins/nested/packages/owner/feature/src/client/Panel.tsx', 'export function Panel() { return <p>{props.label}</p> }')
  const files = clientUiSourceFiles(root)
  expect(files).toEqual([
    'plugins/nested/packages/owner/feature/src/client/Panel.tsx',
    'plugins/root/src/client/Panel.tsx',
    'plugins/root/src/client/helpers.ts',
    'plugins/root/src/client/locales.ts',
  ])
  const violations = files.flatMap(file => findUiI18nViolations(file, readFileSync(join(root, file), 'utf8')))
  expect(violations).toHaveLength(1)
  expect(violations[0]).toMatchObject({ file: 'plugins/root/src/client/Panel.tsx', text: 'Untranslated copy' })
  write('plugins/root/src/client/Panel.tsx', 'export function Panel() { return <p>{props.label}</p> }')
  expect(files.flatMap(file => findUiI18nViolations(file, readFileSync(join(root, file), 'utf8')))).toEqual([])
})

it('reports undocumented root and nested exports without scanning vendor or built declarations', () => {
  const { root, write } = fixture()
  write('plugins/root/package.json', '{"exports":{"./src/*":"./src/*"}}')
  write('plugins/root/src/index.ts', 'export function rootAction(): void {}')
  write('plugins/root/src/vendor/index.ts', 'export function vendorAction(): void {}')
  write('plugins/root/lib/index.ts', 'export function builtAction(): void {}')
  write('plugins/nested/packages/owner/feature/package.json', '{}')
  write('plugins/nested/packages/owner/feature/src/index.ts', 'export function nestedAction(): void {}')
  const violations = collectExportJsdocViolations(root)
  expect(violations).toHaveLength(2)
  expect(violations.join('\n')).toContain('rootAction')
  expect(violations.join('\n')).toContain('nestedAction')
  write('plugins/root/src/index.ts', '/** Run the root action. */\nexport function rootAction(): void {}')
  write('plugins/nested/packages/owner/feature/src/index.ts', '/** Run the nested action. */\nexport function nestedAction(): void {}')
  expect(collectExportJsdocViolations(root)).toEqual([])
})

it('follows root package public barrels while leaving internal exports private', () => {
  const { root, write } = fixture()
  write('plugins/root/package.json', '{"exports":{".":{"types":"./lib/types/index.d.ts","default":"./lib/index.js"}}}')
  write('plugins/root/src/index.ts', 'export { readOptions } from "./options.ts"')
  write('plugins/root/src/options.ts', 'export function readOptions(): void {}\nexport function internalOptions(): void {}')
  const violations = collectExportJsdocViolations(root)
  expect(violations).toHaveLength(1)
  expect(violations[0]).toContain('readOptions')
  expect(violations[0]).not.toContain('internalOptions')
  write('plugins/root/src/options.ts', '/** Read the public options. */\nexport function readOptions(): void {}\nexport function internalOptions(): void {}')
  expect(collectExportJsdocViolations(root)).toEqual([])
})

it('reports broken root TS and TSX documentation references with nested sources still covered', () => {
  const { root, write } = fixture()
  write('plugins/root/src/index.ts', '// See docs/missing-root.md\n')
  write('plugins/root/src/client/Panel.tsx', '// See docs/missing-panel.md\n')
  write('plugins/root/src/types.d.ts', '// See docs/ignored-declaration.md\n')
  write('plugins/root/src/vendor/index.ts', '// See docs/ignored-vendor.md\n')
  write('plugins/root/lib/index.ts', '// See docs/ignored-built.md\n')
  write('plugins/root/upstream/src/index.ts', '// See docs/ignored-upstream.md\n')
  write('plugins/nested/packages/owner/feature/src/index.ts', '// See docs/missing-nested.md\n')
  const result = scanDocReferences(root)
  expect(result.checked).toBe(3)
  expect(result.violations.map(violation => violation.ref).sort()).toEqual([
    'docs/missing-nested.md', 'docs/missing-panel.md', 'docs/missing-root.md',
  ])
  for (const name of ['missing-root', 'missing-panel', 'missing-nested']) write(`docs/${name}.md`, '# Guide\n')
  expect(scanDocReferences(root)).toEqual({ checked: 3, violations: [] })
})

it('retains reference package discovery and README checks while using its own source-style checks', () => {
  const { root, write } = fixture()
  const plugin = 'plugins/dsh-superagent-prototype'
  write(`${plugin}/package.json`, '{}')
  write(`${plugin}/src/index.ts`, 'export function action(): void {}')
  write(`${plugin}/src/client/Panel.tsx`, 'export function Panel() { return <p>Reference copy</p> }')
  write(`${plugin}/README.md`, '# Reference\n')
  expect(pluginPackageJsons(root)).toEqual([`${plugin}/package.json`])
  expect(packageReadmes(root)).toEqual([`${plugin}/README.md`])
  expect(packageReadmeSummaryErrors(`${plugin}/README.md`, '# Reference\n')).not.toEqual([])
  expect(clientUiSourceFiles(root)).toEqual([])
  expect(collectExportJsdocViolations(root)).toEqual([])
  expect(isReferencePluginPath('plugins\\dsh-superagent-prototype\\src\\index.ts')).toBe(true)
  expect(isReferencePluginPath('plugins/dsh-superagent-prototype-other/src/index.ts')).toBe(false)
})

it('resolves submodule-owned documentation without accepting missing references', () => {
  const { root, write } = fixture()
  write('plugins/root/docs/deployment.md', '# Deployment\n')
  write('plugins/root/src/index.ts', '// See docs/deployment.md and docs/missing.md\n')
  write('plugins/other/src/index.ts', '// See docs/deployment.md\n')
  expect(scanDocReferences(root).violations.map(v => [v.file, v.ref])).toEqual([
    ['plugins/other/src/index.ts', 'docs/deployment.md'],
    ['plugins/root/src/index.ts', 'docs/missing.md'],
  ])
})
