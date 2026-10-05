/** Preset-scoped domain capabilities must not affect other Sessions. */
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
import { expect, it, onTestFinished } from 'vitest'
import * as drama from '../packages/creative/short-drama/src/agent.ts'
import * as game from '../packages/creative/novel-to-game/src/agent.ts'
import * as video from '../packages/creative/video-recap/src/agent.ts'
import * as student from '../packages/education/student/src/agent.ts'

const domains = [
  { id: 'short-drama', group: 'creative', agent: drama, tools: ['drama_produce_run', 'drama_produce_status', 'creative_production'], skills: 5 },
  { id: 'novel-to-game', group: 'creative', agent: game, tools: ['game_qa'], skills: 4 },
  { id: 'video-recap', group: 'creative', agent: video, tools: ['video_produce_run', 'video_recap_produce_status'], skills: 2 },
  { id: 'student', group: 'education', agent: student, tools: ['study_status', 'study_update'], skills: 1 },
]

it('isolates domain capabilities from Standard and sibling modes, including native children', async () => {
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
    if (name === 'persona-test') return Persona
    const domain = domains.find(entry => entry.id === name)
    if (domain) return domain.agent
    throw new Error(`Unexpected module: ${name}`)
  } } as Internal
  const prefixes = new Map<string, string>()
  for (const domain of domains) {
    const patch = await readFile(new URL(`../packages/${domain.group}/${domain.id}/cordis.patch.yml`, import.meta.url), 'utf8')
    prefixes.set(domain.id, patch.match(/              prefix: \|\n((?:                .+\n)+)/u)![1]!.replace(/^                /gmu, ''))
  }
  await ctx.plugin({ inject: ['agentPresets'], async* apply(owner: Context) {
    yield await owner.agentPresets.register({ id: 'standard', plugins: [] })
    for (const domain of domains) yield await owner.agentPresets.register({ id: domain.id, plugins: [{ name: 'persona-test', config: { prefix: prefixes.get(domain.id) } }, { name: domain.id }] })
  } })
  const create = async (id: string) => (await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: '/ws' }, setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, id) } })).agent
  const standard = await create('standard')
  expect(await ctx.skills.list({ scope: standard })).toEqual([])
  for (const domain of domains) {
    const agent = await create(domain.id)
    const child = (await ctx.agents.create({ sessionId: SessionId(`${domain.id}-child`), meta: { cwd: '/ws' }, setup: childCtx => { ctx.agentPresets.composeFrom(childCtx, agent.ctx) } })).agent
    const prompt = await ctx.systemPrompt.assemble(assembleContextFor(agent))
    await expect(prompt.sections.find(section => section.name === Persona.PERSONA_PREFIX_SECTION)!.text).toMatchFileSnapshot(`./fixtures/${domain.id}-persona.txt`)
    for (const scoped of [agent, child]) {
      expect(await ctx.skills.list({ scope: scoped })).toHaveLength(domain.skills)
      for (const tool of new Set(domains.flatMap(entry => entry.tools))) {
        expect(Boolean(ctx.tools.get(tool, scoped))).toBe(domain.tools.includes(tool))
        expect(ctx.tools.get(tool, standard)).toBeUndefined()
        expect(ctx.tools.get(tool)).toBeUndefined()
      }
    }
  }
})
