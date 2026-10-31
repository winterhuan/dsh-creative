/**
 * Build the absolute URL for one workspace-route call.
 * @param path - route path below `/story`, e.g. `file` or `workspace`.
 * @param sessionId - the DSH session the call addresses.
 * @param file - optional workspace-relative path parameter.
 * @returns the URL string all client fetches use.
 */
export function endpoint(path: string, sessionId: string, file?: string): string {
  const url = new URL(`/story/${path}`, globalThis.location.origin)
  url.searchParams.set('sessionId', sessionId)
  if (file !== undefined) url.searchParams.set('path', file)
  return url.toString()
}
