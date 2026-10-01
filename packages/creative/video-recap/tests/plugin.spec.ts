import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { renderSkillContent } from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as plugin from '../src/index.ts'
import { createVideoRecapSkillProvider } from '../src/skill-provider.ts'

describe('video-recap independent ownership', () => {
  it('loads only its catalog and tools and releases them on unload', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SubagentRuntime)
    const fiber = ctx.plugin(plugin)
    await fiber.await()
    const catalog = await ctx.skills.list()
    expect(catalog.map(skill => skill.name)).toEqual(['video-recap', 'video-script'])
    expect(catalog.every(skill => skill.invocation.userInvocable && skill.invocation.modelInvocable)).toBe(true)
    expect(ctx.tools.get('video_produce_run')).toBeDefined()
    expect(ctx.tools.get('game_qa')).toBeUndefined()
    expect(ctx.tools.get('creative_produce_run')).toBeUndefined()
    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
    expect(ctx.tools.get('video_produce_run')).toBeUndefined()
  })

  it('keeps stage scripts executable resources without registering them as Skills', async () => {
    const root = resolve(import.meta.dirname, '../knowledge/video-recap')
    for (const [stage, entry] of [['understanding', 'understand.py'], ['cut', 'cut.py'], ['voiceover', 'voiceover.py'], ['assemble', 'assemble.py']]) {
      await expect(readFile(resolve(root, 'references', `${stage}.md`), 'utf8')).resolves.toMatch(/\S/u)
      await expect(readFile(resolve(root, 'skills', `video-${stage}`, 'scripts', entry!), 'utf8')).resolves.toMatch(/\S/u)
    }
  })

  it('resolves each skill reference from the resource base shown by native DSH', async () => {
    const base = resolve(import.meta.dirname, '../knowledge/video-recap')
    const provider = createVideoRecapSkillProvider(resolve(base, 'skills'))
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected a complete catalog')
    for (const candidate of candidates) {
      const skill = await provider.get(candidate, {})
      if (skill === undefined) throw new Error('Registered skill is unavailable')
      expect(skill.resourceBase).toEqual({ kind: 'directory', path: base })
      expect(renderSkillContent(skill)).toContain(`Base directory for this skill: ${base}`)
      const references = [...skill.content.matchAll(/`(references\/[^`]+\.md)`/gu)]
      expect(references.length).toBeGreaterThan(0)
      for (const [, reference] of references) {
        await expect(readFile(resolve(base, reference!), 'utf8')).resolves.toMatch(/\S/u)
      }
    }
  })
})
