/**
 * Writer settings page (Zhuque + cover keys), browser half. Registers into the
 * Plugins page's `plugins.item` slot while the Host serves the `writer` namespace.
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ZhuqueSettingsCard } from './ZhuqueSettingsCard.tsx'
import { WRITER_SETTINGS_NS, WriterZhuqueCardController } from './zhuque-settings-controller.ts'
import { en, zh, type WriterZhuqueLocaleKey } from './zhuque-locales.ts'

export type { ZhuqueSettingsCardProps } from './ZhuqueSettingsCard.tsx'
export type {
  WriterZhuqueCardFace, WriterZhuqueCardState, WriterZhuqueKeyControlState, WriterZhuqueSettings,
} from './zhuque-settings-controller.ts'
export type { WriterZhuqueLocaleKey } from './zhuque-locales.ts'
export { WRITER_SETTINGS_NS, WriterZhuqueCardController } from './zhuque-settings-controller.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Writer Zhuque settings page copy. */
    'settings.writer': WriterZhuqueLocaleKey
  }
}

/** Dictionary namespace owned by the Writing settings page. */
export const ZHUQUE_NS = 'settings.writer'

/** Cordis services the Writing settings page needs beyond the sidebar. */
export const zhuqueInject = ['remote.credentials', 'configForms'] as const

/**
 * Mount the Writing settings page while the Host serves the writer namespace.
 * @param ctx - the browser plugin context.
 */
export function applyZhuqueSettings(ctx: ClientContext): void {
  const t = ctx.locale.bind(ZHUQUE_NS)
  ctx.effect(() => ctx.locale.register(ZHUQUE_NS, { zh, en }), 'writer: zhuque dictionaries')
  const card = new WriterZhuqueCardController(ctx.configForms.get(WRITER_SETTINGS_NS), ctx)
  ctx.effect(() => () => { card.dispose() }, 'writer: zhuque form subscription')
  ctx.effect(
    () => ctx.remote.$on('credentials/reference-updated', (ref) => { card.refreshCredential(ref) }),
    'writer: zhuque credential invalidations',
  )
  ctx.effect(() => ctx.configForms.whileServed([WRITER_SETTINGS_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'writer', order: 40, label: () => t('title'), locale: ZHUQUE_NS, inject: () => card.inject(),
  }, ZhuqueSettingsCard))), 'writer: zhuque settings page')
}
