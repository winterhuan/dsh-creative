import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import TeamService from '@deepseek-ai/dsh-experimental-agent-team'
import * as TeamTools from '@deepseek-ai/dsh-experimental-tool-agent-team'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as FsTools from '@deepseek-ai/dsh-tool-fs'
import * as Delegate from '@deepseek-ai/dsh-tool-subagent'
import { LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi, type TestContext } from 'vitest'

const resourceBase = resolve(import.meta.dirname, '../../story/knowledge/story/skills/story-write')
const roleFile = resolve(resourceBase, 'references/roles/story-architect.md')
const referenceFile = resolve(resourceBase, 'references/methods/outline-methods.md')
const task = `You are the story-architect specialist. Read ${roleFile} first. Resources are based at ${resourceBase}. Review the assigned outline without changing files.`

/** Keep native live/cold observations; these scenarios do not use full-text search. */
class ReadQuery extends SessionQuery {
  async searchSessions(): Promise<never> { throw new Error('full-text search is not used') }
  async searchEvents(): Promise<never> { throw new Error('full-text search is not used') }
}

class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  async *stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(request)
    const count = this.requests.filter(item => item.sessionId === request.sessionId).length
    if (count <= 2 && request.sessionId !== 'role-test-lead') {
      const id = ToolCallId(`read-${count}`)
      const args = JSON.stringify({ file_path: count === 1 ? roleFile : referenceFile })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id, name: 'read', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'read', arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      const text = count === 3 ? 'Outline reviewed.' : 'Follow-up reviewed.'
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

async function setup(test: TestContext, team: boolean) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-role-native-'))
  const context = new Context()
  test.onTestFinished(async () => {
    try { await context.fiber.dispose() }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
  const adapter = new ScriptedAdapter()
  context.baseUrl = new URL('./fixtures/headless/', import.meta.url).href
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['role-test-dependencies', { async apply(ctx: Context) {
      await mountAgentLoopTestDependencies(ctx)
      ctx.get('llm')!.registerAdapter(['role-test'], adapter)
    } }],
    ['role-test-persistence', { async apply(ctx: Context) { await ctx.plugin(Persistence, { root: directory }) } }],
    ['role-test-query', ReadQuery], ['role-test-loop', AgentLoop],
    ['role-test-subagents', Subagents], ['role-test-spawn', Spawn],
    ['role-test-fs', LocalFileSystem], ['role-test-fs-tools', FsTools],
    ['role-test-delegate', Delegate], ['role-test-team', TeamService], ['role-test-team-tools', TeamTools],
  ])
  type Internal = NonNullable<typeof context.loader.internal>
  const internal: Pick<Extract<Internal, { version: 'v2' }>, 'version' | 'import'> = {
    version: 'v2', async import(specifier: string) {
      const plugin = modules.get(specifier)
      if (plugin === undefined) throw new Error(`Unknown test plugin: ${specifier}`)
      return plugin
    },
  }
  context.loader.internal = internal as Internal
  await context.loader.create({
    name: 'cordis:include', config: {
      path: new URL('./fixtures/headless/roles.yml', import.meta.url).href,
      patches: team ? [
        { id: 'role-native-delegate', disabled: true },
        { insert: [{ name: 'role-test-team' }, { name: 'role-test-team-tools' }] },
      ] : [],
    },
  })
  await context.loader.await()
  const lead = await context.agentLoop.create(SessionId('role-test-lead'), { provider: 'role-test', model: 'inherited' }, { cwd: directory })
  const exec = { agent: lead, signal: new AbortController().signal } as ToolRunContext
  expect(context.tools.get('creative_role', lead)).toBeUndefined()
  return { context, lead, exec, adapter }
}

function assertReadInstructions(adapter: Pick<ScriptedAdapter, 'requests'>) {
  expect(adapter.requests.length).toBeGreaterThanOrEqual(3)
  expect(JSON.stringify(adapter.requests[0]!.messages)).toContain(task)
  expect(JSON.stringify(adapter.requests[2]!.messages)).toContain('# Story Architect')
  expect(JSON.stringify(adapter.requests[2]!.messages)).toContain(referenceFile)
  expect(JSON.stringify(adapter.requests[2]!.messages)).not.toContain('# Narrative Writer')
  expect(JSON.stringify(adapter.requests[2]!.messages.filter(message => message.role === 'system'))).not.toContain('# Story Architect')
}

describe('professional Agents using only native delegation', () => {
  it('creates a native subagent that reads the packaged Role and references', async test => {
    const { context, lead, exec, adapter } = await setup(test, false)
    const tool = context.tools.get('subagent', lead)!
    const result = await tool.execute({ description: 'Review the outline', prompt: task }, exec) as { runId: string; output: object }
    expect(JSON.stringify(result.output)).toContain('Outline reviewed.')
    expect(context.agents.get(SessionId(result.runId))).toBeUndefined()
    assertReadInstructions(adapter)
    expect(adapter.requests[0]!.sessionId).not.toBe(lead.id)
  })

  it('uses native Team creation and messages to resume the same professional Agent', async test => {
    const { context, lead, exec, adapter } = await setup(test, true)
    expect(context.tools.get('subagent', lead)).toBeUndefined()
    const spawn = context.tools.get('spawn_teammate', lead)!
    await spawn.execute({ name: 'reviewer', description: 'Outline reviewer', prompt: task, context: 'fresh' }, exec)
    const member = context.agentTeams.listMembers(lead).find(row => row.name === 'reviewer')!
    expect(member).toBeDefined()
    const requests = () => adapter.requests.filter(request => request.sessionId === member.id)
    await vi.waitFor(() => {
      expect(requests()).toHaveLength(3)
      expect(context.agents.get(member.id)).toBeUndefined()
    }, { timeout: 5000 })
    assertReadInstructions({ requests: requests() })
    const send = context.tools.get('send_message', lead)!
    await send.execute({ target: 'reviewer', message: 'Review the revised outline.' }, exec)
    await vi.waitFor(() => {
      expect(requests()).toHaveLength(4)
      expect(context.agents.get(member.id)).toBeUndefined()
    }, { timeout: 5000 })
    expect(context.agentTeams.listMembers(lead)).toHaveLength(2)
    expect(requests()[3]!.sessionId).toBe(member.id)
    expect(JSON.stringify(requests()[3]!.messages)).toContain('# Story Architect')
  })
})
