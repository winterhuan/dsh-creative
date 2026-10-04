import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'

const packageRoot = resolve(import.meta.dirname, '..')

async function temporary(context: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-story-launcher-'))
  context.onTestFinished(() => rm(path, { recursive: true, force: true }))
  return path
}

describe('built story CLI launcher', () => {
  it('runs the packaged bin after relocation from an unrelated workspace', async (context) => {
    const root = await temporary(context)
    const installed = join(root, 'installed plugin')
    const workspace = join(root, 'workspace')
    await mkdir(join(installed, 'lib'), { recursive: true })
    await mkdir(workspace)
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { bin: Record<string, string> }
    const launcher = manifest.bin['dsh-story']!
    await cp(join(packageRoot, launcher), join(installed, launcher))
    await cp(join(packageRoot, 'runtime'), join(installed, 'runtime'), { recursive: true })
    await cp(join(packageRoot, 'knowledge'), join(installed, 'knowledge'), { recursive: true })
    const book = '雨夜 $(literal)'
    const result = await execa(process.execPath, [join(installed, launcher), 'project', 'init',
      '--workspace', workspace, '--book', book, '--kind', 'short', '--json'], { cwd: workspace })
    expect(result.exitCode).toBe(0)
    const checked = await execa(process.execPath, [join(installed, launcher), 'project', 'status',
      '--workspace', workspace, '--book', book, '--json'], { cwd: workspace })
    expect(JSON.parse(checked.stdout)).toMatchObject({ initialized: false })
    await expect(readFile(join(workspace, book, '追踪/_tracking-state.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports a missing interpreter without requiring a shell or global CLI installation', async (context) => {
    const root = await temporary(context)
    const result = await execa(process.execPath, [join(packageRoot, 'lib/cli.js'), '--help'], {
      env: { PATH: root }, reject: false,
    })
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout)).toMatchObject({ error_code: 'PYTHON_UNAVAILABLE' })
  })

  // POSIX process groups are the launcher’s cancellation mechanism; Windows does not provide them.
  it.skipIf(process.platform === 'win32')('terminates its Python and Node descendants when cancelled', async (context) => {
    const root = await temporary(context)
    await mkdir(join(root, 'lib'))
    await mkdir(join(root, 'runtime'))
    await cp(join(packageRoot, 'lib/cli.js'), join(root, 'lib/cli.js'))
    await writeFile(join(root, 'runtime/cli.py'), `import json, os, subprocess
child = subprocess.Popen([os.environ['DSH_STORY_NODE'], '-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], stdout=subprocess.PIPE)
child.stdout.read(5)
print(json.dumps({'python': os.getpid(), 'node': child.pid}), flush=True)
child.wait()
`)
    const child = spawn(process.execPath, [join(root, 'lib/cli.js')], { stdio: ['ignore', 'pipe', 'pipe'] })
    const closed = new Promise<number | null>((done, reject) => {
      child.once('close', done)
      child.once('error', reject)
    })
    context.onTestFinished(async () => { child.kill('SIGTERM'); await closed })
    const identity = await new Promise<{ python: number; node: number }>((done, reject) => {
      child.stdout.once('data', (data: Buffer) => {
        try { done(JSON.parse(data.toString('utf8'))) }
        catch (error) { reject(error) }
      })
      child.once('error', reject)
      child.once('exit', () => reject(new Error('Launcher exited before child readiness.')))
    })
    child.kill('SIGTERM')
    expect(await closed).toBe(143)
    await expect.poll(() => {
      for (const pid of Object.values(identity)) {
        try { process.kill(pid, 0); return false }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
      }
      return true
    }).toBe(true)
  })
})
