import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const STORY_PROVIDER_NAME = 'story'
const DSH_SKILL_ROUTING = [
  'Workflow stages are Skills: load each one with the skill tool and its exact catalog name in the name argument. For a $name or /name reference, omit the prefix. Loading supplies instructions to the current Agent.',
  'For an independent specialist, follow references/project/delegation.md and use the visible native delegation tools. Put the professional identity, absolute Role file and resource base in the child task; the actual child reads its instructions. Use native Agent Teams only when the user explicitly requests team collaboration.',
]
const DSH_SKILL_BRIDGE = [
  '<creative-dsh-integration>',
  'This Skill is a native contribution to the current DeepSeek Harness session.',
  'DSH owns the workspace, model, preset, permissions, Session Log, tools, subagents, cancellation, resume, and Agent UI.',
  'Never start another Agent runtime, session transport, creator UI, SSE stream, polling loop, or model configuration.',
  ...DSH_SKILL_ROUTING,
  'Use foreground subagent calls (run_in_background: false) for prerequisite stages. Reserve background delegation for independent work, and collect each terminal result and verify required files before using its output.',
  'After a failed delegation, report its actual diagnostic (or say it is unavailable), inspect partial artifacts, and resume only missing authorized work. Authentication and endpoint failures need DSH provider settings repaired; do not reinstall Skills or silently switch providers.',
  'Roles do not require project-local platform files or deployment markers.',
  'Use only DSH-visible tools. DSH sandbox and permission policy remain authoritative.',
  '</creative-dsh-integration>',
].join('\n')

interface ParsedSkill {
  readonly name: string
  readonly description: string
  readonly content: string
  readonly userInvocable: boolean
}

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const lines = frontmatter.split(/\r?\n/u)
  const index = lines.findIndex(line => new RegExp(`^${key}:\\s*`, 'u').test(line))
  if (index < 0) return undefined
  const raw = lines[index]?.replace(new RegExp(`^${key}:\\s*`, 'u'), '').trim()
  if (raw === undefined) return undefined
  if (raw === '>' || raw === '|' || raw === '>-' || raw === '|-') {
    const values: string[] = []
    for (const line of lines.slice(index + 1)) {
      if (/^\S/u.test(line)) break
      values.push(line.trim())
    }
    return (raw.startsWith('>') ? values.join(' ') : values.join('\n')).trim()
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try { return JSON.parse(raw) as string }
    catch { return raw.slice(1, -1) }
  }
  return raw.replace(/^['"]|['"]$/gu, '')
}

/**
 * Parse one bundled `SKILL.md` into its frontmatter identity and body.
 * @param source - the raw skill file content.
 * @returns the parsed name, description, body, and user-invocation metadata.
 * @throws Error when frontmatter is missing, the name is not a slug, or the
 * description is empty.
 */
export function parseBundledSkill(source: string): ParsedSkill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source)
  if (match?.[1] === undefined) throw new Error('Bundled skill is missing YAML frontmatter.')
  const name = frontmatterValue(match[1], 'name')
  const description = frontmatterValue(match[1], 'description')
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) throw new Error('Bundled skill has an invalid name.')
  if (!description) throw new Error(`Bundled skill "${name}" has no description.`)
  return {
    name,
    description,
    content: source.slice(match[0].length),
    userInvocable: frontmatterValue(match[1], 'user-invocable') !== 'false',
  }
}

function createBundledSkillProvider(
  providerName: string,
  skillRoot: string,
  bridge: string,
): SkillProvider {
  const root = resolve(skillRoot)
  const resourceBase = { kind: 'directory' as const, path: dirname(root) }
  return {
    name: providerName,
    async list(): Promise<readonly SkillCandidate[]> {
      const directories = (await readdir(root, { withFileTypes: true }))
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort()
      return Promise.all(directories.map(async (directory): Promise<SkillCandidate> => {
        const path = join(root, directory, 'SKILL.md')
        const parsed = parseBundledSkill(await readFile(path, 'utf8'))
        if (parsed.name !== directory) throw new Error(`Bundled skill directory "${directory}" does not match name "${parsed.name}".`)
        return {
          name: parsed.name,
          description: parsed.description,
          invocation: { modelInvocable: true, userInvocable: parsed.userInvocable },
          provider: providerName,
          source: 'bundled',
          resourceBase,
          rank: BUNDLED_SKILL_RANK,
          locator: pathToFileURL(path),
          path,
        }
      }))
    },
    async get(candidate): Promise<SkillDefinition | undefined> {
      if (candidate.provider !== providerName || typeof candidate.path !== 'string') return undefined
      const path = resolve(candidate.path)
      const relativePath = relative(root, path)
      if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
        throw new Error('Bundled skill locator escaped the packaged skill root.')
      }
      const parsed = parseBundledSkill(await readFile(path, 'utf8'))
      if (parsed.name !== candidate.name) return undefined
      return {
        name: parsed.name,
        description: parsed.description,
        invocation: { modelInvocable: true, userInvocable: parsed.userInvocable },
        provider: providerName,
        source: 'bundled',
        resourceBase,
        path,
        content: `${bridge}\n\n${parsed.content}`,
      }
    },
  }
}

/** Resolve the packaged story skill directory.
 * @returns the absolute skill directory.
 */
export function defaultStorySkillRoot(): string { return resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/story/skills') }
/** Create the story skill catalog.
 * @param skillRoot - packaged resource override.
 * @returns the domain provider.
 */
export function createStorySkillProvider(skillRoot = defaultStorySkillRoot()): SkillProvider { return createBundledSkillProvider(STORY_PROVIDER_NAME, skillRoot, DSH_SKILL_BRIDGE) }
