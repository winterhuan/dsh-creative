import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { registerGameRoutes, serveGamePreview } from '../src/routes.ts'

function response() {
  let status = 0
  let body = ''
  return {
    value: { writeHead: (code: number) => { status = code }, end: (data: string) => { body = data } } as ServerResponse,
    status: () => status,
    body: () => JSON.parse(body),
  }
}

describe('game route boundaries', () => {
  it.each(['/novel-to-game/preview/workspace/a/b/index.html', '/creative/game-preview/workspace/a/b/index.html'])(
    'returns forbidden for an untrusted navigation through %s', async url => {
      const reply = response()
      await serveGamePreview({} as Context, { url, headers: { host: 'attacker.example', 'sec-fetch-site': 'cross-site' } } as IncomingMessage, reply.value)
      expect(reply.status()).toBe(403)
    },
  )

  it('lists only game files and never reads the other domain trees', async () => {
    const directories: Record<string, string[]> = {
      '/ws': ['game-adaptations', '正文', 'video-recaps'],
      '/ws/game-adaptations': ['demo'],
      '/ws/game-adaptations/demo': ['notes.txt'],
    }
    const target = (displayPath: string) => ({ displayPath, targetKey: displayPath })
    const fs = {
      resolve: async (path: string, options?: { cwd?: string }) => target(path.startsWith('/') ? path : `${options?.cwd}/${path}`),
      contains: (parent: { displayPath: string }, child: { displayPath: string }) => child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
      stat: async ({ displayPath }: { displayPath: string }) => directories[displayPath] ? { type: 'directory', version: 'v1' } : displayPath.endsWith('/notes.txt') ? { type: 'file', size: 4, version: 'v1' } : undefined,
      listDir: vi.fn(async ({ displayPath }: { displayPath: string }) => (directories[displayPath] ?? []).map(name => ({ name, target: target(`${displayPath}/${name}`), type: directories[`${displayPath}/${name}`] ? 'directory' : 'file' }))),
    }
    const agent = { session: { id: randomUUID(), header: { cwd: '/ws' } }, ctx: { get: (name: string) => name === 'fs' ? fs : {} } }
    let handler: Parameters<Context['webServer']['register']>[0]['handler'] | undefined
    const ctx = {
      effect: (effect: () => () => void) => effect(),
      webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return () => {} } },
      typert: { lookups: { get: () => ({ resolve: async () => agent }) } },
    } as Context
    registerGameRoutes(ctx, { maxBytes: 2_097_152 })
    const reply = response()
    await handler!({ method: 'GET', url: `/novel-to-game/workspace?sessionId=${agent.session.id}`, headers: { host: 'localhost:3000' } } as IncomingMessage, reply.value)
    expect(reply.status()).toBe(200)
    expect(reply.body().files.map((file: { path: string }) => file.path)).toEqual(['game-adaptations/demo/notes.txt'])
    expect(reply.body().games).toHaveLength(1)
    expect(reply.body()).not.toHaveProperty('videos')
    expect(fs.listDir.mock.calls.map(([path]) => path.displayPath)).toEqual(['/ws/game-adaptations', '/ws/game-adaptations/demo'])
  })

  it('limits the standalone API to reads and releases its route on unload', async () => {
    let handler: Parameters<Context['webServer']['register']>[0]['handler'] | undefined
    const dispose = vi.fn()
    let cleanup: (() => void) | undefined
    const ctx = {
      effect: (effect: () => () => void) => { cleanup = effect() },
      webServer: { register: (route: { path: string; handler: typeof handler }) => { expect(route.path).toBe('/novel-to-game'); handler = route.handler; return dispose } },
    } as Context
    registerGameRoutes(ctx, { maxBytes: 2_097_152 })
    const reply = response()
    await handler!({ method: 'POST', url: '/novel-to-game/file', headers: {} } as IncomingMessage, reply.value)
    expect(reply.status()).toBe(405)
    expect(reply.body()).toHaveProperty('error')
    cleanup!()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
