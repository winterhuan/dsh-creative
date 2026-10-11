/**
 * Check one chapter file with the Tencent Zhuque AIGC text detector.
 *
 * Port of `tests/reference/zhuque_detect.py`. The whole file is sent to Zhuque through
 * Tencent Cloud EdgeOne Makers; every returned segment is mapped back to file
 * lines, and the verdict is computed the way the Zhuque web page computes it.
 * The chapter file is never modified. Keys come from `MAKERS_API_KEY` or from
 * a JSON pool: keys are tried in order and an authentication rejection
 * advances to the next one. Offsets follow the Python reference and count
 * code points, not UTF-16 units.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Schema of detection reports and errors. */
export const ZHUQUE_SCHEMA = 'story-zhuque-detect/v1'
/** The EdgeOne Makers classify endpoint. */
export const ZHUQUE_ENDPOINT = 'https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify'
/** Environment name the single-key path reads. */
export const KEY_ENV = 'MAKERS_API_KEY'
const TIMEOUT_MS = 60_000
// The web page refuses texts under 350 characters; keep the same floor so both channels judge comparable input.
const MIN_CHARS = 350
/** Default refusal threshold; one call is billed per character. */
export const DEFAULT_MAX_CHARS = 20_000
/** Default AI-ratio threshold, the web page's green verdict. */
export const DEFAULT_TARGET = 0.5
// Every rejected key costs one round trip; a longer pool is a configuration error, not rotation.
const MAX_KEY_ATTEMPTS = 16

const LABELS: Readonly<Record<string, string>> = { 0: 'human', 1: 'ai', 2: 'suspected' }
const VERDICT_TEXT: Readonly<Record<string, string>> = { green: '人工创作特征显著', yellow: '人工创作特征较弱', red: '未发现明显的人工创作特征' }

/** Exit codes: pass, below target, input, credential, service. */
export const ZHUQUE_EXIT = { pass: 0, belowTarget: 1, input: 2, credential: 3, service: 4 } as const

// Python `str.split()` whitespace: ASCII separators, the C1 NEL and the Unicode space separators.
const PYTHON_WHITESPACE = /[\t\n\v\f\r \x1c-\x1f\x85\xa0  - \u2028\u2029  　]+/gu
const PYTHON_SPACE_EDGE = /^[\t\n\v\f\r \x1c-\x1f\x85\xa0  - \u2028\u2029  　]+|[\t\n\v\f\r \x1c-\x1f\x85\xa0  - \u2028\u2029  　]+$/gu

/** A failure reported as a structured error instead of a stack trace. */
export class DetectError extends Error {
  constructor(readonly code: string, message: string, readonly exitCode: number) {
    super(message)
    this.name = 'DetectError'
  }
}

/** The minimal response surface the detector uses, so tests can supply a fake. */
export type ZhuqueFetch = (url: string, init: { readonly method: 'POST'; readonly headers: Readonly<Record<string, string>>; readonly body: string; readonly signal: AbortSignal }) => Promise<{
  readonly ok: boolean
  readonly status: number
  readonly headers: { get(name: string): string | null }
  text(): Promise<string>
}>

/** Options of {@link detectChapter}. */
export interface DetectOptions {
  readonly file: string
  readonly target?: number
  readonly maxChars?: number
  /** Candidate keys in rotation order; `undefined` reads `MAKERS_API_KEY` from `env`. */
  readonly keyPool?: readonly string[]
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly fetch?: ZhuqueFetch
}

/**
 * Count characters the way the Zhuque web page does: whitespace separates
 * tokens; a token of ASCII letters counts as one word, any other token counts one per character.
 * @param text - the chapter text.
 * @returns the counted characters.
 */
export function countedChars(text: string): number {
  let count = 0
  for (const token of text.split(PYTHON_WHITESPACE)) {
    if (token === '') continue
    count += /^[A-Za-z]+$/.test(token) ? 1 : Array.from(token).length
  }
  return count
}

