import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('checks native Windows process ownership, readiness, and command installation', () => {
  const result = spawnSync('python3', [resolve(import.meta.dirname, 'dsh-sre-windows.py')], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, PYTHONUTF8: '1' },
  })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr + result.stdout).toBe(0)
  expect(result.stderr).toMatch(/Ran \d+ tests/)
}, 65_000)
