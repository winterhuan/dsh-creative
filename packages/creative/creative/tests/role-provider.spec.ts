import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREATIVE_ROLE_NAMES, loadBundledRole, loadBundledRoleDefinition } from '../src/role-provider.js'

describe('bundled Creative roles', () => {
  it('loads all seven upstream role definitions as DSH personas', async () => {
    expect(CREATIVE_ROLE_NAMES).toHaveLength(7)
    const root = resolve(import.meta.dirname, '../../story/knowledge/creative/roles')
    for (const name of CREATIVE_ROLE_NAMES) {
      const source = await readFile(resolve(root, `${name}.md`), 'utf8')
      const persona = await loadBundledRole(name, root)
      expect(persona).toContain(`CREATIVE_DSH_ROLE:${name}`)
      expect(persona).toContain('Do not read or write project files')
      expect(persona).toContain(source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u, '').trim())
      expect(persona).not.toMatch(/Agent\(subagent_type|\.claude\/skills/u)
    }
  })

  it('adapts the same exact role body for native DSH tool execution', async () => {
    const persona = await loadBundledRole('narrative-writer', resolve(import.meta.dirname, '../../story/knowledge/creative/roles'), 'native-tools')
    expect(persona).toContain('current DSH workspace and visible tool set')
    expect(persona).toContain('Read references with the native read tool')
    expect(persona).toContain('bypass DSH filesystem permissions')
    expect(persona).not.toContain('creative_bundled_reference')
    expect(persona).not.toContain('do not call tools')
  })

  it('resolves every Role reference against the shipped package resource base', async () => {
    for (const name of CREATIVE_ROLE_NAMES) {
      const persona = await loadBundledRole(name, undefined, 'native-tools')
      const base = /^Bundled resource base directory: (.+)$/mu.exec(persona)?.[1]
      expect(base).toBe(resolve(import.meta.dirname, '../../story/knowledge/story'))
      expect(isAbsolute(base!)).toBe(true)
      for (const [, reference] of persona.matchAll(/`(references\/[^`]+\.md)`/gu)) {
        await expect(readFile(resolve(base!, reference!), 'utf8'), `${name}: ${reference}`)
          .resolves.toMatch(/\S/u)
      }
    }
  })

  it('keeps the updated benchmark-book failure distinction', async () => {
    const persona = await loadBundledRole('story-explorer', resolve(import.meta.dirname, '../../story/knowledge/creative/roles'), 'native-tools')
    expect(persona).toContain('benchmark_book_missing: true')
    expect(persona).toContain('profile_missing: true')
    expect(persona).toContain('expected_path')
  })

  it('routes external research through native web tools without a preset browser port', async () => {
    const persona = await loadBundledRole('story-researcher', undefined, 'native-tools')
    expect(persona).toContain('`web_search`')
    expect(persona).toContain('`web_fetch`')
    expect(persona).not.toMatch(/WebSearch|webReader|9222|--cdp/u)
  })

  it('keeps chapter retries within the inherited DSH model', async () => {
    const persona = await loadBundledRole('chapter-extractor', undefined, 'native-tools')
    expect(persona).not.toMatch(/\b(?:sonnet|haiku|opus)\b/u)
  })

  it('loads host-owned review reasoning from Role frontmatter', async () => {
    const architect = await loadBundledRoleDefinition('story-architect', undefined, 'native-tools')
    const writer = await loadBundledRoleDefinition('narrative-writer', undefined, 'native-tools')
    expect(architect.agentOptions).toEqual({ reasoningEffort: 'high' })
    expect(writer.agentOptions).toBeUndefined()
  })

  it('parses model options as YAML and refuses malformed host configuration', async (context) => {
    const directory = await mkdtemp(resolve(tmpdir(), 'dsh-role-options-'))
    context.onTestFinished(() => rm(directory, { recursive: true, force: true }))
    const path = resolve(directory, 'story-architect.md')
    await writeFile(path, '---\nagent_options:\n  provider: review\n  model: "model:large"\n  reasoning_effort: high # adapter-owned\n  max_tokens: 4096\n---\nReview.\n')
    expect((await loadBundledRoleDefinition('story-architect', directory)).agentOptions).toEqual({
      provider: 'review', model: 'model:large', reasoningEffort: 'high', maxTokens: 4096,
    })
    for (const invalid of ['{max_tokens: -1}', '{model: ""}', '{reasoning_effrot: high}', '{max_tokens: "4096"}']) {
      await writeFile(path, `---\nagent_options: ${invalid}\n---\nReview.\n`)
      await expect(loadBundledRoleDefinition('story-architect', directory)).rejects.toThrow()
    }
  })
})
