
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError, type FileSystem, type FsInfo, type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { isTrustedWorkspaceRequest } from './workspace-request-trust.js'
import {
  CREATIVE_DIRECTORIES,
  PROJECT_FILES, creativeMediaMimeType, isCreativeTextPath, parseCreativePath, projectPath,
  type CreativeProjectPath, type CreativeProjectSummary,
} from './project-path.ts'
import { type ProduceConfig } from './produce-settings.ts'
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
  if (parsed?.domain !== 'story' || parsed.projectRoot !== '') return false
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
  if (parsed?.domain !== 'story' || parsed.projectRoot !== '') {
    throw new WorkspaceHttpError(403, '文件路径不在创作工作台中。')
  }
  return parsed
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
 * List the opened novel project's standard directories and standalone documents.
 * Nested book directories are separate projects and are not discovered here.
 * Recursion within 正文, 大纲 and the other recognized roots preserves volumes.
 * A listing is truncated only when another eligible file exceeds FILE_LIMIT.
 * @param realm - the Session's project directory and filesystem.
 * @returns the complete or truncated project-relative listing.
 */
async function listFiles(realm: WorkspaceRealm): Promise<WorkspaceListing> {
  const files: WorkspaceFile[] = []
  // Returns true when the listing is truncated: an eligible file appeared once
  // `files` already held the limit.
  const walk = async (path: string, directory: FsTarget): Promise<boolean> => {
    for (const entry of await realm.fs.listDir(directory)) {
      if (entry.name.startsWith('.') || !realm.fs.contains(realm.root, entry.target)) continue
      const childPath = `${path}/${entry.name}`
      if (entry.type === 'directory') {
        if (!skipWorkspaceDirectory(childPath) && await walk(childPath, entry.target)) return true
      }
      else if (entry.type === 'file' && editablePath(childPath)) {
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
  return { files: files.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN')), truncated }
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
    if (url.pathname === '/story/workspace' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const listing = await listFiles(realm)
      const files = listing.files
      const projects = await workspaceProjects(realm, files, options.maxBytes)
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null) throw new WorkspaceHttpError(400, '缺少 DSH sessionId。')
      send(response, 200, { cwd: realm.cwd, files, truncated: listing.truncated, projects, mode: 'dsh-session' })
      return
    }
    if (url.pathname === '/story/file' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const path = url.searchParams.get('path')
      if (path === null) throw new WorkspaceHttpError(400, '缺少文件路径。')
      const file = await readVersionedFile(realm.fs, await creativeTarget(realm, path), options.maxBytes)
      send(response, 200, { path, ...file })
      return
    }
    if (url.pathname === '/story/file' && request.method === 'PUT') {
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
    path: '/story',
    handler: (request, response) => handle(context, request, response, options),
  }), 'creative: DSH-session workspace API')
}
