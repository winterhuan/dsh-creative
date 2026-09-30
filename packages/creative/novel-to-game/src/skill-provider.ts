import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const DSH_GAME_BRIDGE = [
  '<novel-to-game-dsh-integration>',
  'This Skill is a native contribution to the current DeepSeek Harness session.',
  'DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, Todo, and Chat UI.',
  'Load each workflow Skill by its exact catalog name using the DSH skill tool.',
  'Use foreground subagent calls (run_in_background: false) for prerequisite stages. Reserve background delegation for independent work, and collect each terminal result and verify required files before using its output.',
  'After a failed delegation, report its actual diagnostic (or say it is unavailable), inspect partial artifacts, and resume only missing authorized work. Authentication and endpoint failures need DSH provider settings repaired; do not reinstall Skills or silently switch providers.',
  'The 游戏 tab is the playable Game Studio. Never start a second Agent runtime, creator UI, session transport, or model configuration.',
  'Write game adaptation artifacts under game-adaptations/<project>/ using the seven bundled Skills and their artifact requirements.',
  'For a web target, keep the authoritative playable entry at build/app/index.html so Game Studio can preview it. Do not silently replace a requested non-web runtime with a web build.',
  'Use only DSH-visible tools and approvals. qa/verification.json remains the sole machine QA truth and must cover launch, render, input, coreLoop, outcome, and restart with real execution evidence.',
  'Adapt games from the novel (a story workspace or novel text), never from short-drama documents: screenplay density cannot support system design, and same-IP dual adaptation shares the novel upstream, not the drama. Record the adaptation edge with the packaged record_lineage.py when intaking from a novel workspace or export package.',
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
          resourceBase: { kind: 'directory', path: join(root, directory) },
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
        resourceBase: { kind: 'directory', path: join(root, parsed.name) },
        path,
        content: `${bridge}\n\n${parsed.content}`,
      }
    },
  }
}

/**
 * Resolve the game plugin's packaged Skill directory.
 * @returns the absolute resource directory.
 */
export function defaultNovelToGameSkillRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/skills')
}

/**
 * Build the game-only provider with local packaged source-exchange tools.
 * @param skillRoot - game Skill resource root.
 * @returns the provider registered with DSH skills.
 */
export function createNovelToGameSkillProvider(skillRoot = defaultNovelToGameSkillRoot()): SkillProvider {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/source-tools')
  const bridge = `${DSH_GAME_BRIDGE}\nNovel export: ${join(source, 'export_novel_txt.py')}\nAdaptation lineage: ${join(source, 'record_lineage.py')}\nSource index and coverage: ${join(source, 'novel_index.py')}\nGame starter: ${join(skillRoot, 'game-build/templates/create_game.py')}\nRun authenticated QA with game_qa, supplying the game project root.\n</novel-to-game-dsh-integration>`
  return createBundledSkillProvider('novel-to-game', skillRoot, bridge)
}
