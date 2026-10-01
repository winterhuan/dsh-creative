import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { renderSkillContent } from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { readFile, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it, onTestFinished } from 'vitest'
import * as game from '../src/index.ts'

const run = promisify(execFile)

describe('standalone game plugin', () => {
  it('owns exactly four skills and game QA, and removes them on unload', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SkillRegistry)
    const plugin = ctx.plugin(game)
    await plugin.await()
    expect((await ctx.skills.list()).map(skill => skill.name).sort()).toEqual([
      'game-build', 'game-design', 'game-qa', 'novel-to-game',
    ])
    expect(ctx.tools.get('game_qa')).toBeDefined()
    expect(ctx.tools.get('creative_produce_run')).toBeUndefined()
    expect(ctx.tools.get('creative_role')).toBeUndefined()
    await plugin.dispose()
    expect(await ctx.skills.list()).toEqual([])
    expect(ctx.tools.get('game_qa')).toBeUndefined()
  })

  it('resolves task references from native DSH resource hints', async () => {
    const provider = game.createNovelToGameSkillProvider()
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected complete game catalog')
    for (const candidate of candidates) {
      const skill = await provider.get(candidate, {})
      const base = resolve(import.meta.dirname, '../knowledge/skills', candidate.name)
      expect(skill?.resourceBase).toEqual({ kind: 'directory', path: base })
      expect(renderSkillContent(skill!)).toContain(`Base directory for this skill: ${base}`)
      const paths = [...skill!.content.matchAll(/`(references\/[^`]+\.md)`/gu)]
      if (candidate.name !== 'game-qa') expect(paths.length).toBeGreaterThan(0)
      for (const match of paths) {
        await expect(readFile(resolve(base, match[1]!), 'utf8')).resolves.toMatch(/\S/u)
      }
    }
  })

  it('runs all source helpers without the Creative checkout', async () => {
    const temp = await mkdtemp(resolve(tmpdir(), 'dsh-game-resources-'))
    onTestFinished(() => rm(temp, { recursive: true, force: true }))
    await cp(new URL('../knowledge/', import.meta.url), temp, { recursive: true })
    for (const script of ['export_novel_txt.py', 'record_lineage.py', 'novel_index.py']) {
      const { stdout } = await run('python3', ['-B', resolve(temp, 'source-tools', script), '--help'], { cwd: temp })
      expect(stdout).toContain('usage:')
    }
    const provider = game.createNovelToGameSkillProvider()
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected complete game catalog')
    const skill = await provider.get(candidates.find(skill => skill.name === 'game-qa')!, {})
    expect(skill?.content).toContain('game_qa')
    expect(skill?.content).not.toContain('creative_produce_run')
  })

  it('keeps packaged source-exchange helpers identical to their maintained originals', async () => {
    const originals = {
      'export_novel_txt.py': 'story/scripts/export_novel_txt.py',
      'record_lineage.py': 'story/scripts/record_lineage.py',
      'novel_index.py': 'drama/skills/short-drama-novel-analyze/scripts/novel_index.py',
    }
    for (const [file, source] of Object.entries(originals)) {
      expect(await readFile(new URL(`../knowledge/source-tools/${file}`, import.meta.url), 'utf8'))
        .toBe(await readFile(new URL(`../../${source.startsWith('story/') ? 'story' : 'short-drama'}/knowledge/${source}`, import.meta.url), 'utf8'))
    }
  })
})
