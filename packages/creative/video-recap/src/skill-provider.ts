import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const VIDEO_PROVIDER_NAME = 'video-recap'
const DSH_VIDEO_BRIDGE = [
  '<video-recap-dsh-integration>',
  'This Skill is a native contribution to the current DeepSeek Harness session.',
  'DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, Todo, Chat, and the 视频 preview Studio.',
  'Load video-recap or video-script with the skill tool using its exact name. Media stages are references, not additional Skills. Resolve references/ and skills/ paths against the provided resource base and read only needed material with native read.',
  'Use foreground subagent calls (run_in_background: false) for prerequisite stages. Reserve background delegation for independent work, and collect each terminal result and verify required files before using its output.',
  'After a failed delegation, report its actual diagnostic (or say it is unavailable), inspect partial artifacts, and resume only missing authorized work. Authentication and endpoint failures need DSH provider settings repaired; do not reinstall Skills or silently switch providers.',
  'Never start a second Agent runtime, creator UI, session transport, web server, polling loop, or model configuration.',
  'Put each project under video-recaps/<project>/, source media under sources/, and use work/ as work_dir so the Studio can discover authoritative manifests and outputs.',
  'Short-drama production outputs are ready recap sources: copy files from 剧集/<EP>/制作成果/ into the recap project sources/ preserving filenames (SHOT-/VISUAL- ids are the identity), then run the normal pipeline. Record deliveries with this plugin\'s record_lineage.py at the Source lineage path below.',
  'The Video Studio is a preview and artifact surface, not a nonlinear editor. Do not invent a second project-state format, timeline truth, or render queue; recap_run_manifest.json, recap_phase.json, timeline.json, assembly_manifest.json, and the documented pipeline artifacts remain authoritative.',
  'MIMO_API_KEY, FISH_API_KEY, and voice credentials resolve from the creative-produce profile and credential store. Run credentialed production only through video_produce_run; ordinary bash children do not receive those configured keys. Never put secrets in project files, visible arguments, or chat.',
  'Use only DSH-visible tools and approvals. Run Python and ffmpeg through the current DSH execution world, preserve cancellation, and do not install or upgrade system dependencies without explicit user approval.',
  '</video-recap-dsh-integration>',
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
      const entries = await readdir(root, { withFileTypes: true })
      const directories = (await Promise.all(entries.filter(entry => entry.isDirectory()).map(async (entry) => {
        const files = await readdir(join(root, entry.name), { withFileTypes: true })
        return files.some(file => file.isFile() && file.name === 'SKILL.md') ? entry.name : undefined
      }))).filter((name): name is string => name !== undefined).sort()
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
          resourceBase: { kind: 'directory', path: dirname(root) },
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
        resourceBase: { kind: 'directory', path: dirname(root) },
        path,
        content: `${bridge}\n\n${parsed.content}`,
      }
    },
  }
}

/** Resolve the packaged video-recap skill directory.
 * @returns the absolute skill directory.
 */
export function defaultVideoRecapSkillRoot(): string { return resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/video-recap/skills') }
/** Create the video-recap skill catalog.
 * @param skillRoot - packaged resource override.
 * @returns the domain provider.
 */
export function createVideoRecapSkillProvider(skillRoot = defaultVideoRecapSkillRoot()): SkillProvider { return createBundledSkillProvider(VIDEO_PROVIDER_NAME, skillRoot, `${DSH_VIDEO_BRIDGE.replace("</video-recap-dsh-integration>", "")}\nSource lineage: ${resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/source-tools/record_lineage.py')}\n</video-recap-dsh-integration>`) }
