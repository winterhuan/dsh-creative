/** Learning capabilities scoped to the owning Agent preset and native children. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { createStudySkillProvider } from './skill-provider.ts'
import { registerStudyTools } from './tools.ts'

export const name = 'student-agent'
export const inject = ['skills', 'tools']

/** Register domain Skills and tools for the preset lifetime.
 * @param context - preset-scoped host services.
 */
export function apply(context: Context): void {
  context.effect(() => context.skills.registerProvider(() => createStudySkillProvider()), 'student: skills')
  registerStudyTools(context)
}
