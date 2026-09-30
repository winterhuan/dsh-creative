import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as plugin from '../src/index.ts'

describe('short-drama independent ownership', () => {
  it('loads only its catalog and tools and releases them on unload', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SubagentRuntime)
    const fiber = ctx.plugin(plugin)
    await fiber.await()
    expect(await ctx.skills.list()).toHaveLength(10)
    expect(ctx.tools.get('drama_produce_run')).toBeDefined()
    expect(ctx.tools.get('game_qa')).toBeUndefined()
    expect(ctx.tools.get('creative_produce_run')).toBeUndefined()
    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
    expect(ctx.tools.get('drama_produce_run')).toBeUndefined()
  })
})
