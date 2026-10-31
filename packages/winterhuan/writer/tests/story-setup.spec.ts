import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

const root = new URL('../skills/story-setup/', import.meta.url)

it('tells story-setup to skip Claude Code and Codex hooks on DSH', async () => {
  const skill = await readFile(new URL('SKILL.md', root), 'utf8')
  const dsh = skill.indexOf('DeepSeek Harness（DSH）')
  const claude = skill.indexOf('你自身的运行环境')
  expect(dsh).toBeGreaterThan(0)
  expect(dsh).toBeLessThan(claude)
  expect(skill).toContain('不要部署 Claude Code 的 `.claude/hooks`')
  expect(skill).toContain('不要部署 Codex 的 `.codex/hooks.json`')
  expect(skill).toContain('references/deploy-dsh.md')
  const deploy = await readFile(new URL('references/deploy-dsh.md', root), 'utf8')
  expect(deploy).toContain('`.claude/hooks/`')
  expect(deploy).toContain('`.codex/hooks.json`')
  expect(deploy).toContain('target_cli: dsh')
  const claudeDeploy = await readFile(new URL('references/deploy-claude-code.md', root), 'utf8')
  const codexDeploy = await readFile(new URL('references/deploy-codex.md', root), 'utf8')
  expect(claudeDeploy).toContain('`.claude/hooks/`')
  expect(codexDeploy).toContain('`.codex/hooks.json`')
})
