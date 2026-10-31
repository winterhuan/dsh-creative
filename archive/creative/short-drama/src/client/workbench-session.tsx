import type { IJobs } from '@deepseek-ai/dsh-api-job-controller/client'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { JobView } from '@deepseek-ai/dsh-jobs/view'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { latestSettledMutation, runningRootCalls, streamingAssistant } from './file-activity.js'
import { NS } from './locales/index.ts'
import { productionQueueFromInbox, type ProductionQueueEntry } from './production-runtime.js'
import type { SettledProductionIntent } from './production-intents.js'
import type { ProductionBinding } from '../production-binding.ts'
import type { createWorkbenchStore } from './workbench-store.ts'
import { useWorkspace } from './workspace-client.ts'
import { CreativeWorkbench } from './workbench-editor.tsx'

/** Session-owned commands and snapshots injected into the short-drama tab. */
export interface ProductionConversationFace {
  readonly hooks: {
    readonly saves: ObservableSnapshot<ReadonlySet<string>>
    readonly production: ObservableSnapshot<readonly SettledProductionIntent[] | undefined>
  }
  /** The client jobs service: this tab's roster watch, its rows, and kill. */
  readonly jobs: IJobs
  readonly consumeFileNavigation: (tabId: TabId, revision: number) => boolean
  readonly beginFileSave: (path: string) => boolean
  readonly endFileSave: (path: string) => void
  readonly beginProductionSubmission: (prompt: string) => SessionRequestId
  readonly sendProductionPrompt: (prompt: string, requestId: SessionRequestId) => Promise<void>
  readonly stopProductionJob: (job: ProductionBinding['job']) => Promise<void>
  readonly removeQueuedProduction: (itemId: ProductionQueueEntry['id']) => Promise<void>
}

export type WorkbenchSlotProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsStore<ReturnType<typeof createWorkbenchStore>> & InjectFace<ProductionConversationFace> & PropsLocale<typeof NS>

/** Stable empty roster so the live-jobs selector keeps snapshot identity while a session has no rows. */
const NO_LIVE_JOBS: readonly JobView[] = []

/** Keep session subscriptions mounted with the tab and supply its file editor. */
export function CreativeWorkspace({
  t, sessionId, useChat, useProjection, useStore, actions,
  useTabInfo, useSaves, useProduction, jobs, consumeFileNavigation, beginFileSave, endFileSave,
  beginProductionSubmission, sendProductionPrompt, stopProductionJob, removeQueuedProduction,
}: WorkbenchSlotProps) {
  const { tab } = useTabInfo()
  // Active tool roots come from the formal Chat node store, not a secondary
  // running-call slice: one root lifecycle drives both surfaces.
  const chatNodes = useChat(snapshot => snapshot.nodes.values())
  const runningCalls = useMemo(() => runningRootCalls(chatNodes), [chatNodes])
  const partial = useChat(snapshot => streamingAssistant(snapshot.timeline))
  const settledMutation = useChat(snapshot => latestSettledMutation(snapshot))
  const inbox = useProjection('inbox')
  const productionQueue = useMemo(() => productionQueueFromInbox(inbox), [inbox])
  // This tab owns its session's roster watch for as long as it is mounted.
  // Until the watch is in place the rows are not authoritative, so job
  // identity classifies as "loading" rather than "unavailable".
  const [jobsWatched, setJobsWatched] = useState(false)
  useEffect(() => {
    const stop = jobs.watchRows(sessionId)
    setJobsWatched(true)
    return stop
  }, [jobs, sessionId])
  const liveJobs = useSyncExternalStore(
    listener => jobs.state.subscribe(listener),
    () => jobs.state.getSnapshot().rows[sessionId],
  ) ?? NO_LIVE_JOBS
  const productionIntents = useProduction(snapshot => snapshot)
  const savingPaths = useSaves(snapshot => snapshot)
  const { workspace, error, sessionUnavailable, loading: workspaceLoading, reload } = useWorkspace(sessionId)
  return <CreativeWorkbench
    sessionId={sessionId}
    runningCalls={runningCalls}
    partial={partial}
    settledMutation={settledMutation}
    productionQueue={productionQueue}
    productionIntents={productionIntents ?? []}
    liveJobs={liveJobs}
    jobsReady={jobsWatched}
    workspace={workspace}
    error={error}
    sessionUnavailable={sessionUnavailable}
    workspaceLoading={workspaceLoading}
    reload={reload}
    open={tab.visible}
    navigation={tab.navigation}
    tabId={tab.id}
    consumeFileNavigation={consumeFileNavigation}
    savingPaths={savingPaths}
    beginFileSave={beginFileSave}
    endFileSave={endFileSave}
    beginProductionSubmission={beginProductionSubmission}
    sendProductionPrompt={sendProductionPrompt}
    stopProductionJob={stopProductionJob}
    removeQueuedProduction={removeQueuedProduction}
    useStore={useStore}
    actions={actions}
    t={t}
  />
}
