/** Host override behavior: which creations adopt a project default, and how failures are contained. */

import { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cordis'
import type { Agent, SessionStartSource } from '@deepseek-ai/dsh-agent'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, ruleForWorkspace, type Config } from '../src/index.ts'
import type { ProjectDefaultRule } from '../src/types.ts'

/** A writable Volatile double: the settings form replaces the snapshot in place. */
function volatileRules(initial: readonly ProjectDefaultRule[]): Volatile<ProjectDefaultRule[]> & { set(next: ProjectDefaultRule[]): void } {
  let current: ProjectDefaultRule[] = [...initial]
  return {
    get: () => current,
    set: (next) => { current = next },
  }
}

/** A minimal live Agent double carrying only the header and context the listener reads. */
function stubAgent(options: {
  cwd?: string
  parentSession?: SessionId
  origin?: 'subagent'
  headerPreset?: string
} = {}): Agent {
  const header = {
    id: SessionId('session-one'),
    ...options.cwd === undefined ? {} : { cwd: options.cwd },
    ...options.parentSession === undefined ? {} : { parentSession: options.parentSession },
    ...options.origin === undefined ? {} : { origin: options.origin },
    ...options.headerPreset === undefined ? {} : { agentPreset: options.headerPreset },
  }
  return {
    id: SessionId('session-one'),
    ctx: new Context(),
    session: { header } as never,
  } as never
}

/** One composed Host context with the optional services the override reads. */
async function bench(options: {
  rules?: readonly ProjectDefaultRule[]
  workspaces?: Map<string, { id: string }>
  composed?: string | undefined
  defaultId?: string
  select?: (agent: Agent, preset: string) => Promise<string>
} = {}): Promise<{
  select: ReturnType<typeof vi.fn>
  warnings: string[]
  fire: (agent: Agent, source: SessionStartSource) => Promise<void>
}> {
  const ctx = new Context()
  const warnings: string[] = []
  ctx.logger.warn = ((message: unknown) => { warnings.push(String(message)) }) as typeof ctx.logger.warn
  const select = vi.fn(options.select ?? (async (_agent: Agent, preset: string) => preset))
  if (options.workspaces !== undefined) {
    const workspaces = options.workspaces
    ctx.provide('workspaceRegistry', {
      resolveByPath: async (path: string) => workspaces.get(path),
    } as never)
  }
  ctx.provide('agentPresets', {
    select,
    composedPreset: () => options.composed,
    defaultId: options.defaultId ?? 'standard',
  } as never)
  let fire: (agent: Agent, source: SessionStartSource) => Promise<void> = async () => {}
  await ctx.plugin({
    apply(child: Context) {
      apply(child, { rules: volatileRules(options.rules ?? []) } as Config)
      // The Host dispatches this event serially and awaits every listener.
      fire = (agent, source) => child.serial('agent/created', { agent, source })
    },
  })
  return { select, warnings, fire }
}

const WORKSPACES = new Map([['/projects/novel', { id: 'ws-novel' }]])

afterEach(() => { vi.restoreAllMocks() })

