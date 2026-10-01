import { IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ISessions, SubmissionHandle } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { en, NS, zh, type CreativeLocaleKey } from './locales/index.ts'
import { registerProductionProjection } from './production-projection.ts'
import { registerFileRedirect } from './file-redirect.tsx'
import { CREATIVE_PRODUCTION_TOOL_NAME } from '../production-intent.js'
import { ProductionToolView } from './tool-views.js'
import { endpoint } from './workbench-ui.js'
import { createSaveState } from './editor-buffer.ts'
import { createWorkbenchStore } from './workbench-store.ts'
import { json } from './workspace-client.ts'
import { CreativeWorkspace, type ProductionConversationFace } from './workbench-session.tsx'
import './plugin.css'

export { createWorkbenchStore } from './workbench-store.ts'

export const name = 'short-drama'
export const inject = ['slots', 'sessions', 'conversation', 'uiConversation', 'jobs', 'locale', 'sidebarRight', 'sidebarRightTabs']

const WORKBENCH_KIND = 'short-drama' as const
const WORKBENCH_ID = '@winterhuan/dsh-short-drama'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Creative workbench copy. */
    'shortdrama': CreativeLocaleKey
  }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** A file navigation addressed to one Creative Session. */
    'short-drama': { readonly creativeFile: { readonly sessionId: SessionId; readonly path: string } }
  }
}

/**
 * Register the Creative Sidebar tab, file navigation, and production tool views.
 * @param context - Client services for the Sidebar, Session projections, and slots.
 */
export function apply(context: ClientContext): void {
  context.effect(() => context.locale.register(NS, { zh, en }), 'creative: dictionaries')
  const translate = context.locale.bind(NS)
  context.effect(() => context.sidebarRightTabs.register({
    id: WORKBENCH_ID,
    kind: WORKBENCH_KIND,
    title: () => translate('workbench.title'),
    guide: [{
      id: 'workbench',
      icon: IconPlayOutlineRegular,
      order: 22,
      title: () => translate('workbench.title'),
      description: () => translate('workbench.description'),
    }],
  }), 'creative: Sidebar tab type')
  registerProductionProjection(context)
  registerFileRedirect(context, WORKBENCH_KIND)
  context.slots.inject('sidebar.right.pane.tab', function* () {
    yield context.slots.register({
      name: 'sidebar.right.pane.tab',
      key: WORKBENCH_ID,
      locale: NS,
      store: createWorkbenchStore,
      inject: (sessionId): ProductionConversationFace => {
        const saves = createSaveState()
        const navigationRevisions = new Map<TabId, number>()
        const sessionBinding = (): NonNullable<ReturnType<ISessions['binding']>> => {
          const binding = context.sessions.binding(sessionId)
          if (binding === undefined) throw new Error('DSH 会话当前不可用。')
          return binding
        }
        // This Session-scoped operation owns every complete submission handle it
        // mints: the view may read `requestId` to persist its card before
        // dispatch, but only the owner can retire the local echo with
        // `abandon()` when the prompt never settles.
        const submissions = new Map<SessionRequestId, SubmissionHandle>()
        return {
          hooks: {
            saves: saves.active,
            production: context.uiConversation.binding(sessionBinding()).target('creative-production'),
          },
          // This tab's roster watch rides the shared jobs service; the face
          // hands the service over so the view owns the watch lifecycle.
          jobs: context.jobs,
          beginFileSave: saves.begin,
          endFileSave: saves.end,
          consumeFileNavigation: (tabId, revision) => {
            if (navigationRevisions.get(tabId) === revision) return false
            navigationRevisions.set(tabId, revision)
            return true
          },
          beginProductionSubmission: (prompt) => {
            const handle = sessionBinding().session.beginSubmission({ text: prompt, attachments: [], mode: 'queue' })
            submissions.set(handle.requestId, handle)
            return handle.requestId
          },
          sendProductionPrompt: async (prompt, requestId) => {
            // The view may read the identity to persist its card before dispatch,
            // but only this owner retires the local echo when the prompt cannot
            // reach settlement.
            const handle = submissions.get(requestId)
            let settled = false
            try {
              const session = sessionBinding().session
              const result = await session.prompt([{ type: 'text', text: prompt }], 'queue', undefined, requestId)
              // A prompt that answered settled its own identified echo: a rejected
              // outcome retires the local submission through prompt() itself.
              settled = true
              if (!result.ok) throw new Error(result.error.message)
            } catch (failure) {
              // Session lookup, serialization, transport, or another exception
              // kept the prompt from settling, so nothing else retired the echo.
              if (!settled) handle?.abandon()
              throw failure
            } finally {
              submissions.delete(requestId)
            }
          },
          stopProductionJob: async (job) => {
            await json(await fetch(endpoint('job/stop', sessionId), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(job) }))
          },
          removeQueuedProduction: async (itemId) => {
            const result = await sessionBinding().session.updateQueue(itemId, { kind: 'remove' })
            if (!result.ok) throw new Error(result.error.message)
          },
        }
      },
    }, CreativeWorkspace)
  })
  context.slots.inject('tool.call.toolview', () => context.slots.register({
    name: 'tool.call.toolview',
    key: CREATIVE_PRODUCTION_TOOL_NAME,
    locale: NS,
  }, ProductionToolView))
}
