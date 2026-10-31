import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const script = fileURLToPath(new URL('../skills/story-zhuque/scripts/detect.mjs', import.meta.url))

function run(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number, stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { env })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.on('error', reject)
    child.on('close', code => { resolve({ code: code ?? 1, stdout }) })
  })
}

it('stops before any network call when the credential is missing or the text is too short', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-writer-zhuque-'))
  try {
    const file = join(dir, '第001章.md')
    await writeFile(file, '短')
    const missing = await run(['--file', file], { PATH: process.env.PATH })
    expect(missing.code).toBe(3)
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: 'missing_credential' } })
    expect(missing.stdout).not.toContain('super-secret')
    const short = await run(['--file', file], { ...process.env, MAKERS_API_KEY: 'super-secret' })
    expect(short.code).toBe(2)
    expect(JSON.parse(short.stdout).error.code).toBe('text_too_short')
    expect(short.stdout).not.toContain('super-secret')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
