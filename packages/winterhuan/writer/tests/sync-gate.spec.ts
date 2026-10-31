import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, resolveWriterSyncPreset } from '../src/index.ts'

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

it('prefers event and live composed presets over a frozen header', () => {
  expect(resolveWriterSyncPreset({
    eventPreset: 'writer',
    composedPreset: 'standard',
    headerPreset: 'standard',
  })).toBe('writer')
  expect(resolveWriterSyncPreset({
    composedPreset: 'writer',
    headerPreset: 'standard',
  })).toBe('writer')
  expect(resolveWriterSyncPreset({
    headerPreset: 'standard',
  })).toBe('standard')
  expect(resolveWriterSyncPreset({
    eventPreset: 'standard',
    composedPreset: 'writer',
    headerPreset: 'writer',
  })).toBe('standard')
})

it('syncs on agent-preset/selected when the event is writer even if the header stayed standard', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-writer-sync-gate-'))
  tempDirs.push(workspace)
  await mkdir(join(workspace, '.git'))

  let composed: string | undefined = 'standard'
  const agent = {
    session: { id: 's1', header: { cwd: workspace, agentPreset: 'standard' as string | undefined } },
    ctx: new Context(),
  }
  const context = new Context()
  context.provide('agents', { get: (id: string) => id === 's1' ? agent : undefined })
  context.provide('agentPresets', { composedPreset: () => composed })
  apply(context, { skillMount: 'workspace' })
  const host = context.get('writerHost')
  expect(host).toBeDefined()
  const sync = vi.spyOn(host!, 'sync').mockResolvedValue({
    copied: [],
    skipped: [],
    root: workspace,
    destination: join(workspace, '.agents/skills'),
  })

  context.emit('agent/created', { agent })
  await Promise.resolve()
  expect(sync).not.toHaveBeenCalled()

  context.emit('agent-preset/selected', 's1', 'writer')
  await Promise.resolve()
  expect(sync).toHaveBeenCalledWith(workspace, false)

  sync.mockClear()
  composed = 'writer'
  context.emit('agent/created', { agent })
  await Promise.resolve()
  expect(sync).toHaveBeenCalledWith(workspace, false)

  sync.mockClear()
  context.emit('agent-preset/selected', 's1', 'standard')
  await Promise.resolve()
  expect(sync).not.toHaveBeenCalled()
})
