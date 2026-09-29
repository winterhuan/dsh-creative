/**
 * Run one named group of package.json check scripts in order and report every failure, so a
 * failing check does not hide the result of the checks after it. Each group member is a
 * package.json script; the group is chosen by the single CLI argument.
 */

import { spawnSync } from 'node:child_process'

/** Check groups by name; each entry names a package.json script. */
const GROUPS: Readonly<Record<string, readonly string[]>> = {
  docs: [
    'verify-md-wrap',
    'verify-md-links',
    'verify-translation-pairing',
    'verify-translation-prompt',
    'verify-agent-note-classification',
    'verify-agent-note-format',
    'verify-archived-agent-notes',
    'verify-concrete-terms',
    'verify-repository-references',
    'verify-public-repository-links',
    'verify-doc-refs',
    'verify-doc-budgets',
    'verify-skill-invocation-metadata',
    'verify-package-readme-summaries',
    'verify-package-readme-model-experience',
    'verify-package-readme-limitations',
  ],
  hygiene: [
    'verify-client-ui-i18n',
    'verify-no-unknown-casts',
    'verify-export-jsdoc',
  ],
}

const group = process.argv[2]
const scripts = group === undefined || process.argv.length !== 3 ? undefined : GROUPS[group]
if (group === undefined || scripts === undefined) {
  console.error(`run-checks: usage: tsx scripts/run-checks.ts <${Object.keys(GROUPS).join(' | ')}>`)
  process.exit(2)
}

const failed: string[] = []
for (const script of scripts) {
  const result = spawnSync('pnpm', ['--silent', 'run', script], { stdio: 'inherit' })
  if (result.status !== 0) failed.push(script)
}

if (failed.length > 0) {
  console.error(`run-checks ${group}: ${failed.length} of ${scripts.length} check(s) failed: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`run-checks ${group}: all ${scripts.length} check(s) passed.`)
