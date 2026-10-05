import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError } from '@deepseek-ai/dsh-fs'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { z } from 'zod'
import { commandSchema } from './schema.ts'
import { studyStore, StudyConflict } from './store.ts'
import { dashboard } from './dashboard.ts'

const mutation = z.object({ revision: z.number().int().nonnegative(), change: commandSchema }).strict()
const allowed = new Set(['setup', 'limits', 'configure-course', 'start', 'answer', 'hint', 'stop', 'confirm-mistake'])

/** Browser requests must address the local DSH host and originate from the same authority. */
export function trustedStudyRequest(request: Pick<IncomingMessage, 'headers'>): boolean {
  try {
    const host = request.headers.host
    if (!host || request.headers['sec-fetch-site'] === 'cross-site') return false
    const url = new URL(`http://${host}`)
    if (url.host !== host || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false
    const origin = request.headers.origin
    return origin === undefined || (typeof origin === 'string' && new URL(origin).host === url.host)
  } catch { return false }
}

function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(value))
}

/** The UI can submit learner actions; grading and rewards remain in the shared learning reducer. */
export async function handleStudyRequest(context: Context, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const abort = new AbortController()
  const onClose = () => { if (!response.writableEnded) abort.abort() }
  response.on('close', onClose)
  try {
    if (!trustedStudyRequest(request)) { send(response, 403, { error: '请求来源不受信任' }); return }
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== '/student/workspace' || !['GET', 'POST'].includes(request.method ?? '')) { send(response, 404, { error: '学习接口不存在' }); return }
    const rawId = url.searchParams.get('sessionId')
    if (!rawId || rawId.length > 200) { send(response, 400, { error: '请先打开学习会话' }); return }
    const agent = await context.typert.lookups.get('agent')?.resolve(SessionId(rawId)) as Agent | undefined
    if (!agent || agent.session.header.parentSession || agent.session.header.origin === 'subagent') { send(response, 404, { error: '请在主会话中打开学习工作区' }); return }
    let change: z.infer<typeof commandSchema> | undefined
    let revision: number | undefined
    if (request.method === 'POST') {
      if (!request.headers['content-type']?.startsWith('application/json')) { send(response, 415, { error: '请求必须使用 JSON' }); return }
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += bytes.length
        if (size > 65_536) { send(response, 413, { error: '提交内容过长' }); return }
        chunks.push(bytes)
      }
      const input = mutation.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      if (!allowed.has(input.change.action)) { send(response, 403, { error: '该操作需要学习助手核对' }); return }
      change = input.change
      revision = input.revision
    }
    const state = await studyStore({ agent, signal: abort.signal }, change, revision)
    send(response, 200, dashboard(state, Date.now()))
  } catch (error) {
    const conflict = error instanceof StudyConflict || (error instanceof FsError && ['FS_STALE_VERSION', 'FS_NOT_OBSERVED'].includes(error.code))
    send(response, conflict ? 409 : 400, { error: error instanceof z.ZodError ? '请填写完整且有效的学习资料' : error instanceof Error ? error.message : '学习档案暂时无法读取' })
  } finally { response.off('close', onClose) }
}

/** Optional web integration leaves the same plugin usable in terminal sessions. */
export function registerStudyRoute(context: Context): void {
  context.inject(['webServer', 'typert'], ctx => {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/student', handler: (request, response) => handleStudyRequest(ctx, request, response) }), 'student: workspace API')
  })
}
