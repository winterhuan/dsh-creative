/** Session projection owns domain-mode availability, including blank-session selections. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry/types'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Read the selected preset from the current Session list, failing closed while unknown.
 * @param context - browser Session services.
 * @param sessionId - Session to inspect.
 * @returns whether this Session uses the domain preset.
 */
export function isModeSession(context: Context, sessionId: SessionId | undefined): boolean {
  return sessionId !== undefined && context.sessions.list.getSnapshot().byId[sessionId]?.projectionValues?.agentPreset === 'student'
}

/** Keep the domain guide entry visible only for the on-screen domain Session.
 * The tab body and its persisted store remain registered across Session switches.
 * @param context - browser Session and sidebar services.
 * @param definition - domain tab type with its guide entry.
 * @returns disposer for the subscriptions and current tab registration.
 */
export function registerModeTab(context: Context, definition: SidebarRightTabDefinition): () => void {
  const current = context.uiSession.adapter.current
  let visible: boolean | undefined
  let release: (() => void) | undefined
  const sync = () => {
    const next = isModeSession(context, current.getSnapshot().key as SessionId | undefined)
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
