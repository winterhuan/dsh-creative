import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { createStudySkillProvider } from './skill-provider.ts'
import { registerStudyRoute } from './route.ts'
import { registerStudyTools } from './tools.ts'

/** Independent student plugin identity. */
export const name = 'student'
/** Native services required for skills and learning records. */
export const inject = ['skills', 'tools']

/** Install study contributions; DSH disposes their registrations with this plugin's scope. */
export function apply(context: Context): void {
  context.effect(() => context.skills.registerProvider(() => createStudySkillProvider()), 'student: study skill')
  registerStudyTools(context)
  registerStudyRoute(context)
}
