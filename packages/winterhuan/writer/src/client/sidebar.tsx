/** Register the writing sidebar: tab type, then the keyed body slot. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect } from 'react'
import { WriterDesk } from './desk.tsx'
import { en, NS, zh } from './locales.ts'
import { registerWriterTab } from './mode.ts'

export const name = 'writer'
export const inject = ['slots', 'sessions', 'uiSession', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

const TAB_ID = '@winterhuan/dsh-writer'
type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS>

/**
 * Register the writing tab and its body. The guide entry follows the selected preset.
 * @param context - browser services.
 */
export function apply(context: Context): void {
  context.effect(() => context.locale.register(NS, { zh, en }), 'writer: dictionaries')
  const t = context.locale.bind(NS)
  context.effect(() => registerWriterTab(context, {
    id: TAB_ID,
    kind: 'writer',
    title: () => t('title'),
    guide: [{ id: 'writer', order: 22, title: () => t('title'), description: () => t('description'), icon: IconEditOutlineRegular }],
  }), 'writer: sidebar type')
  function Sidebar({ sessionId, useTabInfo, useSessions, t: copy }: Props) {
    const preset = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
    const cwd = useSessions(state => state.byId[sessionId]?.cwd)
    const { tab } = useTabInfo()
    useEffect(() => { if (typeof preset === 'string' && preset !== 'writer') tab.actions.close() }, [preset, tab.actions])
    if (preset !== 'writer') return null
    if (cwd === undefined) return <p className="writer-empty">{copy('noWorkspace')}</p>
    return <WriterDesk sessionId={sessionId} cwd={cwd} remote={context.remote} t={copy} visible={tab.visible} />
  }
  context.effect(() => context.slots.inject('sidebar.right.pane.tab', () => context.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS },
    Sidebar,
  )), 'writer: sidebar body')
}
