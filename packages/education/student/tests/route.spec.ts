import { Readable } from 'node:stream'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleStudyRequest, trustedStudyRequest } from '../src/route.ts'
import { updateStudy } from '../src/learning.ts'
import { studyStore, StudyConflict } from '../src/store.ts'
import { queueWorksheet } from '../src/worksheet.ts'
import { NOW, DAY, mistake, confirm, setup } from './fixtures.ts'

vi.mock('../src/store.ts', async importOriginal => ({ ...await importOriginal<typeof import('../src/store.ts')>(), studyStore: vi.fn() }))
vi.mock('../src/worksheet.ts', async importOriginal => ({ ...await importOriginal<typeof import('../src/worksheet.ts')>(), queueWorksheet: vi.fn() }))
afterEach(() => { vi.mocked(studyStore).mockReset(); vi.mocked(queueWorksheet).mockReset() })

async function request({ method = 'GET', body = '', header = {}, session = true, child = false, path = '/student/workspace?sessionId=test' } = {}) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url: path, headers: { host: 'localhost:3000', 'content-type': 'application/json', ...header } }) as IncomingMessage
  let status = 0
  let result: string | Buffer = ''
  let contentType = ''
  const res = Object.assign(new EventEmitter(), { writableEnded: false, writeHead(code: number, headers: Record<string, string>) { status = code; contentType = headers['content-type'] ?? '' }, end(text: string | Buffer) { result = text; this.writableEnded = true } }) as ServerResponse
  const resolve = vi.fn(async () => session ? { session: { header: { cwd: '/learning', ...(child ? { origin: 'subagent' } : {}) } } } : undefined)
  type Provider = NonNullable<ReturnType<Context['typert']['lookups']['get']>>
  const fake: { typert: { lookups: { get(key: string): Pick<Provider, 'resolve'> | undefined } } } = { typert: { lookups: { get: () => ({ resolve }) } } }
  const context = fake as Context
  await handleStudyRequest(context, req, res)
  return { status, result: contentType === 'application/pdf' ? result : JSON.parse(String(result)), resolve }
}

function worksheetState() {
  let state = updateStudy(undefined, setup, NOW)
  state = updateStudy(state, { action: 'concept', concept: { id: 'ten', subject: 'math', name: '凑十', definition: '先组成十', example: '8+2=10', source: '课本' } }, NOW)
  state = updateStudy(state, { action: 'confirm-concept', id: 'ten', userConfirmation: '家长核对' }, NOW)
  state = updateStudy(state, { action: 'objective', objective: { id: 'add', subject: 'math', title: '凑十加法', goal: '解释步骤', conceptIds: ['ten'], method: 'represent' } }, NOW)
  state = updateStudy(state, { action: 'mistake', mistake }, NOW)
  state = updateStudy(state, confirm, NOW)
  state = updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'add' }, NOW)
  return updateStudy(state, { action: 'worksheet', worksheet: { id: 'sheet', subject: 'math', objectiveId: 'add', items: [{ id: 'q1', mistakeId: mistake.id, prompt: '请用凑十法计算 9 + 6。', answer: '15', explanation: '先拆成 1 和 5', answerEvidence: '9+1+5=15' }] } }, NOW)
}

