/**
 * The story settings page, browser half. It registers into the Plugins page's
 * `plugins.item` slot while the Host serves the `story` namespace.
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { StorySettingsCard } from './StorySettingsCard.tsx'
import { STORY_SETTINGS_NS, StorySettingsCardController } from './story-settings-controller.ts'
import { en, zh, type StorySettingsLocaleKey } from './locales.ts'

export type { StorySettingsCardProps } from './StorySettingsCard.tsx'
export type { StorySettingsCardFace, StorySettingsCardState, StoryKeyControlState, StorySettings } from './story-settings-controller.ts'
export type { StorySettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Story settings page copy. */
    'settings.story': StorySettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.story'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'configForms']

/**
 * Mount the story settings page while the Host serves its namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-story: dictionaries')
  const card = new StorySettingsCardController(ctx.configForms.get(STORY_SETTINGS_NS), ctx)
  ctx.effect(() => () => { card.dispose() }, 'ui-settings-story: form subscription')
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref) => { card.refreshCredential(ref) }),
    'ui-settings-story: credential invalidations',
  )
  ctx.effect(() => ctx.configForms.whileServed([STORY_SETTINGS_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'story', order: 40, label: () => t('title'), locale: NS, inject: () => card.inject(),
  }, StorySettingsCard))), 'ui-settings-story: page')
}
