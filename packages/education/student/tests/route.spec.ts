import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleStudyRequest, trustedStudyRequest } from '../src/route.ts'
import { studyStore, StudyConflict } from '../src/store.ts'
import { setup } from './fixtures.ts'

vi.mock('../src/store.ts', async importOriginal => ({ ...await importOriginal<typeof import('../src/store.ts')>(), studyStore: vi.fn() }))
afterEach(() => vi.mocked(studyStore).mockReset())

async function request({ method = 'GET', body = '', header = {}, session = true, child = false, path = '/student/workspace?sessionId=test' } = {}) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url: path, headers: { host: 'localhost:3000', 'content-type': 'application/json', ...header } }) as IncomingMessage
  let status = 0
  let result = ''
  const res = Object.assign(new EventEmitter(), { writableEnded: false, writeHead(code: number) { status = code }, end(text: string) { result = text; this.writableEnded = true } }) as ServerResponse
  const resolve = vi.fn(async () => session ? { session: { header: { cwd: '/learning', ...(child ? { origin: 'subagent' } : {}) } } } : undefined)
  type Provider = NonNullable<ReturnType<Context['typert']['lookups']['get']>>
  const fake: { typert: { lookups: { get(key: string): Pick<Provider, 'resolve'> | undefined } } } = { typert: { lookups: { get: () => ({ resolve }) } } }
  const context = fake as Context
  await handleStudyRequest(context, req, res)
  return { status, result: JSON.parse(result), resolve }
}

describe('student workspace boundary', () => {
  it('permits same-host loopback requests and rejects cross-site and rebinding origins', () => {
    expect(trustedStudyRequest({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } })).toBe(true)
    for (const headers of [{ host: 'evil.test' }, { host: '127.0.0.1', origin: 'https://evil.test' }, { host: 'localhost', 'sec-fetch-site': 'cross-site' }, { host: 'localhost@evil.test' }]) expect(trustedStudyRequest({ headers })).toBe(false)
  })
  it('does not resolve or read an untrusted request', async () => {
    const result = await request({ header: { origin: 'https://evil.test' } })
    expect(result.status).toBe(403)
    expect(result.resolve).not.toHaveBeenCalled()
    expect(studyStore).not.toHaveBeenCalled()
  })
  it('rejects missing and child sessions', async () => {
    expect((await request({ session: false })).status).toBe(404)
    expect((await request({ child: true })).status).toBe(404)
    expect((await request({ path: '/student/workspace' })).status).toBe(400)
    expect(studyStore).not.toHaveBeenCalled()
  })
  it('returns an absent dashboard without creating a learner', async () => {
    vi.mocked(studyStore).mockResolvedValue(undefined)
    expect((await request()).result).toMatchObject({ revision: 0, study: null })
    expect(studyStore).toHaveBeenCalledWith(expect.anything(), undefined, undefined)
  })
  it('requires revisions, bounds payloads, and disallows client-authored assessments', async () => {
    expect((await request({ method: 'POST', body: JSON.stringify({ change: setup }) })).status).toBe(400)
    expect((await request({ method: 'POST', body: 'x'.repeat(65_537) })).status).toBe(413)
    expect((await request({ method: 'POST', body: JSON.stringify({ revision: 0, change: { action: 'task', task: { id: 'q', sessionId: 's', subject: 'math', topic: 'sum', prompt: '1+1?' } } }) })).status).toBe(403)
    expect(studyStore).not.toHaveBeenCalled()
  })
  it('passes the observed revision and reports conflicts without retrying writes', async () => {
    vi.mocked(studyStore).mockRejectedValue(new StudyConflict())
    const result = await request({ method: 'POST', body: JSON.stringify({ revision: 7, change: setup }) })
    expect(result.status).toBe(409)
    expect(studyStore).toHaveBeenCalledTimes(1)
    expect(studyStore).toHaveBeenCalledWith(expect.anything(), setup, 7)
  })
})
