/** Game project reads and isolated previews on the DSH web server. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError, type FileSystem, type FsInfo, type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { type GameVerificationBinding, validateGameEvidence, WorkspaceVerificationTracker } from './verification.ts'
import { isTrustedPreviewNavigation, isTrustedWorkspaceRequest } from './workspace-request-trust.ts'

const GAME_DIRECTORY = 'game-adaptations'
const FILE_LIMIT = 1000
const PREVIEW_FILE_LIMIT = 32 * 1024 * 1024
const previewPolicy: string[] = JSON.parse(readFileSync(new URL('../knowledge/skills/game-qa/scripts/preview-policy.json', import.meta.url), 'utf8'))
const workspaceVerificationTracker = new WorkspaceVerificationTracker()

/** Game route read budget and permitted host authorities. */
export interface GameRouteOptions {
  readonly maxBytes: number
  readonly trustedHosts?: readonly string[]
}

interface WorkspaceFile {
  readonly path: string
  readonly bytes: number
  readonly version: string
  readonly kind: 'text' | 'media'
  readonly mimeType?: string | undefined
}

interface GameVerificationSummary {
  readonly status: 'NOT_RUN' | 'FAIL' | 'PASS'
  readonly checks: Readonly<Record<string, 'NOT_RUN' | 'FAIL' | 'PASS'>>
  readonly runId?: string | undefined
  readonly limitations: readonly { readonly scope: string; readonly reason: string }[]
  readonly binding: GameVerificationBinding
  readonly verifiedPreviewVersion?: string | undefined
}

