import { randomUUID } from 'node:crypto'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { registerWorkspaceRoute } from '../src/workspace-route.ts'

// Sibling books share chapter names; access must retain each complete project path.
function fixture(cwd = '/ws') {
  const directories: Record<string, string[]> = {
    '/ws': ['正文', 'book', 'game-adaptations', 'video-recaps'],
    '/ws/正文': ['chapter.md', 'poster.png'],
    '/ws/book': ['正文', '剧集'],
    '/ws/book/正文': ['chapter.md'],
    '/ws/book/剧集': ['EP001'],
    '/ws/book/剧集/EP001': ['剧本.md'],
    '/ws/game-adaptations': [], '/ws/video-recaps': [],
    '/collection': ['book', 'other', '长篇', '短篇', 'archive', 'node_modules', '.hidden'],
    '/collection/book': ['正文', '追踪'],
    '/collection/book/正文': ['第一卷'],
    '/collection/book/正文/第一卷': ['chapter.md'],
    '/collection/book/追踪': ['_tracking-state.json'],
    '/collection/other': ['正文.md', '追踪'],
    '/collection/other/追踪': ['_tracking-state.json'],
    '/collection/长篇': ['书甲'],
    '/collection/长篇/书甲': ['正文'],
    '/collection/长篇/书甲/正文': ['chapter.md'],
    '/collection/短篇': ['书乙'],
    '/collection/短篇/书乙': ['正文.md'],
    '/collection/archive': ['old'],
    '/collection/archive/old': ['正文'],
    '/collection/archive/old/正文': ['chapter.md'],
    '/collection/node_modules': ['正文.md'],
    '/collection/.hidden': ['正文.md'],
  }
  const contents: Record<string, string> = {
    '/collection/book/追踪/_tracking-state.json': '{"title":"Book"}',
    '/collection/other/追踪/_tracking-state.json': '{"title":"Other"}',
  }
  const versions: Record<string, number> = {}
  const target = (displayPath: string) => ({ displayPath, targetKey: displayPath })
  const fs = {
    resolve: async (path: string, options?: { cwd?: string }) => target(path.startsWith('/') ? path : `${options?.cwd}/${path}`),
    contains: (parent: { displayPath: string }, child: { displayPath: string }) => child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
    stat: async ({ displayPath }: { displayPath: string }) => directories[displayPath] ? { type: 'directory', version: 'v1' } : directories[displayPath.slice(0, displayPath.lastIndexOf('/'))]?.includes(displayPath.slice(displayPath.lastIndexOf('/') + 1)) ? { type: 'file', size: 4, version: `v${versions[displayPath] ?? 1}` } : undefined,
    listDir: vi.fn(async ({ displayPath }: { displayPath: string }) => (directories[displayPath] ?? []).map(name => ({ name, target: target(`${displayPath}/${name}`), type: directories[`${displayPath}/${name}`] ? 'directory' : 'file' }))),
    readBytes: vi.fn(async ({ displayPath }: { displayPath: string }) => Buffer.from(contents[displayPath] ?? `Chapter at ${displayPath}`)),
    writeText: vi.fn(async ({ displayPath }: { displayPath: string }, content: string, condition: { kind: string; version: string }) => {
      const version = versions[displayPath] ?? 1
      if (condition.version !== `v${version}`) throw new FsError('Version changed', 'FS_STALE_VERSION')
      contents[displayPath] = content
      versions[displayPath] = version + 1
      return { after: content, version: `v${version + 1}` }
    }),
  }
  const agent = { session: { id: randomUUID(), header: { cwd } }, ctx: { get: (name: string) => name === 'fs' ? fs : { resolve: () => ({}) } } }
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
    fs, directories, contents, dispose, unload: () => cleanup!(),
    request: async (endpoint: string, path?: string, input?: { content: string; baseVersion: string }) => {
      let status = 0
      let body = ''
      const reply = { writeHead: (code: number) => { status = code }, end: (data: string) => { body = data } } as ServerResponse
      await handler!({ method: input === undefined ? 'GET' : 'PUT', url: `/story/${endpoint}?sessionId=${agent.session.id}${path === undefined ? '' : `&path=${encodeURIComponent(path)}`}`, headers: { host: 'localhost:3000' },
        async *[Symbol.asyncIterator]() { if (input !== undefined) yield Buffer.from(JSON.stringify(input)) },
      } as IncomingMessage, reply)
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
    expect(fs.listDir.mock.calls.map(([path]) => path.displayPath)).toEqual(['/ws/正文', '/ws', '/ws/book/正文'])
    expect(fs.readBytes).not.toHaveBeenCalled()
  })

  it('lists immediate books without reading metadata or traversing deeper collections', async () => {
    const { request, fs } = fixture('/collection')
    const reply = await request('workspace')
    expect(reply.status).toBe(200)
    expect(reply.body.files.map((file: { path: string }) => file.path).sort()).toEqual([
      'book/正文/第一卷/chapter.md', 'book/追踪/_tracking-state.json', 'other/正文.md', 'other/追踪/_tracking-state.json',
    ])
    expect(reply.body).not.toHaveProperty('projects')
    expect(fs.readBytes).not.toHaveBeenCalled()
    expect(fs.listDir.mock.calls.map(([path]) => path.displayPath)).not.toContain('/collection/archive')
    expect(fs.listDir.mock.calls.map(([path]) => path.displayPath)).not.toContain('/collection/长篇')
  })
  it.each([
    ['/collection/book', '正文/第一卷/chapter.md'],
    ['/collection/长篇/书甲', '正文/chapter.md'],
    ['/collection/短篇/书乙', '正文.md'],
  ])('discovers the project opened directly at %s', async (cwd, file) => {
    const { request } = fixture(cwd)
    const reply = await request('workspace')
    expect(reply.status).toBe(200)
    expect(reply.body.files.map((value: { path: string }) => value.path)).toContain(file)
  })
  it('reads and saves a child book using the observed version without changing a sibling chapter', async () => {
    const { request, fs } = fixture()
    const file = await request('file', 'book/正文/chapter.md')
    expect(file.status).toBe(200)
    expect(file.body.content).toBe('Chapter at /ws/book/正文/chapter.md')
    expect((await request('file', 'book/正文/chapter.md', { content: 'Revised chapter', baseVersion: file.body.version })).status).toBe(200)
    expect((await request('file', 'book/正文/chapter.md')).body.content).toBe('Revised chapter')
    expect((await request('file', '正文/chapter.md')).body.content).toBe('Chapter at /ws/正文/chapter.md')
    expect(fs.writeText).toHaveBeenCalledWith(expect.objectContaining({ displayPath: '/ws/book/正文/chapter.md' }), 'Revised chapter', { kind: 'replaceIfVersion', version: 'v1' }, undefined, {})
    expect((await request('file', 'book/正文/chapter.md', { content: 'Stale chapter', baseVersion: 'v1' })).status).toBe(412)
    expect((await request('file', 'book/正文/chapter.md')).body.content).toBe('Revised chapter')
  })
  it('recognizes a directly nested novel whose folder is named 短篇', async () => {
    const { request, directories } = fixture('/collection')
    directories['/collection/短篇'] = ['正文.md']
    expect((await request('workspace')).body.files.map((file: { path: string }) => file.path)).toContain('短篇/正文.md')
    expect((await request('file', '短篇/正文.md')).status).toBe(200)
  })
  it('rejects links into another novel or outside the workspace', async () => {
    const { request, fs } = fixture()
    const resolve = fs.resolve
    fs.resolve = async (path, options) => path === 'book/正文/chapter.md'
      ? resolve('/ws/正文/chapter.md') : resolve(path, options)
    expect((await request('file', 'book/正文/chapter.md')).status).toBe(403)
    expect((await request('file', 'book/正文/chapter.md', { content: 'overwrite', baseVersion: 'v1' })).status).toBe(403)
    fs.resolve = async (path, options) => path === 'book/正文/chapter.md'
      ? resolve('/outside/chapter.md') : resolve(path, options)
    expect((await request('file', 'book/正文/chapter.md')).status).toBe(403)
    expect(fs.readBytes).not.toHaveBeenCalled()
    expect(fs.writeText).not.toHaveBeenCalled()
  })
  it('omits linked documents and directories owned by another project from the listing', async () => {
    const { request, fs, directories } = fixture()
    directories['/ws/book'] = ['正文', '正文.md']
    const resolve = fs.resolve
    fs.resolve = async (path, options) => path === 'book/正文'
      ? resolve('/ws/正文') : path === 'book/正文.md' ? resolve('/outside/chapter.md') : resolve(path, options)
    const reply = await request('workspace')
    expect(reply.status).toBe(200)
    expect(reply.body.files.map((file: { path: string }) => file.path)).toEqual(['正文/chapter.md'])
  })
  it.each(['archive/old/正文/chapter.md', '长篇/书甲/正文/chapter.md', '../book/正文/chapter.md', 'book/../other/正文.md'])('rejects deeper or escaping project access to %s', async path => {
    const { request, fs } = fixture('/collection')
    expect((await request('file', path)).status).toBeGreaterThanOrEqual(400)
    expect((await request('file', path, { content: 'overwrite', baseVersion: 'v1' })).status).toBeGreaterThanOrEqual(400)
    expect(fs.readBytes).not.toHaveBeenCalled()
    expect(fs.writeText).not.toHaveBeenCalled()
  })
  it('keeps the shared listing limit across root and child projects', async () => {
    const { request, directories } = fixture()
    directories['/ws/正文'] = Array.from({ length: 1_000 }, (_, i) => `chapter-${i}.md`)
    const reply = await request('workspace')
    expect(reply.body.files).toHaveLength(1_000)
    expect(reply.body.truncated).toBe(true)
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
