import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { renderSkillContent } from '@deepseek-ai/dsh-skill'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createDramaSkillProvider, parseBundledSkill } from '../src/skill-provider.ts'

const dramaRoot = resolve(import.meta.dirname, '../knowledge/drama/skills')

describe.each([{ name: 'short-drama', create: createDramaSkillProvider, root: dramaRoot, skillName: 'short-drama', count: 5 }])('$name skill source', ({ create, root, skillName, count }) => {
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
