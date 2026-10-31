/** Save response from the writing host. */
export interface WriterSave {
  readonly path: string
  readonly bytes: number
  readonly version: string
}

/**
 * Build the save URL. The host accepts PUT only.
 * @param sessionId - session that owns the workspace.
 * @param path - workspace-relative path.
 * @returns the route URL.
 */
export function writerFileUrl(sessionId: string, path: string): string {
  const query = new URLSearchParams({ sessionId, path })
  return `/writer/file?${query.toString()}`
}

/**
 * Save text when `baseVersion` still matches the file.
 * @param sessionId - session that owns the workspace.
 * @param path - workspace-relative path.
 * @param content - full new text.
 * @param baseVersion - version from the last read.
 * @param signal - cancellation.
 * @returns the response. Status 412 means the disk copy changed.
 */
export function saveWriterFile(
  sessionId: string,
  path: string,
  content: string,
  baseVersion: string,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(writerFileUrl(sessionId, path), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, baseVersion }),
    signal,
  })
}
