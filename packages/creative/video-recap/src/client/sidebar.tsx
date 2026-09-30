/** Standalone video sidebar, using session files and conversation activity. */
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef } from 'react'
import { fileMutations, latestSettledMutation, runningRootCalls, streamingAssistant } from './activity.ts'
import { NS, zh, en } from './locales/index.ts'
import { useWorkspace } from './workspace-client.ts'
import { createVideoStore } from './state.ts'
import { VideoStudio } from './video-studio.tsx'

type VideoSidebarProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsStore<ReturnType<typeof createVideoStore>> & PropsLocale<typeof NS>

function VideoSession({ t, sessionId, useStore, actions, useChat, useTabInfo }: VideoSidebarProps) {
  const { tab } = useTabInfo()
  const { workspace, error, sessionUnavailable, reload } = useWorkspace(sessionId)
  const videoTab = useStore(memory => memory.videoTab)
  const videoProjectId = useStore(memory => memory.videoProjectId)
  const settled = useChat(latestSettledMutation)
  const previousSettled = useRef(settled)
  const building = useChat(snapshot => fileMutations(runningRootCalls(snapshot.nodes.values()), streamingAssistant(snapshot.timeline))
    .some(activity => activity.path !== undefined && (activity.path.startsWith('video-recaps/') || (workspace !== undefined && activity.path.startsWith(`${workspace.cwd}/video-recaps/`)))))
  useEffect(() => {
    if (previousSettled.current === settled) return
    previousSettled.current = settled
    reload()
  }, [settled, reload])
  const refresh = <div className="oh-video-mode-tabs"><button type="button" onClick={reload}>{t('workbench.reloadFiles')}</button></div>
  if (workspace === undefined) return <main className="oh-video-studio">
    {sessionUnavailable ? <div className="creative-warning" role="alert">{t('session.unavailable')}</div> : error !== undefined
      ? <div className="creative-error" role="alert">{error}{refresh}</div>
      : <div className="oh-video-design-empty">{t('video.connecting')}</div>}
  </main>
  return <VideoStudio key={sessionId} t={t} sessionId={sessionId} projects={workspace.videos}
    running={building} hidden={!tab.visible} tab={videoTab} projectId={videoProjectId}
    onTab={actions.setVideoTab} onProject={actions.setVideoProjectId} workbenches={['video']} onWorkbench={() => {}} />
}

function VideoSidebar(props: VideoSidebarProps) {
  return <div className="creative-workspace" data-workbench="video"><VideoSession key={props.sessionId} {...props} /></div>
}

/**
 * Register a video-only guide entry and session-scoped body in the existing sidebar.
 * @param context - Creative client context with locale, sidebar and slot services.
 */
export function apply(context: Context): void {
  context.effect(() => context.locale.register(NS, { zh, en }), 'video-recap: dictionaries')
  const t = context.locale.bind(NS)
  context.effect(() => context.sidebarRightTabs.register({
    id: '@winterhuan/dsh-video-recap',
    kind: 'video-recap',
    title: () => t('workbench.title'),
    guide: [{ id: 'video', order: 21, title: () => t('workbench.title'), description: () => t('video.connecting'), icon: IconPlayOutlineRegular }],
  }), 'creative: video sidebar')
  context.slots.inject('sidebar.right.pane.tab', () => context.slots.register({
    name: 'sidebar.right.pane.tab',
    key: '@winterhuan/dsh-video-recap',
    locale: NS,
    store: createVideoStore,
  }, VideoSidebar))
}

/** Browser plugin identity. */
export const name = 'video-recap'
/** Services used by the video sidebar. */
export const inject = ['slots', 'sessions', 'locale', 'sidebarRightTabs']
