import { registerModeTab } from './mode.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useMemo } from 'react'
import { NS, zh, en } from './locales.ts'
import { tutorBridge } from './bridge.ts'
import { StudyDesk } from './desk.tsx'

export const name = 'student'
export const inject = ['slots', 'sessions', 'uiSession', 'locale', 'sidebarRightTabs']
type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS>

/** Register the learning desk inside DSH's existing session sidebar. */
export function apply(context: Context): void {
  context.effect(() => context.locale.register(NS, { zh, en }), 'student: dictionaries')
  const t = context.locale.bind(NS)
  context.effect(() => registerModeTab(context, {
    id: '@winterhuan/dsh-student', kind: 'student', title: () => t('title'),
    guide: [{ id: 'student', order: 24, title: () => t('title'), description: () => t('description'), icon: IconPlayOutlineRegular }],
  }), 'student: sidebar')
  function Sidebar({ sessionId, useTabInfo, useSession, useSessions, t }: Props) {
    const preset = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
    const { tab } = useTabInfo()
    useEffect(() => { if (typeof preset === 'string' && preset !== 'student') tab.actions.close() }, [preset, tab.actions])
    const running = useSession(snapshot => snapshot.running)
    const ask = useMemo(() => tutorBridge(context, sessionId, t('sessionError'), t('sendError')), [sessionId, t])
    if (preset !== 'student') return null
    return <StudyDesk key={sessionId} sessionId={sessionId} visible={tab.visible} running={!!running} ask={ask} t={t} />
  }
  context.slots.inject('sidebar.right.pane.tab', () => context.slots.register({ name: 'sidebar.right.pane.tab', key: '@winterhuan/dsh-student', locale: NS }, Sidebar))
}
