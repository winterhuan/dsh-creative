import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'

const python = process.platform === 'win32' ? 'python' : 'python3'
const skills = ['video-understanding', 'video-script', 'video-cut', 'video-assemble']

const networkGuard = `import sys

def reject_network(event, args):
    if event in {"socket.connect", "socket.connect_ex", "socket.bind", "socket.sendto", "socket.getaddrinfo", "urllib.Request", "http.client.connect"}:
        raise RuntimeError("Offline knowledge self-test attempted network access: " + event)

sys.addaudithook(reject_network)
`

async function runSelftest(context: TestContext, args: string[]) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-video-selftest-'))
  try {
    await writeFile(join(directory, 'sitecustomize.py'), networkGuard)
    const child = execa(python, ['-B', ...args], {
      cwd: directory,
      cancelSignal: context.signal,
      reject: false,
      stripFinalNewline: false,
      env: {
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONPATH: directory,
        PYTHONNOUSERSITE: '1',
        TMPDIR: directory,
        TMP: directory,
        TEMP: directory,
      },
    })
    context.onTestFinished(async () => {
      child.kill('SIGKILL')
      await child
    })
    const result = await child
    expect(result.timedOut).toBe(false)
    expect(result.isCanceled).toBe(false)
    expect(result.signal).toBeUndefined()
    return result
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('bundled video-recap offline selftests', () => {
  for (const skill of skills) {
    it(`runs ${skill} with isolated temporary files and no network`, async (context) => {
      const entry = resolve(
        import.meta.dirname,
        '../../video-recap/knowledge/video-recap/skills',
        skill,
        'scripts/selftest.py',
      )
      const result = await runSelftest(context, [entry])
      expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
      expect(result.stdout.trim().split('\n').at(-1)).toMatch(/^\d+ self-tests passed$/u)
    })
  }

  it('renders a synthetic keyless draft and finished episode with real media streams', async (context) => {
    const result = await runSelftest(context, [resolve(import.meta.dirname, 'fixtures/media-delivery.py')])
    expect(result.exitCode, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout.trim()).toBe('15 self-tests passed')
  }, 120_000)

  it('rejects network access before opening a connection', async (context) => {
    const result = await runSelftest(context, [
      '-c', 'import socket; socket.socket().connect(("127.0.0.1", 1))',
    ])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Offline knowledge self-test attempted network access: socket.connect')
  })
})
