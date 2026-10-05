import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JobHandle, JobSpec } from '@deepseek-ai/dsh-jobs'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext, ToolRuntime } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createCreativeProduceRunTool,
  CREATIVE_PRODUCE_RUN_TOOL_NAME,
} from '../src/produce-tool.ts'

vi.mock('node:fs/promises', () => ({ stat: vi.fn() }))

const mockedStat = vi.mocked(stat)

function agentWith(services: Record<string, unknown>): Agent {
  return {
    session: { id: 'session-own', header: { cwd: resolve('/work/story') } },
    ctx: { get: (name: string) => services[name] },
  } as Agent
}

function execWith(agent: Agent | undefined, signal = new AbortController().signal): ToolRunContext {
  const callId = 'call-1' as ToolRunContext['callId']
  return {
    ...(agent === undefined ? {} : { agent }), signal, callId, rootCallId: callId,
    name: CREATIVE_PRODUCE_RUN_TOOL_NAME,
    arguments: {},
    token: Symbol('tool') as ToolRunContext['token'],
    deferContext: vi.fn(),
    concludeTurn: vi.fn(),
  }
}

function shellMock() {
  return {
    shell: {
      resolve: vi.fn((request: unknown) => request),
      execute: vi.fn(async () => ({
        kill: vi.fn(() => true),
        done: Promise.resolve(),
        exitCode: 0 as number | null,
        observed: {
          stdout: { readFrom: (fromByte: number) => ({ text: 'partial', nextOffset: fromByte + 7, lossy: false }) },
          stderr: { readFrom: (fromByte: number) => ({ text: '', nextOffset: fromByte, lossy: false }) },
        },
        readOutput: () => ({ delta: 'partial', lossy: false, nextOffset: 7 }),
        result: async () => ({
          aborted: false, timedOut: false,
          signal: null as NodeJS.Signals | null,
          exitCode: 0 as number | null,
          stdout: { text: '{"state":"succeeded"}', truncated: false },
          stderr: { text: '', truncated: false },
        }),
      })),
    },
  }
}

describe('video_produce_run', () => {
  beforeEach(() => {
    mockedStat.mockReset()
    mockedStat.mockResolvedValue({ isFile: () => true } as Awaited<ReturnType<typeof stat>>)
  })

  it.each(['video-recap'])('never retries the whole %s command after an adapter failure', async (entry) => {
    const { shell } = shellMock()
    shell.execute.mockResolvedValue({
      kill: vi.fn(() => true), done: Promise.resolve(), exitCode: 2, readOutput: () => ({ delta: '', lossy: false, nextOffset: 0 }),
      observed: { stdout: { readFrom: (fromByte: number) => ({ text: '', nextOffset: fromByte, lossy: false }) }, stderr: { readFrom: (fromByte: number) => ({ text: '', nextOffset: fromByte, lossy: false }) } },
      result: async () => ({
        aborted: false, timedOut: false, signal: null, exitCode: 2,
        stdout: { text: '{"error":{"category":"authentication","submission_rejected":true}}', truncated: false },
        stderr: { text: 'confirmation was consumed', truncated: false },
      }),
    })
    const agent = agentWith({ shell, credentials: { resolve: async () => ({ value: 'dummy-a\ndummy-b' }) } })
    const args = { entry }
    const result = await createCreativeProduceRunTool().execute(args, execWith(agent))
    expect(result).toMatchObject({ kind: 'foreground', exitCode: 2 })
    expect(shell.execute).toHaveBeenCalledTimes(1)
  })

  it('forwards profile settings and preserves video stdin, paths and policy', async () => {
    const { shell } = shellMock()
    const resolvePolicy = vi.fn(() => ({ mode: 'workspace-write' }))
    const agent = agentWith({ shell, sandboxPolicy: { resolve: resolvePolicy } })
    const tool = createCreativeProduceRunTool({ entry: { seedanceModel: 'seedance-2-5', ttsProvider: 'auto' } })
    await tool.execute({ entry: 'video-voiceover', argv: ['--help'], stdin: 'input', workdir: resolve('/abs/studio'), timeoutMs: 60_000 }, execWith(agent))
    const first = shell.resolve.mock.calls[0]?.[0] as Record<string, unknown>
    expect(first).toMatchObject({ workdir: resolve('/abs/studio'), timeoutMs: 60_000, stdin: 'input', sandboxPolicy: { mode: 'workspace-write' } })
    expect(first.env).toEqual({ TTS_PROVIDER: 'auto' })
    expect(first.command).toContain('voiceover.py')
    await tool.execute({ entry: 'video-recap' }, execWith(agent))
    expect((shell.resolve.mock.calls[1]?.[0] as Record<string, unknown>).command).toContain('recap.py')
    await tool.execute({ entry: 'video-doctor', workdir: 'video-recaps/demo' }, execWith(agent))
    expect(shell.resolve.mock.calls[2]?.[0]).toMatchObject({ workdir: resolve('/work/story/video-recaps/demo'), command: expect.stringContaining('doctor.py') })
  })


})
