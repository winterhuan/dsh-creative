/** Standalone game sidebar, using session files and conversation activity. */
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useRef, useState } from 'react'
import { fileMutations, latestSettledMutation, runningRootCalls, streamingAssistant } from './activity.ts'
import { NS, zh, en } from './locales.ts'
import { useWorkspace } from './workspace.ts'
import { createGameStore } from './state.ts'
import { GameStudio } from './studio.tsx'

type GameSidebarProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsStore<ReturnType<typeof createGameStore>> & PropsLocale<typeof NS>

function GameSession({ t, sessionId, useStore, actions, useChat, useTabInfo }: GameSidebarProps) {
  const { tab } = useTabInfo()
  const { workspace, error, sessionUnavailable, reload } = useWorkspace(sessionId)
  const gameTab = useStore(memory => memory.gameTab)
  const gameProjectId = useStore(memory => memory.gameProjectId)
  const [selected, setSelected] = useState<string>()
  const settled = useChat(latestSettledMutation)
  const previousSettled = useRef(settled)
  const building = useChat(snapshot => fileMutations(runningRootCalls(snapshot.nodes.values()), streamingAssistant(snapshot.timeline))
    .some(activity => activity.path !== undefined && (activity.path.startsWith('game-adaptations/') || (workspace !== undefined && activity.path.startsWith(`${workspace.cwd}/game-adaptations/`)))))
  useEffect(() => {
    if (previousSettled.current === settled) return
    previousSettled.current = settled
    reload()
  }, [settled, reload])
  const refresh = <div className="oh-game-mode-tabs"><button type="button" onClick={reload}>{t('workbench.reloadFiles')}</button></div>
  if (workspace === undefined) return <main className="oh-game-studio">
    {sessionUnavailable ? <div className="creative-warning" role="alert">{t('session.unavailable')}</div> : error !== undefined
      ? <div className="creative-error" role="alert">{error}{refresh}</div>
      : <div className="oh-game-design-empty">{t('game.connecting')}</div>}
  </main>
  return <GameStudio key={sessionId} t={t} sessionId={sessionId} games={workspace.games} files={workspace.files}
    building={building} selected={selected} hidden={!tab.visible} gameTab={gameTab} gameProjectId={gameProjectId}
    onGameTab={actions.setGameTab} onGameProject={actions.setGameProjectId} onSelect={setSelected} navigation={refresh} />
}

function GameSidebar(props: GameSidebarProps) {
  return <div className="game-workspace"><GameSession key={props.sessionId} {...props} /></div>
}

/**
 * Register a game-only guide entry and session-scoped body in the existing sidebar.
 * @param context - Creative client context with locale, sidebar and slot services.
 */
export function apply(context: Context): void {
  context.effect(() => context.locale.register(NS, { zh, en }), 'novel-to-game: dictionaries')
  const t = context.locale.bind(NS)
  context.effect(() => context.sidebarRightTabs.register({
    id: '@winterhuan/dsh-creative/game',
    kind: 'creative-game',
    title: () => t('game.sidebar.title'),
    guide: [{ id: 'game', order: 23, title: () => t('game.sidebar.title'), description: () => t('game.sidebar.description'), icon: IconPlayOutlineRegular }],
  }), 'creative: game sidebar')
  context.slots.inject('sidebar.right.pane.tab', () => context.slots.register({
    name: 'sidebar.right.pane.tab',
    key: '@winterhuan/dsh-creative/game',
    locale: NS,
    store: createGameStore,
  }, GameSidebar))
}

/** Browser plugin identity. */
export const name = 'novel-to-game'
/** Services used by the game sidebar. */
export const inject = ['slots', 'sessions', 'locale', 'sidebarRightTabs']
