/** Independently installable novel-to-game skills, QA and workspace previews. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import { createNovelToGameSkillProvider } from './skill-provider.ts'
import { registerGameQaTool } from './qa-tool.ts'
import { registerGameRoutes } from './routes.ts'
import { assertTrustedWorkspaceAuthority } from './workspace-request-trust.ts'

export { createNovelToGameSkillProvider, defaultNovelToGameSkillRoot } from './skill-provider.ts'
export { createGameQaTool } from './qa-tool.ts'
export { gameQaEnvironment, validateGameEvidence, WorkspaceVerificationTracker, type GameVerificationBinding, type GameVerificationFreshness } from './verification.ts'
export { gameRoot, previewContentSecurityPolicy, workspaceGameProjects, serveGamePreview, registerGameRoutes } from './routes.ts'

export const name = 'novel-to-game'
export const inject = ['skills', 'tools']

/** Game metadata read limits and allowed additional host authorities. */
export interface Config {
  readonly editorMaxBytes?: number
  readonly trustedHosts?: string[]
}

export const Config = z.object({
  editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152),
  trustedHosts: z.array(z.string()).default([]),
}) as z<Config>

/**
 * Register game contributions without loading other Creative business domains.
 * @param context - DSH skills and tools context.
 * @param config - file read limits and permitted host authorities.
 */
export function apply(context: Context, config: Config = {}): void {
  const trustedHosts = config.trustedHosts ?? []
  for (const host of trustedHosts) assertTrustedWorkspaceAuthority(host)
  context.effect(() => context.skills.registerProvider(() => createNovelToGameSkillProvider()), 'novel-to-game: skills')
  registerGameQaTool(context)
  context.inject(['webServer', 'typert'], ctx => registerGameRoutes(ctx, { maxBytes: config.editorMaxBytes ?? 2_097_152, trustedHosts }))
}
