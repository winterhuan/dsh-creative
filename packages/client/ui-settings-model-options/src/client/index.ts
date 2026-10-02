/** Add model capability and provider retry controls to the built-in Models page. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ProviderOptions } from './ProviderOptions.tsx'
import { providerOptionsFace } from './operations.ts'
import { OutcomeToast } from './OutcomeToast.tsx'
import type { OutcomeNotice } from './OutcomeToast.tsx'
import { en, zh } from './locales.ts'
import type { ModelOptionsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Model capability and request retry settings copy. */
    'settings.modelOptions': ModelOptionsKey
  }
}

/** Namespace of this plugin's dictionaries. */
export const NS = 'settings.modelOptions'

/** Host services used by the provider cards and shared save notifications. */
export const inject = ['slots', 'locale', 'configForms', 'settingsSchema', 'remote', 'remote.settings', 'remote.session']

/**
 * Register provider-card extensions and a save-outcome overlay through disposable slot effects.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'model-options: dictionaries')
  const notice = createSnapshotStore<OutcomeNotice | null>(null)
  let sequence = 0
  for (const ns of ['llm-pi-ai', 'llm-deepseek']) {
    const face = providerOptionsFace(ctx, ns, outcome => { notice.set({ outcome, sequence: ++sequence }) })
    ctx.effect(() => ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
      name: 'settings.models.provider-card', key: ns, locale: NS, inject: () => face,
    }, ProviderOptions)), `model-options: ${ns}`)
  }
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'model-options-outcome', locale: NS,
    inject: () => ({ hooks: { notice }, dismiss: () => { notice.set(null) } }),
  }, OutcomeToast)), 'model-options: outcome toast')
}
