
import { createReadStream } from 'node:fs'
import { realpath as nodeRealpath, stat as nodeStat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, relative } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError, type FileSystem, type FsInfo, type FsTarget, type FsVersion } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { skipVideoDirectory, summarizeVideoProject, VIDEO_DIRECTORY, videoProjectRoot, visibleVideoPath, type VideoProjectSummary } from './video-project.js'
import { isTrustedWorkspaceRequest } from './workspace-request-trust.js'
import { CREATIVE_DIRECTORIES, PROJECT_FILES, creativeMediaMimeType, isCreativeTextPath, parseCreativePath, projectPath, type CreativeProjectPath, type CreativeProjectSummary } from './project-path.ts'
import { type ProduceConfig, produceCredentialView } from './produce-settings.ts'

const GAME_DIRECTORY = 'game-adaptations'
const MEDIA_MAX_BYTES = 256 * 1_024 * 1_024
const FILE_LIMIT = 1_000
const execFileAsync = promisify(execFile)
let videoPreflightCache: { readonly expires: number; readonly value: VideoPreflightSummary } | undefined

interface WorkspaceRouteOptions {
  readonly maxBytes: number
  readonly trustedHosts?: readonly string[]
  /** Production profile seed; the video preflight reports the credentials a run would receive. */
  readonly produce?: ProduceConfig
}

/** What the video preflight needs from the produce profile: see {@link produceCredentialView}. */
type ProduceCredentialView = Awaited<ReturnType<typeof produceCredentialView>>

/** Host-process capability probe. The Agent's execution world may differ; `video-recap --doctor` is authoritative there. */
interface VideoPreflightSummary {
  readonly python: { readonly ok: boolean; readonly version?: string | undefined }
  readonly ffmpeg: { readonly ok: boolean; readonly subtitles: boolean }
  readonly ffprobe: { readonly ok: boolean }
  readonly credentials: { readonly mimo: boolean; readonly fish: boolean; readonly ttsProvider: string }
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

/** One host command probe. `undefined` means the command could not run. */
type PreflightCommandRunner = (command: string, args: readonly string[]) => Promise<string | undefined>

async function commandOutput(command: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], { encoding: 'utf8', timeout: 5_000, maxBuffer: 4 * 1_024 * 1_024 })
    return `${stdout}${stderr}`.trim()
  } catch { return undefined }
}

function pythonVersion(value: string | undefined): { readonly ok: boolean; readonly version?: string | undefined } {
  const match = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/u.exec(value ?? '')
  if (match === null) return { ok: false }
  const major = Number(match[1])
  const minor = Number(match[2])
  return { ok: major > 3 || (major === 3 && minor >= 10), version: match[0].replace(/^Python\s+/u, '') }
}

/**
 * Resolve the speech provider `doctor.py` will use, so the panel names the
 * provider a run actually reaches instead of the request that selects it.
 * @param requested - profile value: `auto`, `mimo-tts` or `fish-audio`.
 * @param mimo - whether a MiMo credential resolves.
 * @param fish - whether a Fish Audio credential resolves.
 * @returns the effective provider id the pinned scripts report.
 */
function effectiveSpeechProvider(requested: string, mimo: boolean, fish: boolean): string {
  const normalized = requested.trim().toLowerCase()
  if (normalized !== '' && normalized !== 'auto') return normalized
  return mimo || !fish ? 'mimo-tts' : 'fish-audio'
}

/**
 * Probe host process capabilities for the video-recap pipeline. Pure apart
 * from `runner` and `env`; `videoPreflight` owns the 30-second cache around it.
 * @param runner - executes one version/filter probe command.
 * @param credentials - the produce profile's resolved credentials and speech routing.
 * @returns the probe summary consumed by the VideoStudio preflight panel.
 */
async function runVideoPreflight(
  runner: PreflightCommandRunner,
  credentials: ProduceCredentialView | Readonly<Record<string, string>>,
): Promise<VideoPreflightSummary> {
  const view: ProduceCredentialView = 'configured' in credentials && credentials.configured instanceof Set
    ? credentials as ProduceCredentialView
    : {
        configured: new Set(Object.keys(credentials as Readonly<Record<string, string>>).filter(key => key.endsWith('_API_KEY'))),
        ttsProvider: (credentials as Readonly<Record<string, string>>).TTS_PROVIDER ?? 'auto',
      }
  let python: VideoPreflightSummary['python'] = { ok: false }
  for (const command of ['python3', 'python']) {
    const parsed = pythonVersion(await runner(command, ['--version']))
    if (parsed.version !== undefined) { python = parsed; break }
  }
  const mimo = view.configured.has('MIMO_API_KEY')
  const fish = view.configured.has('FISH_API_KEY')
  const [ffmpegOutput, ffmpegFilters, ffprobeOutput] = await Promise.all([
    runner('ffmpeg', ['-version']),
    runner('ffmpeg', ['-hide_banner', '-filters']),
    runner('ffprobe', ['-version']),
  ])
  return {
    python,
    ffmpeg: { ok: ffmpegOutput !== undefined, subtitles: /\bsubtitles\b/u.test(ffmpegFilters ?? '') },
    ffprobe: { ok: ffprobeOutput !== undefined },
    credentials: {
      mimo,
      fish,
      ttsProvider: effectiveSpeechProvider(view.ttsProvider, mimo, fish),
    },
  }
}

