import { readdir, readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const DRAMA_PROVIDER_NAME = 'short-drama'
const DSH_SKILL_ROUTING = [
  'Workflow stages are Skills: load each one with the skill tool and its exact catalog name in the name argument. For a $name or /name reference, omit the prefix. Loading supplies instructions to the current Agent.',
]
const DSH_DRAMA_BRIDGE = [
  '<short-drama-dsh-integration>',
  'This Skill is a native contribution to the current DeepSeek Harness session.',
  'DSH owns the workspace, model, preset, permissions, Session Log, tools, approvals, cancellation, resume, and Agent UI.',
  ...DSH_SKILL_ROUTING,
  'The 短剧 tab is the creator workspace. Never start another web server, creator UI, Agent runtime, session transport, or model configuration.',
  'Drama Skills use one creator-first contract: each episode keeps only the requested documents, up to five creator-facing sources at 剧集/<EP>/剧本.md, 视觉设定.md, 分镜.md, 图片提示词.md, and 视频提示词.md. Never precreate empty documents, backfill nominal stages, or start work the creator did not request. Persisted reviews use creator-readable Markdown under 审查/; an oral review writes nothing.',
  'Never create a parallel JSON/JSONL lifecycle truth, indexes, fingerprints, coverage tables, or QA records merely because maintenance scripts and templates remain bundled.',
  'Use only tools visible in the current DSH preset and preserve project ownership, freshness, review, and explicit production-confirmation contracts.',
  'Use creative_production only for semantic production-view intents (open/focus, explicit shot order, or tracking a job that this Agent is actually executing). Cosmetic canvas layout remains creator-controlled. The tool changes only the Session projection: it does not edit creator documents, generate media, or authorize production.',
  'Production credentials remain outside project files. Never treat a prior acceptance, preview, continuation request, or budget discussion as confirmation for a paid production run.',
  'Use drama_produce_status to check configured production adapters when that tool is visible. Ordinary bash os.environ checks do not inspect the DSH credential store. For Agnes images use drama_produce_run with entry drama and adapter agnes-image after job confirmation. Never request API keys in chat or read credential files; missing credentials are configured in Settings > Plugins > Creative production.',
  '</short-drama-dsh-integration>',
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

/** Resolve the packaged short-drama skill directory.
 * @returns the absolute skill directory.
 */
export function defaultDramaSkillRoot(): string { return resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/drama/skills') }
/** Create the short-drama skill catalog.
 * @param skillRoot - packaged resource override.
 * @returns the domain provider.
 */
export function createDramaSkillProvider(skillRoot = defaultDramaSkillRoot()): SkillProvider { return createBundledSkillProvider(DRAMA_PROVIDER_NAME, skillRoot, `${DSH_DRAMA_BRIDGE.replace("</short-drama-dsh-integration>", "")}\nNovel export: ${resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/source-tools/export_novel_txt.py')}\nSource lineage: ${resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/source-tools/record_lineage.py')}\n</short-drama-dsh-integration>`) }
