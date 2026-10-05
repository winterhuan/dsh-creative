import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'

const script = fileURLToPath(new URL('../runtime/storyctl.py', import.meta.url))
const python = process.platform === 'win32' ? 'python' : 'python3'

it('queries 500-chapter continuity without writes, omissions or stale pages', async context => {
  const child = execa(python, [fileURLToPath(new URL('./fixtures/knowledge-project-query.py', import.meta.url)), script], {
    env: { PYTHONDONTWRITEBYTECODE: '1' }, reject: false, cancelSignal: context.signal,
  })
  context.onTestFinished(async () => { child.kill('SIGKILL'); await child })
  const result = await child
  expect(result.isCanceled).toBe(false)
  expect(result.signal).toBeUndefined()
  expect(result.exitCode, result.stderr).toBe(0)
  expect(result.stderr).toContain('Ran 10 tests')
})

it('exposes structured status, filters and argument failures through the shipped CLI', async context => {
  const root = await mkdtemp(join(tmpdir(), 'story-query-cli-'))
  context.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const cwd = join(root, '书')
  await mkdir(join(cwd, '追踪'), { recursive: true })
  await writeFile(join(cwd, '追踪/_tracking-state.json'), await readFile(new URL('./fixtures/continuity-state.json', import.meta.url)))
  const cli = fileURLToPath(new URL('../runtime/cli.py', import.meta.url))
  for (const [args, code, expected] of [
    [['status'], 0, { initialized: true, through_chapter: 500 }],
    [['query', '--kind', 'foreshadow', '--filter', 'due'], 0, { total: 2 }],
    [['query', '--kind', 'foreshadow', '--revision', '6'], 2, { error_code: 'INVALID_INPUT' }],
    [['query', '--kind', 'invalid'], 2, { error_code: 'INVALID_ARGUMENT' }],
  ] as const) {
    const child = execa(python, [cli, 'project', ...args, '--workspace', root, '--book', '书'], {
      env: { PYTHONDONTWRITEBYTECODE: '1' }, reject: false, cancelSignal: context.signal,
    })
    context.onTestFinished(async () => { child.kill('SIGKILL'); await child })
    const result = await child
    expect(result.signal).toBeUndefined()
    expect(result.exitCode, result.stderr).toBe(code)
    expect(JSON.parse(result.stdout)).toMatchObject(expected)
  }
})
