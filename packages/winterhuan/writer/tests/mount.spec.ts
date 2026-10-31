import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { skillFilesystemRowDisabled, writerSkillMount } from '../src/mount.ts'

describe('skill mount', () => {
  it('defaults to workspace and treats only bundled as bundled', () => {
    expect(writerSkillMount(undefined, undefined)).toBe('workspace')
    expect(writerSkillMount(undefined, 'workspace')).toBe('workspace')
    expect(writerSkillMount('bundled', 'workspace')).toBe('bundled')
    expect(writerSkillMount(undefined, 'bundled')).toBe('bundled')
  })

  it('enables exactly one skill-filesystem row', () => {
    for (const mount of ['workspace', 'bundled'] as const) {
      const enabled = (['workspace', 'bundled'] as const).filter(row => !skillFilesystemRowDisabled(mount, row))
      expect(enabled).toEqual([mount])
    }
  })

  it('puts bundledSkillDir only on the bundled row and resolves it from the package manifest', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const workspace = patch.slice(patch.indexOf('id: skill-filesystem\n'), patch.indexOf('id: skill-filesystem-bundled'))
    const bundled = patch.slice(patch.indexOf('id: skill-filesystem-bundled'))
    expect(workspace).toContain("=== 'bundled'")
    expect(workspace).not.toContain('bundledSkillDir')
    expect(bundled).toContain("!== 'bundled'")
    expect(bundled).toContain("createRequire(baseUrl).resolve('@winterhuan/dsh-writer/package.json')), 'skills'")
    expect(patch).toContain('name: 写作模式')
    expect(patch).toContain('story-long-write')
    expect(patch).toContain('story-short-write')
    expect(patch).toContain('story-deslop')
    expect(patch).not.toContain('/agent')
  })
})
