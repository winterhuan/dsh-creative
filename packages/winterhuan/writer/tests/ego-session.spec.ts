import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import {
  createSession,
  openRunStore,
  parseJSONResult,
  validateEnvelope,
  extractEnvelope,
  buildScript,
  buildEvaluateBody,
  localDateStamp,
  getArg,
  sleep,
  EgoTransportError,
  ENVELOPE_VERSION,
} from '../skills/browser-cdp/scripts/ego-session.cjs'

const fixtures = new URL('./fixtures/', import.meta.url)
const fakeBinary = fileURLToPath(new URL('fake-ego-browser.cjs', fixtures))
const programRunner = fileURLToPath(new URL('run-ego-program.mjs', fixtures))
const skillsRoot = fileURLToPath(new URL('../skills/', import.meta.url))

const tempDirs: string[] = []
const inheritedMode = process.env.WRITER_FAKE_EGO_MODE
const inheritedRecord = process.env.WRITER_FAKE_EGO_RECORD
afterEach(async () => {
  if (inheritedMode === undefined) delete process.env.WRITER_FAKE_EGO_MODE
  else process.env.WRITER_FAKE_EGO_MODE = inheritedMode
  if (inheritedRecord === undefined) delete process.env.WRITER_FAKE_EGO_RECORD
  else process.env.WRITER_FAKE_EGO_RECORD = inheritedRecord
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function tempDir(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `dsh-writer-ego-${name}-`))
  tempDirs.push(dir)
  return dir
}

function session(mode: string, record?: string, extra: Record<string, unknown> = {}) {
  if (mode) process.env.WRITER_FAKE_EGO_MODE = mode
  if (record) process.env.WRITER_FAKE_EGO_RECORD = record
  return createSession({ spaceName: 'writer test', binary: fakeBinary, runId: 'run-1', ...extra })
}

function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    return (err as EgoTransportError).code
  }
  throw new Error('expected the call to throw')
}

/** Run a generated program against a stub TaskSpace, collecting its envelope. */
async function runProgram(
  script: string,
  options: { page?: Record<string, unknown>; pages?: unknown[] } = {},
): Promise<{ envelope: any; lines: string[] }> {
  const lines: string[] = []
  const page = { label: 'p1', goto: async () => ({}), url: async () => 'https://example.test/', evaluate: async () => null, ...(options.page ?? {}) }
  const task = {
    spaceId: 7,
    pages: async () => options.pages ?? [page],
    newPage: async () => ({ ...page, label: 'p2' }),
    handOff: async () => {},
    finish: async () => ({ finished: true }),
  }
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<unknown>
  await new AsyncFunction('taskSpace', 'console', script)(
    async () => task,
    { log: (line: string) => lines.push(line) },
  )
  expect(lines).toHaveLength(1)
  return { envelope: JSON.parse(lines[0]), lines }
}

/**
 * Run a generated program in a child Node process, where dynamic import works
 * the same way it does inside the Ego runtime.
 */
async function runProgramInNode(
  script: string,
  input: { value?: unknown; pages?: 'default' | 'none' } = {},
): Promise<any> {
  const dir = await tempDir('program')
  const inputFile = join(dir, 'input.json')
  await writeFile(inputFile, JSON.stringify({ script, ...input }), 'utf8')
  const result = spawnSync(process.execPath, [programRunner, inputFile], { encoding: 'utf8', timeout: 30_000 })
  expect(result.stderr, result.stderr).toBe('')
  const parsed = JSON.parse(result.stdout)
  expect(parsed.error).toBeUndefined()
  expect(parsed.lines).toHaveLength(1)
  return JSON.parse(parsed.lines[0])
}

// ---------------------------------------------------------------------------
// Launcher contract
// ---------------------------------------------------------------------------

