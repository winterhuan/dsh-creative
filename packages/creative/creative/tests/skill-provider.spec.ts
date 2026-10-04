import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { listReferences, readReference } from '../../../skill/skill-viewer/src/references.ts'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createDramaSkillProvider, createNovelToGameSkillProvider, createStorySkillProvider, createVideoRecapSkillProvider, parseBundledSkill } from '../src/skill-provider.ts'

const skillRoot = resolve(import.meta.dirname, '../../story/knowledge/story/skills')
const dramaRoot = resolve(import.meta.dirname, '../../short-drama/knowledge/drama/skills')
const gameRoot = resolve(import.meta.dirname, '../../novel-to-game/knowledge/skills')
const videoRoot = resolve(import.meta.dirname, '../../video-recap/knowledge/video-recap/skills')

describe.each([
  { name: 'story', create: createStorySkillProvider, root: skillRoot, skillName: 'story', count: 6 },
  { name: 'short-drama', create: createDramaSkillProvider, root: dramaRoot, skillName: 'short-drama', count: 5 },
  { name: 'novel-to-game', create: createNovelToGameSkillProvider, root: gameRoot, skillName: 'novel-to-game', count: 4 },
  { name: 'video-recap', create: createVideoRecapSkillProvider, root: videoRoot, skillName: 'video-recap', count: 2 },
])('$name skill source', ({ create, root, skillName, count }) => {
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

describe('Drama Skills bundled provider', () => {
  it('publishes five task entries through DSH', async () => {
    const provider = createDramaSkillProvider(dramaRoot)
    const listed = await provider.list({})
    if (!Array.isArray(listed)) throw new Error('Expected a complete Drama Skills catalog.')
    expect(listed).toHaveLength(5)
    expect(listed.map(candidate => candidate.name)).toEqual(expect.arrayContaining([
      'short-drama', 'short-drama-produce', 'short-drama-review', 'short-drama-visual', 'short-drama-write',
    ]))
    for (const candidate of listed) {
      const skill = await provider.get(candidate, {})
      expect(skill?.content).toContain('DSH owns the workspace')
      expect(skill?.content).toContain('drama_produce_run')
      expect(skill?.content).toContain('creative_production')
    }
    const routeCandidate = listed.find(candidate => candidate.name === 'short-drama')
    const route = await provider.get(routeCandidate!, {})
    expect(route?.resourceBase).toEqual({ kind: 'directory', path: dirname(dramaRoot) })
    for (const provider of ['gpt-image-2', 'minimax-h3-video', 'minimax-music', 'seedance']) {
      const reference = await readFile(resolve(dramaRoot, `../references/produce/providers/${provider}.md`), 'utf8')
      expect(reference).toContain('"job_id":')
      expect(reference).not.toContain('"stdin":')
    }

  })
})

describe('NovelToGame bundled provider', () => {
  it('publishes four playable adaptation tasks through DSH', async () => {
    const provider = createNovelToGameSkillProvider(gameRoot)
    const listed = await provider.list({})
    if (!Array.isArray(listed)) throw new Error('Expected a complete NovelToGame catalog.')
    expect(listed.map(candidate => candidate.name)).toEqual([
      'game-build',
      'game-design',
      'game-qa',
      'novel-to-game',
    ])
    for (const candidate of listed) {
      const skill = await provider.get(candidate, {})
      expect(skill?.content).toContain('The 游戏 tab is the playable Game Studio')
      expect(skill?.content).toContain('game-adaptations/<project>/')
      expect(skill?.content).toContain('qa/verification.json remains the sole machine QA truth')
      expect(skill?.content).toContain('Adapt games from the novel')
      expect(skill?.content).toContain('record_lineage.py')
      expect(skill?.resourceBase).toEqual({ kind: 'directory', path: resolve(gameRoot, candidate.name) })
    }
    const qa = await provider.get(listed.find(candidate => candidate.name === 'game-qa')!, {})
    for (const check of ['launch', 'render', 'input', 'coreLoop', 'outcome', 'restart']) {
      expect(qa?.content).toContain(check)
    }
  })
})

describe('video-recap bundled provider', () => {
  it('publishes two tasks with native DSH boundaries', async () => {
    const provider = createVideoRecapSkillProvider(videoRoot)
    const listed = await provider.list({})
    if (!Array.isArray(listed)) throw new Error('Expected a complete video-recap catalog.')
    expect(listed.map(candidate => candidate.name)).toEqual([
      'video-recap',
      'video-script',
    ])
    expect(listed.find(candidate => candidate.name === 'video-recap')?.invocation.userInvocable).toBe(true)
    for (const candidate of listed) {
      const skill = await provider.get(candidate, {})
      expect(skill?.content).toContain('The Video Studio is a preview and artifact surface')
      expect(skill?.content).toContain('video-recaps/<project>/')
      expect(skill?.content).toContain('MIMO_API_KEY, FISH_API_KEY')
      expect(skill?.content).toContain('Short-drama production outputs are ready recap sources')
      expect(skill?.content).toContain('record_lineage.py')
      expect(skill?.resourceBase).toEqual({ kind: 'directory', path: dirname(videoRoot) })
    }
  })
})
