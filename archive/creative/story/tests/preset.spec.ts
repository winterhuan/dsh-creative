/** Preset-scoped novel capabilities must not affect other Sessions. */
import { readFile } from 'node:fs/promises'
import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import * as Persona from '@deepseek-ai/dsh-persona'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AgentPresets from '@deepseek-ai/dsh-agent-preset-registry'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { SessionId } from '@deepseek-ai/dsh-session'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as storyAgent from '../src/agent.ts'
import * as storyHost from '../src/index.ts'

it('keeps the Host entry free of model capabilities', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(storyHost)
  expect(await ctx.skills.list()).toEqual([])
  expect(ctx.tools.get('story_zhuque')).toBeUndefined()
})

describe('novel preset scope', () => {
  it('isolates tools, Skills and write hooks, and retains them for native child composition', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    ctx.baseUrl = import.meta.url
    await ctx.plugin(Loader)
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(AgentPresets, { default: 'standard' })
    type Internal = NonNullable<typeof ctx.loader.internal>
    ctx.loader.internal = { version: 'v2', async import(name: string) {
      if (name === 'story-agent-test') return storyAgent
      if (name === 'story-persona-test') return Persona
      throw new Error(`Unexpected test module: ${name}`)
    } } as Internal
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const prefix = patch.match(/              prefix: \|\n((?:                .+\n)+)/u)![1]!.replace(/^                /gmu, '')
    await ctx.plugin({ inject: ['agentPresets'], async* apply(owner: Context) {
      yield await owner.agentPresets.register({ id: 'standard', plugins: [] })
      yield await owner.agentPresets.register({ id: 'story', plugins: [{ name: 'story-persona-test', config: { prefix } }, { name: 'story-agent-test' }] })
    } })
    const create = async (id: string, preset: string) => (await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: '/ws' }, setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, preset) } })).agent
    const standard = await create('standard', 'standard')
    const novel = await create('novel', 'story')
    const child = (await ctx.agents.create({ sessionId: SessionId('child'), meta: { cwd: '/ws' }, setup: childCtx => { ctx.agentPresets.composeFrom(childCtx, novel.ctx) } })).agent
    const novelPrompt = await ctx.systemPrompt.assemble(assembleContextFor(novel))
    await expect(novelPrompt.sections.find(section => section.name === Persona.PERSONA_PREFIX_SECTION)!.text).toMatchFileSnapshot('./fixtures/story-persona.txt')
    const standardPrompt = await ctx.systemPrompt.assemble(assembleContextFor(standard))
    expect(JSON.stringify(standardPrompt)).not.toContain('novel-writing collaborator')
    expect(ctx.tools.get('story_zhuque')).toBeUndefined()
    for (const agent of [novel, child]) {
      expect(ctx.tools.get('story_zhuque', agent)).toBeDefined()
      expect(await ctx.skills.list({ scope: agent })).toHaveLength(6)
    }
    expect(ctx.tools.get('story_zhuque', standard)).toBeUndefined()
    expect(await ctx.skills.list({ scope: standard })).toEqual([])
    const decision = (agent: typeof novel) => {
      const exec = { agent, name: 'write', arguments: { file_path: '正文.md' }, signal: new AbortController().signal } as ToolExecution
      return ctx.waterfall(scopeTarget(ctx.tools, agent), 'tools/pre-execute', exec, async () => ({ kind: 'allow' as const }))
    }
    expect(await decision(standard)).toEqual({ kind: 'allow' })
    expect(await decision(novel)).toMatchObject({ kind: 'deny' })
    expect(await decision(child)).toMatchObject({ kind: 'deny' })
  })
})
