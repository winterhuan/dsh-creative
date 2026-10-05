import { readFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { type FileSystem, type FsDirEntry, type FsInfo, type FsTarget } from '@deepseek-ai/dsh-fs'
import { routeContext, type RouteHandler } from './route-context.ts'
import { listFiles, workspaceProjects, registerWorkspaceRoute } from '../src/workspace-route.ts'

type ListingRealm = Parameters<typeof listFiles>[0]

/**
 * In-memory workspace: `tree` maps absolute directory paths to child names,
 * everything not a directory is a file. Mirrors the dsh-fs shape the route
 * walks, including the branded-id casts used by native-hooks.spec.ts.
 * `versioned` lists file display paths whose directory entries already carry
 * a version and size, like a real filesystem listing; the rest fall back to
 * `stat`, so both resolution paths stay covered.
 */
function memoryRealm(
  tree: Readonly<Record<string, readonly string[]>>,
  versioned: ReadonlySet<string> = new Set(),
  links: Readonly<Record<string, string>> = {},
): ListingRealm {
  const target = (displayPath: string): FsTarget => ({ targetKey: displayPath as FsTarget['targetKey'], displayPath })
  const exists = (displayPath: string): boolean => {
    if (tree[displayPath] !== undefined) return true
    const parent = displayPath.slice(0, displayPath.lastIndexOf('/'))
    const name = displayPath.slice(displayPath.lastIndexOf('/') + 1)
    return (tree[parent] ?? []).includes(name)
  }
  const resolve = async (path: string, options?: { readonly cwd?: string }): Promise<FsTarget> => {
    const absolute = path.startsWith('/') ? path : `${options?.cwd ?? '.'}/${path}`
    return target(links[absolute] ?? absolute)
  }
  const fs = {
    resolve,
    contains: (parent: FsTarget, child: FsTarget) =>
      child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
    stat: async (entry: FsTarget): Promise<FsInfo | undefined> => {
      if (!exists(entry.displayPath)) return undefined
      return {
        version: `v-${entry.displayPath}` as FsInfo['version'],
        type: tree[entry.displayPath] !== undefined ? 'directory' : 'file',
        size: 10,
      }
    },
    listDir: async (entry: FsTarget): Promise<FsDirEntry[]> => {
      const names = tree[entry.displayPath] ?? []
      return Promise.all(names.map(async (name) => {
        const displayPath = `${entry.displayPath}/${name}`
        const child = await resolve(name, { cwd: entry.displayPath })
        const observed = versioned.has(displayPath) ? { version: `v-${displayPath}`, size: 10 } as const : {}
        return { name, type: tree[displayPath] !== undefined ? 'directory' : 'file', target: child, ...observed } as FsDirEntry
      }))
    },
  } as FileSystem
  return { agent: {}, sandboxPolicy: {}, cwd: '/ws', root: target('/ws'), fs } as ListingRealm
}

function chapters(count: number, width = 4): string[] {
  return Array.from({ length: count }, (_, index) => `第${String(index + 1).padStart(width, '0')}章.md`)
}

/** Every file display path of a `memoryRealm` tree, for versioned listings. */
function allFiles(tree: Readonly<Record<string, readonly string[]>>): Set<string> {
  const directories = new Set(Object.keys(tree))
  const files = new Set<string>()
  for (const [directory, names] of Object.entries(tree)) {
    for (const name of names) {
      const displayPath = `${directory}/${name}`
      if (!directories.has(displayPath)) files.add(displayPath)
    }
  }
  return files
}

describe('short-drama workspace listing', () => {
  it('reads metadata from each full project root, including metadata outside the file page', async () => {
    const realm = memoryRealm({
      '/ws': ['书甲', '长篇'],
      '/ws/书甲': ['short-drama.json', '追踪', '剧集'],
      '/ws/书甲/追踪': ['_tracking-state.json'],
      '/ws/书甲/剧集': ['EP001'],
      '/ws/书甲/剧集/EP001': ['分镜.md'],
      '/ws/长篇': ['书乙'],
      '/ws/长篇/书乙': ['short-drama.json', '剧集'],
      '/ws/长篇/书乙/剧集': ['EP001'],
      '/ws/长篇/书乙/剧集/EP001': ['分镜.md'],
    })
    const reads: string[] = []
    realm.fs.readBytes = async (target) => {
      reads.push(target.displayPath)
      return new TextEncoder().encode(JSON.stringify({ project: target.displayPath.includes('/书甲/') ? '甲' : '乙' }))
    }
    const listing = await listFiles(realm)
    expect(listing.files.map(file => file.path)).toContain('长篇/书乙/short-drama.json')
    const withoutConfig = listing.files.filter(file => !file.path.endsWith('short-drama.json'))
    const projects = await workspaceProjects(realm, withoutConfig, 1_024)
    expect(projects.find(project => project.root === '书甲')).toMatchObject({ shortDrama: { project: '甲' }, metadataErrors: [] })
    expect(projects.find(project => project.root === '长篇/书乙')).toMatchObject({ tracking: null, shortDrama: { project: '乙' }, metadataErrors: [] })
    expect(reads).not.toContain('/ws/short-drama.json')
  })

  it('collects editable and media files across creative roots and reports a complete listing', async () => {
    const realm = memoryRealm({
      '/ws': ['short-drama.json'],
      '/ws/正文': ['第001章.md', 'notes.log', '.hidden.md'],
      '/ws/剧集': ['EP001'],
      '/ws/剧集/EP001': ['剧本.md', 'poster.png'],
      '/ws/video-recaps': ['demo'],
      '/ws/video-recaps/demo': ['project.json', 'frames'],
      '/ws/video-recaps/demo/frames': ['frame.png'],
    })
    const listing = await listFiles(realm)
    expect(listing.truncated).toBe(false)
    expect(listing.files.map(file => file.path)).toEqual([
      '剧集/EP001/剧本.md',
      '剧集/EP001/poster.png',
      'short-drama.json',
    ])
    expect(listing.files.find(file => file.path === '剧集/EP001/poster.png')).toMatchObject({ kind: 'media', mimeType: 'image/png' })
  })

  it.each([false, true])('associates renamed media only through matching manifest bytes (changed=%s)', async (changed) => {
    const realm = memoryRealm({
      '/ws': ['short-drama.json', '剧集', '.short-drama'], '/ws/剧集': ['EP001'], '/ws/剧集/EP001': ['制作成果'],
      '/ws/剧集/EP001/制作成果': ['renamed.png'], '/ws/.short-drama': ['production'], '/ws/.short-drama/production': ['manifests'],
      '/ws/.short-drama/production/manifests': ['run.json'],
    })
    const bytes = Buffer.from('0123456789')
    const output = { path: '剧集/EP001/制作成果/renamed.png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    const manifest = { targetId: 'SHOT-EP001-001', requestId: 'request-1', episode: '剧集/EP001', job: { sessionId: 'session-1', jobId: 'job-1', startedAt: 1 }, outputs: [output] }
    realm.fs.readBytes = async (target) => target.displayPath.endsWith('run.json') ? Buffer.from(JSON.stringify(manifest))
      : target.displayPath.endsWith('renamed.png') ? changed ? Buffer.from('9876543210') : bytes : Buffer.from('{}')
    const services = { fs: realm.fs, sandboxPolicy: realm.sandboxPolicy }
    const agent = { session: { header: { cwd: realm.cwd } }, ctx: { get: (key: keyof typeof services) => services[key] } }
    let handler: RouteHandler | undefined
    const context = routeContext({
      effect: (effect: () => () => void) => { onTestFinished(effect()) },
      webServer: { register: (entry: { handler: RouteHandler }) => { handler = entry.handler; return () => {} } },
      typert: { lookups: new Map([['agent', { resolve: async () => agent }]]) }, logger: () => ({ error: vi.fn() }),
    })
    registerWorkspaceRoute(context, { maxBytes: 100_000 })
    let status = 0
    let body: unknown
    await handler!({ method: 'GET', url: `/short-drama/workspace?sessionId=${randomUUID()}`, headers: { host: 'localhost:3000' } } as IncomingMessage, {
      writeHead: (value: number) => { status = value }, end: (value: string) => { body = JSON.parse(value) },
    } as ServerResponse)
    expect(status).toBe(200)
    expect(body).toMatchObject({ outputs: changed ? [] : [{ path: output.path, targetId: manifest.targetId, requestId: manifest.requestId, episode: manifest.episode, job: manifest.job, sha256: output.sha256, kind: 'image' }] })
  })

  it.each(['valid', 'missing', 'changed-document', 'changed-project'])('reads a coherent episode snapshot: %s', async (mode) => {
    const fixture = JSON.parse(await readFile(new URL('./fixtures/creator-episode.json', import.meta.url), 'utf8')) as { documents: Record<string, string> }
    const documents = { ...fixture.documents }
    if (mode === 'missing') delete documents['视觉设定.md']
    const realm = memoryRealm({
      '/ws': ['short-drama.json', '剧集'], '/ws/剧集': ['EP001'], '/ws/剧集/EP001': Object.keys(documents),
    })
    const stat = realm.fs.stat.bind(realm.fs)
    let changedDocument = false
    let projectStats = 0
    realm.fs.stat = async (target) => {
      const info = await stat(target)
      if (info === undefined) return undefined
      if (target.displayPath === '/ws/short-drama.json') projectStats += 1
      const changed = mode === 'changed-document' && changedDocument && target.displayPath.endsWith('/剧本.md')
        || mode === 'changed-project' && target.displayPath === '/ws/short-drama.json' && projectStats >= 5
      return changed ? { ...info, version: 'changed' as FsInfo['version'] } : info
    }
    realm.fs.readBytes = async (target) => {
      if (target.displayPath === '/ws/short-drama.json') { changedDocument = true; return Buffer.from('{}') }
      return Buffer.from(documents[target.displayPath.split('/').at(-1)!]!)
    }
    const services = { fs: realm.fs, sandboxPolicy: realm.sandboxPolicy }
    const agent = { session: { header: { cwd: realm.cwd } }, ctx: { get: (key: keyof typeof services) => services[key] } }
    let handler: RouteHandler | undefined
    const context = routeContext({
      effect: (effect: () => () => void) => { onTestFinished(effect()) },
      webServer: { register: (entry: { handler: RouteHandler }) => { handler = entry.handler; return () => {} } },
      typert: { lookups: new Map([['agent', { resolve: async () => agent }]]) },
      logger: () => ({ error: vi.fn() }),
    })
    registerWorkspaceRoute(context, { maxBytes: 100_000 })
    let status = 0
    let body: unknown
    await handler!({ method: 'GET', url: `/short-drama/episode?sessionId=${randomUUID()}&path=${encodeURIComponent('剧集/EP001')}`, headers: { host: 'localhost:3000' } } as IncomingMessage, {
      writeHead: (value: number) => { status = value }, end: (value: string) => { body = JSON.parse(value) },
    } as ServerResponse)
    if (mode.startsWith('changed-')) expect(status).toBe(409)
    else {
      expect(status).toBe(200)
      expect(body).toMatchObject({ revision: expect.any(String), files: expect.arrayContaining([expect.objectContaining({ path: '剧集/EP001/剧本.md', content: documents['剧本.md'] })]) })
      if (mode === 'valid') expect(body).toMatchObject({ diagnostics: [] })
      else expect(body).toMatchObject({ files: expect.arrayContaining([{ path: '剧集/EP001/视觉设定.md', missing: true }]), diagnostics: expect.arrayContaining([expect.stringContaining('视觉设定.md')]) })
    }
  })

  it('marks the listing truncated when an eligible file exists beyond the limit', async () => {
    const realm = memoryRealm({ '/ws/剧集': [...chapters(1_001), '附录.md'] })
    const listing = await listFiles(realm)
    expect(listing.files).toHaveLength(1_000)
    expect(listing.truncated).toBe(true)
  })

  it('does not mark truncation when the workspace holds exactly the limit', async () => {
    const realm = memoryRealm({ '/ws/剧集': chapters(1_000) })
    const listing = await listFiles(realm)
    expect(listing.files).toHaveLength(1_000)
    expect(listing.truncated).toBe(false)
  })


})
