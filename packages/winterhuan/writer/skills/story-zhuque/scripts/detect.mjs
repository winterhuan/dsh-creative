#!/usr/bin/env node
/**
 * One-chapter Zhuque text check. The key is read from the environment only.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const ENDPOINT = 'https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify'
const SCHEMA = 'story-zhuque-detect/v1'
const MIN_CHARS = 350
const DEFAULT_MAX_CHARS = 20_000
const DEFAULT_TARGET = 0.5
const EXIT = { pass: 0, belowTarget: 1, input: 2, credential: 3, service: 4 }

/**
 * @param {string} code
 * @param {string} message
 * @param {number} exitCode
 * @param {string} file
 */
function fail(code, message, exitCode, file) {
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ok: false, file, error: { code, message } }, null, 2)}\n`)
  process.exit(exitCode)
}

function readArgs(argv) {
  /** @type {{ file: string, out: string, target: number, maxChars: number, help: boolean }} */
  const out = { file: '', out: '', target: DEFAULT_TARGET, maxChars: DEFAULT_MAX_CHARS, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    const value = argv[i + 1]
    if (key === '--file' && value) { out.file = value; i += 1 }
    else if (key === '--out' && value) { out.out = value; i += 1 }
    else if (key === '--target' && value) { out.target = Number(value); i += 1 }
    else if (key === '--max-chars' && value) { out.maxChars = Number(value); i += 1 }
    else if (key === '--help') out.help = true
  }
  return out
}

/** @param {string} text */
function countedChars(text) {
  let count = 0
  for (const token of text.split(/\s+/u)) {
    if (token === '') continue
    count += /^[A-Za-z]+$/u.test(token) ? 1 : Array.from(token).length
  }
  return count
}

/** @param {number} ratio */
function verdictOf(ratio) {
  const percent = Math.round(ratio * 10_000) / 100
  if (percent >= 100) return ['red', '未发现明显的人工创作特征']
  if (percent >= 50) return ['yellow', '人工创作特征较弱']
  return ['green', '人工创作特征显著']
}

const options = readArgs(process.argv.slice(2))
if (options.help || options.file === '') {
  fail('invalid_arguments', 'usage: node scripts/detect.mjs --file <chapter.md> [--out report.json] [--target 0.5] [--max-chars 20000]', EXIT.input, options.file)
}
if (!(options.target > 0 && options.target <= 1) || !Number.isFinite(options.maxChars) || options.maxChars < MIN_CHARS) {
  fail('invalid_arguments', '--target must be in (0, 1] and --max-chars must be at least 350', EXIT.input, options.file)
}

let text
try {
  text = readFileSync(options.file, 'utf8')
} catch (error) {
  fail('file_unreadable', error instanceof Error ? error.message : String(error), EXIT.input, options.file)
}

const envName = process.env.WRITER_ZHUQUE_KEY_ENV?.trim() || 'MAKERS_API_KEY'
const key = process.env[envName]?.trim() ?? ''
const count = countedChars(text)
const length = Array.from(text).length
if (key === '') fail('missing_credential', `${envName} is not configured`, EXIT.credential, options.file)
if (count < MIN_CHARS) fail('text_too_short', `${String(count)} characters; Zhuque needs at least ${String(MIN_CHARS)}`, EXIT.input, options.file)
if (length > options.maxChars) fail('text_too_long', `${String(length)} characters exceeds --max-chars ${String(options.maxChars)}`, EXIT.input, options.file)

const response = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ text, is_merge: false }),
  signal: AbortSignal.timeout(60_000),
})
const raw = await response.text()
if (!response.ok) {
  const code = response.status === 401 || response.status === 403 ? 'auth_failed' : response.status === 429 ? 'rate_limited' : 'service_error'
  fail(code, `HTTP ${String(response.status)}`, code === 'auth_failed' ? EXIT.credential : EXIT.service, options.file)
}
let data
try {
  data = JSON.parse(raw)
} catch {
  fail('invalid_response', 'Zhuque returned a non-JSON response', EXIT.service, options.file)
}
const ratio = Number(data.ratio_confidence)
if (!Number.isFinite(ratio)) fail('invalid_response', 'Zhuque response is missing ratio_confidence', EXIT.service, options.file)
const [verdict, verdictText] = verdictOf(ratio)
const report = {
  schema: SCHEMA,
  ok: true,
  file: options.file,
  chars: length,
  counted_chars: count,
  request_id: response.headers.get('x-makers-models-id'),
  ai_ratio: ratio,
  ai_percent: Math.round(ratio * 10_000) / 100,
  verdict,
  verdict_text: verdictText,
  target: options.target,
  pass: ratio < options.target,
  labels_ratio: data.labels_ratio ?? null,
  segments: data.segment_labels ?? [],
}
const body = `${JSON.stringify(report, null, 2)}\n`
if (options.out !== '') {
  mkdirSync(dirname(options.out), { recursive: true })
  writeFileSync(options.out, body)
}
process.stdout.write(body)
process.exit(report.pass ? EXIT.pass : EXIT.belowTarget)
