/** Novel capabilities scoped to the story Agent preset and its native children. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { createStorySkillProvider } from './skill-provider.ts'
import { registerCreativeProduceRunTool } from './produce-tool.ts'
import { registerCreativeHooks } from './native-hooks.ts'

export const name = 'story-agent'
export const inject = ['skills', 'tools']

/** Register novel Skills, tools and write guards within the owning preset scope.
 * @param context - preset-scoped host context.
 */
export function apply(context: Context): void {
  context.effect(() => context.skills.registerProvider(() => createStorySkillProvider()), 'story: skills')
  registerCreativeProduceRunTool(context)
  registerCreativeHooks(context)
}