/**
 * Cached {@link runVideoPreflight}: repeated browser requests within 30 seconds
 * reuse one probe so opening the VideoStudio does not re-exec the probes.
 * @param credentials - the produce profile's resolved credentials and speech routing.
 * @param runner - executes one probe command; defaults to real host commands.
 * @param now - monotonic-enough clock source; injectable for cache tests.
 * @returns the cached or freshly probed capability summary.
 */
async function videoPreflight(
  credentials: ProduceCredentialView | PreflightCommandRunner,
  runner: PreflightCommandRunner | (() => number) = commandOutput,
  now: (() => number) = Date.now,
): Promise<VideoPreflightSummary> {
  if (typeof credentials === 'function') {
    const legacyRunner = credentials
    const legacyNow = typeof runner === 'function' && runner.length === 0 ? runner as () => number : now
    if (videoPreflightCache !== undefined && videoPreflightCache.expires > legacyNow()) return videoPreflightCache.value
    const value = await runVideoPreflight(legacyRunner, {})
    videoPreflightCache = { expires: legacyNow() + 30_000, value }
    return value
  }
  const probeRunner = typeof runner === 'function' && runner.length > 0 ? runner as PreflightCommandRunner : commandOutput
  const cached = videoPreflightCache
  if (cached !== undefined && cached.expires > now()) return cached.value
  const value = await runVideoPreflight(probeRunner, credentials)
  videoPreflightCache = { expires: now() + 30_000, value }
  return value
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
  if (parsed?.domain !== 'video') return false
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
  if (parsed?.domain !== 'video') {
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
  return name.startsWith('.') || name === 'node_modules' || name === '__pycache__' || skipVideoDirectory(path)
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
        const owner = path === GAME_DIRECTORY || path === VIDEO_DIRECTORY ? entry.target : project
        if (!skipWorkspaceDirectory(childPath) && await walk(childPath, entry.target, owner)) return true
      }
      else if (entry.type === 'file' && (editablePath(childPath) || (parseCreativePath(childPath)?.domain === 'video' && creativeMediaMimeType(entry.name) !== undefined))) {
        if (childPath.startsWith(`${VIDEO_DIRECTORY}/`) && !visibleVideoPath(childPath)) continue
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

async function workspaceText(realm: WorkspaceRealm, path: string, maxBytes: number): Promise<string | undefined> {
  const target = await realm.fs.resolve(path, { cwd: realm.cwd })
  if (!realm.fs.contains(realm.root, target) || (await realm.fs.stat(target))?.type !== 'file') return undefined
  return (await readVersionedFile(realm.fs, target, maxBytes)).content
}

async function workspaceVideoProjects(
  realm: WorkspaceRealm,
  files: readonly WorkspaceFile[],
  maxBytes: number,
): Promise<VideoProjectSummary[]> {
  const roots = [...new Set(files.flatMap((file) => {
    const root = videoProjectRoot(file.path)
    return root === undefined ? [] : [root]
  }))].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
  return Promise.all(roots.map(async (root) => {
    const findPath = (name: string): string | undefined => files.find(file => file.path.startsWith(`${root}/`) && file.path.split('/').at(-1) === name)?.path
    const readJson = async (name: string): Promise<unknown> => {
      const path = findPath(name)
      if (path === undefined) return undefined
      const content = await workspaceText(realm, path, maxBytes).catch(() => undefined)
      if (content === undefined) return undefined
      try {
        const value: unknown = JSON.parse(content)
        return value
      } catch { return undefined }
    }
    const [project, runManifest, assembly] = await Promise.all([
      readJson('project.json'),
      readJson('recap_run_manifest.json'),
      readJson('assembly_manifest.json'),
    ])
    return summarizeVideoProject(root, files, { project, runManifest, assembly })
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
    if (url.pathname === '/video-recap/workspace' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const listing = await listFiles(realm)
      const files = listing.files
      const projects = await workspaceProjects(realm, files, options.maxBytes)
      const sessionId = url.searchParams.get('sessionId')
      if (sessionId === null) throw new WorkspaceHttpError(400, '缺少 DSH sessionId。')
      const games: never[] = []
      const videos = await workspaceVideoProjects(realm, files, options.maxBytes)
      const outputs: never[] = []
      send(response, 200, { cwd: realm.cwd, files, truncated: listing.truncated, games, videos, projects, outputs, mode: 'dsh-session' })
      return
    }
    if (url.pathname === '/video-recap/video-preflight' && request.method === 'GET') {
      send(response, 200, await videoPreflight(await produceCredentialView(context, options.produce ?? {})))
      return
    }
    if (url.pathname === '/video-recap/file' && request.method === 'GET') {
      const realm = await workspaceRealm(context, url)
      const path = url.searchParams.get('path')
      if (path === null) throw new WorkspaceHttpError(400, '缺少文件路径。')
      const file = await readVersionedFile(realm.fs, await creativeTarget(realm, path), options.maxBytes)
      send(response, 200, { path, ...file })
      return
    }
    if (url.pathname === '/video-recap/media' && (request.method === 'GET' || request.method === 'HEAD')) {
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
    if (url.pathname === '/video-recap/file' && request.method === 'PUT') {
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
    path: '/video-recap',
    handler: (request, response) => handle(context, request, response, options),
  }), 'creative: DSH-session workspace API')
}
