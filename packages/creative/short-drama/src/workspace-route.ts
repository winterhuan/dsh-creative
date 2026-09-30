import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath as nodeRealpath, stat as nodeStat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, relative, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { defaultDramaSkillRoot } from './skill-provider.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError, type FileSystem, type FsInfo, type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { JobId } from '@deepseek-ai/dsh-jobs/brand'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { isTrustedWorkspaceRequest } from './workspace-request-trust.js'
import {
  BOOK_CONTAINERS, CREATIVE_DIRECTORIES, DRAMA_DIRECTORIES,
  PROJECT_FILES, creativeMediaMimeType, isCreativeTextPath, parseCreativePath, projectPath,
  type CreativeProjectPath, type CreativeProjectSummary,
} from './project-path.ts'
import { ownedProductionJob } from './production-context.ts'
import { type ProduceConfig } from './produce-settings.ts'

const MEDIA_MAX_BYTES = 256 * 1_024 * 1_024
const FILE_LIMIT = 1_000

interface WorkspaceRouteOptions {
  readonly maxBytes: number
  readonly trustedHosts?: readonly string[]
  /** Production profile seed; the video preflight reports the credentials a run would receive. */
  readonly produce?: ProduceConfig
}

interface WorkspaceFile {
  readonly path: string
  readonly bytes: number
  readonly version: string
  readonly kind: 'text' | 'media'
  readonly mimeType?: string | undefined
}

interface WorkspaceRealm {
  readonly agent: Agent
  readonly fs: FileSystem
  readonly sandboxPolicy: SandboxPolicyService
  readonly cwd: string
  readonly root: FsTarget
}

interface ReadFileResult {
  readonly content: string
  readonly bytes: number
  readonly version: FsVersion
}

class WorkspaceHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