describe('student workspace boundary', () => {
  it('permits same-host loopback requests and rejects cross-site and rebinding origins', () => {
    expect(trustedStudyRequest({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } })).toBe(true)
    for (const headers of [{ host: 'evil.test' }, { host: '127.0.0.1', origin: 'https://evil.test' }, { host: 'localhost', 'sec-fetch-site': 'cross-site' }, { host: 'localhost@evil.test' }]) expect(trustedStudyRequest({ headers })).toBe(false)
  })
  it('does not resolve or read an untrusted request', async () => {
    const result = await request({ header: { origin: 'https://evil.test' } })
    expect(result.status).toBe(403)
    expect(result.resolve).not.toHaveBeenCalled()
    expect(studyStore).not.toHaveBeenCalled()
  })
  it('rejects missing and child sessions', async () => {
    expect((await request({ session: false })).status).toBe(404)
    expect((await request({ child: true })).status).toBe(404)
    expect((await request({ path: '/student/workspace' })).status).toBe(400)
    expect(studyStore).not.toHaveBeenCalled()
  })
  it('rejects invalid notebook offsets before reading study data', async () => {
    expect((await request({ path: '/student/workspace?sessionId=test&mistakeOffset=-1' })).status).toBe(400)
    expect((await request({ path: '/student/workspace?sessionId=test&mistakeOffset=5001' })).status).toBe(400)
    expect((await request({ path: '/student/workspace?sessionId=test&subject=history' })).status).toBe(400)
    expect((await request({ path: '/student/workspace?sessionId=test&mistakeStatus=archived' })).status).toBe(400)
    expect((await request({ path: '/student/workspace?sessionId=test&mapGrade=3' })).status).toBe(400)
    expect((await request({ path: '/student/workspace?sessionId=test&mapTerm=third' })).status).toBe(400)
    expect(studyStore).not.toHaveBeenCalled()
  })
  it('returns an absent dashboard without creating a learner', async () => {
    vi.mocked(studyStore).mockResolvedValue(undefined)
    expect((await request()).result).toMatchObject({ revision: 0, study: null })
    expect(studyStore).toHaveBeenCalledWith(expect.anything(), undefined, undefined)
  })
  it('returns the requested page of confirmed mistakes through the workspace route', async () => {
    const state = updateStudy(undefined, setup, NOW)
    state.mistakes = Array.from({ length: 21 }, (_, index) => ({ ...mistake, id: `error-${index}`, confirmedAt: NOW, dueAt: NOW + DAY, userConfirmation: 'Parent checked', stage: 0, independentDays: [] }))
    vi.mocked(studyStore).mockResolvedValue(state)
    const result = await request({ path: '/student/workspace?sessionId=test&mistakeOffset=20&subject=math' })
    expect(result.status).toBe(200)
    expect(result.result.study).toMatchObject({ confirmedCount: 21, confirmedCounts: { chinese: 0, math: 21, english: 0 }, confirmedOffset: 20, confirmedSubject: 'math', confirmedMistakes: [{ id: 'error-0' }], mistakeStatus: 'all', mistakeBook: { mastered: 0, pending: 0 } })
    expect(result.result.study.mistakeBook.due + result.result.study.mistakeBook.reviewing).toBe(21)
    expect(result.result.study.curriculum).toMatchObject({ id: 'math-grade2-first', summary: expect.objectContaining({ concepts: 20 }) })
    const browsed = await request({ path: '/student/workspace?sessionId=test&subject=math&mapGrade=1&mapTerm=second' })
    expect(browsed.result.study).toMatchObject({ curriculum: { id: 'math-grade1-second', scope: { grade: 1, term: 'second', current: false } }, diagnostic: { subject: 'math' } })
    const filtered = await request({ path: '/student/workspace?sessionId=test&subject=math&mistakeStatus=mastered' })
    expect(filtered.result.study).toMatchObject({ confirmedCount: 0, confirmedCounts: { chinese: 0, math: 0, english: 0 }, mistakeStatus: 'mastered', mistakeBook: { mastered: 0 } })
  })
  it('previews a real PDF without submitting a print job', async () => {
    const state = worksheetState()
    vi.mocked(studyStore).mockResolvedValue(state)
    const path = '/student/worksheet.pdf?sessionId=test&id=sheet'
    const preview = await request({ path })
    expect(preview.status).toBe(200)
    expect(Buffer.isBuffer(preview.result) && preview.result.subarray(0, 8).toString()).toBe('%PDF-1.3')
    expect(queueWorksheet).not.toHaveBeenCalled()
  })
  it.skipIf(process.platform === 'win32')('queues only after an explicit confirmed request on an lp host', async () => {
    const state = worksheetState()
    vi.mocked(studyStore).mockResolvedValue(state)
    expect((await request({ method: 'POST', path: '/student/print?sessionId=test', body: JSON.stringify({ revision: state.revision, worksheetId: 'sheet' }) })).status).toBe(400)
    expect((await request({ method: 'POST', path: '/student/print?sessionId=test', body: JSON.stringify({ revision: state.revision - 1, worksheetId: 'sheet', confirmed: true }) })).status).toBe(409)
    expect(queueWorksheet).not.toHaveBeenCalled()
    vi.mocked(queueWorksheet).mockResolvedValue('request id is HP_DeskJet_4900-123')
    const printed = await request({ method: 'POST', path: '/student/print?sessionId=test', body: JSON.stringify({ revision: state.revision, worksheetId: 'sheet', confirmed: true }) })
    expect(printed).toMatchObject({ status: 200, result: { receipt: 'request id is HP_DeskJet_4900-123' } })
    expect(queueWorksheet).toHaveBeenCalledWith(expect.any(Buffer), 'study-sheet')
  })
  it('requires revisions, bounds payloads, and disallows client-authored assessments', async () => {
    expect((await request({ method: 'POST', body: JSON.stringify({ change: setup }) })).status).toBe(400)
    expect((await request({ method: 'POST', body: 'x'.repeat(65_537) })).status).toBe(413)
    expect((await request({ method: 'POST', body: JSON.stringify({ revision: 0, change: { action: 'task', task: { id: 'q', sessionId: 's', subject: 'math', topic: 'sum', prompt: '1+1?' } } }) })).status).toBe(403)
    expect((await request({ method: 'POST', body: JSON.stringify({ revision: 0, change: { action: 'paper-draft', paperDraft: { worksheetId: 'w', itemId: 'q', response: '2', result: 'correct', assistance: 'independent', uncertainties: '' } } }) })).status).toBe(403)
    expect(studyStore).not.toHaveBeenCalled()
    for (const change of [
      { action: 'school-progress', subject: 'math', unitId: 'm2a-u-mul', posture: 'keep-up', preview: 'off', pace: 'teaching', parentConfirmation: '家长确认学校进度。' },
      { action: 'classify-mistake', mistakeId: 'error-1', errorType: 'carry-borrow' },
      { action: 'confirm-paper', worksheetId: 'w', results: [{ itemId: 'q', result: 'correct' }], userConfirmation: '家长核对照片。' },
    ]) expect((await request({ method: 'POST', body: JSON.stringify({ revision: 0, change }) })).status).toBe(200)
  })
  it('passes the observed revision and reports conflicts without retrying writes', async () => {
    vi.mocked(studyStore).mockRejectedValue(new StudyConflict())
    const result = await request({ method: 'POST', body: JSON.stringify({ revision: 7, change: setup }) })
    expect(result.status).toBe(409)
    expect(studyStore).toHaveBeenCalledTimes(1)
    expect(studyStore).toHaveBeenCalledWith(expect.anything(), setup, 7)
  })
})
