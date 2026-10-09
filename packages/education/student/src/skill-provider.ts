import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BUNDLED_SKILL_RANK, type SkillProvider } from '@deepseek-ai/dsh-skill'

/** Provide the study Skill, teaching references and default textbook pages from the installed package. */
export function createStudySkillProvider(): SkillProvider {
  const root = fileURLToPath(new URL('../knowledge/skills/study/', import.meta.url))
  const path = `${root}SKILL.md`
  const read = async () => {
    const source = await readFile(path, 'utf8')
    const match = /^---\r?\n[\s\S]*?^description: (.+)\r?\n[\s\S]*?^---\r?\n([\s\S]*)$/mu.exec(source)
    if (!match?.[1] || !match[2]) throw new Error('study SKILL.md requires description frontmatter and a body.')
    return { description: match[1], content: match[2] }
  }
  const identity = { name: 'study', provider: 'student', source: 'bundled' as const, invocation: { modelInvocable: true, userInvocable: true }, resourceBase: { kind: 'directory' as const, path: root }, path }
  return {
    name: 'student',
    async list() { return [{ ...identity, description: (await read()).description, rank: BUNDLED_SKILL_RANK, locator: pathToFileURL(path) }] },
    async get(candidate) {
      if (candidate.name !== identity.name || candidate.provider !== identity.provider || candidate.path !== path) return undefined
      return { ...identity, ...await read() }
    },
  }
}
