import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const skills = resolve(import.meta.dirname, '../../story/knowledge/story/skills')

describe('packaged specialist instructions', () => {
  it('keeps specialist methods and their references inside the owning skill', async () => {
    const owners = {
      story: ['story-explorer', 'story-researcher'],
      'story-write': ['character-designer', 'narrative-writer', 'story-architect'],
      'story-analyze': ['chapter-extractor'],
      'story-review': ['consistency-checker'],
    }
    for (const [skill, names] of Object.entries(owners)) {
      const base = resolve(skills, skill)
      const roles = resolve(base, 'references/roles')
      expect((await readdir(roles)).sort()).toEqual(names.map(name => `${name}.md`).sort())
      for (const name of names) {
        const body = await readFile(resolve(roles, `${name}.md`), 'utf8')
        expect(body).toContain(`name: ${name}`)
        for (const [, reference] of body.matchAll(/`(references\/[^`<>*]+\.md)`/gu)) {
          await expect(access(resolve(base, reference!)), `${name}: ${reference}`).resolves.toBeUndefined()
        }
      }
    }
  })
})
