import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError, type FsVersion } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { isEditableWriterPath } from './editable.ts'
import { isTrustedWriterRequest } from './request-trust.ts'

/** Limits and authorities for the write route. */
export interface WriterRouteOptions {
  readonly maxBytes: number
  readonly trustedHosts: readonly string[]
}

class WriterHttpError extends Error {
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
    if (size > maxBytes) throw new WriterHttpError(413, '请求内容过大。')
    chunks.push(value)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object')
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof WriterHttpError) throw error
    throw new WriterHttpError(400, '请求必须是 JSON 对象。')
  }
}

function mapFsError(error: unknown): WriterHttpError | undefined {
  if (!(error instanceof FsError)) return undefined
  switch (error.code) {
    case 'FS_NOT_FOUND': return new WriterHttpError(404, '文件不存在。')
    case 'FS_TOO_LARGE': return new WriterHttpError(413, '文件超过侧栏大小限制。')
    case 'FS_NOT_TEXT':
    case 'FS_NOT_REGULAR_FILE': return new WriterHttpError(415, '目标不是可编辑的文本文件。')
    case 'FS_PERMISSION_DENIED':
    case 'FS_SANDBOX_DENIED': return new WriterHttpError(403, '当前权限不允许修改该文件。')
    case 'FS_STALE_VERSION':
    case 'FS_NOT_OBSERVED': return new WriterHttpError(412, '文件已在磁盘上更新。请处理冲突后再保存。')
    case 'FS_ABORTED': return new WriterHttpError(409, '文件操作已取消。')
    default: return new WriterHttpError(500, '文件系统操作失败。')
  }
}

async function sessionAgent(context: Context, rawId: string): Promise<Agent> {
  if (rawId === '' || rawId.length > 200) throw new WriterHttpError(400, '缺少会话。')
  const lookup = context.typert.lookups.get('agent')
  if (lookup === undefined) throw new WriterHttpError(503, '会话查找当前不可用。')
  let agent: Agent | undefined
  try {
    agent = await lookup.resolve(SessionId(rawId)) as Agent | undefined
  } catch {
    throw new WriterHttpError(404, '会话不可用。')
  }
  if (agent === undefined) throw new WriterHttpError(404, '会话不可用。')
  if (agent.session.header.parentSession !== undefined || agent.session.header.origin === 'subagent') {
    throw new WriterHttpError(404, '请在主会话里保存。')
  }
  if (agent.session.header.cwd === undefined) throw new WriterHttpError(404, '会话没有工作区。')
  return agent
}

async function handle(context: Context, request: IncomingMessage, response: ServerResponse, options: WriterRouteOptions): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  if (!isTrustedWriterRequest(request, options.trustedHosts)) throw new WriterHttpError(403, '请求来源不受信任。')
  if (url.pathname !== '/writer/file' || request.method !== 'PUT') throw new WriterHttpError(404, '写作接口不存在。')
  const sessionId = url.searchParams.get('sessionId') ?? ''
  const path = url.searchParams.get('path') ?? ''
  if (!isEditableWriterPath(path)) throw new WriterHttpError(403, '只能保存侧栏允许的文本文件（md/txt/json/yaml/yml/toml）。')
  const input = await jsonBody(request, options.maxBytes * 2 + 1024)
  if (typeof input.content !== 'string') throw new WriterHttpError(400, 'content 必须是字符串。')
  if (Buffer.byteLength(input.content) > options.maxBytes) throw new WriterHttpError(413, '文件超过侧栏大小限制。')
  if (typeof input.baseVersion !== 'string' || input.baseVersion === '') throw new WriterHttpError(400, 'baseVersion 必须是有效版本。')
  const agent = await sessionAgent(context, sessionId)
  const filesystem = agent.ctx.get('fs')
  if (filesystem === undefined) throw new WriterHttpError(503, '会话文件系统不可用。')
  const cwd = agent.session.header.cwd
  if (cwd === undefined) throw new WriterHttpError(404, '会话没有工作区。')
  const root = await filesystem.resolve(cwd)
  const target = await filesystem.resolve(path, { cwd })
  if (!filesystem.contains(root, target)) throw new WriterHttpError(403, '文件不在当前工作区。')
  const sandbox = agent.ctx.get('sandboxPolicy')
  const policy = sandbox?.resolve({ session: agent.session })
  const intent = { kind: 'replaceIfVersion' as const, version: input.baseVersion as FsVersion }
  const outcome = policy === undefined
    ? await filesystem.writeText(target, input.content, intent)
    : await filesystem.writeText(target, input.content, intent, undefined, policy)
  send(response, 200, { path, bytes: Buffer.byteLength(outcome.after), version: outcome.version })
}

/**
 * Mount the save route. Reads and directory listings stay on `workspaceFiles`.
 * @param context - host context with the web server and session lookup.
 * @param options - size limit and extra trusted authorities.
 */
export function registerWriterRoute(context: Context, options: WriterRouteOptions): void {
  context.effect(() => context.webServer.register({
    kind: 'prefix',
    path: '/writer',
    handler: async (request, response) => {
      try {
        await handle(context, request, response, options)
      } catch (error) {
        const mapped = error instanceof WriterHttpError ? error : mapFsError(error)
        if (mapped === undefined) context.logger('writer').error('write route failed', error)
        if (!response.headersSent) send(response, mapped?.status ?? 500, { error: mapped?.message ?? '保存失败。' })
      }
    },
  }), 'writer: save route')
}
