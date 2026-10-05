/** Game capabilities scoped to the owning Agent preset and native children. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { createNovelToGameSkillProvider } from './skill-provider.ts'
import { registerGameQaTool } from './qa-tool.ts'

export const name = 'novel-to-game-agent'
export const inject = ['skills', 'tools']

/** Register domain Skills and tools for the preset lifetime.
 * @param context - preset-scoped host services.
 */
export function apply(context: Context): void {
  context.effect(() => context.skills.registerProvider(() => createNovelToGameSkillProvider()), 'novel-to-game: skills')
  registerGameQaTool(context)
}
