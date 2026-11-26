import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'

const script = resolve(import.meta.dirname, '../ops/dsh-sre/dsh-sre')

it.each([
  { installed: [] },
  { installed: ['story'] },
  { installed: ['writer'] },
  { installed: ['writer', 'story'] },
])('restart all includes only installed writing profiles: $installed', ({ installed }) => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-sre-'))
  onTestFinished(() => rmSync(home, { recursive: true, force: true }))
  const base = ['webctl', 'student', 'superagent', 'antfarm', 'media']
  const bin = join(home, '.dsh/bin')
  mkdirSync(bin, { recursive: true })
  for (const name of [...base, 'writer', 'story']) writeFileSync(join(bin, `dsh-${name}`), '')
  for (const name of installed) {
    const profile = join(home, '.dsh/profiles', name)
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), '{}')
    writeFileSync(join(profile, 'cordis.yml'), '[]')
  }
  // Keep controller calls inside the child so this test cannot reach host services.
  const result = spawnSync('python3', ['-c', `
import json, runpy, sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
script = sys.argv.pop(1)
calls = []
def run(args, **kwargs):
    calls.append(args)
    return SimpleNamespace(returncode=0, stdout='{"pids": []}', stderr='')
with patch('sys.platform', 'linux'), patch('subprocess.run', side_effect=run):
    try:
        runpy.run_path(script, run_name='__main__')
    except SystemExit as error:
        if error.code:
            raise
print('RESTARTED=' + json.dumps([Path(args[0]).name for args in calls if args[1] == 'restart']))
`, script, 'restart', 'all'], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
  })
  expect(result.error).toBeUndefined()
  expect(result.signal).toBeNull()
  expect(result.status, result.stderr).toBe(0)
  const line = result.stdout.split('\n').find(value => value.startsWith('RESTARTED='))
  expect(line).toBeDefined()
  expect(JSON.parse(line!.slice('RESTARTED='.length)).sort()).toEqual(
    [...base, ...installed].map(name => `dsh-${name}`).sort(),
  )
})
