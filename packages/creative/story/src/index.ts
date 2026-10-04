/** Independently installed story workflow and workbench. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import z from '@deepseek-ai/schemastery'
import { createStorySkillProvider } from './skill-provider.ts'
import { registerWorkspaceRoute } from './workspace-route.ts'
import { registerCreativeProduceRunTool } from './produce-tool.ts'
import { assertTrustedWorkspaceAuthority } from './workspace-request-trust.ts'
import { registerCreativeHooks } from './native-hooks.ts'

export * from './skill-provider.ts'
export * from './produce-tool.ts'
export { registerWorkspaceRoute } from './workspace-route.ts'
export * from './native-hooks.ts'

export const name = 'story'
export const inject = ['skills', 'tools']
/** File budgets, trusted authorities and the Zhuque credential reference. The reference is volatile so the settings page can edit it without remounting the plugin. */
export interface Config { readonly editorMaxBytes?: number; readonly trustedHosts?: string[]; readonly makersApiKeyEnv?: Volatile<string> }
export const Config = z.object({
  editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152),
  trustedHosts: z.array(z.string()).default([]),
  makersApiKeyEnv: z.string().role('credential-ref').default('MAKERS_API_KEY').volatile(),
}) as z<Config>
/** Register domain contributions for this plugin's lifetime.
 * @param context - host services.
 * @param config - domain configuration.
 */
export async function apply(context: Context, config: Config = {}): Promise<void> {
  for (const host of config.trustedHosts ?? []) assertTrustedWorkspaceAuthority(host)
  context.effect(() => context.skills.registerProvider(() => createStorySkillProvider()), 'story: skills')
  const makersApiKeyEnv = typeof config.makersApiKeyEnv === 'string' ? config.makersApiKeyEnv : undefined
  registerCreativeProduceRunTool(context, {
    entry: makersApiKeyEnv === undefined ? {} : { makersApiKeyEnv },
  })
  registerCreativeHooks(context)
  context.inject(['webServer', 'typert'], ctx => registerWorkspaceRoute(ctx, { maxBytes: config.editorMaxBytes ?? 2_097_152, trustedHosts: config.trustedHosts ?? [] }))
}