it('passes the nodejs subcommand, a unique space name, and the program on stdin', async () => {
  const record = join(await tempDir('argv'), 'record.json')
  const s = session('ok', record)
  expect(s.open('https://example.com/')).toEqual({ echoed: true })
  expect(s.spaceId).toBe(42)
  const rec = JSON.parse(await readFile(record, 'utf8'))
  expect(rec.argv).toEqual(['nodejs'])
  expect(rec.stdin).toMatch(/taskSpace\("writer test [^"]+"\)/)
  expect(rec.stdin).toContain('page.goto("https://example.com/")')
})

it('reads the envelope from stderr and keeps other lines as diagnostics', () => {
  expect(session('stderr-ok').evaluate('1')).toEqual({ echoed: true })
})

it('fails without an envelope and reports captured diagnostics', () => {
  const s = session('no-envelope')
  try {
    s.open('https://example.com/')
    expect.unreachable('should have thrown')
  } catch (err) {
    expect((err as EgoTransportError).code).toBe('NO_ENVELOPE')
    expect(String((err as Error).message)).toContain('some diagnostic')
  }
})

it('rejects duplicate envelopes for one invocation', () => {
  expect(codeOf(() => session('duplicate').open('https://example.com/'))).toBe('DUPLICATE')
})

it('surfaces browser-side errors with their safety flags', () => {
  const s = session('browser-error')
  try {
    s.open('https://example.com/')
    expect.unreachable('should have thrown')
  } catch (err) {
    const transportError = err as EgoTransportError
    expect(transportError.code).toBe('SafetyTimeout')
    expect(transportError.details).toMatchObject({ executionStopped: false, mayHaveLateEffects: true })
  }
})

it('fails when the launcher crashes without output', () => {
  expect(codeOf(() => session('crash').open('https://example.com/'))).toBe('NO_ENVELOPE')
})

// ---------------------------------------------------------------------------
// Envelope validation
// ---------------------------------------------------------------------------

it.each([
  ['bad-version', 'INCOMPATIBLE_ENVELOPE'],
  ['wrong-op', 'MISMATCHED_ENVELOPE'],
  ['wrong-run', 'MISMATCHED_ENVELOPE'],
  ['unknown-outcome', 'INVALID_ENVELOPE'],
])('rejects a %s envelope instead of returning its data', (mode, code) => {
  expect(codeOf(() => session(mode).open('https://example.com/'))).toBe(code)
})

it('discards a success envelope that arrived with a non-zero exit', () => {
  expect(codeOf(() => session('nonzero-ok').open('https://example.com/'))).toBe('NONZERO_EXIT')
})

it('validates version, identity, outcome, and space id', () => {
  const base = { v: ENVELOPE_VERSION, opId: 'op', runId: 'run', spaceId: 1, outcome: 'ok' }
  expect(() => validateEnvelope(base, { opId: 'op', runId: 'run' })).not.toThrow()
  expect(() => validateEnvelope({ ...base, v: 2 }, { opId: 'op', runId: 'run' })).toThrow(/version/)
  expect(() => validateEnvelope({ ...base, opId: 'other' }, { opId: 'op', runId: 'run' })).toThrow(/opId/)
  expect(() => validateEnvelope({ ...base, outcome: 'maybe' }, { opId: 'op', runId: 'run' })).toThrow(/outcome/)
  expect(() => validateEnvelope({ ...base, spaceId: 'x' }, { opId: 'op', runId: 'run' })).toThrow(/spaceId/)
})

// ---------------------------------------------------------------------------
// Large results
// ---------------------------------------------------------------------------

it('defaults the result directory to a writable run-scoped path', () => {
  const s = createSession({ spaceName: 'x', runId: 'run-2', binary: fakeBinary })
  expect(s.resultDir).toContain('writer-ego')
  expect(s.resultDir).toContain('run-2')
})

it('spills a result larger than the byte cap and reads it back', async () => {
  const dir = await tempDir('spill')
  const s = session('ok', undefined, { resultDir: dir })
  const script = buildScript({
    spaceRef: 'space',
    body: buildEvaluateBody('"中文"', join(dir, 'result.json'), 4),
    marker: 'm',
    opId: 'o',
    runId: 'run-1',
    resultFile: join(dir, 'result.json'),
    maxInlineBytes: 4,
  })
  const envelope = await runProgramInNode(script, { value: '中文' })
  expect(envelope.outcome, JSON.stringify(envelope.error)).toBe('ok')
  expect(envelope.dataFile).toBe(join(dir, 'result.json'))
  expect(await readFile(envelope.dataFile, 'utf8')).toBe('"中文"')
  expect(s._readResultFile(envelope.dataFile)).toBe('中文')
  expect(existsSync(envelope.dataFile)).toBe(false)
})

it('keeps a multi-byte result inline when it fits the byte cap', async () => {
  const dir = await tempDir('inline')
  const script = buildScript({
    spaceRef: 'space',
    body: buildEvaluateBody('"中文"', join(dir, 'result.json'), 8),
    marker: 'm',
    opId: 'o',
    runId: 'run-1',
    resultFile: join(dir, 'result.json'),
    maxInlineBytes: 8,
  })
  const envelope = await runProgramInNode(script, { value: '中文' })
  expect(envelope.data).toBe('中文')
  expect(existsSync(join(dir, 'result.json'))).toBe(false)
})

it('rejects a result file outside the session directory, oversized, or malformed', async () => {
  const dir = await tempDir('resultfile')
  const s = session('ok', undefined, { resultDir: dir })
  expect(codeOf(() => s._readResultFile('/etc/hosts'))).toBe('RESULT_FILE')

  s.maxFileBytes = 16
  const big = join(dir, 'big.json')
  await writeFile(big, JSON.stringify({ pad: 'x'.repeat(64) }), 'utf8')
  expect(codeOf(() => s._readResultFile(big))).toBe('OVERSIZE')

  const bad = join(dir, 'bad.json')
  await writeFile(bad, '{not json', 'utf8')
  expect(codeOf(() => s._readResultFile(bad))).toBe('RESULT_FILE')
  expect(codeOf(() => s._readResultFile(join(dir, 'missing.json')))).toBe('RESULT_FILE')
})

// ---------------------------------------------------------------------------
// Safe teardown
// ---------------------------------------------------------------------------

it('finishes a clean run', () => {
  const s = session('ok')
  s.open('https://example.com/')
  expect(s.end()).toEqual({ finished: true, retained: false, reason: 'finished' })
  expect(s.end()).toEqual({ finished: true, retained: false, reason: 'finished' })
})

it('retains the Space after a handoff and never finishes it', () => {
  const s = session('ok')
  s.open('https://example.com/')
  s.handOff = () => ({ spaceId: 42 })
  s.handedOff = true
  expect(s.end()).toMatchObject({ finished: false, retained: true, reason: 'handed-off' })
})

it('retains the Space when an invocation left the browser state unknown', () => {
  const s = session('no-envelope')
  expect(codeOf(() => s.open('https://example.com/'))).toBe('NO_ENVELOPE')
  expect(s.end()).toMatchObject({ finished: false, retained: true, reason: 'uncertain' })
})

it('does not try to finish a Space that was never attached', () => {
  const s = createSession({ spaceName: 'x', binary: join(tmpdir(), 'missing-ego-binary'), runId: 'run-3' })
  expect(codeOf(() => s.open('https://example.com/'))).toBe('SPAWN')
  expect(s.end()).toMatchObject({ finished: false, retained: false, reason: 'never-attached' })
})

it('marks a run uncertain when finishing fails', () => {
  const s = session('ok')
  s.open('https://example.com/')
  s.finish = () => {
    throw new Error('finish failed')
  }
  expect(s.end()).toMatchObject({ finished: false, retained: true, reason: 'finish-failed' })
})

it('blocks new browser commands after an unknown outcome until explicit reconciliation', async () => {
  const record = join(await tempDir('blocked'), 'record.json')
  const s = session('no-envelope', record)
  expect(codeOf(() => s.open('https://example.com/'))).toBe('NO_ENVELOPE')
  const initial = await readFile(record, 'utf8')
  expect(codeOf(() => s.open('https://example.org/'))).toBe('OUTCOME_UNKNOWN')
  expect(codeOf(() => s.evaluate('1'))).toBe('OUTCOME_UNKNOWN')
  expect(codeOf(() => s.takeOver())).toBe('NO_SPACE_ID')
  expect(await readFile(record, 'utf8')).toBe(initial)
  expect(codeOf(() => s.recover({ executionStopped: false, pageResponsive: true }))).toBe('RECOVERY_REQUIRED')
  s.recover({ executionStopped: true, pageResponsive: true })
  process.env.WRITER_FAKE_EGO_MODE = 'ok'
  expect(s.open('https://example.org/')).toEqual({ echoed: true })
})

it('blocks commands and finish after handoff, but permits an explicit takeover', () => {
  const s = session('ok')
  s.open('https://example.com/')
  s.handOff()
  expect(codeOf(() => s.open('https://example.org/'))).toBe('HANDED_OFF')
  expect(codeOf(() => s.finish())).toBe('HANDED_OFF')
  s.takeOver()
  expect(s.handedOff).toBe(false)
  expect(s.open('https://example.org/')).toEqual({ echoed: true })
})

// ---------------------------------------------------------------------------
// Generated program
// ---------------------------------------------------------------------------

it('reuses the first managed page and falls back to a new one', async () => {
  const script = buildScript({
    spaceRef: 'space',
    body: 'await __ok({ ok: true });',
    marker: 'm',
    opId: 'o',
    runId: 'r',
    resultFile: '/tmp/unused.json',
    maxInlineBytes: 1024,
  })
  const reused = await runProgram(script)
  expect(reused.envelope.page).toBe('p1')

  const fresh = await runProgram(script, { pages: [] })
  expect(fresh.envelope.page).toBe('p2')
})

it('reports safety-stop flags from the generated program', async () => {
  const script = buildScript({
    spaceRef: 'space',
    body: 'throw Object.assign(new Error("stopped"), { executionStopped: true, pageResponsive: false, mayHaveLateEffects: true });',
    marker: 'm',
    opId: 'o',
    runId: 'r',
    resultFile: '/tmp/unused.json',
    maxInlineBytes: 1024,
  })
  const { envelope } = await runProgram(script)
  expect(envelope.outcome).toBe('error')
  expect(envelope.error).toMatchObject({
    message: 'stopped',
    executionStopped: true,
    pageResponsive: false,
    mayHaveLateEffects: true,
  })
})

// ---------------------------------------------------------------------------
// Run checkpoints
// ---------------------------------------------------------------------------

it('commits, reads, and lists batches atomically', async () => {
  const root = await tempDir('run')
  const run = openRunStore({ root, params: { type: 'x' }, parserRevision: '1' })
  expect(run.has('page-1')).toBe(false)
  run.commit('page-1', { rows: [1, 2] })
  expect(run.has('page-1')).toBe(true)
  expect(run.get('page-1')).toEqual({ rows: [1, 2] })
  expect(run.keys()).toEqual(['page-1'])
  expect(await readdir(join(run.dir, 'batches'))).toEqual(['page-1.json'])
})

it('resumes a run only with matching parameters and parser revision', async () => {
  const root = await tempDir('resume')
  const first = openRunStore({ root, params: { channel: 'male', pages: 3 }, parserRevision: '1' })
  first.commit('page-1', { rows: [] })

  const resumed = openRunStore({ root, resume: first.runId, params: { pages: 3, channel: 'male' }, parserRevision: '1' })
  expect(resumed.get('page-1')).toEqual({ rows: [] })

  expect(() => openRunStore({ root, resume: first.runId, params: { channel: 'female' }, parserRevision: '1' })).toThrow(
    /different parameters/,
  )
  expect(() => openRunStore({ root, resume: first.runId, params: { channel: 'male', pages: 3 }, parserRevision: '2' })).toThrow(
    /parser revision/,
  )
  expect(() => openRunStore({ root, resume: 'nope', params: {}, parserRevision: '1' })).toThrow(/no checkpoint/)
})

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

it('extracts only the matching marker', () => {
  const stdout = ['{"noise":1}', '{"marker":"m1","outcome":"ok","data":5}', 'plain'].join('\n')
  expect(extractEnvelope(stdout, '', 'm1')).toMatchObject({ outcome: 'ok', data: 5 })
  expect(extractEnvelope(stdout, '', 'other')).toBeNull()
})

it('parses JSON results, tolerating double encoding', () => {
  expect(parseJSONResult('{"a":1}')).toEqual({ a: 1 })
  expect(parseJSONResult('"{\\"a\\":1}"')).toEqual({ a: 1 })
  expect(parseJSONResult({ a: 1 })).toEqual({ a: 1 })
  expect(codeOf(() => parseJSONResult(''))).toBe('EMPTY')
  expect(codeOf(() => parseJSONResult('not json'))).toBe('INVALID_JSON')
})

it('formats local dates and parses both argument forms', () => {
  expect(localDateStamp(new Date(2026, 10, 6))).toBe('20261106')
  expect(localDateStamp()).toMatch(/^\d{8}$/)
  expect(getArg(['--port', '9333'], '--port')).toBe('9333')
  expect(getArg(['--port=9333'], '--port')).toBe('9333')
  expect(getArg(['--other'], '--port')).toBeNull()
})

it('sleeps without a system sleep command', () => {
  const started = Date.now()
  sleep(20)
  expect(Date.now() - started).toBeGreaterThanOrEqual(15)
})

// ---------------------------------------------------------------------------
// Shipped entry points
// ---------------------------------------------------------------------------

it('runs a collector from the packaged skill directory under an ESM package', () => {
  const scraper = join(skillsRoot, 'story-long-scan/scripts/qidian-rank-scraper.js')
  const result = spawnSync(process.execPath, [scraper, '--type', 'nope'], { encoding: 'utf8', timeout: 30_000 })
  // Loading the module must reach argument validation; an ESM/CJS mismatch
  // would fail earlier with "require is not defined".
  expect(result.stderr).toContain('未知 --type')
  expect(result.stderr).not.toContain('require is not defined')
  expect(result.status).toBe(1)
})

it('keeps researcher templates and the generated Antigravity agent free of the old backend', async () => {
  const templatesDir = join(skillsRoot, 'story-setup/references/templates/agents')
  const dest = await tempDir('agents')
  const generated = spawnSync(
    process.execPath,
    [join(skillsRoot, 'story-setup/scripts/generate-antigravity-agents.mjs'), '--source', templatesDir, '--dest', dest],
    { encoding: 'utf8', timeout: 30_000 },
  )
  expect(generated.status, generated.stderr).toBe(0)

  const agent = await readFile(join(dest, 'story-researcher', 'agent.md'), 'utf8')
  for (const banned of ['webReader', 'websearch', 'agent-browser', 'cdp_port', 'CDP']) {
    expect(agent.toLowerCase()).not.toContain(banned.toLowerCase())
  }
  expect(agent).toContain('task.finish(')
  expect(agent).toContain('browser_unavailable')

  const variants = [
    join(skillsRoot, 'story-setup/references/templates/agents/story-researcher.md'),
    join(skillsRoot, 'story-setup/references/codex/agents/story-researcher.toml'),
    join(skillsRoot, 'story-setup/references/opencode/agents/story-researcher.md'),
    join(skillsRoot, 'story-setup/references/zcode/agents/story-researcher.md'),
  ]
  for (const file of variants) {
    const text = await readFile(file, 'utf8')
    for (const banned of ['webReader', 'agent-browser', 'cdp_port', 'CDP']) {
      expect(text.toLowerCase(), `${file} contains ${banned}`).not.toContain(banned.toLowerCase())
    }
    expect(text).toContain('task.finish(')
  }
})

it('creates the agents output directory only through the generator', async () => {
  // Negative control for the generator: a missing source directory must fail
  // loudly instead of publishing an empty agent set.
  const dest = join(await tempDir('agents-empty'), 'out')
  await mkdir(dest, { recursive: true })
  const result = spawnSync(
    process.execPath,
    [
      join(skillsRoot, 'story-setup/scripts/generate-antigravity-agents.mjs'),
      '--source',
      join(skillsRoot, 'story-setup/references/templates/missing'),
      '--dest',
      dest,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  )
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('source directory missing')
})