function roundHalfEven(value: number): number {
  const floor = Math.floor(value)
  const fraction = value - floor
  if (fraction < 0.5) return floor
  if (fraction > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

/**
 * The AI percentage the web page displays.
 * @param ratio - the AI ratio.
 * @returns the percentage with two decimals.
 */
export function aiPercent(ratio: number): number {
  return roundHalfEven(ratio * 10_000) / 100
}

function verdictOf(ratio: number): string {
  const percent = aiPercent(ratio)
  if (percent >= 100) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

function readChapter(path: string): string {
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') throw new DetectError('file_not_found', `${path}: file not found`, ZHUQUE_EXIT.input)
    throw new DetectError('file_unreadable', `${path}: ${error instanceof Error ? error.message : String(error)}`, ZHUQUE_EXIT.input)
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    throw new DetectError('file_unreadable', `${path}: ${error instanceof Error ? error.message : String(error)}`, ZHUQUE_EXIT.input)
  }
  if (text.startsWith('﻿')) text = text.slice(1)
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

/**
 * Parse a JSON key pool into distinct, non-empty keys in order.
 * @param source - the JSON text, normally read from stdin.
 * @returns the keys.
 * @throws DetectError for malformed input or more than sixteen keys.
 */
export function readKeyPool(source: string): string[] {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch (error) {
    throw new DetectError('invalid_arguments', `credential pool on stdin is not JSON: ${error instanceof Error ? error.message : String(error)}`, ZHUQUE_EXIT.input)
  }
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw new DetectError('invalid_arguments', 'credential pool on stdin must be a JSON array of strings', ZHUQUE_EXIT.input)
  const keys = [...new Set((value as string[]).map(item => item.trim()).filter(item => item !== ''))]
  if (keys.length > MAX_KEY_ATTEMPTS) throw new DetectError('invalid_arguments', `credential pool holds ${String(keys.length)} keys; at most ${String(MAX_KEY_ATTEMPTS)} are tried`, ZHUQUE_EXIT.input)
  return keys
}

function pyStrip(text: string): string {
  return text.replace(PYTHON_SPACE_EDGE, '')
}

function excerpt(segment: string): string {
  const flat = Array.from(segment.split(PYTHON_WHITESPACE).filter(part => part !== '').join(' '))
  if (flat.length <= 40) return flat.join('')
  return `${flat.slice(0, 24).join('')}……${flat.slice(-12).join('')}`
}

function lineOf(chars: readonly string[], offset: number): number {
  let count = 0
  for (let index = 0; index < offset && index < chars.length; index += 1) if (chars[index] === '\n') count += 1
  return count + 1
}

function locate(text: string, chars: readonly string[], segment: Readonly<Record<string, unknown>>): [number, number] | null {
  const body = segment.text
  const position = segment.position
  if (Array.isArray(position) && position.length === 2 && position.every(value => typeof value === 'number' && Number.isInteger(value))) {
    const [start, length] = position as [number, number]
    if (start >= 0 && length > 0 && start + length <= chars.length) {
      if (typeof body !== 'string' || chars.slice(start, start + length).join('') === body) return [start, length]
    }
  }
  if (typeof body === 'string' && body !== '') {
    const at = text.indexOf(body)
    if (at >= 0) return [Array.from(text.slice(0, at)).length, Array.from(body).length]
  }
  return null
}

function segmentView(text: string, chars: readonly string[], segment: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const rawLabel = segment.label
  const label = typeof rawLabel === 'number' && Number.isInteger(rawLabel) ? (LABELS[String(rawLabel)] ?? 'unknown') : 'unknown'
  const conf = segment.conf
  const view: Record<string, unknown> = { order: segment.order ?? null, label, conf: typeof conf === 'number' ? conf : null }
  const found = locate(text, chars, segment)
  if (found === null) {
    const body = segment.text
    return { ...view, start: null, length: null, lines: null, excerpt: typeof body === 'string' ? excerpt(body) : '' }
  }
  const [start, length] = found
  const chunk = chars.slice(start, start + length).join('')
  // A segment that ends on blank lines still belongs to the paragraph before them.
  const stripped = pyStrip(chunk)
  const last = stripped !== '' ? start + Array.from(chunk.replace(/[\t\n\v\f\r \x1c-\x1f\x85\xa0  - \u2028\u2029  　]+$/u, '')).length - 1 : start
  const leading = Array.from(chunk).length - Array.from(chunk.replace(/^[\t\n\v\f\r \x1c-\x1f\x85\xa0  - \u2028\u2029  　]+/u, '')).length
  return { ...view, start, length, lines: [lineOf(chars, start + leading), lineOf(chars, last)], excerpt: excerpt(chunk) }
}

function number(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new DetectError('invalid_response', `Zhuque response field ${field} is not a number`, ZHUQUE_EXIT.service)
  return value
}

function pythonRepr(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return String(value)
}

async function classify(text: string, key: string, fetchImpl: ZhuqueFetch): Promise<{ readonly data: Readonly<Record<string, unknown>>; readonly requestId: string | null }> {
  const body = JSON.stringify({ text, is_merge: false })
  let response: Awaited<ReturnType<ZhuqueFetch>>
  try {
    response = await fetchImpl(ZHUQUE_ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    throw new DetectError('network_error', `unable to reach Zhuque: ${error instanceof Error ? error.message : String(error)}`, ZHUQUE_EXIT.service)
  }
  const raw = await response.text()
  if (!response.ok) throw httpError(response.status, raw)
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new DetectError('invalid_response', 'Zhuque returned a non-JSON response', ZHUQUE_EXIT.service)
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new DetectError('invalid_response', 'Zhuque returned a non-object response', ZHUQUE_EXIT.service)
  const record = data as Readonly<Record<string, unknown>>
  if (record.status !== 'success') {
    const message = typeof record.msg === 'string' && record.msg !== '' ? record.msg : `status ${pythonRepr(record.status)}`
    throw new DetectError('service_error', `Zhuque did not succeed: ${message}`, ZHUQUE_EXIT.service)
  }
  return { data: record, requestId: response.headers.get('X-Makers-Models-Id') }
}

function httpError(status: number, raw: string): DetectError {
  let message = `HTTP ${String(status)}`
  try {
    const payload: unknown = JSON.parse(raw)
    const detail = typeof payload === 'object' && payload !== null ? (payload as Readonly<Record<string, unknown>>).error : undefined
    if (typeof detail === 'object' && detail !== null && typeof (detail as Readonly<Record<string, unknown>>).message === 'string') {
      message = `HTTP ${String(status)}: ${String((detail as Readonly<Record<string, unknown>>).message)}`
    }
  } catch {
    // A non-JSON error body keeps the bare status message.
  }
  if (status === 401 || status === 403) return new DetectError('auth_failed', message, ZHUQUE_EXIT.credential)
  if (status === 429) return new DetectError('rate_limited', message, ZHUQUE_EXIT.service)
  if (status === 400) return new DetectError('invalid_request', message, ZHUQUE_EXIT.input)
  return new DetectError('service_error', message, ZHUQUE_EXIT.service)
}

function buildReport(file: string, text: string, target: number, data: Readonly<Record<string, unknown>>, requestId: string | null): Record<string, unknown> {
  const ratio = number(data.ratio_confidence, 'ratio_confidence')
  const labels = data.labels_ratio
  const segments = data.segment_labels
  if (typeof labels !== 'object' || labels === null || Array.isArray(labels) || !Array.isArray(segments)
    || !segments.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    throw new DetectError('invalid_response', 'Zhuque response is missing labels_ratio or segment_labels', ZHUQUE_EXIT.service)
  }
  const verdict = verdictOf(ratio)
  const usage = typeof data.usage === 'object' && data.usage !== null ? data.usage as Readonly<Record<string, unknown>> : {}
  const billed = typeof data.makers_models_usage === 'object' && data.makers_models_usage !== null ? data.makers_models_usage as Readonly<Record<string, unknown>> : {}
  const softmax = data.softmax_confidence
  const chars = Array.from(text)
  const labelRecord = labels as Readonly<Record<string, unknown>>
  return {
    schema: ZHUQUE_SCHEMA,
    ok: true,
    file,
    chars: chars.length,
    counted_chars: countedChars(text),
    request_id: requestId,
    ai_ratio: ratio,
    ai_percent: aiPercent(ratio),
    verdict,
    verdict_text: VERDICT_TEXT[verdict] ?? '',
    target,
    pass: ratio < target,
    labels_ratio: Object.fromEntries(Object.entries(LABELS).map(([code, name]) => [name, Object.hasOwn(labelRecord, code) ? labelRecord[code] : 0])),
    softmax_confidence: typeof softmax === 'number' ? softmax : null,
    segments: (segments as readonly Readonly<Record<string, unknown>>[]).map(segment => segmentView(text, chars, segment)),
    usage: { model_tokens: usage.total_tokens ?? null, billed_tokens: billed.total_tokens ?? null },
  }
}

/**
 * Write a report JSON file.
 * @param path - the destination.
 * @param report - the report.
 * @throws DetectError when the path cannot be written.
 */
export function writeReport(path: string, report: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  } catch (error) {
    throw new DetectError('report_unwritable', `${path}: ${error instanceof Error ? error.message : String(error)}`, ZHUQUE_EXIT.input)
  }
}

/** The report or structured error of one detection, with its exit code. */
export interface DetectOutcome {
  readonly report: Record<string, unknown>
  readonly exitCode: number
}

/**
 * Detect one chapter, trying pooled keys in order.
 * @param options - file, thresholds, key source and transport.
 * @returns the report (or error document) and the process exit code.
 */
export async function detectChapter(options: DetectOptions): Promise<DetectOutcome> {
  const target = options.target ?? DEFAULT_TARGET
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS
  const file = options.file
  let attempts = 0
  try {
    if (!(target > 0 && target <= 1)) throw new DetectError('invalid_arguments', '--target must be greater than 0 and at most 1', ZHUQUE_EXIT.input)
    if (maxChars < MIN_CHARS) throw new DetectError('invalid_arguments', `--max-chars must be at least ${String(MIN_CHARS)}`, ZHUQUE_EXIT.input)
    const text = readChapter(file)
    const count = countedChars(text)
    if (count < MIN_CHARS) throw new DetectError('text_too_short', `${String(count)} characters; Zhuque needs at least ${String(MIN_CHARS)}`, ZHUQUE_EXIT.input)
    const length = Array.from(text).length
    if (length > maxChars) throw new DetectError('text_too_long', `${String(length)} characters exceeds --max-chars ${String(maxChars)}; check one chapter per call`, ZHUQUE_EXIT.input)
    const keys = (options.keyPool ?? [(options.env ?? process.env)[KEY_ENV]?.trim() ?? '']).filter(key => key !== '')
    if (keys.length === 0) throw new DetectError('missing_credential', `${KEY_ENV} is not configured; run through story_zhuque`, ZHUQUE_EXIT.credential)
    const fetchImpl = options.fetch ?? (fetch as unknown as ZhuqueFetch)
    let classified: Awaited<ReturnType<typeof classify>> | undefined
    for (const key of keys) {
      attempts += 1
      try {
        classified = await classify(text, key, fetchImpl)
        break
      } catch (error) {
        // Only a rejected key advances the pool; quota, network and input failures end detection.
        if (!(error instanceof DetectError) || error.code !== 'auth_failed' || attempts === keys.length) throw error
      }
    }
    if (classified === undefined) throw new DetectError('missing_credential', `${KEY_ENV} is not configured; run through story_zhuque`, ZHUQUE_EXIT.credential)
    const report = buildReport(file, text, target, classified.data, classified.requestId)
    report.key_attempts = attempts
    return { report, exitCode: report.pass === true ? ZHUQUE_EXIT.pass : ZHUQUE_EXIT.belowTarget }
  } catch (error) {
    if (!(error instanceof DetectError)) throw error
    return { report: { schema: ZHUQUE_SCHEMA, ok: false, file, key_attempts: attempts, error: { code: error.code, message: error.message } }, exitCode: error.exitCode }
  }
}
