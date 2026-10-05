import * as story from '@winterhuan/dsh-story'
import * as drama from '@winterhuan/dsh-short-drama'
import * as video from '@winterhuan/dsh-video-recap'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as game from '@winterhuan/dsh-novel-to-game'

describe('Independent domain Loader composition', () => {
  it.each([undefined, 'story', 'short-drama', 'video-recap', 'novel-to-game'])('keeps Host domain layers free of model capabilities: %s', async separateDomain => {
    const context = new Context()
    onTestFinished(async () => { await context.fiber.dispose() })
    context.baseUrl = new URL('./fixtures/domains/', import.meta.url).href
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-skill', SkillRegistry],
      ['@deepseek-ai/dsh-subagent', SubagentRuntime],
      ['@winterhuan/dsh-story', story],
      ['@winterhuan/dsh-short-drama', drama],
      ['@winterhuan/dsh-video-recap', video],
      ['@winterhuan/dsh-novel-to-game', game],
    ])
    type InternalLoader = NonNullable<typeof context.loader.internal>
    const internal: Pick<Extract<InternalLoader, { version: 'v2' }>, 'version' | 'import'> = {
      version: 'v2',
      async import(specifier: string) {
        const plugin = modules.get(specifier)
        if (plugin === undefined) throw new Error(`Unexpected Loader import: ${specifier}`)
        return plugin
      },
    }
    context.loader.internal = internal as InternalLoader
    await context.loader.create({
      name: 'cordis:include',
      config: { path: new URL('./fixtures/domains/cordis.yml', import.meta.url).href, ...(separateDomain ? { patches: [{ insert: [{ id: separateDomain, name: `@winterhuan/dsh-${separateDomain}` }] }] } : {}) },
    })
    await context.loader.await()
    expect(context.get('webServer')).toBeUndefined()
    expect(context.get('typert')).toBeUndefined()
    expect(await context.skills.list()).toEqual([])
    for (const name of ['story_zhuque', 'game_qa', 'drama_produce_run', 'video_produce_run', 'creative_production']) expect(context.tools.get(name)).toBeUndefined()
    expect(context.tools.get('creative_bundled_reference')).toBeUndefined()
  })
})
