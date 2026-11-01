import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import { afterEach, expect, it } from 'vitest'
import { packageSkillsDir } from '../src/skills-dir.ts'
import { syncWriterSkills, unsyncWriterSkills } from '../src/sync-skills.ts'

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function tempDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `dsh-writer-${name}-`))
  tempDirs.push(dir)
  return dir
}

it('copies story skills into .agents/skills without overwriting, then a force sync replaces them', async () => {
  const project = await tempDir('project')
  await mkdir(join(project, '.git'))
  const book = join(project, 'book')
  await mkdir(book)
  const source = packageSkillsDir()
  const first = await syncWriterSkills({ sourceDir: source, workspaceDir: book, force: false })
  expect(first.root).toBe(project)
  expect(first.copied).toEqual(expect.arrayContaining(['story', 'story-long-write', 'story-short-write', 'story-deslop', 'story-zhuque', 'story-long-scan', 'story-long-analyze', 'story-short-scan', 'story-short-analyze', 'story-cover', 'browser-cdp']))
  expect(first.skipped).toEqual([])
  const storyFile = join(project, '.agents/skills/story/SKILL.md')
  const original = await readFile(storyFile, 'utf8')
  await writeFile(storyFile, '---\nname: story\ndescription: local edit\n---\n\nlocal\n')
  const second = await syncWriterSkills({ sourceDir: source, workspaceDir: book, force: false })
  expect(second.copied).not.toContain('story')
  expect(second.skipped).toContain('story')
  expect(await readFile(storyFile, 'utf8')).toContain('local edit')
  const forced = await syncWriterSkills({ sourceDir: source, workspaceDir: book, force: true })
  expect(forced.copied).toContain('story')
  expect(await readFile(storyFile, 'utf8')).toBe(original)
})

it('discovers story skills from the workspace copy and not from an unused bundled directory', async () => {
  const home = await tempDir('home')
  const project = await tempDir('discover')
  await mkdir(join(project, '.git'))
  await syncWriterSkills({ sourceDir: packageSkillsDir(), workspaceDir: project, force: false })
  const bundled = await tempDir('bundled')
  await mkdir(join(bundled, 'only-bundled'), { recursive: true })
  await writeFile(join(bundled, 'only-bundled/SKILL.md'), '---\nname: only-bundled\ndescription: should stay hidden\n---\n\nno\n')
  const ctx = new Context()
  const bundledCtx = new Context()
  try {
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillFileSystem, {
      dshHome: join(home, '.dsh'),
      agentsHome: join(home, '.agents'),
      watch: false,
    })
    const names = (await ctx.skills.list({ cwd: join(project, 'chapters') })).map(skill => skill.name)
    expect(names).toEqual(expect.arrayContaining(['story', 'story-long-write', 'story-short-write', 'story-deslop', 'story-zhuque', 'story-long-scan', 'story-long-analyze', 'story-short-scan', 'story-short-analyze', 'story-cover', 'browser-cdp']))
    expect(names).not.toContain('only-bundled')
    await bundledCtx.plugin(SkillRegistry)
    await bundledCtx.plugin(SkillFileSystem, {
      dshHome: join(home, '.dsh'),
      agentsHome: join(home, '.agents'),
      watch: false,
      includeDefaultRoots: false,
      bundledSkillDir: packageSkillsDir(),
    })
    const bundledNames = (await bundledCtx.skills.list({ cwd: project })).map(skill => skill.name)
    expect(bundledNames).toContain('story-long-write')
    expect(bundledNames).not.toContain('only-bundled')
  } finally {
    await ctx.fiber.dispose()
    await bundledCtx.fiber.dispose()
  }
})

it('unsync removes only packaged Writer skill directories and leaves other project skills', async () => {
  const project = await tempDir('unsync')
  await mkdir(join(project, '.git'))
  const source = packageSkillsDir()
  await syncWriterSkills({ sourceDir: source, workspaceDir: project, force: false })
  const custom = join(project, '.agents/skills/my-custom-skill')
  await mkdir(custom, { recursive: true })
  await writeFile(join(custom, 'SKILL.md'), '---\nname: my-custom-skill\ndescription: keep me\n---\n\nkeep\n')
  const storyFile = join(project, '.agents/skills/story/SKILL.md')
  expect(await readFile(storyFile, 'utf8')).toContain('name: story')
  const result = await unsyncWriterSkills({ sourceDir: source, workspaceDir: project })
  expect(result.removed).toEqual(expect.arrayContaining(['story', 'story-long-write', 'story-cover']))
  expect(result.removed).not.toContain('my-custom-skill')
  await expect(readFile(storyFile, 'utf8')).rejects.toThrow()
  expect(await readFile(join(custom, 'SKILL.md'), 'utf8')).toContain('keep me')
  const again = await unsyncWriterSkills({ sourceDir: source, workspaceDir: project })
  expect(again.removed).toEqual([])
  expect(again.missing).toEqual(expect.arrayContaining(['story', 'story-long-write']))
})

it('sync can still force-write packaged skills after default mounts as bundled', async () => {
  const project = await tempDir('sync-after-bundled')
  await mkdir(join(project, '.git'))
  const source = packageSkillsDir()
  const forced = await syncWriterSkills({ sourceDir: source, workspaceDir: project, force: true })
  expect(forced.copied).toEqual(expect.arrayContaining(['story', 'story-zhuque']))
  expect(await readFile(join(project, '.agents/skills/story/SKILL.md'), 'utf8')).toContain('name: story')
})
