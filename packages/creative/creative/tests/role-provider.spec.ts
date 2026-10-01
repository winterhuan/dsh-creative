import { access, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const knowledge = resolve(import.meta.dirname, '../../story/knowledge')
const roles = resolve(knowledge, 'creative/roles')

describe('packaged specialist instructions', () => {
  it('keeps seven professional identities as readable files, not runtime configuration', async () => {
    const files = (await readdir(roles)).filter(file => file.endsWith('.md')).sort()
    expect(files).toEqual([
      'chapter-extractor.md', 'character-designer.md', 'consistency-checker.md',
      'narrative-writer.md', 'story-architect.md', 'story-explorer.md', 'story-researcher.md',
    ])
    const delegation = await readFile(resolve(knowledge, 'story/references/project/delegation.md'), 'utf8')
    for (const file of files) {
      const body = await readFile(resolve(roles, file), 'utf8')
      expect(body).toContain(`name: ${file.slice(0, -3)}`)
      expect(body).not.toMatch(/creative_role|agent_options|CREATIVE_DSH_ROLE/u)
      expect(delegation).toContain(`../creative/roles/${file}`)
      for (const [, reference] of body.matchAll(/`(references\/[^`]+\.md)`/gu)) {
        await expect(access(resolve(knowledge, 'story', reference!)), `${file}: ${reference}`).resolves.toBeUndefined()
      }
    }
  })

  it('distinguishes native Agent creation from loading instructions in the caller', async () => {
    const delegation = await readFile(resolve(knowledge, 'story/references/project/delegation.md'), 'utf8')
    expect(delegation).toContain('真实 Agent')
    expect(delegation).toContain('`subagent`')
    expect(delegation).toContain('`spawn_teammate`')
    expect(delegation).toContain('`send_message`')
    expect(delegation).toContain('同一 Agent 换专业指令不构成独立审稿')
  })
})
