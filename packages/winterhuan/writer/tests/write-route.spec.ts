import { FsError } from '@deepseek-ai/dsh-fs'
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { expect, it, vi } from 'vitest'
import { registerWriterRoute } from '../src/write-route.ts'

function fixture() {
  const versions: Record<string, string> = { '/ws/novel/正文/第001章.md': 'v1' }
  const contents: Record<string, string> = { '/ws/novel/正文/第001章.md': '旧稿' }
  const target = (displayPath: string) => ({ displayPath, targetKey: displayPath })
  const fs = {
    resolve: async (path: string, options?: { cwd?: string }) => target(path.startsWith('/') ? path : `${options?.cwd ?? ''}/${path}`),
    contains: (parent: { displayPath: string }, child: { displayPath: string }) => child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
    writeText: vi.fn(async ({ displayPath }: { displayPath: string }, content: string, condition: { version?: string }) => {
      if (condition.version !== versions[displayPath]) throw new FsError('stale', 'FS_STALE_VERSION')
      contents[displayPath] = content
      versions[displayPath] = 'v2'
      return { after: content, version: 'v2', operation: 'replace' }
    }),
  }
  const agent = { session: { id: 'session-1', header: { cwd: '/ws' } }, ctx: { get: (service: string) => service === 'fs' ? fs : undefined } }
  let handler: ((request: IncomingMessage, response: ServerResponse) => Promise<void>) | undefined
  const context = Object.assign(new Context(), {
    effect: (effect: () => () => void) => { effect() },
    webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } },
    typert: { lookups: { get: () => ({ resolve: async () => agent }) } },
    logger: () => ({ error: () => {}, warn: () => {} }),
  })
  registerWriterRoute(context, { maxBytes: 2_097_152, trustedHosts: [] })
  return {
    contents,
    request: async (path: string, input: { content: string, baseVersion?: string }, host = 'localhost:3000') => {
      let status = 0
      let body = ''
      const reply = { writeHead: (code: number) => { status = code }, end: (data: string) => { body = data }, headersSent: false } as ServerResponse
      await handler!({
        method: 'PUT',
        url: `/writer/file?sessionId=session-1&path=${encodeURIComponent(path)}`,
        headers: { host },
        async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(input)) },
      } as IncomingMessage, reply)
      return { status, body: JSON.parse(body) as { version?: string, error?: string } }
    },
  }
}

it('saves a chapter when the version matches and rejects a stale write', async () => {
  const { request, contents } = fixture()
  const saved = await request('novel/正文/第001章.md', { content: '新稿', baseVersion: 'v1' })
  expect(saved.status).toBe(200)
  expect(saved.body.version).toBe('v2')
  expect(contents['/ws/novel/正文/第001章.md']).toBe('新稿')
  const stale = await request('novel/正文/第001章.md', { content: '再改', baseVersion: 'v1' })
  expect(stale.status).toBe(412)
  expect(contents['/ws/novel/正文/第001章.md']).toBe('新稿')
})

it('refuses paths outside the book and untrusted hosts', async () => {
  const { request } = fixture()
  expect((await request('../秘密.md', { content: 'x', baseVersion: 'v1' })).status).toBe(403)
  expect((await request('novel/notes.md', { content: 'x', baseVersion: 'v1' })).status).toBe(403)
  expect((await request('novel/正文/第001章.md', { content: 'x', baseVersion: 'v1' }, 'evil.example')).status).toBe(403)
})
