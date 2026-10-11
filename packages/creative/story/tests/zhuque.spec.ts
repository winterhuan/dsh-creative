/**
 * Offline behaviour of the TypeScript Zhuque detector: report mapping, verdicts,
 * failure classification, refusals before any request, and key-pool rotation.
 * The transport is a fake; no network access happens.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { ZHUQUE_EXIT, countedChars, detectChapter, readKeyPool, type ZhuqueFetch } from '../src/core/zhuque.ts'

const PARAGRAPHS = [
  '夜色压下来的时候，她推开木门，把篮子放在桌边，'.repeat(7),
  '灶上的水开了，壶盖一下一下地跳，她没去管，'.repeat(8),
  '院门外有人喊她的小名，喊了两声就不喊了，'.repeat(8),
]
const CHAPTER = `# 第1章\n\n${PARAGRAPHS.join('\n\n')}\n`

function segment(label: number, conf: number, text: string, order: number, position?: [number, number]): Record<string, unknown> {
  const start = Array.from(CHAPTER.slice(0, CHAPTER.indexOf(text))).length
  return { text, label, conf, order, position: position ?? [start, Array.from(text).length] }
}

function success(ratio = 0.7369, segments?: Record<string, unknown>[], labels?: Record<string, number>): Record<string, unknown> {
  return {
    status: 'success', softmax_confidence: 0.5552, ratio_confidence: ratio,
    labels_ratio: labels ?? { 0: 0.2631, 1: 0.4802, 2: 0.2567 },
    segment_labels: segments ?? [segment(1, 0.9997, PARAGRAPHS[0] ?? '', 1), segment(2, 0.6081, PARAGRAPHS[1] ?? '', 2), segment(0, 0.0112, PARAGRAPHS[2] ?? '', 3)],
    usage: { total_tokens: Array.from(CHAPTER).length }, msg: '', makers_models_usage: { total_tokens: 900 },
  }
}

interface Reply { readonly status?: number; readonly body?: unknown; readonly raw?: string; readonly throws?: Error }

function transport(replies: readonly Reply[]): { readonly fetch: ZhuqueFetch; readonly requests: { readonly key: string; readonly body: unknown }[] } {
  const queue = [...replies]
  const requests: { key: string; body: unknown }[] = []
  const fetch: ZhuqueFetch = async (_url, init) => {
    requests.push({ key: init.headers.Authorization ?? '', body: JSON.parse(init.body) as unknown })
    const reply = queue.shift() ?? replies[replies.length - 1] ?? {}
    if (reply.throws !== undefined) throw reply.throws
    const status = reply.status ?? 200
    return { ok: status >= 200 && status < 300, status, headers: { get: () => 'req_offline' }, text: async () => reply.raw ?? JSON.stringify(reply.body ?? success()) }
  }
  return { fetch, requests }
}

async function chapter(context: TestContext, text = CHAPTER): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-story-zhuque-'))
  context.onTestFinished(async () => { await rm(directory, { recursive: true, force: true }) })
  const file = join(directory, '第1章.md')
  await writeFile(file, text)
  return file
}

describe('Zhuque detector', () => {
  it('maps segments to lines and mirrors the web verdict', async (context) => {
    const file = await chapter(context)
    const { fetch, requests } = transport([{}])
    const { report, exitCode } = await detectChapter({ file, env: { MAKERS_API_KEY: 'dummy-makers-key' }, fetch })
    expect(exitCode).toBe(ZHUQUE_EXIT.belowTarget)
    expect(report).toMatchObject({ schema: 'story-zhuque-detect/v1', verdict: 'yellow', verdict_text: '人工创作特征较弱', pass: false, ai_percent: 73.69, request_id: 'req_offline', key_attempts: 1 })
    expect(report.labels_ratio).toEqual({ human: 0.2631, ai: 0.4802, suspected: 0.2567 })
    const segments = report.segments as { label: string; lines: [number, number]; excerpt: string }[]
    expect(segments.map(item => item.label)).toEqual(['ai', 'suspected', 'human'])
    expect(segments.map(item => item.lines)).toEqual([[3, 3], [5, 5], [7, 7]])
    expect(segments[0]?.excerpt.startsWith('夜色压下来的时候')).toBe(true)
    expect(report.usage).toEqual({ model_tokens: Array.from(CHAPTER).length, billed_tokens: 900 })
    expect(requests[0]).toEqual({ key: 'Bearer dummy-makers-key', body: { text: CHAPTER, is_merge: false } })
  })

  it('applies target and colour boundaries', async (context) => {
    const file = await chapter(context)
    for (const [ratio, verdict, target, passed] of [[0.4999, 'green', 0.5, true], [0.5, 'yellow', 0.5, false], [1, 'red', 0.5, false], [0.3, 'green', 0.3, false]] as const) {
      const { report, exitCode } = await detectChapter({ file, target, env: { MAKERS_API_KEY: 'k' }, fetch: transport([{ body: success(ratio) }]).fetch })
      expect([report.verdict, report.pass]).toEqual([verdict, passed])
      expect(exitCode).toBe(passed ? ZHUQUE_EXIT.pass : ZHUQUE_EXIT.belowTarget)
    }
  })

  it('recovers shifted segments and reports unmatched ones', async (context) => {
    const file = await chapter(context)
    const shifted = segment(1, 0.99, PARAGRAPHS[1] ?? '', 1, [0, Array.from(PARAGRAPHS[1] ?? '').length])
    const missing = { text: '原文里没有这句话。', label: 2, conf: 0.6, order: 2, position: [5, 9] }
    const { report } = await detectChapter({ file, env: { MAKERS_API_KEY: 'k' }, fetch: transport([{ body: success(0.7, [shifted, missing]) }]).fetch })
    const segments = report.segments as Record<string, unknown>[]
    expect(segments[0]?.lines).toEqual([5, 5])
    expect(segments[0]?.start).toBe(Array.from(CHAPTER.slice(0, CHAPTER.indexOf(PARAGRAPHS[1] ?? ''))).length)
    expect(segments[1]).toMatchObject({ start: null, length: null, lines: null })
  })

  it('classifies HTTP, network and malformed failures', async (context) => {
    const file = await chapter(context)
    const cases: readonly [Reply, string, number][] = [
      [{ status: 401, body: { error: { message: 'API key not found.', code: 'auth_failed' } } }, 'auth_failed', ZHUQUE_EXIT.credential],
      [{ status: 403, body: { error: { message: 'forbidden' } } }, 'auth_failed', ZHUQUE_EXIT.credential],
      [{ status: 429, body: { error: { message: 'slow down' } } }, 'rate_limited', ZHUQUE_EXIT.service],
      [{ status: 400, body: { error: { message: 'text must be a non-empty string' } } }, 'invalid_request', ZHUQUE_EXIT.input],
      [{ status: 502, body: {} }, 'service_error', ZHUQUE_EXIT.service],
      [{ throws: new Error('offline') }, 'network_error', ZHUQUE_EXIT.service],
      [{ raw: '<html>gateway</html>' }, 'invalid_response', ZHUQUE_EXIT.service],
      [{ body: [1, 2] }, 'invalid_response', ZHUQUE_EXIT.service],
      [{ body: { status: 'failed', msg: 'busy' } }, 'service_error', ZHUQUE_EXIT.service],
      [{ body: { ...success(), ratio_confidence: 'high' } }, 'invalid_response', ZHUQUE_EXIT.service],
      [{ body: { ...success(), segment_labels: null } }, 'invalid_response', ZHUQUE_EXIT.service],
    ]
    for (const [reply, code, exit] of cases) {
      const { report, exitCode } = await detectChapter({ file, env: { MAKERS_API_KEY: 'k' }, fetch: transport([reply]).fetch })
      expect([exitCode, report.ok, (report.error as { code: string }).code], code).toEqual([exit, false, code])
    }
    const { report } = await detectChapter({ file, env: { MAKERS_API_KEY: 'k' }, fetch: transport([cases[0]?.[0] ?? {}]).fetch })
    expect((report.error as { message: string }).message).toBe('HTTP 401: API key not found.')
  })

  it('refuses before any request without a key or with unusable input', async (context) => {
    const file = await chapter(context)
    const short = await chapter(context, '她推开木门。\n'.repeat(20))
    const cases: readonly [Partial<Parameters<typeof detectChapter>[0]>, string | undefined, string, number][] = [
      [{ file }, undefined, 'missing_credential', ZHUQUE_EXIT.credential],
      [{ file }, '   ', 'missing_credential', ZHUQUE_EXIT.credential],
      [{ file: short }, 'dummy', 'text_too_short', ZHUQUE_EXIT.input],
      [{ file, maxChars: 400 }, 'dummy', 'text_too_long', ZHUQUE_EXIT.input],
      [{ file: join(file, '..', 'missing.md') }, 'dummy', 'file_not_found', ZHUQUE_EXIT.input],
      [{ file, target: 0 }, 'dummy', 'invalid_arguments', ZHUQUE_EXIT.input],
      [{ file, target: 1.5 }, 'dummy', 'invalid_arguments', ZHUQUE_EXIT.input],
      [{ file, maxChars: 100 }, 'dummy', 'invalid_arguments', ZHUQUE_EXIT.input],
    ]
    for (const [options, key, code, exit] of cases) {
      const { fetch, requests } = transport([{}])
      const { report, exitCode } = await detectChapter({ file, ...options, env: key === undefined ? {} : { MAKERS_API_KEY: key }, fetch })
      expect([exitCode, (report.error as { code: string }).code], code).toEqual([exit, code])
      expect(requests).toEqual([])
    }
  })

  it('normalizes BOM and line endings before detection and counts like the web page', async (context) => {
    const file = await chapter(context, `﻿${CHAPTER.replaceAll('\n', '\r\n')}`)
    const { fetch, requests } = transport([{}])
    const { report } = await detectChapter({ file, env: { MAKERS_API_KEY: 'k' }, fetch })
    expect((requests[0]?.body as { text: string }).text).toBe(CHAPTER)
    expect((report.segments as { lines: [number, number] }[])[0]?.lines).toEqual([3, 3])
    expect(countedChars('hello world 你好，世界')).toBe(2 + 5)
    expect(countedChars('  第1章\n\n她笑了。 OK ')).toBe(3 + 4 + 1)
  })

  it('rotates a rejected key from the pool and stops on other failures', async (context) => {
    const file = await chapter(context)
    const rejected: Reply = { status: 401, body: { error: { message: 'API key not found.', code: 'auth_failed' } } }
    const rotated = transport([rejected, {}])
    const first = await detectChapter({ file, keyPool: readKeyPool(JSON.stringify(['dead-key', ' live-key ', 'live-key'])), fetch: rotated.fetch })
    expect(first.exitCode).toBe(ZHUQUE_EXIT.belowTarget)
    expect(first.report.key_attempts).toBe(2)
    expect(rotated.requests.map(request => request.key)).toEqual(['Bearer dead-key', 'Bearer live-key'])
    const exhausted = transport([{ status: 403, body: { error: { message: 'forbidden' } } }, { status: 403, body: { error: { message: 'forbidden' } } }])
    const all = await detectChapter({ file, keyPool: ['a', 'b'], fetch: exhausted.fetch })
    expect([all.exitCode, (all.report.error as { code: string }).code, all.report.key_attempts]).toEqual([ZHUQUE_EXIT.credential, 'auth_failed', 2])
    const limited = transport([{ status: 429, body: { error: { message: 'slow down' } } }])
    const quota = await detectChapter({ file, keyPool: ['a', 'b'], fetch: limited.fetch })
    expect([quota.exitCode, (quota.report.error as { code: string }).code, quota.report.key_attempts]).toEqual([ZHUQUE_EXIT.service, 'rate_limited', 1])
    expect(limited.requests).toHaveLength(1)
    expect(() => readKeyPool('not json')).toThrow('not JSON')
    expect(() => readKeyPool('{"key":"a"}')).toThrow('JSON array of strings')
    expect(() => readKeyPool(JSON.stringify(Array.from({ length: 17 }, (_, index) => `k${String(index)}`)))).toThrow('at most 16')
    const empty = await detectChapter({ file, keyPool: readKeyPool('["", "  "]'), env: { MAKERS_API_KEY: 'ignored' }, fetch: transport([{}]).fetch })
    expect((empty.report.error as { code: string }).code).toBe('missing_credential')
  })

  it('writes the report file and leaves the chapter untouched', async (context) => {
    const file = await chapter(context)
    const { report } = await detectChapter({ file, env: { MAKERS_API_KEY: 'k' }, fetch: transport([{}]).fetch })
    const { writeReport } = await import('../src/core/zhuque.ts')
    const out = join(file, '..', '.story-polish', '第1章', 'R0.json')
    writeReport(out, report)
    expect((JSON.parse(await readFile(out, 'utf8')) as { ai_percent: number }).ai_percent).toBe(73.69)
    expect(await readFile(file, 'utf8')).toBe(CHAPTER)
    await writeFile(join(file, '..', 'blocker'), '')
    let failure: unknown
    try { writeReport(join(file, '..', 'blocker', 'R0.json'), report) }
    catch (error) { failure = error }
    expect(failure).toMatchObject({ code: 'report_unwritable', exitCode: ZHUQUE_EXIT.input })
  })
})
