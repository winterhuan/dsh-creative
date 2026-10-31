import type { IncomingHttpHeaders } from 'node:http'

interface TrustRequest {
  readonly headers: IncomingHttpHeaders | Headers
}

function header(headers: IncomingHttpHeaders | Headers, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function parseAuthority(authority: string): URL | undefined {
  try { return new URL(`http://${authority}`) }
  catch { return undefined }
}

function canonicalAuthority(entry: string, url: URL): string {
  const port = url.port !== '' ? url.port : new URL(`https://${entry}`).port
  return port === '' ? url.hostname : `${url.hostname}:${port}`
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
}

function isTrustedAuthority(host: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const candidate = parseAuthority(entry)
    if (candidate === undefined) return false
    return canonicalAuthority(entry, candidate) === candidate.hostname
      ? candidate.hostname === host.hostname
      : candidate.host === host.host
  })
}

/**
 * Reject a trustedHosts entry that is not a bare host or host:port.
 * @param entry - one configured authority.
 */
export function assertTrustedWriterAuthority(entry: string): void {
  const url = parseAuthority(entry)
  if (url !== undefined && canonicalAuthority(entry, url) === entry.toLocaleLowerCase()) return
  throw new Error(`writer: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`)
}

/**
 * Accept loopback and configured authorities, and reject cross-site browser requests.
 * @param request - the incoming request.
 * @param trustedHosts - extra authorities from plugin config.
 * @returns whether the write route may run.
 */
export function isTrustedWriterRequest(request: TrustRequest, trustedHosts: readonly string[]): boolean {
  const authority = header(request.headers, 'host')
  if (authority === undefined) return false
  const host = parseAuthority(authority)
  if (host === undefined) return false
  if (!isLoopbackHostname(host.hostname) && !isTrustedAuthority(host, trustedHosts)) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try { return new URL(origin).host === host.host }
  catch { return false }
}
