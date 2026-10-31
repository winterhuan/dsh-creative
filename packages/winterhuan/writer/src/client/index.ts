/** Writing-mode browser entry: sidebar workbench and Zhuque settings card. */
import type { Context } from '@deepseek-ai/cordis'
import './plugin.css'
import { apply as applySidebar, inject as sidebarInject, name } from './sidebar.tsx'
import { applyZhuqueSettings, zhuqueInject } from './zhuque-settings.ts'

export { name }
export type {
  ZhuqueSettingsCardProps, WriterZhuqueCardFace, WriterZhuqueCardState,
  WriterZhuqueKeyControlState, WriterZhuqueLocaleKey, WriterZhuqueSettings,
} from './zhuque-settings.ts'
export { WRITER_SETTINGS_NS, WriterZhuqueCardController, ZHUQUE_NS } from './zhuque-settings.ts'

/** Services required by the sidebar and the Zhuque settings page. */
export const inject = [
  ...sidebarInject,
  ...zhuqueInject,
]

/**
 * Register the writing sidebar and the Plugins-page Zhuque credential entry.
 * @param context - browser services.
 */
export function apply(context: Context): void {
  applySidebar(context)
  applyZhuqueSettings(context)
}
