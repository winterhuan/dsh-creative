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
import { queueWorksheet, renderWorksheet } from './worksheet.ts'

const mutation = z.object({ revision: z.number().int().nonnegative(), change: commandSchema }).strict()
const printRequest = z.object({ revision: z.number().int().nonnegative(), worksheetId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u), confirmed: z.literal(true) }).strict()
const allowed = new Set(['setup', 'limits', 'configure-course', 'school-progress', 'start', 'answer', 'hint', 'stop', 'confirm-mistake', 'confirm-concept', 'link-mistake', 'classify-mistake', 'grade-sheet', 'discard-sheet', 'confirm-paper'])

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

async function body(request: IncomingMessage, limit: number): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new Error('请求必须使用 JSON')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > limit) throw new Error('提交内容过长')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** The UI can submit learner actions and the parent's marks on a printed sheet; tutor assessment and rewards stay with the model tools. */
export async function handleStudyRequest(context: Context, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const abort = new AbortController()
  const onClose = () => { if (!response.writableEnded) abort.abort() }
  response.on('close', onClose)
  try {
    if (!trustedStudyRequest(request)) { send(response, 403, { error: '请求来源不受信任' }); return }
    const url = new URL(request.url ?? '/', 'http://localhost')
    const workspace = url.pathname === '/student/workspace' && ['GET', 'POST'].includes(request.method ?? '')
    const preview = url.pathname === '/student/worksheet.pdf' && request.method === 'GET'
    const print = url.pathname === '/student/print' && request.method === 'POST'
    if (!workspace && !preview && !print) { send(response, 404, { error: '学习接口不存在' }); return }
    const rawId = url.searchParams.get('sessionId')
    if (!rawId || rawId.length > 200) { send(response, 400, { error: '请先打开学习会话' }); return }
    const mistakeOffset = workspace ? z.coerce.number().int().min(0).max(5000).parse(url.searchParams.get('mistakeOffset') ?? '0') : 0
    const subject = workspace ? z.enum(['chinese', 'math', 'english']).parse(url.searchParams.get('subject') ?? 'math') : 'math'
    const mistakeStatus = workspace ? z.enum(['all', 'due', 'reviewing', 'mastered']).parse(url.searchParams.get('mistakeStatus') ?? 'all') : 'all'
    const mapGrade = workspace && url.searchParams.has('mapGrade') ? z.coerce.number().int().min(1).max(2).parse(url.searchParams.get('mapGrade')) : undefined
    const mapTerm = workspace && url.searchParams.has('mapTerm') ? z.enum(['first', 'second']).parse(url.searchParams.get('mapTerm')) : undefined
    const diagGrade = workspace && url.searchParams.has('diagGrade') ? z.coerce.number().int().min(1).max(2).parse(url.searchParams.get('diagGrade')) : undefined
    const diagTerm = workspace && url.searchParams.has('diagTerm') ? z.enum(['first', 'second']).parse(url.searchParams.get('diagTerm')) : undefined
    const diagUnit = workspace && url.searchParams.has('diagUnit') ? z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/u).parse(url.searchParams.get('diagUnit')) : undefined
    const agent = await context.typert.lookups.get('agent')?.resolve(SessionId(rawId)) as Agent | undefined
    if (!agent || agent.session.header.parentSession || agent.session.header.origin === 'subagent') { send(response, 404, { error: '请在主会话中打开学习工作区' }); return }
    if (preview || print) {
      if (print && !request.headers['content-type']?.startsWith('application/json')) { send(response, 415, { error: '请求必须使用 JSON' }); return }
      if (print && process.platform === 'win32') { send(response, 501, { error: '当前系统可预览 PDF，但没有 lp 打印队列' }); return }
      const input = print ? printRequest.parse(await body(request, 1024)) : undefined
      const worksheetId = input?.worksheetId ?? url.searchParams.get('id') ?? ''
      if (!/^[a-zA-Z0-9_-]{1,80}$/u.test(worksheetId)) { send(response, 400, { error: '请选择练习单' }); return }
      const state = await studyStore({ agent, signal: abort.signal })
      if (!state) { send(response, 404, { error: '学习档案不存在' }); return }
      if (input && input.revision !== state.revision) { send(response, 409, { error: '学习档案已更新，请刷新后再打印' }); return }
      const pdf = await renderWorksheet(state, worksheetId)
      if (print) { send(response, 200, { receipt: await queueWorksheet(pdf, `study-${worksheetId}`) }); return }
      response.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="study-${worksheetId}.pdf"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      response.end(pdf)
      return
    }
    let change: z.infer<typeof commandSchema> | undefined
    let revision: number | undefined
    if (request.method === 'POST') {
      if (!request.headers['content-type']?.startsWith('application/json')) { send(response, 415, { error: '请求必须使用 JSON' }); return }
      const input = mutation.parse(await body(request, 65_536))
      if (!allowed.has(input.change.action)) { send(response, 403, { error: '该操作需要学习助手核对' }); return }
      change = input.change
      revision = input.revision
    }
    const state = await studyStore({ agent, signal: abort.signal }, change, revision)
    send(response, 200, dashboard(state, Date.now(), { subject, mistakeOffset, mistakeStatus, ...(mapGrade !== undefined ? { mapGrade } : {}), ...(mapTerm !== undefined ? { mapTerm } : {}), ...(diagGrade !== undefined ? { diagGrade } : {}), ...(diagTerm !== undefined ? { diagTerm } : {}), ...(diagUnit !== undefined ? { diagUnit } : {}) }))
  } catch (error) {
    const conflict = error instanceof StudyConflict || (error instanceof FsError && ['FS_STALE_VERSION', 'FS_NOT_OBSERVED'].includes(error.code))
    send(response, conflict ? 409 : error instanceof Error && error.message === '提交内容过长' ? 413 : 400, { error: error instanceof z.ZodError ? '请填写完整且有效的学习资料' : error instanceof Error ? error.message : '学习档案暂时无法读取' })
  } finally { response.off('close', onClose) }
}

/** Optional web integration leaves the same plugin usable in terminal sessions. */
export function registerStudyRoute(context: Context): void {
  context.inject(['webServer', 'typert'], ctx => {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/student', handler: (request, response) => handleStudyRequest(ctx, request, response) }), 'student: workspace API')
  })
}
