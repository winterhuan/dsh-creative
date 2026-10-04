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

describe('story detection CLI adapter', () => {
  it('passes the selected book to the CLI and keeps the credential out of command arguments', async () => {
    const resolve = vi.fn((request: unknown) => request)
    const shell = {
      resolve,
      execute: vi.fn(async () => ({ result: async () => ({
        aborted: false, timedOut: false, signal: null, exitCode: 3,
        stdout: { text: '{"error":{"code":"auth_failed"}}' }, stderr: { text: '' },
      }) })),
    }
    const secret = 'dummy-makers-secret'
    const credentials = { resolve: vi.fn(async () => ({ value: secret, source: 'store' })) }
    const agent = {
      session: { header: { cwd: '/workspace' } },
      ctx: { get: (name: string) => name === 'shell' ? shell : name === 'credentials' ? credentials : undefined },
    } as Agent
    const result = await createCreativeProduceRunTool().execute({
      book: '雨夜', file: "正文/第1章'余音.md", out: '.story-polish/report.json', max_chars: 10000,
    }, execution(agent))
    expect(result).toMatchObject({ kind: 'foreground', exitCode: 3 })
    expect(resolve).toHaveBeenCalledOnce()
    const request = resolve.mock.calls[0]![0] as { command: string; workdir: string; env: Record<string, string> }
    expect(request.command).toContain("/lib/cli.js' 'detect' 'zhuque' '--workspace' '/workspace' '--book' '雨夜'")
    expect(request.command).toContain("'--file' '正文/第1章'\"'\"'余音.md'")
    expect(request.command).toContain("'--out' '.story-polish/report.json'")
    expect(request.command).not.toContain(secret)
    expect(request.env).toEqual({ MAKERS_API_KEY: secret })
    expect(request.workdir).toBe('/workspace')
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
