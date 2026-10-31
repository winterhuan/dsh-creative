import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { createCreativeProduceRunTool } from '../src/produce-tool.ts'

function execution(agent: Agent): ToolRunContext {
  const callId = 'detection-call' as ToolRunContext['callId']
  return {
    agent, callId, rootCallId: callId, name: 'story_zhuque', arguments: {},
    signal: new AbortController().signal, token: Symbol('tool') as ToolRunContext['token'],
    deferContext: vi.fn(), concludeTurn: vi.fn(),
  }
}

interface ShellRequest { readonly command: string; readonly workdir: string; readonly env?: Record<string, string>; readonly stdin?: string }

/** A Session whose credential store holds `stored` (one key per line) and whose shell records the request it receives. */
function session(stored: string | undefined) {
  const resolve = vi.fn((request: unknown) => request)
  const shell = {
    resolve,
    execute: vi.fn(async () => ({ result: async () => ({
      aborted: false, timedOut: false, signal: null, exitCode: 3,
      stdout: { text: '{"ok":false,"key_attempts":2,"error":{"code":"auth_failed"}}' }, stderr: { text: '' },
    }) })),
  }
  const credentials = { resolve: vi.fn(async () => stored === undefined ? undefined : { value: stored, source: 'store' }) }
  const agent = {
    session: { header: { cwd: '/workspace' } },
    ctx: { get: (name: string) => name === 'shell' ? shell : name === 'credentials' ? credentials : undefined },
  } as Agent
  return { agent, resolve, request: () => resolve.mock.calls[0]![0] as ShellRequest }
}

describe('story detection CLI adapter', () => {
  it('passes the selected book to the CLI and hands the key pool to one process on stdin', async () => {
    const { agent, resolve, request } = session('dummy-makers-first\n dummy-makers-second \ndummy-makers-first')
    const result = await createCreativeProduceRunTool().execute({
      book: '雨夜', file: "正文/第1章'余音.md", out: '.story-polish/report.json', max_chars: 10000,
    }, execution(agent))
    expect(result).toMatchObject({ kind: 'foreground', exitCode: 3 })
    expect(resolve).toHaveBeenCalledOnce()
    const { command, workdir, env, stdin } = request()
    expect(command).toContain("/lib/cli.js' 'detect' 'zhuque' '--workspace' '/workspace' '--book' '雨夜'")
    expect(command).toContain("'--file' '正文/第1章'\"'\"'余音.md'")
    expect(command).toContain("'--out' '.story-polish/report.json'")
    expect(command).toContain("'--credential-pool-stdin'")
    expect(command).not.toContain('dummy-makers')
    expect(env).toBeUndefined()
    expect(stdin).toBe(JSON.stringify(['dummy-makers-first', 'dummy-makers-second']))
    expect(workdir).toBe('/workspace')
  })

  it('caps the pool at the detector attempt limit', async () => {
    const stored = Array.from({ length: 20 }, (_, index) => `dummy-makers-${String(index)}`)
    const { agent, request } = session(stored.join('\n'))
    await createCreativeProduceRunTool().execute({ book: '雨夜', file: '正文.md' }, execution(agent))
    const pool: unknown = JSON.parse(request().stdin ?? '[]')
    expect(pool).toEqual(stored.slice(0, 16))
  })

  it('runs without a pool when no credential resolves, so the CLI reports the missing key', async () => {
    const { agent, request } = session(undefined)
    await createCreativeProduceRunTool().execute({ book: '雨夜', file: '正文.md' }, execution(agent))
    const { command, stdin } = request()
    expect(command).not.toContain('credential-pool-stdin')
    expect(stdin).toBeUndefined()
  })

  it('does not resolve secrets or launch a process for a cancelled call', async () => {
    const get = vi.fn()
    const agent = { session: { header: { cwd: '/workspace' } }, ctx: { get: (name: string) => { get(name); return undefined } } } as Agent
    const exec = execution(agent)
    const abort = new AbortController()
    abort.abort()
    await expect(createCreativeProduceRunTool().execute({ book: '雨夜', file: '正文.md' }, {
      ...exec, signal: abort.signal,
    })).rejects.toThrow('aborted')
    expect(get).not.toHaveBeenCalled()
  })
})