function send(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

/** One inclusive byte range served to a media player. */
interface ByteRange { readonly start: number; readonly end: number }

/**
 * RFC 9110 14.2: a Range this server cannot parse or does not support is ignored (`undefined`, full
 * 200 response); only a well-formed but unsatisfiable range earns a 416 (`null`).
 */
/**
 * RFC 9110 14.2: a Range this server cannot parse or does not support is ignored (`undefined`, full
 * 200 response); only a well-formed but unsatisfiable range earns a 416 (`null`).
 * @param value - the raw `Range` header, when present.
 * @param size - the media resource size in bytes.
 * @returns the clamped byte range, `undefined` to ignore, or `null` for 416.
 */
function parseByteRange(value: string | undefined, size: number): ByteRange | undefined | null {
  const match = value === undefined ? null : /^bytes=(\d*)-(\d*)$/u.exec(value.trim())
  if (match === null) return undefined
  const left = match[1] ?? ''
  const right = match[2] ?? ''
  if (left === '') {
    const suffix = Number(right)
    if (right === '' || !Number.isSafeInteger(suffix)) return undefined
    return suffix === 0 || size <= 0 ? null : { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(left)
  const requestedEnd = right === '' ? Number.MAX_SAFE_INTEGER : Number(right)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || requestedEnd < start) return undefined
  return start >= size ? null : { start, end: Math.min(requestedEnd, size - 1) }
}

function mediaHeaders(mimeType: string, size: number, range: ByteRange | undefined): Record<string, string | number> {
  const start = range?.start ?? 0
  const end = range?.end ?? size - 1
  return {
    'content-type': mimeType,
    'content-length': Math.max(0, end - start + 1),
    'cache-control': 'private, max-age=60',
    'accept-ranges': 'bytes',
    ...(range === undefined ? {} : { 'content-range': `bytes ${String(start)}-${String(end)}/${String(size)}` }),
    'x-content-type-options': 'nosniff',
  }
}

function sendMediaBytes(request: IncomingMessage, response: ServerResponse, bytes: Uint8Array, mimeType: string): void {
  const range = parseByteRange(typeof request.headers.range === 'string' ? request.headers.range : undefined, bytes.byteLength)
  if (range === null) {
    response.writeHead(416, { 'content-range': `bytes */${String(bytes.byteLength)}`, 'cache-control': 'no-store' })
    response.end()
    return
  }
  const start = range?.start ?? 0
  const end = range?.end ?? bytes.byteLength - 1
  const body = bytes.subarray(start, end + 1)
  response.writeHead(range === undefined ? 200 : 206, mediaHeaders(mimeType, bytes.byteLength, range))
  response.end(request.method === 'HEAD' ? undefined : Buffer.from(body))
}

/**
 * Resolve a host-streamable file only when the provider explicitly maps the host
 * root and target to the same execution-world files, including after realpath.
 */
async function hostWorkspaceFile(realm: WorkspaceRealm, target: FsTarget, expectedSize: number): Promise<string | undefined> {
  const rootPath = realm.fs.processPath(realm.root)
  const targetPath = realm.fs.processPath(target)
  if (realm.fs.processPathFromHostPath(rootPath) !== rootPath
    || realm.fs.processPathFromHostPath(targetPath) !== targetPath) return undefined
  const [root, path] = await Promise.all([
    nodeRealpath(rootPath),
    nodeRealpath(targetPath),
  ])
  if (realm.fs.processPathFromHostPath(root) !== rootPath
    || realm.fs.processPathFromHostPath(path) !== targetPath) return undefined
  const inside = relative(root, path)
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return undefined
  const local = await nodeStat(path)
  return local.isFile() && local.size === expectedSize ? path : undefined
}

async function sendWorkspaceMedia(
  request: IncomingMessage,
  response: ServerResponse,
  realm: WorkspaceRealm,
  target: FsTarget,
  info: FsInfo,
  mimeType: string,
): Promise<void> {
  const expectedSize = info.size
  if (expectedSize !== undefined) {
    // A remote filesystem may expose a process path this web host cannot read; fall back to its
    // bounded binary API for modest files.
    const processPath = await hostWorkspaceFile(realm, target, expectedSize).catch(() => undefined)
    if (processPath !== undefined) {
      const range = parseByteRange(typeof request.headers.range === 'string' ? request.headers.range : undefined, expectedSize)
      if (range === null) {
        response.writeHead(416, { 'content-range': `bytes */${String(expectedSize)}`, 'cache-control': 'no-store' })
        response.end()
        return
      }
      response.writeHead(range === undefined ? 200 : 206, mediaHeaders(mimeType, expectedSize, range))
      if (request.method === 'HEAD') { response.end(); return }
      const stream = createReadStream(processPath, range === undefined ? undefined : { start: range.start, end: range.end })
      request.once('close', () => { if (!response.writableEnded) stream.destroy() })
      stream.on('error', () => { if (!response.headersSent) response.destroy(); else response.end() })
      stream.pipe(response)
      return
    }
    if (expectedSize > MEDIA_MAX_BYTES) throw new WorkspaceHttpError(413, '远程媒体超过工作台回退预览大小限制。')
  }
  sendMediaBytes(request, response, await realm.fs.readBytes(target, undefined, MEDIA_MAX_BYTES), mimeType)
}

async function jsonBody(request: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request as AsyncIterable<Uint8Array>) {
    const value = Buffer.from(chunk)
    size += value.byteLength
    if (size > maxBytes) throw new WorkspaceHttpError(413, '请求内容过大。')
    chunks.push(value)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new WorkspaceHttpError(400, '请求必须是 JSON 对象。')
  }
}

function safeRelativePath(path: string): boolean {
  return path !== ''
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
}

function editablePath(path: string): boolean {
  const parsed = parseCreativePath(path)
  if (parsed?.domain !== 'drama') return false
  return parsed !== undefined && isCreativeTextPath(parsed)
}

/**
 * Enforce the workbench path contract for one read or write: extension by
 * directory kind, relative-safety, and the creative directory allowlist.
 * @param path - workspace-relative path as requested by the client.
 * @param kind - whether the file is being read as text or streamed as media.
 * @returns the validated project path.
 * @throws WorkspaceHttpError with a client-facing message on any violation.
 */
function assertCreativePath(path: string, kind: 'text' | 'media'): CreativeProjectPath {
  if (kind === 'text' ? !editablePath(path) : creativeMediaMimeType(path) === undefined) {
    throw new WorkspaceHttpError(415, kind === 'text' ? '工作台不支持编辑该文件类型。' : '目标不是受支持的短剧媒体文件。')
  }
  if (!safeRelativePath(path)) {
    throw new WorkspaceHttpError(403, '文件路径不在创作工作台中。')
  }
  const parsed = parseCreativePath(path)
  if (parsed?.domain !== 'drama') {
    throw new WorkspaceHttpError(403, '文件路径不在创作工作台中。')
  }
  return parsed
}

/**
 * The media type served for one path.
 * @param path - workspace-relative path.
 * @returns the registered MIME type, or `undefined` for non-media files.
 */
function mediaMimeTypeForPath(path: string): string | undefined {
  return creativeMediaMimeType(path)
}

async function workspaceRealmForSession(context: Context, rawId: string): Promise<WorkspaceRealm> {
  if (rawId === '') throw new WorkspaceHttpError(400, '缺少 DSH sessionId。')
  const lookup = context.typert.lookups.get('agent')
  if (lookup === undefined) throw new WorkspaceHttpError(503, 'DSH Agent lookup 当前不可用。')
  let agent: Agent | undefined
  try {
    agent = await lookup.resolve(SessionId(rawId)) as Agent | undefined
  } catch {
    throw new WorkspaceHttpError(404, 'DSH 会话不可用。')
  }
  if (agent === undefined) throw new WorkspaceHttpError(404, 'DSH 会话不可用。')
  if (agent.session.header.parentSession !== undefined || agent.session.header.origin === 'subagent') {
    throw new WorkspaceHttpError(403, '子 Agent 会话不开放创作编辑器。')
  }
  const cwd = agent.session.header.cwd
  if (cwd === undefined) throw new WorkspaceHttpError(409, '当前 DSH 会话没有工作目录。')
  const fs = agent.ctx.get('fs')
  const sandboxPolicy = agent.ctx.get('sandboxPolicy')
  if (fs === undefined || sandboxPolicy === undefined) throw new WorkspaceHttpError(503, 'DSH 文件系统当前不可用。')
  return { agent, fs, sandboxPolicy, cwd, root: await fs.resolve(cwd) }
}

async function workspaceRealm(context: Context, url: URL): Promise<WorkspaceRealm> {
  const rawId = url.searchParams.get('sessionId')
  if (rawId === null) throw new WorkspaceHttpError(400, '缺少 DSH sessionId。')
  return workspaceRealmForSession(context, rawId)
}

async function creativeTarget(realm: WorkspaceRealm, path: string, kind: 'text' | 'media' = 'text'): Promise<FsTarget> {
  const { projectRoot } = assertCreativePath(path, kind)
  const target = await realm.fs.resolve(path, { cwd: realm.cwd })
  if (!realm.fs.contains(realm.root, target)) throw new WorkspaceHttpError(403, '文件路径离开了 DSH 工作目录。')
  const project = projectRoot === '' ? realm.root : await realm.fs.resolve(projectRoot, { cwd: realm.cwd })
  if (!realm.fs.contains(realm.root, project) || !realm.fs.contains(project, target)) throw new WorkspaceHttpError(403, '文件路径离开了所属创作项目。')
  return target
}

function requireRegularFile(info: FsInfo | undefined): FsInfo {
  if (info === undefined) throw new WorkspaceHttpError(404, '文件不存在。')
  if (info.type !== 'file') throw new WorkspaceHttpError(415, '目标不是可编辑的普通文件。')
  return info
}

/** Read bytes and a matching opaque version, retrying if a writer wins the read window. */
async function readVersionedFile(fs: FileSystem, target: FsTarget, maxBytes: number): Promise<ReadFileResult> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = requireRegularFile(await fs.stat(target))
    if (before.size !== undefined && before.size > maxBytes) throw new WorkspaceHttpError(413, '文件超过工作台大小限制。')
    const bytes = await fs.readBytes(target, undefined, maxBytes)
    const after = requireRegularFile(await fs.stat(target))
    if (before.version !== after.version) continue
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new WorkspaceHttpError(415, '文件不是有效的 UTF-8 文本。')
    }
    return { content, bytes: bytes.byteLength, version: after.version }
  }
  throw new WorkspaceHttpError(409, '文件正在被修改，请重试。')
}

