/**
 * Route Chat file opens for Creative project files into the single Creative workbench.
 *
 * Chat opens a file as a `dsh-resource://file/session/<id>/<path>` resource. This tab type claims
 * those addresses at the `extension` band when the path is a Creative text or media file, so it
 * outranks the plain-text preview. Its body immediately replaces itself with the `creative` page,
 * carrying the path as a navigation parameter, so one workbench tab serves every file.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { useEffect } from 'react'
import { creativeMediaMimeType, isCreativeTextPath, parseCreativePath } from '../project-path.ts'

/** Implementation identity of the redirect tab type. */
const REDIRECT_ID = '@winterhuan/dsh-story/file-redirect'
/** Kind of the redirect tab type. */
const REDIRECT_KIND = 'story-file'

/**
 * Resolve a file address to the workspace-relative Creative path it names.
 * @param context - Client services used to read the Session's working directory.
 * @param address - a `dsh-resource://file/...` address.
 * @returns the Session and Creative path, or `undefined` for any other address.
 */
function creativeFileOf(context: ClientContext, address: string): { readonly sessionId: SessionId; readonly path: string } | undefined {
  const file = parseFileAddress(address)
  if (file?.scope !== 'session') return undefined
  const sessionId = file.sessionId as SessionId
  const cwd = context.sessions.list.getSnapshot().byId[sessionId]?.cwd
  const parsed = parseCreativePath(file.path, cwd)
  if (parsed?.domain !== 'story' || parsed.projectRoot !== '' || (!isCreativeTextPath(parsed) && creativeMediaMimeType(parsed.path) === undefined)) return undefined
  return { sessionId, path: parsed.path }
}

/**
 * Register the redirect tab type and its self-replacing body.
 * @param context - Client services for the Sidebar and slots.
 * @param workbenchKind - the Creative workbench page kind to open.
 */
export function registerFileRedirect(context: ClientContext, workbenchKind: 'story'): void {
  context.effect(() => context.sidebarRightTabs.register({
    id: REDIRECT_ID,
    kind: REDIRECT_KIND,
    patterns: ['dsh-resource://file/session/**'],
    canOpen: address => creativeFileOf(context, address) !== undefined,
    title: address => address.slice(address.lastIndexOf('/') + 1),
  }), 'creative: file redirect tab type')

  function FileRedirect({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'>) {
    const { tab } = useTabInfo()
    const address = tab.navigation.address
    useEffect(() => {
      const creativeFile = creativeFileOf(context, address)
      if (creativeFile === undefined) tab.actions.close()
      else tab.actions.openTab(workbenchKind, { replaceTab: true, params: { creativeFile } })
    }, [address, tab.actions])
    return null
  }

  context.slots.inject('sidebar.right.pane.tab', () => context.slots.register({
    name: 'sidebar.right.pane.tab',
    key: REDIRECT_ID,
  }, FileRedirect))
}
