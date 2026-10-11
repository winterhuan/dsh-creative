/**
 * Real composition of this plugin with the production preset registry, Agent
 * loop, subagent runtime and the `tool-subagent` row the shipped default preset
 * carries. A fresh session under a ruled Workspace must be created without
 * error and end up composing the project's preset; one elsewhere keeps the
 * default.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import Group from '@deepseek-ai/cordis-plugin-group'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets, { type PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
// Type-only: the tools service merge for `ctx.tools.schemas`.
import type {} from '@deepseek-ai/dsh-tools'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi, type TestContext } from 'vitest'
import * as ProjectDefaultMode from '../src/index.ts'
import type { ProjectDefaultRule } from '../src/types.ts'

const contribute = new URL('./fixtures/plugins/contribute.js', import.meta.url).href
const WORKSPACE = 'ws-ruled'

/** The Workspace registry surface this plugin reads: one registered directory. */
class RuledWorkspaces extends Service {
  constructor(ctx: Context, private readonly config: { ruled: string }) {
    super(ctx, 'workspaceRegistry')
  }

  async resolveByPath(path: string): Promise<{ id: string } | undefined> {
    return await realpath(path) === this.config.ruled ? { id: WORKSPACE } : undefined
  }
}

async function declare(ctx: Context, config: PresetDefinition): Promise<void> {
  await ctx.plugin({ inject: ['agentPresets'], async* apply(child: Context) { yield await child.agentPresets.register(config) } })
}

async function compose(test: TestContext, rules: readonly ProjectDefaultRule[]): Promise<{ ctx: Context; directory: string }> {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'dsh-project-default-real-')))
  const ctx = new Context()
  test.onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(directory, { recursive: true, force: true }) }
  })
  ctx.baseUrl = new URL('./fixtures/', import.meta.url).href
  await ctx.plugin(Loader)
  ctx.loader.builtins.group = Group
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true, systemPrompt: { personaPrefix: '' } })
  await ctx.plugin(Persistence, { root: join(directory, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(AgentPresets, { default: 'standard' })
  await ctx.plugin(RuledWorkspaces, { ruled: directory })
  // The shipped default preset carries tool-subagent rows; the project preset contributes its own tool.
  await declare(ctx, { id: 'standard', plugins: [
    { name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent' } },
    { name: contribute, config: { tool: 'standard' } },
  ] })
  await declare(ctx, { id: 'student', plugins: [{ name: contribute, config: { tool: 'student' } }] })
  await ctx.plugin(ProjectDefaultMode, { rules: [...rules] })
  await ctx.loader.await()
  return { ctx, directory }
}

/** A web-style creation: the controller mounts the default preset in setup and records it in the header. */
async function createSession(ctx: Context, id: string, cwd: string) {
  const handle = await ctx.agents.create({
    sessionId: SessionId(id),
    meta: { cwd, agentPreset: 'standard' },
    setup: async (agentCtx: Context) => { await ctx.agentPresets.mount(agentCtx, 'standard') },
  })
  return handle.agent
}

describe('project default mode in a real composition', () => {
  it('creates a session under a ruled workspace and composes the project preset', async (test) => {
    const { ctx, directory } = await compose(test, [{ workspaceId: WORKSPACE, agentPreset: 'student' }])
    const agent = await createSession(ctx, 'ruled', directory)
    await vi.waitFor(() => {
      expect(ctx.agentPresets.composedPreset(agent.ctx)).toBe('student')
      expect(ctx.sessionProjections.stateOf(agent.session, 'agentPreset')).toBe('student')
    })
    const tools = ctx.tools.schemas(agent).map(row => row.name)
    expect(tools).toContain('student')
    expect(tools).not.toContain('standard')
    expect(tools).not.toContain('subagent')
  })

  it('leaves a session outside the ruled workspace on the default preset', async (test) => {
    const { ctx } = await compose(test, [{ workspaceId: WORKSPACE, agentPreset: 'student' }])
    const elsewhere = await realpath(await mkdtemp(join(tmpdir(), 'dsh-project-default-other-')))
    test.onTestFinished(() => rm(elsewhere, { recursive: true, force: true }))
    const agent = await createSession(ctx, 'unruled', elsewhere)
    expect(ctx.agentPresets.composedPreset(agent.ctx)).toBe('standard')
    expect(ctx.tools.schemas(agent).map(row => row.name)).toEqual(expect.arrayContaining(['standard', 'subagent']))
  })
})
