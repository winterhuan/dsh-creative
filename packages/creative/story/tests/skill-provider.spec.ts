import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { listReferences, readReference } from '../../../skill/skill-viewer/src/references.ts'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createStorySkillProvider, parseBundledSkill } from '../src/skill-provider.ts'

const skillRoot = resolve(import.meta.dirname, '../knowledge/story/skills')

describe.each([{ name: 'story', create: createStorySkillProvider, root: skillRoot, skillName: 'story', count: 6 }])('$name skill source', ({ create, root, skillName, count }) => {
  it('resolves local Markdown links in its packaged knowledge', async () => {
    const knowledge = resolve(root, skillName === 'novel-to-game' ? '..' : '../..')
    for (const file of await readdir(knowledge, { recursive: true })) {
      if (!file.endsWith('.md')) continue
      const path = resolve(knowledge, file)
      const source = await readFile(path, 'utf8')
      for (const match of source.matchAll(/\]\(([^)]+)\)/gu)) {
        const link = match[1]!
        if (!/^(?:\.\.?\/|references\/|scripts\/|templates\/)/u.test(link) || /[<{*]/u.test(link)) continue
        const target = link.split('#')[0]!
        await expect(access(resolve(dirname(path), target)), `${file}: ${link}`).resolves.toBeUndefined()
      }
    }
  })

  it('serves every file body unchanged after shared integration context', async () => {
    const provider = create(root)
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected a complete bundled catalog.')
    expect(candidates).toHaveLength(count)
    for (const candidate of candidates) {
      const source = parseBundledSkill(await readFile(resolve(root, candidate.name, 'SKILL.md'), 'utf8'))
      const skill = await provider.get(candidate, {})
      expect(skill?.description).toBe(source.description)
      expect(skill?.content).not.toContain('creative_role')
      expect(candidate.description.length).toBeLessThanOrEqual(500)
      expect(skill?.resourceBase).toEqual(candidate.resourceBase)
      if (skill?.resourceBase?.kind !== 'directory') throw new Error('Expected bundled directory resources.')
      const base = skill.resourceBase.path
      expect(renderSkillContent(skill)).toContain(`Base directory for this skill: ${base}`)
      for (const match of skill.content.matchAll(/`((?:references|scripts|skills)\/[^`<>*]+\.(?:md|py|js))`/gu)) {
        await expect(access(resolve(base, match[1]!)), `${candidate.name}: ${match[1]}`).resolves.toBeUndefined()
      }
      expect(skill?.content.replace(/^<[\w-]+-dsh-integration>[\s\S]*?<\/[\w-]+-dsh-integration>\n\n/u, ''))
        .toBe(source.content)
    }
  })

  it('reads edits to a named skill instead of substituting a runtime body', async () => {
    const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'dsh-creative-skills-'))
    onTestFinished(() => rm(temporaryRoot, { recursive: true, force: true }))
    const directory = resolve(temporaryRoot, skillName)
    await mkdir(directory)
    const path = resolve(directory, 'SKILL.md')
    await writeFile(path, `---\nname: ${skillName}\ndescription: original description\n---\n# Original instructions\n`)
    const provider = create(temporaryRoot)
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected a complete bundled catalog.')
    expect(candidates).toHaveLength(1)
    const original = await provider.get(candidates[0]!, {})
    expect(original?.content).toContain('# Original instructions\n')
    await writeFile(path, `---\nname: ${skillName}\ndescription: updated description\n---\n# Updated instructions\n`)
    const updated = await provider.get(candidates[0]!, {})
    expect(updated?.description).toBe('updated description')
    expect(updated?.content).toBe(original?.content.replace('# Original instructions\n', '# Updated instructions\n'))
    expect(updated?.resourceBase).toEqual({ kind: 'directory', path: skillName === 'novel-to-game' || skillName === 'story' ? directory : dirname(temporaryRoot) })
  })
})

describe('Novel bundled skill provider', () => {
  it('publishes exactly six entrypoints without compatibility aliases', async () => {
    const provider = createStorySkillProvider(skillRoot)
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected a complete bundled catalog.')
    expect(candidates.map(candidate => candidate.name)).toEqual([
      'story', 'story-analyze', 'story-cover', 'story-polish', 'story-review', 'story-write',
    ])
    expect(candidates.every(candidate => candidate.source === 'bundled' && candidate.invocation.modelInvocable)).toBe(true)
    for (const candidate of candidates) {
      const skill = await provider.get(candidate, {})
      expect(skill?.content).not.toContain('creative-dsh-integration')
      for (const obsolete of ['.claude/agents', '.codex/agents', '.opencode/agents', '.agents/agents', 'invoke_subagent', 'creative_bundled_reference']) {
        expect(skill?.content).not.toContain(obsolete)
      }
    }
  })

  it('discovers and previews each skill’s local references through the viewer', async () => {
    const provider = createStorySkillProvider(skillRoot)
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected a complete bundled catalog.')
    const signal = new AbortController().signal
    for (const candidate of candidates) {
      const skill = await provider.get(candidate, {})
      if (skill?.resourceBase?.kind !== 'directory') throw new Error('Expected local resources.')
      const base = resolve(skillRoot, candidate.name)
      expect(skill.resourceBase.path).toBe(base)
      const listing = await listReferences(base, 1000, signal)
      expect(listing.truncated).toBe(false)
      expect(listing.files.length, candidate.name).toBeGreaterThan(0)
      const paths = [...skill.content.matchAll(/(?:`|\()(references\/[^`<>()*]+\.md)(?:`|\))/gu)]
      expect(paths.length, candidate.name).toBeGreaterThan(0)
      for (const [, path] of paths) {
        expect(listing.files).toContain(path)
        const preview = await readReference(base, path!, 1024, signal)
        expect(preview.content.length).toBeGreaterThan(0)
        expect((await readFile(resolve(base, path!), 'utf8')).startsWith(preview.content)).toBe(true)
      }
    }
  })

  it('rejects missing frontmatter', () => {
    expect(() => parseBundledSkill('# no metadata')).toThrow(/frontmatter/u)
  })

  it('parses folded YAML descriptions and user invocation metadata', () => {
    const parsed = parseBundledSkill('---\nname: folded-skill\nuser-invocable: false\ndescription: >\n first line\n second line\n---\n# Body\n')
    expect(parsed.description).toBe('first line second line')
    expect(parsed.userInvocable).toBe(false)
  })

  it('rejects candidate paths outside the packaged skill root', async () => {
    const provider = createStorySkillProvider(skillRoot)
    await expect(provider.get({
      name: 'story-write',
      description: 'invalid external candidate',
      invocation: { modelInvocable: true, userInvocable: true },
      provider: 'story',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: resolve(skillRoot, '..') },
      rank: 0,
      locator: new URL('file:///tmp/SKILL.md'),
      path: resolve(skillRoot, '../SKILL.md'),
    }, {})).rejects.toThrow(/escaped/u)
  })
})
