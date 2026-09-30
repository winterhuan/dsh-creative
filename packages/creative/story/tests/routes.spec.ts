import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { registerWorkspaceRoute } from '../src/workspace-route.ts'

// The fixture includes nested books so discovery cannot hide a cross-domain read.
function fixture() {
  const directories: Record<string, string[]> = {
    '/ws': ['正文', 'book', 'game-adaptations', 'video-recaps'],
    '/ws/正文': ['chapter.md', 'poster.png'],
    '/ws/book': ['正文', '剧集'],
    '/ws/book/正文': ['chapter.md'],
    '/ws/book/剧集': ['EP001'],
    '/ws/book/剧集/EP001': ['剧本.md'],
    '/ws/game-adaptations': [], '/ws/video-recaps': [],
  }
  const target = (displayPath: string) => ({ displayPath, targetKey: displayPath })
  const fs = {
    resolve: async (path: string, options?: { cwd?: string }) => target(path.startsWith('/') ? path : `${options?.cwd}/${path}`),
    contains: (parent: { displayPath: string }, child: { displayPath: string }) => child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
    stat: async ({ displayPath }: { displayPath: string }) => directories[displayPath] ? { type: 'directory', version: 'v1' } : directories[displayPath.slice(0, displayPath.lastIndexOf('/'))]?.includes(displayPath.slice(displayPath.lastIndexOf('/') + 1)) ? { type: 'file', size: 4, version: 'v1' } : undefined,
    listDir: vi.fn(async ({ displayPath }: { displayPath: string }) => (directories[displayPath] ?? []).map(name => ({ name, target: target(`${displayPath}/${name}`), type: directories[`${displayPath}/${name}`] ? 'directory' : 'file' }))),
    readBytes: vi.fn(),
  }
  const agent = { session: { id: randomUUID(), header: { cwd: '/ws' } }, ctx: { get: (name: string) => name === 'fs' ? fs : {} } }
  let handler: Parameters<Context['webServer']['register']>[0]['handler'] | undefined
  const dispose = vi.fn()
  let cleanup: (() => void) | undefined
  const context = {
    effect: (effect: () => () => void) => { cleanup = effect() },
    webServer: { register: (route: { handler: typeof handler }) => { handler = route.handler; return dispose } },
    typert: { lookups: { get: () => ({ resolve: async () => agent }) } },
  } as Context
  registerWorkspaceRoute(context, { maxBytes: 2_097_152 })
  return {
    fs, dispose, unload: () => cleanup!(),
    request: async (endpoint: string, path?: string) => {
      let status = 0
      let body = ''
      const reply = { writeHead: (code: number) => { status = code }, end: (data: string) => { body = data } } as ServerResponse
      await handler!({ method: 'GET', url: `/story/${endpoint}?sessionId=${agent.session.id}${path === undefined ? '' : `&path=${encodeURIComponent(path)}`}`, headers: { host: 'localhost:3000' } } as IncomingMessage, reply)
      return { status, body: JSON.parse(body) }
    },
  }
}

describe('standalone story routes', () => {
  it('lists novel documents without traversing nested drama or exposing media', async () => {
    const { request, fs } = fixture()
    const reply = await request('workspace')
    expect(reply.status).toBe(200)
    expect(reply.body.files.map((file: { path: string }) => file.path).sort()).toEqual(['book/正文/chapter.md', '正文/chapter.md'])
    expect(reply.body).not.toHaveProperty('games')
    expect(reply.body).not.toHaveProperty('videos')
    expect(fs.listDir.mock.calls.map(([path]) => path.displayPath)).not.toContain('/ws/book/剧集')
    expect(fs.readBytes).not.toHaveBeenCalled()
  })
  it.each(['book/剧集/EP001/剧本.md', 'game-adaptations/demo/design/GAME_DESIGN.md', 'video-recaps/demo/work/plan.json'])('rejects another domain before reading %s', async path => {
    const { request, fs } = fixture()
    expect((await request('file', path)).status).toBe(415)
    expect(fs.readBytes).not.toHaveBeenCalled()
  })
  it('removes its API on unload', () => {
    const { unload, dispose } = fixture()
    unload()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
