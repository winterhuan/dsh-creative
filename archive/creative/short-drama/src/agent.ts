/** Short-drama capabilities scoped to the owning Agent preset and native children. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import { createDramaSkillProvider } from './skill-provider.ts'
import { registerCreativeProduceRunTool } from './produce-tool.ts'
import z from '@deepseek-ai/schemastery'
import { ProduceSettingsSchema, type ProduceConfig } from './produce-settings.ts'
import { registerCreativeProductionTool } from './production-tool.ts'

export const name = 'short-drama-agent'
export const inject = ['skills', 'tools']

/** Optional production seed for custom compositions without global production settings. */
export interface Config { readonly produce?: ProduceConfig }
export const Config = z.object({ produce: ProduceSettingsSchema }) as z<Config>

/** Register domain Skills and tools for the preset lifetime.
 * @param context - preset-scoped host services.
 * @param config - optional production defaults.
 */
export function apply(context: Context, config: Config = {}): void {
  context.effect(() => context.skills.registerProvider(() => createDramaSkillProvider()), 'short-drama: skills')
  registerCreativeProduceRunTool(context, { entry: config.produce ?? {} })
  registerCreativeProductionTool(context)
}