/** Full workspace listing. `truncated` marks a walk that stopped at {@link FILE_LIMIT} with eligible files still unseen. */
interface WorkspaceListing {
  readonly files: WorkspaceFile[]
  readonly truncated: boolean
}

function skipWorkspaceDirectory(path: string): boolean {
  const name = path.split('/').at(-1) ?? ''
  return name.startsWith('.') || name === 'node_modules' || name === '__pycache__' || path.split('/').some(segment => segment.startsWith('.'))
}

/**
 * Walk every creative directory under the realm root and collect editable and
 * media files, including the book layouts the story skills actually write
 * (`<book>/<leaf>/…`, `长篇|短篇/<book>/<leaf>/…`, short-story single files).
 * A project may contain creative directories or standalone project documents;
 * short-story settings and outlines are visible before prose exists.
 * The walk keeps going past the file limit
 * only until it observes one further eligible file, so `truncated` stays
 * false for a workspace that holds exactly the limit. Dependency directories,
 * Python caches, hidden directories, and video working areas are not traversed.
 * @param realm - the session's workspace realm supplying the filesystem view.
 * @returns the complete or truncated listing in workspace-relative paths.
 */
async function listFiles(realm: WorkspaceRealm): Promise<WorkspaceListing> {
  const files: WorkspaceFile[] = []
  // Returns true when the listing is truncated: an eligible file appeared once
  // `files` already held the limit.
  const walk = async (path: string, directory: FsTarget, project: FsTarget = realm.root): Promise<boolean> => {
    for (const entry of await realm.fs.listDir(directory)) {
      if (entry.name.startsWith('.') || !realm.fs.contains(project, entry.target)) continue
      const childPath = `${path}/${entry.name}`
      if (entry.type === 'directory') {
        const owner = project
        if (!skipWorkspaceDirectory(childPath) && await walk(childPath, entry.target, owner)) return true
      }
      else if (entry.type === 'file' && (editablePath(childPath) || (parseCreativePath(childPath)?.domain === 'drama' && creativeMediaMimeType(entry.name) !== undefined))) {
        const info = entry.version === undefined || entry.size === undefined ? await realm.fs.stat(entry.target) : undefined
        const version = entry.version ?? info?.version
        const mimeType = creativeMediaMimeType(entry.name)
        if (version !== undefined) {
          if (files.length >= FILE_LIMIT) return true
          files.push({ path: childPath, bytes: entry.size ?? info?.size ?? 0, version, kind: mimeType === undefined ? 'text' : 'media', mimeType })
        }
      }
    }
    return false
  }
  let truncated = false
  for (const directory of CREATIVE_DIRECTORIES) {
    const target = await realm.fs.resolve(directory, { cwd: realm.cwd })
    if (!realm.fs.contains(realm.root, target)) continue
    const info = await realm.fs.stat(target)
    if (info?.type === 'directory' && await walk(directory, target)) {
      truncated = true
      break
    }
  }
  for (const path of PROJECT_FILES) {
    if (truncated) break
    const target = await creativeTarget(realm, path)
    const info = await realm.fs.stat(target)
    if (info?.type === 'file') {
      if (files.length >= FILE_LIMIT) { truncated = true; break }
      files.push({ path, bytes: info.size ?? 0, version: info.version, kind: 'text' })
    }
  }
  if (!truncated) truncated = await listBookFiles(realm, walk, files)
  return { files: files.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN')), truncated }
}

/**
 * Collect creative files from book directories below the workspace root.
 * Only immediate children (and `长篇/`/`短篇/` grandchildren) are probed with
 * one directory listing each, so a code checkout never pays a full-tree walk.
 * @param realm - the session's workspace realm supplying the filesystem view.
 * @param walk - the shared recursive collector reporting truncation.
 * @param files - the listing under construction, already holding root-level files.
 * @returns whether an eligible file appeared past the file limit.
 */
async function listBookFiles(
  realm: WorkspaceRealm,
  walk: (path: string, directory: FsTarget, project: FsTarget) => Promise<boolean>,
  files: WorkspaceFile[],
): Promise<boolean> {
  const creativeRoots = new Set<string>(CREATIVE_DIRECTORIES)
  const candidates: { readonly prefix: string; readonly target: FsTarget }[] = []
  for (const entry of await realm.fs.listDir(realm.root)) {
    if (skipWorkspaceDirectory(entry.name) || !realm.fs.contains(realm.root, entry.target)) continue
    if (creativeRoots.has(entry.name)) continue
    if (entry.type !== 'directory') continue
    if (BOOK_CONTAINERS.some(container => container === entry.name)) {
      for (const book of await realm.fs.listDir(entry.target)) {
        if (skipWorkspaceDirectory(`${entry.name}/${book.name}`) || book.type !== 'directory' || !realm.fs.contains(realm.root, book.target)) continue
        candidates.push({ prefix: `${entry.name}/${book.name}`, target: book.target })
      }
      continue
    }
    candidates.push({ prefix: entry.name, target: entry.target })
  }
  for (const { prefix, target } of candidates) {
    const children = await realm.fs.listDir(target)
    const visible = children.filter(child => !child.name.startsWith('.') && realm.fs.contains(target, child.target))
    for (const leaf of DRAMA_DIRECTORIES) {
      const child = visible.find(item => item.name === leaf && item.type === 'directory')
      if (child === undefined) continue
      if (await walk(`${prefix}/${leaf}`, child.target, target)) return true
    }
    for (const name of PROJECT_FILES) {
      const child = visible.find(item => item.name === name && item.type === 'file')
      if (child === undefined) continue
      if (files.length >= FILE_LIMIT) return true
      const childPath = `${prefix}/${name}`
      const info = child.version === undefined || child.size === undefined ? await realm.fs.stat(child.target) : undefined
      const version = child.version ?? info?.version
      if (version !== undefined) {
        files.push({ path: childPath, bytes: child.size ?? info?.size ?? 0, version, kind: 'text' })
      }
    }
  }
  return false
}

async function metadata(
  realm: WorkspaceRealm,
  path: string,
  maxBytes: number,
): Promise<{ readonly value: unknown; readonly error?: string }> {
  try {
    const target = await creativeTarget(realm, path)
    if (await realm.fs.stat(target) === undefined) return { value: null }
    const value: unknown = JSON.parse((await readVersionedFile(realm.fs, target, maxBytes)).content)
    return { value }
  } catch (error) {
    return { value: null, error: error instanceof SyntaxError ? `${path} 不是有效的 JSON。` : `${path} 暂时无法读取。` }
  }
}

/**
 * Read each listed project's metadata independently of the listing's file limit.
 * @param realm - session filesystem and workspace root.
 * @param files - listed creative files identifying the projects.
 * @param maxBytes - maximum bytes per metadata document.
 * @returns metadata keyed by full project root, including project-local read errors.
 */
async function workspaceProjects(
  realm: WorkspaceRealm, files: readonly WorkspaceFile[], maxBytes: number,
): Promise<CreativeProjectSummary[]> {
  const projects = new Map<string, Set<CreativeProjectSummary['domains'][number]>>()
  for (const file of files) {
    const parsed = parseCreativePath(file.path)
    if (parsed === undefined) continue
    const domains = projects.get(parsed.projectRoot) ?? new Set()
    domains.add(parsed.domain)
    projects.set(parsed.projectRoot, domains)
  }
  return Promise.all([...projects].map(async ([root, domains]) => {
    const tracking: Awaited<ReturnType<typeof metadata>> = domains.has('story') ? await metadata(realm, projectPath(root, '追踪/_tracking-state.json'), maxBytes) : { value: null }
    const shortDrama: Awaited<ReturnType<typeof metadata>> = domains.has('drama') ? await metadata(realm, projectPath(root, 'short-drama.json'), maxBytes) : { value: null }
    return {
      root, domains: [...domains], tracking: tracking.value, shortDrama: shortDrama.value,
      metadataErrors: [tracking.error, shortDrama.error].filter((error): error is string => error !== undefined),
    }
  }))
}

async function productionOutputs(realm: WorkspaceRealm, projects: readonly CreativeProjectSummary[], files: readonly WorkspaceFile[]) {
  const outputs: Array<{ path: string; targetId: string; requestId: string; episode: string; job?: { sessionId: string; jobId: string; startedAt: number }; sha256: string; kind: 'image' | 'video' | 'audio' }> = []
  for (const project of projects.filter(project => project.domains.includes('drama'))) {
    const directory = await realm.fs.resolve(projectPath(project.root, '.short-drama/production/manifests'), { cwd: realm.cwd })
    if (!realm.fs.contains(realm.root, directory) || (await realm.fs.stat(directory))?.type !== 'directory') continue
    for (const entry of (await realm.fs.listDir(directory)).slice(0, 500)) {
      if (entry.type !== 'file' || !entry.name.endsWith('.json') || !realm.fs.contains(directory, entry.target)) continue
      try {
        const value: unknown = JSON.parse((await readVersionedFile(realm.fs, entry.target, 256 * 1024)).content)
        if (typeof value !== 'object' || value === null) continue
        const manifest = value as Record<string, unknown>
        if (typeof manifest.targetId !== 'string' || typeof manifest.requestId !== 'string' || typeof manifest.episode !== 'string' || !Array.isArray(manifest.outputs)) continue
        for (const item of manifest.outputs) {
          if (typeof item !== 'object' || item === null) continue
          const output = item as Record<string, unknown>
          if (typeof output.path !== 'string' || typeof output.sha256 !== 'string') continue
          const path = projectPath(project.root, output.path)
          const file = files.find(file => file.path === path && file.kind === 'media' && file.bytes === output.bytes)
          if (file === undefined) continue
          const target = await creativeTarget(realm, path, 'media')
          const digest = createHash('sha256').update(await realm.fs.readBytes(target, undefined, MEDIA_MAX_BYTES)).digest('hex')
          if (digest !== output.sha256) continue
          const kind = file.mimeType?.startsWith('image/') === true ? 'image' : file.mimeType?.startsWith('audio/') === true ? 'audio' : 'video'
          const job = manifest.job as { sessionId?: unknown; jobId?: unknown; startedAt?: unknown } | null | undefined
          outputs.push({ path, targetId: manifest.targetId, requestId: manifest.requestId, episode: manifest.episode, sha256: digest, kind,
            ...(typeof job?.sessionId === 'string' && typeof job.jobId === 'string' && typeof job.startedAt === 'number' ? { job: { sessionId: job.sessionId, jobId: job.jobId, startedAt: job.startedAt } } : {}),
          })
        }
      } catch { /* An incomplete manifest cannot attach media to a production target. */ }
    }
  }
  return outputs
}

function mapFsError(error: unknown): WorkspaceHttpError | undefined {
  if (!(error instanceof FsError)) return undefined
  switch (error.code) {
    case 'FS_NOT_FOUND': return new WorkspaceHttpError(404, '文件不存在。')
    case 'FS_TOO_LARGE': return new WorkspaceHttpError(413, '文件超过工作台大小限制。')
    case 'FS_NOT_TEXT':
    case 'FS_NOT_REGULAR_FILE': return new WorkspaceHttpError(415, '目标不是可编辑的文本文件。')
    case 'FS_PERMISSION_DENIED':
    case 'FS_SANDBOX_DENIED': return new WorkspaceHttpError(403, '当前 DSH 权限不允许修改该文件。')
    case 'FS_STALE_VERSION':
    case 'FS_NOT_OBSERVED': return new WorkspaceHttpError(412, '文件已在磁盘上更新。请处理冲突后再保存。')
    case 'FS_ABORTED': return new WorkspaceHttpError(409, '文件操作已取消。')
    default: return new WorkspaceHttpError(500, 'DSH 文件系统操作失败。')
  }
}

async function handle(context: Context, request: IncomingMessage, response: ServerResponse, options: WorkspaceRouteOptions): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const trusted = isTrustedWorkspaceRequest(request, options.trustedHosts ?? [])
    if (!trusted) throw new WorkspaceHttpError(403, '请求来源不受信任。')
    if (url.pathname === '/short-drama/workspace' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const listing = await listFiles(realm)
      const files = listing.files
      const projects = await workspaceProjects(realm, files, options.maxBytes)
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null) throw new WorkspaceHttpError(400, '缺少 DSH sessionId。')
      const games: never[] = []
      const videos: never[] = []
      const outputs = await productionOutputs(realm, projects, files)
      send(response, 200, { cwd: realm.cwd, files, truncated: listing.truncated, games, videos, projects, outputs, mode: 'dsh-session' })
      return
    }
    if (url.pathname === '/short-drama/job/stop' && request.method === 'POST') {
      const { agent } = await workspaceRealm(context, url)
      const input = await jsonBody(request, 4_096)
      if (typeof input.jobId !== 'string' || input.jobId === '' || typeof input.startedAt !== 'number' || !Number.isFinite(input.startedAt)) {
        throw new WorkspaceHttpError(400, '停止请求必须包含实际 jobId 与 startedAt。')
      }
      let snapshot
      try { snapshot = ownedProductionJob(agent, input.jobId as JobId) }
      catch { throw new WorkspaceHttpError(404, '当前会话中不存在该作业。') }
      if (snapshot.startedAt !== input.startedAt) throw new WorkspaceHttpError(409, '作业引用已失效，请刷新状态。')
      const jobs = agent.ctx.get('jobs')
      if (jobs === undefined) throw new WorkspaceHttpError(503, 'DSH 作业服务当前不可用。')
      const status = jobs.kill(snapshot.id, agent.session.id)
      send(response, 200, { status })
      return
    }
    if (url.pathname === '/short-drama/file' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const path = url.searchParams.get('path')
      if (path === null) throw new WorkspaceHttpError(400, '缺少文件路径。')
      const file = await readVersionedFile(realm.fs, await creativeTarget(realm, path), options.maxBytes)
      send(response, 200, { path, ...file })
      return
    }
    if (url.pathname === '/short-drama/episode' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const episode = url.searchParams.get('path')
      const parsed = parseCreativePath(`${episode ?? ''}/剧本.md`)
      if (episode === null || parsed?.role !== 'creator-document' || parsed.episodePath !== episode) throw new WorkspaceHttpError(400, '剧集路径无效')
      const names = ['剧本.md', '视觉设定.md', '分镜.md', '图片提示词.md', '视频提示词.md']
      const files = await Promise.all(names.map(async name => {
        const path = `${episode}/${name}`
        const target = await creativeTarget(realm, path)
        const info = await realm.fs.stat(target)
        if (info === undefined) return { path, missing: true as const }
        return { path, ...await readVersionedFile(realm.fs, target, options.maxBytes) }
      }))
      const listing = await listFiles(realm)
      const documents = Object.fromEntries(files.flatMap(file => 'content' in file ? [[file.path.slice(episode.length + 1), file.content]] : []))
      const availablePaths = listing.files.filter(file => file.path.startsWith(parsed.projectRoot === '' ? '' : `${parsed.projectRoot}/`)).map(file => parsed.projectRoot === '' ? file.path : file.path.slice(parsed.projectRoot.length + 1))
      const projectTarget = await creativeTarget(realm, projectPath(parsed.projectRoot, 'short-drama.json'))
      const projectFile = (await realm.fs.stat(projectTarget)) === undefined ? undefined : await readVersionedFile(realm.fs, projectTarget, options.maxBytes)
      const project: unknown = projectFile === undefined ? {} : JSON.parse(projectFile.content)
      const diagnostics = await new Promise<string[]>((resolveResult, reject) => {
        const child = execFile('python3', ['-B', resolve(defaultDramaSkillRoot(), 'short-drama/scripts/creator_markdown_check.py'), '--stdin'], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
          if (error !== null) { reject(error); return }
          try {
            const value: unknown = JSON.parse(stdout)
            if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new Error('Invalid creator diagnostics')
            resolveResult(value)
          } catch (reason) { reject(reason) }
        })
        child.stdin?.end(JSON.stringify({ documents, available_paths: availablePaths, project }))
      })
      for (const file of files) {
        const info = await realm.fs.stat(await creativeTarget(realm, file.path))
        if (('version' in file ? file.version : undefined) !== info?.version) throw new WorkspaceHttpError(409, '剧集文档已改变，请重新加载')
      }
      if (projectFile?.version !== (await realm.fs.stat(projectTarget))?.version) throw new WorkspaceHttpError(409, '剧集配置已改变，请重新加载')
      const revision = createHash('sha256').update(JSON.stringify([projectFile?.version, ...files.map(file => [file.path, 'version' in file ? file.version : null])])).digest('hex')
      send(response, 200, { files, revision, diagnostics })
      return
    }
    if (url.pathname === '/short-drama/media' && (request.method === 'GET' || request.method === 'HEAD')) {
      const realm = await workspaceRealm(context, url)
      const path = url.searchParams.get('path')
      if (path === null) throw new WorkspaceHttpError(400, '缺少媒体文件路径。')
      const mimeType = mediaMimeTypeForPath(path)
      if (mimeType === undefined) throw new WorkspaceHttpError(415, '目标不是受支持的短剧媒体文件。')
      const target = await creativeTarget(realm, path, 'media')
      const info = requireRegularFile(await realm.fs.stat(target))
      await sendWorkspaceMedia(request, response, realm, target, info, mimeType)
      return
    }
    if (url.pathname === '/short-drama/file' && request.method === 'PUT') {
      const realm = await workspaceRealm(context, url)
      const path = url.searchParams.get('path')
      if (path === null) throw new WorkspaceHttpError(400, '缺少文件路径。')
      const input = await jsonBody(request, options.maxBytes * 6 + 1_024)
      if (typeof input.content !== 'string') throw new WorkspaceHttpError(400, 'content 必须是字符串。')
      if (typeof input.baseVersion !== 'string' || input.baseVersion === '') throw new WorkspaceHttpError(400, 'baseVersion 必须是有效版本。')
      if (Buffer.byteLength(input.content) > options.maxBytes) throw new WorkspaceHttpError(413, '文件超过工作台大小限制。')
      const outcome = await realm.fs.writeText(
        await creativeTarget(realm, path),
        input.content,
        { kind: 'replaceIfVersion', version: input.baseVersion as FsVersion },
        undefined,
        realm.sandboxPolicy.resolve({ session: realm.agent.session }),
      )
      send(response, 200, { path, content: outcome.after, bytes: Buffer.byteLength(outcome.after), version: outcome.version })
      return
    }
    send(response, 404, { error: 'Creative route not found.' })
  } catch (error) {
    const mapped = error instanceof WorkspaceHttpError ? error : mapFsError(error)
    if (mapped === undefined) context.logger('creative').error('workspace route failed', error)
    send(response, mapped?.status ?? 500, { error: mapped?.message ?? 'Creative workspace operation failed.' })
  }
}

/**
 * Mount the narrow editor API on DSH's official web-server extension seam.
 * @param context - the plugin context holding the webServer service.
 * @param options - listing budget and trusted authorities for every route.
 */
export function registerWorkspaceRoute(context: Context, options: WorkspaceRouteOptions): void {
  context.effect(() => context.webServer.register({
    kind: 'prefix',
    path: '/short-drama',
    handler: (request, response) => handle(context, request, response, options),
  }), 'creative: DSH-session workspace API')
}
