/** A cancellable read of one book, retaining only that book's last successful snapshot on failure. */
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { endpoint } from './workbench-ui.ts'
import { parseTrackingView, type TrackingView } from './tracking-view.ts'

const fileResponse = z.object({ content: z.string(), version: z.string() })

/** Read a book's tracking without using the editor buffer or issuing write requests.
 * @param sessionId - active Session identity.
 * @param path - full workspace-relative tracking path, absent while no book is selected.
 * @param refresh - explicit refresh generation, including workspace listing changes.
 * @param version - observed file version, when listed.
 * @returns current snapshot and its load state; failed refreshes keep same-book data marked stale.
 */
export function useTracking(sessionId: string, path: string | undefined, refresh: number, version: string | undefined) {
  const key = `${sessionId}\0${path ?? ''}`
  const [snapshot, setSnapshot] = useState<{ key: string; state: TrackingView }>()
  const [request, setRequest] = useState<{ key: string; status: 'loading' | 'ready' | 'missing' | 'error'; failure?: 'read' | 'invalid' }>()
  useEffect(() => {
    if (path === undefined) return
    const controller = new AbortController()
    setSnapshot(current => current?.key === key ? current : undefined)
    setRequest({ key, status: 'loading' })
    void (async () => {
      let failure: 'read' | 'invalid' = 'read'
      try {
        const response = await fetch(endpoint('file', sessionId, path), { signal: controller.signal })
        if (response.status === 404) {
          if (!controller.signal.aborted) { setSnapshot(undefined); setRequest({ key, status: 'missing' }) }
          return
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        failure = 'invalid'
        const file = fileResponse.parse(await response.json())
        const state = parseTrackingView(file.content)
        if (!controller.signal.aborted) { setSnapshot({ key, state }); setRequest({ key, status: 'ready' }) }
      } catch {
        // Abort belongs to the previous book/request and must not replace the current display.
        if (!controller.signal.aborted) setRequest({ key, status: 'error', failure })
      }
    })()
    return () => { controller.abort() }
  }, [sessionId, path, key, refresh, version])
  return {
    state: snapshot?.key === key ? snapshot.state : undefined,
    status: path === undefined ? 'missing' : request?.key === key ? request.status : 'loading',
    failure: request?.key === key ? request.failure : undefined,
  }
}
