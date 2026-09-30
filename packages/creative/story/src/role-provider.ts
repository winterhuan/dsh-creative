import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { load } from 'js-yaml'
import { z } from 'zod'
import { defaultStorySkillRoot } from './skill-provider.js'

/** The seven upstream Creative Roles bundled with the plugin, in load order. */
export const CREATIVE_ROLE_NAMES = [
  'chapter-extractor',
  'character-designer',
  'consistency-checker',
  'narrative-writer',
  'story-architect',
  'story-explorer',
  'story-researcher',
] as const

/** One bundled {@link CREATIVE_ROLE_NAMES} role. */
export type CreativeRoleName = typeof CREATIVE_ROLE_NAMES[number]
/** How the role persona is scoped: no tools at all, or the caller's native DSH tools. */
export type CreativeRoleExecution = 'tool-free' | 'native-tools'

/** One packaged Role's model-facing persona and host-owned Agent overrides. */
export interface BundledCreativeRole {
  readonly persona: string
  readonly agentOptions?: AgentOptions
}

function roleSource(source: string): { readonly body: string; readonly frontmatter: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source)
  return {
    body: source.slice(match?.[0].length ?? 0).trim(),
    frontmatter: match?.[1] ?? '',
  }
}

const roleOptionsSchema = z.object({
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  reasoning_effort: z.string().trim().min(1).optional(),
  max_tokens: z.number().int().positive().optional(),
}).strict()

function roleAgentOptions(frontmatter: string): AgentOptions | undefined {
  const metadata = z.object({ agent_options: roleOptionsSchema.optional() }).parse(load(frontmatter) ?? {})
  const options = metadata.agent_options
  if (options === undefined) return undefined
  return {
    ...options.provider === undefined ? {} : { provider: options.provider },
    ...options.model === undefined ? {} : { model: options.model },
    ...options.reasoning_effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(options.reasoning_effort) },
    ...options.max_tokens === undefined ? {} : { maxTokens: options.max_tokens },
  }
}

/**
 * The packaged directory holding the bundled role markdown files.
 * @returns the default role root derived from this module's location.
 */
export function defaultBundledRoleRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../knowledge/creative/roles')
}

/**
 * Load one bundled role as a DSH persona: upstream frontmatter stripped, an
 * execution-scoped DSH integration preamble prepended, and the first line
 * marked `CREATIVE_DSH_ROLE:<name>`.
 * @param name - the bundled role to load.
 * @param roleRoot - directory holding the role markdown files.
 * @param execution - whether the persona runs tool-free or with native tools.
 * @returns the full persona prompt handed to the subagent.
 * @throws Error when the role file is missing or its body is empty.
 */
export async function loadBundledRole(
  name: CreativeRoleName,
  roleRoot = defaultBundledRoleRoot(),
  execution: CreativeRoleExecution = 'tool-free',
): Promise<string> {
  return (await loadBundledRoleDefinition(name, roleRoot, execution)).persona
}

/**
 * Load one bundled Role plus optional host-owned child model overrides.
 * @param name - the bundled Role name.
 * @param roleRoot - directory containing the packaged Role Markdown files.
 * @param execution - tool access instructions for the persona.
 * @returns the persona and validated child options; invalid frontmatter rejects loading.
 */
export async function loadBundledRoleDefinition(
  name: CreativeRoleName,
  roleRoot = defaultBundledRoleRoot(),
  execution: CreativeRoleExecution = 'tool-free',
): Promise<BundledCreativeRole> {
  const source = roleSource(await readFile(join(resolve(roleRoot), `${name}.md`), 'utf8'))
  const body = source.body
  if (body.length === 0) throw new Error(`Bundled role "${name}" is empty.`)
  const integration = execution === 'tool-free'
    ? [
      'You are running inside an Creative review-required DSH collaboration. The caller supplies every permitted input in the prompt.',
      'Do not read or write project files and do not call tools.',
      'Return only the output contract requested by the caller; never claim to have changed the project.',
    ]
    : [
      'You are running as a native creative-dsh specialist. The current DSH workspace and visible tool set are your complete authority boundary.',
      'This exact pinned Role is already active; it needs no project-local agent files or deployment markers.',
      `Bundled resource base directory: ${dirname(defaultStorySkillRoot())}`,
      'Resolve references/ and scripts/ paths in this Role against that package directory. Read references with the native read tool, loading only the material needed for the task; use offset and limit for large files. Project paths remain relative to the caller\'s workspace.',
      'If read or a required resource is unavailable, report the exact missing resource and diagnostic to the caller. Do not substitute a project Skill or another installation, bypass DSH filesystem permissions, or claim that an unread reference was used.',
      'Use only the tools actually visible to you. Mutate files only when the caller explicitly requests it and your visible DSH tools permit it; otherwise return findings to the caller.',
    ]
  const result: BundledCreativeRole = {
    persona: [
      `CREATIVE_DSH_ROLE:${name}`,
      ...integration,
      '',
      body,
    ].join('\n'),
  }
  const agentOptions = roleAgentOptions(source.frontmatter)
  if (agentOptions !== undefined) return { ...result, agentOptions }
  return result
}
