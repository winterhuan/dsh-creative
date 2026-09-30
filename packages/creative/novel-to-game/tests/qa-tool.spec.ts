import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JobHandle, JobSpec } from '@deepseek-ai/dsh-jobs'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { createGameQaTool } from '../src/qa-tool.ts'

function fixture(signal = new AbortController().signal) {
  const kill = vi.fn()
  const process = {
    kill, done: Promise.resolve(), exitCode: 0,
    observed: { stdout: { readFrom: () => ({ text: 'evidence', nextOffset: 8, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
    result: async () => ({ aborted: false, exitCode: 0, timedOut: false, signal: null, stdout: { text: 'PASS' }, stderr: { text: '' } }),
  }
  const shell = { resolve: vi.fn(value => value), execute: vi.fn(async () => process) }
  const jobs = { start: vi.fn((_spec: JobSpec) => 'job-game') }
  const policy = { resolve: vi.fn(() => ({ mode: 'workspace' })) }
  const services: Record<string, unknown> = { shell, jobs, sandboxPolicy: policy }
  const agent = { session: { id: 'session-game', header: { cwd: '/workspace' } }, ctx: { get: (key: string) => services[key] } } as Agent
  const exec = { agent, signal, name: 'game_qa' } as ToolRunContext
  return { shell, jobs, policy, exec, kill }
}

describe('game QA execution', () => {
  it('uses the session workspace and sandbox without accessing media settings', async () => {
    const f = fixture()
    expect(await createGameQaTool().execute({ project: 'game-adaptations/demo' }, f.exec)).toMatchObject({ kind: 'foreground', exitCode: 0, stdout: 'PASS' })
    expect(f.shell.resolve).toHaveBeenCalledWith(expect.objectContaining({ workdir: '/workspace', signal: f.exec.signal, sandboxPolicy: { mode: 'workspace' }, env: expect.objectContaining({ DSH_GAME_QA_SESSION: 'session-game' }) }))
    expect(f.shell.resolve.mock.calls[0]![0].command).toContain('/game-qa/scripts/run_qa.py')
  })

  it.each(['../escape', 'game-adaptations/../escape', 'game-adaptations/demo\0'])('rejects unsafe project %s before execution', async project => {
    const f = fixture()
    await expect(createGameQaTool().execute({ project }, f.exec)).rejects.toThrow('project must name')
    expect(f.shell.execute).not.toHaveBeenCalled()
  })

  it('does not launch an already cancelled call', async () => {
    const f = fixture(AbortSignal.abort())
    await expect(createGameQaTool().execute({ project: 'game-adaptations/demo' }, f.exec)).rejects.toThrow('aborted')
    expect(f.shell.execute).not.toHaveBeenCalled()
  })

  it('cancels a background job while shell startup is pending', async () => {
    const f = fixture()
    let release!: () => void
    const barrier = new Promise<void>(resolve => { release = resolve })
    const execute = f.shell.execute.getMockImplementation()!
    f.shell.execute.mockImplementation(async () => { await barrier; return execute() })
    expect(await createGameQaTool().execute({ project: 'game-adaptations/demo', run_in_background: true }, f.exec)).toEqual({ kind: 'background', jobId: 'job-game' })
    const spec = f.jobs.start.mock.calls[0]![0]
    expect(spec.owner).toBe('session-game')
    const handle = spec.run({} as JobHandle)
    await handle.cancel!()
    release()
    await handle.done
    expect(f.kill).toHaveBeenCalledOnce()
    expect(f.shell.resolve.mock.calls[0]![0].signal.aborted).toBe(true)
  })
})
