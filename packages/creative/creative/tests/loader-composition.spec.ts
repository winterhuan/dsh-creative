import { Context } from '@deepseek-ai/cordis'
import { readFile } from 'node:fs/promises'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as creative from '../src/index.ts'

describe('Creative headless Loader composition', () => {
  it('registers all four catalogs and executable tools without Web services', async () => {
    const context = new Context()
    onTestFinished(async () => { await context.fiber.dispose() })
    context.baseUrl = new URL('./fixtures/headless/', import.meta.url).href
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-skill', SkillRegistry],
      ['@deepseek-ai/dsh-subagent', SubagentRuntime],
      ['@winterhuan/dsh-creative', creative],
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
      config: { path: new URL('./fixtures/headless/cordis.yml', import.meta.url).href },
    })
    await context.loader.await()
    expect(context.get('webServer')).toBeUndefined()
    expect(context.get('typert')).toBeUndefined()
    expect((await context.skills.list()).map(skill => skill.name)).toEqual(expect.arrayContaining([
      'story', 'short-drama', 'novel-to-game', 'video-recap',
    ]))
    const source = await readFile(new URL('../knowledge/story/skills/story-long-write/SKILL.md', import.meta.url), 'utf8')
    expect(await context.skills.get('story-long-write')).toMatchObject({
      content: expect.stringContaining(source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '').trim()),
    })
    expect(context.tools.get('creative_produce_run')).toBeDefined()
    expect(context.tools.get('creative_production')).toBeDefined()
    expect(context.tools.get('creative_bundled_reference')).toBeDefined()
  })
})