interface GameProjectSummary {
  readonly id: string
  readonly root: string
  readonly title: string
  readonly source: 'workspace'
  readonly previewReady: boolean
  readonly previewUrl?: string | undefined
  readonly previewVersion: string
  readonly verification: GameVerificationSummary
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

function skipWorkspaceDirectory(path: string): boolean {
  return path.split('/').some(part => part.startsWith('.') || ['node_modules', '__pycache__', '.git'].includes(part))
}

function editablePath(path: string): boolean {
  return safeRelativePath(path) && gameRoot(path.split('/').slice(0, 2).join('/'))
    && /\.(?:md|txt|json|jsonl|html|css|[cm]?js|tsx?|jsx)$/iu.test(path)
}

async function creativeTarget(realm: WorkspaceRealm, path: string): Promise<FsTarget> {
  if (!editablePath(path)) throw new WorkspaceHttpError(403, '文件不属于游戏项目。')
  const root = await realm.fs.resolve(path.split('/').slice(0, 2).join('/'), { cwd: realm.cwd })
  const target = await realm.fs.resolve(path, { cwd: realm.cwd })
  if (!realm.fs.contains(realm.root, root) || !realm.fs.contains(root, target)) throw new WorkspaceHttpError(403, '文件离开游戏项目。')
  return target
}

async function listFiles(realm: WorkspaceRealm): Promise<{ readonly files: WorkspaceFile[]; readonly truncated: boolean }> {
  const files: WorkspaceFile[] = []
  let truncated = false
  const walk = async (path: string, target: FsTarget, owner: FsTarget): Promise<void> => {
    for (const entry of await realm.fs.listDir(target)) {
      if (truncated) return
      const child = `${path}/${entry.name}`
      if (skipWorkspaceDirectory(child) || !realm.fs.contains(owner, entry.target)) continue
      if (entry.type === 'directory') await walk(child, entry.target, path === GAME_DIRECTORY ? entry.target : owner)
      else if (entry.type === 'file' && editablePath(child)) {
        if (files.length >= FILE_LIMIT) { truncated = true; return }
        const info = await realm.fs.stat(entry.target)
        if (info?.type === 'file') files.push({ path: child, bytes: info.size ?? 0, version: info.version, kind: 'text' })
      }
    }
  }
  const root = await realm.fs.resolve(GAME_DIRECTORY, { cwd: realm.cwd })
  if (realm.fs.contains(realm.root, root) && (await realm.fs.stat(root))?.type === 'directory') await walk(GAME_DIRECTORY, root, root)
  return { files: files.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN')), truncated }
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

function safeRelativePath(path: string): boolean {
  return path !== ''
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
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

function token(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function untoken(value: string): string {
  try { return Buffer.from(value, 'base64url').toString('utf8') }
  catch { throw new WorkspaceHttpError(400, '游戏预览标识无效。') }
}

/**
 * The deliberately loose well-formedness check for a workspace game project
 * root; `fs.resolve` plus `contains` stay the real containment boundary.
 * @param path - workspace-relative path to test.
 * @returns whether the path names `game-adaptations/<project>`.
 */
export function gameRoot(path: string): boolean {
  // Reject only what is actually unsafe; fs.resolve + fs.contains remain the real boundary.
  // A stricter slug allowlist silently hid legitimate project names (spaces, ·, leading _, NFD).
  const parts = path.split('/')
  const name = parts[1]
  return parts.length === 2 && parts[0] === GAME_DIRECTORY && name !== undefined
    && name !== '' && name !== '.' && name !== '..' && name.length <= 128
    && !name.startsWith('.') && !name.includes('\\')
}

function normalizedVerification(
  value: unknown,
  binding: GameVerificationBinding,
  verifiedPreviewVersion?: string,
): GameVerificationSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { status: 'NOT_RUN', checks: {}, limitations: [], binding }
  }
  const record = value as Record<string, unknown>
  const status = record.status === 'PASS' || record.status === 'FAIL' ? record.status : 'NOT_RUN'
  const rawChecks = typeof record.checks === 'object' && record.checks !== null && !Array.isArray(record.checks)
    ? record.checks as Record<string, unknown>
    : {}
  const checks: Record<string, 'NOT_RUN' | 'FAIL' | 'PASS'> = {}
  for (const name of ['launch', 'render', 'input', 'coreLoop', 'outcome', 'restart']) {
    const check = rawChecks[name]
    checks[name] = check === 'PASS' || check === 'FAIL' ? check : 'NOT_RUN'
  }
  const completeRun = typeof record.completeRun === 'object' && record.completeRun !== null && !Array.isArray(record.completeRun)
    ? record.completeRun as Record<string, unknown>
    : {}
  const limitations = Array.isArray(record.limitations) ? record.limitations.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return []
    const item = entry as Record<string, unknown>
    return typeof item.scope === 'string' && typeof item.reason === 'string'
      ? [{ scope: item.scope, reason: item.reason }]
      : []
  }) : []
  return {
    status,
    checks,
    runId: typeof completeRun.id === 'string' ? completeRun.id : undefined,
    limitations,
    binding,
    verifiedPreviewVersion,
  }
}

async function workspaceText(realm: WorkspaceRealm, path: string, maxBytes: number): Promise<string | undefined> {
  const target = await realm.fs.resolve(path, { cwd: realm.cwd })
  if (!realm.fs.contains(realm.root, target) || (await realm.fs.stat(target))?.type !== 'file') return undefined
  return (await readVersionedFile(realm.fs, target, maxBytes)).content
}

async function previewDigest(realm: WorkspaceRealm, projectRoot: string): Promise<{ readonly ready: boolean; readonly version: string; readonly paths: readonly string[] }> {
  const appPath = `${projectRoot}/build/app`
  const app = await realm.fs.resolve(appPath, { cwd: realm.cwd })
  if (!realm.fs.contains(realm.root, app) || (await realm.fs.stat(app))?.type !== 'directory') return { ready: false, version: 'missing', paths: [] }
  const entries: string[] = []
  const paths: string[] = []
  let ready = false
  const visit = async (directory: FsTarget, path: string): Promise<void> => {
    for (const entry of await realm.fs.listDir(directory)) {
      if (entry.name.startsWith('.') || !realm.fs.contains(app, entry.target)) continue
      const childPath = path === '' ? entry.name : `${path}/${entry.name}`
      if (entry.type === 'directory') {
        if (!skipWorkspaceDirectory(`${appPath}/${childPath}`)) await visit(entry.target, childPath)
      }
      else if (entry.type === 'file') {
        paths.push(`${appPath}/${childPath}`)
        const info = entry.version === undefined ? await realm.fs.stat(entry.target) : undefined
        const version = entry.version ?? info?.version
        if (version !== undefined) entries.push(`${childPath}\0${version}`)
        if (childPath === 'index.html') ready = true
      }
      if (entries.length >= 5_000) return
    }
  }
  await visit(app, '')
  return { ready, version: createHash('sha256').update(entries.sort().join('\n')).digest('hex').slice(0, 16), paths }
}

function headingTitle(content: string | undefined, fallback: string): string {
  const heading = content?.split(/\r?\n/u).find(line => /^#\s+/u.test(line))
  return heading?.replace(/^#\s+/u, '').replace(/^PRODUCT_BRIEF\s*[·・:]?\s*/iu, '').trim() || fallback
}

/**
 * Project game metadata from a Session-scoped file listing.
 * @param realm - calling Session filesystem and authority.
 * @param files - listed workspace file revisions.
 * @param sessionId - calling Session identity.
 * @param maxBytes - bounded metadata read size.
 * @returns games with authenticated evidence and isolated preview addresses.
 */
export async function workspaceGameProjects(
  realm: WorkspaceRealm,
  files: readonly WorkspaceFile[],
  sessionId: string,
  maxBytes: number,
): Promise<GameProjectSummary[]> {
  const roots = [...new Set(files.flatMap((file) => {
    const parts = file.path.split('/')
    return parts[0] === GAME_DIRECTORY && parts[1] !== undefined ? [`${GAME_DIRECTORY}/${parts[1]}`] : []
  }))].filter(gameRoot).sort()
  return Promise.all(roots.map(async (root) => {
    const id = root.slice(`${GAME_DIRECTORY}/`.length)
    const qaPath = `${root}/qa/verification.json`
    const qaFile = files.find(file => file.path === qaPath)
    // Isolate per-project metadata failures: an unreadable brief, a non-UTF-8 or oversized
    // verification file, or a build/app subtree removed mid-rebuild must degrade this one card,
    // never abort the shared workspace listing (which also carries the story and drama trees).
    const [brief, qa, preview] = await Promise.all([
      workspaceText(realm, `${root}/PRODUCT_BRIEF.md`, maxBytes).catch(() => undefined),
      workspaceText(realm, qaPath, maxBytes).catch(() => undefined),
      previewDigest(realm, root).catch(() => ({ ready: false, version: 'unavailable', paths: [] })),
    ])
    let verification: unknown
    try { verification = qa === undefined ? undefined : JSON.parse(qa) }
    catch { verification = undefined }
    const valid = await validateGameEvidence(verification, async (path) => {
      if (!path.startsWith(`${root}/`)) throw new Error('Evidence belongs to another game')
      const target = await realm.fs.resolve(path, { cwd: realm.cwd })
      if (!realm.fs.contains(realm.root, target)) throw new Error('Evidence leaves workspace')
      return realm.fs.readBytes(target, undefined, PREVIEW_FILE_LIMIT)
    }, [...preview.paths, `${root}/qa/plan.json`])
    if (!valid && verification !== undefined) verification = { status: 'FAIL', checks: {}, limitations: [{ scope: 'evidence', reason: 'Run game_qa; evidence is unsigned, missing, changed or inconsistent.' }] }
    const freshness = workspaceVerificationTracker.observe(`${sessionId}\0${root}`, qaFile?.version, preview.version)
    return {
      id: `workspace:${id}`,
      root,
      title: headingTitle(brief, id),
      source: 'workspace' as const,
      previewReady: preview.ready,
      previewUrl: preview.ready
        ? `/novel-to-game/preview/workspace/${token(sessionId)}/${token(root)}/index.html`
        : undefined,
      previewVersion: preview.version,
      verification: normalizedVerification(verification, valid ? 'CURRENT' : freshness.binding, valid ? preview.version : freshness.verifiedPreviewVersion),
    }
  }))
}

function previewContentType(path: string): string {
  switch (extname(path).toLocaleLowerCase()) {
    case '.html': return 'text/html; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.woff': return 'font/woff'
    case '.woff2': return 'font/woff2'
    case '.wasm': return 'application/wasm'
    case '.mp3': return 'audio/mpeg'
    case '.ogg': return 'audio/ogg'
    default: return 'application/octet-stream'
  }
}

function previewAssetSources(request: IncomingMessage): string {
  const authority = request.headers.host
  if (authority === undefined) return "'none'"
  const prefix = `${authority}${request.url?.startsWith('/creative/') ? '/creative/game-preview/' : '/novel-to-game/preview/'}`
  return `http://${prefix} https://${prefix}`
}

/**
 * The per-response CSP for isolated game previews.
 * @param assets - the origin prefix every preview resource is served from.
 * @returns the header value to send with every preview response.
 */
export function previewContentSecurityPolicy(assets: string): string {
  return previewPolicy.map(rule => rule.replaceAll('$assets', assets)).join('; ')
}

function sendPreview(request: IncomingMessage, response: ServerResponse, path: string, bytes: Uint8Array): void {
  const assets = previewAssetSources(request)
  response.writeHead(200, {
    'content-type': previewContentType(path),
    'content-length': bytes.byteLength,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'cross-origin',
    'access-control-allow-origin': '*',
    'content-security-policy': previewContentSecurityPolicy(assets),
  })
  response.end(bytes)
}

async function previewBytes(context: Context, pathname: string): Promise<{ readonly path: string; readonly bytes: Uint8Array }> {
  let segments: string[]
  try {
    segments = pathname.split('/').slice(3).map(segment => decodeURIComponent(segment))
  } catch {
    throw new WorkspaceHttpError(400, '游戏预览地址无效。')
  }
  const kind = segments.shift()
  if (kind === 'workspace') {
    const session = segments.shift()
    const project = segments.shift()
    const path = segments.join('/') || 'index.html'
    if (session === undefined || project === undefined || !safeRelativePath(path)) throw new WorkspaceHttpError(400, '游戏预览地址无效。')
    const realm = await workspaceRealmForSession(context, untoken(session))
    const root = untoken(project)
    if (!gameRoot(root)) throw new WorkspaceHttpError(403, '游戏项目路径无效。')
    const appRoot = await realm.fs.resolve(`${root}/build/app`, { cwd: realm.cwd })
    const target = await realm.fs.resolve(`${root}/build/app/${path}`, { cwd: realm.cwd })
    if (!realm.fs.contains(realm.root, appRoot) || !realm.fs.contains(appRoot, target)) {
      throw new WorkspaceHttpError(403, '预览资源离开了游戏目录。')
    }
    const info = requireRegularFile(await realm.fs.stat(target))
    if (info.size !== undefined && info.size > PREVIEW_FILE_LIMIT) throw new WorkspaceHttpError(413, '预览资源过大。')
    return { path, bytes: await realm.fs.readBytes(target, undefined, PREVIEW_FILE_LIMIT) }
  }
  throw new WorkspaceHttpError(404, '游戏预览不存在。')
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

/**
 * Serve the current or legacy game-preview URL with the same security checks.
 * @param context - DSH Agent lookup and filesystem services.
 * @param request - incoming game preview request.
 * @param response - response receiving the preview bytes.
 * @param trustedHosts - explicitly permitted extra host authorities.
 */
export async function serveGamePreview(context: Context, request: IncomingMessage, response: ServerResponse, trustedHosts: readonly string[] = []): Promise<void> {
  try {
    if (!isTrustedPreviewNavigation(request, trustedHosts)) throw new WorkspaceHttpError(403, '请求来源不受信任。')
    const preview = await previewBytes(context, new URL(request.url ?? '/', 'http://localhost').pathname)
    sendPreview(request, response, preview.path, preview.bytes)
  } catch (error) {
    const mapped = error instanceof WorkspaceHttpError ? error : mapFsError(error)
    send(response, mapped?.status ?? 500, { error: mapped?.message ?? '游戏预览读取失败。' })
  }
}

async function handle(context: Context, request: IncomingMessage, response: ServerResponse, options: GameRouteOptions): Promise<void> {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (request.method !== 'GET') { send(response, 405, { error: '游戏工作台接口只接受读取请求。' }); return }
    if (url.pathname.startsWith('/novel-to-game/preview/')) { await serveGamePreview(context, request, response, options.trustedHosts); return }
    if (!isTrustedWorkspaceRequest(request, options.trustedHosts ?? [])) throw new WorkspaceHttpError(403, '请求来源不受信任。')
    if (url.pathname === '/novel-to-game/workspace') {
      const realm = await workspaceRealm(context, url)
      const listing = await listFiles(realm)
      const games = await workspaceGameProjects(realm, listing.files, realm.agent.session.id, options.maxBytes)
      send(response, 200, { cwd: realm.cwd, ...listing, games })
      return
    }
    if (url.pathname === '/novel-to-game/file') {
      const realm = await workspaceRealm(context, url)
      const path = url.searchParams.get('path')
      if (path === null) throw new WorkspaceHttpError(400, '缺少文件路径。')
      send(response, 200, { path, ...await readVersionedFile(realm.fs, await creativeTarget(realm, path), options.maxBytes) })
      return
    }
    send(response, 404, { error: '游戏接口不存在。' })
  } catch (error) {
    const mapped = error instanceof WorkspaceHttpError ? error : mapFsError(error)
    send(response, mapped?.status ?? 500, { error: mapped?.message ?? '游戏工作台读取失败。' })
  }
}

/**
 * Register the game-only workspace API and preview routes.
 * @param context - DSH web-server context.
 * @param options - file budgets and trusted authorities.
 */
export function registerGameRoutes(context: Context, options: GameRouteOptions): void {
  context.effect(() => context.webServer.register({ kind: 'prefix', path: '/novel-to-game', handler: (request, response) => handle(context, request, response, options) }), 'novel-to-game: workspace routes')
}
