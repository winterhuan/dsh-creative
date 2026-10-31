import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
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

describe('built story CLI', () => {
  it('runs the packaged bin after relocation from an unrelated workspace', async (context) => {
    const root = await temporary(context)
    const installed = join(root, 'installed plugin')
    const workspace = join(root, 'workspace')
    await mkdir(installed, { recursive: true })
    await mkdir(workspace)
    const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as { bin: Record<string, string> }
    const launcher = manifest.bin['dsh-story']!
    await cp(join(packageRoot, 'package.json'), join(installed, 'package.json'))
    await cp(join(packageRoot, 'lib'), join(installed, 'lib'), { recursive: true })
    await cp(join(packageRoot, 'knowledge'), join(installed, 'knowledge'), { recursive: true })
    const book = '雨夜 $(literal)'
    const result = await execa(process.execPath, [join(installed, launcher), 'project', 'init',
      '--workspace', workspace, '--book', book, '--kind', 'short', '--json'], { cwd: workspace })
    expect(result.exitCode).toBe(0)
    const checked = await execa(process.execPath, [join(installed, launcher), 'project', 'status',
      '--workspace', workspace, '--book', book, '--json'], { cwd: workspace })
    expect(JSON.parse(checked.stdout)).toMatchObject({ initialized: false })
    await expect(readFile(join(workspace, book, '追踪/_tracking-state.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    const planned = await execa(process.execPath, [join(installed, launcher), 'short', 'plan-check',
      '--workspace', workspace, '--book', book, '--json'], { cwd: workspace, reject: false })
    expect(planned.exitCode).toBe(1)
    expect(JSON.parse(planned.stdout)).toMatchObject({ verifier: 'story-short-write.phase2-contract', ok: false })
  })

  it('reports an unknown command as a structured error without a shell or interpreter', async (context) => {
    const root = await temporary(context)
    const result = await execa(process.execPath, [join(packageRoot, 'lib/cli.js'), '--help'], { env: { PATH: root }, reject: false })
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout)).toMatchObject({ schema: 'story-cli-error/v1', error_code: 'INVALID_ARGUMENT' })
  })
})