describe('project default mode host', () => {
  it('composes the project default on a fresh session under a ruled workspace', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }], workspaces: WORKSPACES })
    await b.fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(b.select).toHaveBeenCalledOnce()
    expect(b.select.mock.calls[0]![1]).toBe('story')
  })

  it('leaves a session in a workspace without a rule on the global default', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-other', agentPreset: 'story' }], workspaces: WORKSPACES })
    await b.fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
  })

  it('leaves a session outside any workspace untouched', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }], workspaces: WORKSPACES })
    await b.fire(stubAgent({ cwd: '/tmp/scratch' }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
    expect(b.warnings).toEqual([])
  })

  it.each(['resume', 'clear', 'compact'] as const)('never retargets a %s session', async (source) => {
    const b = await bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }], workspaces: WORKSPACES })
    await b.fire(stubAgent({ cwd: '/projects/novel' }), source)
    expect(b.select).not.toHaveBeenCalled()
  })

  it('never retargets a forked child, which inherits its parent composition', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }], workspaces: WORKSPACES })
    await b.fire(stubAgent({ cwd: '/projects/novel', parentSession: SessionId('session-parent') }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
  })

  it('never retargets a subagent child', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }], workspaces: WORKSPACES })
    await b.fire(stubAgent({ cwd: '/projects/novel', origin: 'subagent' }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
  })

  it('skips a session already composing the ruled preset, so no redundant event is logged', async () => {
    const b = await bench({
      rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }],
      workspaces: WORKSPACES,
      composed: 'story',
    })
    await b.fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
  })

  it('never retargets a creation that named a preset other than the global default', async () => {
    // A webhook or SDK caller that mounts an explicit preset resolves its own
    // composition; the project default must not rewrite it.
    const b = await bench({
      rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }],
      workspaces: WORKSPACES,
      composed: 'ptc',
      defaultId: 'standard',
    })
    await b.fire(stubAgent({ cwd: '/projects/novel', headerPreset: 'ptc' }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
  })

  it('retargets a web-client creation, whose header resolves to the global default', async () => {
    const b = await bench({
      rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }],
      workspaces: WORKSPACES,
      composed: 'standard',
      defaultId: 'standard',
    })
    await b.fire(stubAgent({ cwd: '/projects/novel', headerPreset: 'standard' }), 'startup')
    expect(b.select.mock.calls[0]![1]).toBe('story')
  })

  it('applies the last rule for a workspace', async () => {
    const b = await bench({
      rules: [
        { workspaceId: 'ws-novel', agentPreset: 'story' },
        { workspaceId: 'ws-novel', agentPreset: 'cordis' },
      ],
      workspaces: WORKSPACES,
    })
    await b.fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(b.select.mock.calls[0]![1]).toBe('cordis')
  })

  it('contains a refused select: creation survives and the refusal is logged', async () => {
    const b = await bench({
      rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }],
      workspaces: WORKSPACES,
      select: async () => { throw new Error('agent-preset/locked: This session has already started') },
    })
    await expect(b.fire(stubAgent({ cwd: '/projects/novel' }), 'startup')).resolves.toBeUndefined()
    expect(b.warnings).toHaveLength(1)
    expect(b.warnings[0]).toContain('kept its default preset')
    expect(b.warnings[0]).toContain('agent-preset/locked')
  })

  it('does nothing while the workspace registry is absent', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }] })
    await b.fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(b.select).not.toHaveBeenCalled()
    expect(b.warnings).toEqual([])
  })

  it('observes a rule edited after activation through the volatile reference', async () => {
    const rules = volatileRules([])
    const ctx = new Context()
    const select = vi.fn(async (_agent: Agent, preset: string) => preset)
    ctx.provide('workspaceRegistry', {
      resolveByPath: async (path: string) => WORKSPACES.get(path),
    } as never)
    ctx.provide('agentPresets', { select, composedPreset: () => undefined } as never)
    let fire!: (agent: Agent, source: SessionStartSource) => Promise<void>
    await ctx.plugin({
      apply(child: Context) {
        apply(child, { rules } as Config)
        fire = (agent, source) => child.serial('agent/created', { agent, source })
      },
    })
    await fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(select).not.toHaveBeenCalled()
    // A settings-form write replaces the volatile snapshot without remounting.
    rules.set([{ workspaceId: 'ws-novel', agentPreset: 'story' }])
    await fire(stubAgent({ cwd: '/projects/novel' }), 'startup')
    expect(select).toHaveBeenCalledOnce()
    expect(select.mock.calls[0]![1]).toBe('story')
  })
})

describe('ruleForWorkspace', () => {
  it('returns the last matching rule and undefined without one', () => {
    const rules: ProjectDefaultRule[] = [
      { workspaceId: 'a', agentPreset: 'one' },
      { workspaceId: 'b', agentPreset: 'two' },
      { workspaceId: 'a', agentPreset: 'three' },
    ]
    expect(ruleForWorkspace(rules, 'a')).toEqual({ workspaceId: 'a', agentPreset: 'three' })
    expect(ruleForWorkspace(rules, 'b')).toEqual({ workspaceId: 'b', agentPreset: 'two' })
    expect(ruleForWorkspace(rules, 'c')).toBeUndefined()
    expect(ruleForWorkspace([], 'a')).toBeUndefined()
  })
})
