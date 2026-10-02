/** Settings and catalog operations bound to the plugin's declared Remote namespaces. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelCatalogModel, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ReadPath } from './options.ts'

/** The form can retain a refused draft and distinguish a revision conflict. */
export type SaveOutcome = { ok: true } | { ok: false; conflict: boolean; message: string }

/** Plain operations and observable values injected into each provider card. */
export interface ProviderOptionsFace {
  hooks: { settings: HostObservable<ConfigFormSnapshot<unknown>> }
  read: ReadPath
  save: (ops: SettingsPathOpView[], revision: number) => Promise<SaveOutcome>
  loadModels: (provider: string) => Promise<{ ok: true; models: readonly ModelCatalogModel[] } | { ok: false; message: string }>
}

/**
 * Bind a provider-family form to the shared settings mirror and native catalog.
 * @param ctx - plugin context with settings and session remotes injected.
 * @param ns - owning settings namespace.
 * @param report - report a settled write from the application-wide toast host.
 * @returns actions that preserve drafts on refusal and fold accepted writes into every settings surface.
 */
export function providerOptionsFace(ctx: Context, ns: string, report: (outcome: SaveOutcome) => void): ProviderOptionsFace {
  const mirror = ctx.configForms.describe()
  return {
    hooks: { settings: ctx.configForms.get<unknown>(ns) },
    read: (value, path) => ctx.settingsSchema.getPath(value, path),
    save: async (ops, revision) => {
      let outcome: SaveOutcome
      try {
        const response = await ctx.remote.settings.mutate(ns, ops, revision)
        if (response.ok) {
          mirror.acceptView(response.value)
          outcome = { ok: true }
        } else {
          outcome = { ok: false, conflict: response.error.code === 'settings/conflict', message: response.error.message }
          if (outcome.conflict) {
            const current = await ctx.remote.settings.describe()
            if (current.ok) {
              const view = current.value.namespaces.find(view => view.ns === ns)
              if (view !== undefined) mirror.acceptView(view)
            }
          }
        }
      } catch (error) {
        outcome = { ok: false, conflict: false, message: error instanceof Error ? error.message : String(error) }
      }
      report(outcome)
      return outcome
    },
    loadModels: async provider => {
      try {
        const response = await ctx.remote.session.modelCatalog()
        if (!response.ok) return { ok: false, message: response.error.message }
        const failure = response.value.failures.find(item => item.id === provider)
        if (failure !== undefined) return { ok: false, message: failure.message }
        return { ok: true, models: response.value.groups.find(group => group.id === provider)?.models ?? [] }
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
    },
  }
}
