/** Independently installed short-drama workflow and workbench. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import { createDramaSkillProvider } from './skill-provider.ts'
import { registerWorkspaceRoute } from './workspace-route.ts'
import { registerCreativeProduceRunTool } from './produce-tool.ts'
import { ProduceSettingsSchema, type ProduceConfig } from './produce-settings.ts'
import { assertTrustedWorkspaceAuthority } from './workspace-request-trust.ts'
import { registerCreativeProductionTool } from './production-tool.ts'

export * from './skill-provider.ts'
export * from './produce-tool.ts'
export { registerWorkspaceRoute } from './workspace-route.ts'
export * from './production-tool.ts'
export * from './production-intent.ts'

export const name = 'short-drama'
export const inject = ['skills', 'tools']
/** File budgets, trusted authorities and initial credential references. */
export interface Config { readonly editorMaxBytes?: number; readonly trustedHosts?: string[]; readonly produce?: ProduceConfig }
export const Config = z.object({ editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152), trustedHosts: z.array(z.string()).default([]), produce: ProduceSettingsSchema }) as z<Config>
/** Register domain contributions for this plugin's lifetime.
 * @param context - host services.
 * @param config - domain configuration.
 */
export async function apply(context: Context, config: Config = {}): Promise<void> {
  for (const host of config.trustedHosts ?? []) assertTrustedWorkspaceAuthority(host)
  context.effect(() => context.skills.registerProvider(() => createDramaSkillProvider()), 'short-drama: skills')
  registerCreativeProduceRunTool(context, { entry: config.produce ?? {} })
  registerCreativeProductionTool(context)
  context.inject(['webServer', 'typert'], ctx => registerWorkspaceRoute(ctx, { maxBytes: config.editorMaxBytes ?? 2_097_152, trustedHosts: config.trustedHosts ?? [], produce: config.produce ?? {} }))
}
export * from './production-binding.ts'
export * from './production-context.ts'
