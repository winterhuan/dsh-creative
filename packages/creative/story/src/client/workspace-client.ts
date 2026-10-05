/** Workspace listing and response handling for the Creative client. */
import { useCallback, useEffect, useState } from 'react'
import { endpoint } from './workbench-ui.ts'

/** A listed file revision; content is loaded separately. */
export interface WorkspaceFile {
  readonly path: string
  readonly bytes: number
  readonly version: string
}
/** Session workspace index with an explicit completeness flag. */
export interface WorkspacePayload {
  readonly cwd: string
  /** Absent while the running host still serves the file-only response. */
  readonly books?: readonly string[]
  readonly files: readonly WorkspaceFile[]
  readonly truncated: boolean
  readonly mode: 'dsh-session'
}
/** A workspace HTTP failure with its response status. */
export class WorkspaceRequestError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

/**
 * Decode a workspace response and preserve HTTP failure status.
 * @param response - response from a Creative endpoint.
 * @returns the endpoint's decoded payload.
 */
export async function json<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { readonly error?: string }
  if (!response.ok) throw new WorkspaceRequestError(response.status, value.error ?? `HTTP ${String(response.status)}`)
  return value
}

/**
 * Load the current Session directory without exposing another Session's files.
 * @param sessionId - the active Session identity.
 * @returns the latest listing, read error, and explicit refresh action.
 */
export function useWorkspace(sessionId: string): {
  readonly workspace: WorkspacePayload | undefined
  readonly error: string | undefined
  readonly reload: () => void
  readonly refresh: number
} {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ readonly sessionId: string; readonly workspace: WorkspacePayload }>()
  const [failure, setFailure] = useState<{ readonly sessionId: string; readonly message: string }>()
  const reload = useCallback(() => {
    setVersion(value => value + 1)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setFailure(undefined)
    void fetch(endpoint('workspace', sessionId), { signal: controller.signal })
      .then(response => json<WorkspacePayload>(response))
      .then((workspace) => { if (!controller.signal.aborted) setResult({ sessionId, workspace }) })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setFailure({ sessionId, message: reason instanceof Error ? reason.message : String(reason) })
        }
      })
    return () => { controller.abort() }
  }, [sessionId, version])
  const workspace = result?.sessionId === sessionId ? result.workspace : undefined
  const currentFailure = failure?.sessionId === sessionId ? failure : undefined
  return {
    workspace, error: currentFailure?.message, reload, refresh: version,
  }
}
