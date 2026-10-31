/** Keep the writing guide entry on the session that selected the writer preset. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Whether the on-screen session uses the writing preset.
 * @param context - browser session services.
 * @param sessionId - session to inspect.
 * @returns true when the projection says `writer`.
 */
export function isWriterSession(context: Context, sessionId: SessionId | undefined): boolean {
  return sessionId !== undefined && context.sessions.list.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset === 'writer'
}

/**
 * Register the tab type, and show its guide entry only for a writing session.
 * @param context - browser session and sidebar services.
 * @param definition - tab type including its guide entry.
 * @returns a disposer for the subscriptions and the current registration.
 */
export function registerWriterTab(context: Context, definition: SidebarRightTabDefinition): () => void {
  const current = context.uiSession.adapter.current
  let visible: boolean | undefined
  let release: (() => void) | undefined
  const sync = (): void => {
    const next = isWriterSession(context, current.getSnapshot().key as SessionId | undefined)
    if (next === visible) return
    visible = next
    release?.()
    release = context.sidebarRightTabs.register({ ...definition, guide: next ? definition.guide ?? [] : [] })
  }
  const stopCurrent = current.subscribe(sync)
  const stopSessions = context.sessions.list.subscribe(sync)
  sync()
  return () => { stopCurrent(); stopSessions(); release?.() }
}
