import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { extractChapterRules } from '../src/core/rules.ts'
import { RULE_AUDIT_SCHEMA, RULE_AUDIT_VERIFY_SCHEMA, ruleAuditRelativePath, verifyRuleAudit } from '../src/core/rule-audit.ts'
import { TRACKING_SCHEMA_VERSION } from '../src/core/tracking/schema.ts'

const entry = resolve(import.meta.dirname, '../src/cli.ts')
const loader = import.meta.resolve('tsx')
const fixtures = resolve(import.meta.dirname, 'fixtures')

async function workspace(context: TestContext): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-story-audit-'))
  context.onTestFinished(() => rm(path, { recursive: true, force: true }))
  return path
}

async function call(context: TestContext, cwd: string, args: string[]) {
  const child = execa(process.execPath, ['--import', loader, entry, ...args, '--json'], {
    cwd, reject: false, cancelSignal: context.signal,
  })
  context.onTestFinished(async () => { child.kill('SIGTERM'); await child })
  const result = await child
  let value: Record<string, unknown> = {}
  try { value = JSON.parse(result.stdout) as Record<string, unknown> } catch { value = { raw: result.stdout } }
  return { ...result, value }
}

function scope(root: string, book: string): string[] {
  return ['--workspace', root, '--book', book]
}

const outline = '禁令：不提前说出库门密码\n'
const body = '库门还关着，钥匙在管事手里。\n账册仍在架上。\n'
const sources = { rule_sources: [{ file: '大纲/细纲_第{chapter}章.md', heading: '禁令', prefix: 'OUT-NR' }] }

async function synthetic(context: TestContext, check: unknown = sources) {
  const root = await workspace(context)
  const book = join(root, '样书')
  await mkdir(join(book, '大纲'), { recursive: true })
  await mkdir(join(book, '正文'), { recursive: true })
  await mkdir(join(book, '设定'), { recursive: true })
  await writeFile(join(book, '大纲/细纲_第001章.md'), outline)
  await writeFile(join(book, '正文/第001章.md'), body)
  await writeFile(join(book, '设定/写作检查.json'), JSON.stringify(check))
  return { root, book }
}

async function writeAudit(book: string, chapter: number, document: unknown, relative = ruleAuditRelativePath(chapter)) {
  const path = join(book, relative)
  await mkdir(join(book, '草稿/审稿'), { recursive: true })
  await writeFile(path, JSON.stringify(document))
  return path
}

describe('chapter audit-verify', () => {
  it('accepts a normalized quote and rejects a forged quote, a dropped comma, an unknown id and a missing verdict', async context => {
    const { root, book } = await synthetic(context)
    const rules = extractChapterRules(book, 1)
    expect(rules.rules.map(rule => rule.id)).toEqual(['OUT-001-NR'])
    const bodyHash = createHash('sha256').update(body).digest('hex')
    const base = {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: bodyHash,
      rules_sha256: rules.rules_sha256,
    }
    const spaced = { ...base, verdicts: [{ rule_id: 'OUT-001-NR', verdict: 'violate', evidence: [{ line: 1, quote: '库门还关着， 钥匙在管事手里。' }], reason: '钥匙还在别人手里' }] }
    await writeAudit(book, 1, spaced)
    const passed = verifyRuleAudit(book, 1, join(book, ruleAuditRelativePath(1)))
    expect(passed).toMatchObject({ schema: RULE_AUDIT_VERIFY_SCHEMA, verified: true, violate: ['OUT-001-NR'], unclear: [] })

    const forged = { ...base, verdicts: [{ rule_id: 'OUT-001-NR', verdict: 'violate', evidence: [{ line: 1, quote: '库门其实已经打开' }] }] }
    await writeAudit(book, 1, forged)
    const forgedResult = verifyRuleAudit(book, 1, join(book, ruleAuditRelativePath(1)))
    expect(forgedResult.verified).toBe(false)
    if (!forgedResult.verified) expect(forgedResult.reasons.join('\n')).toContain('quote was not found')

    const dropped = { ...base, verdicts: [{ rule_id: 'OUT-001-NR', verdict: 'violate', evidence: [{ line: 1, quote: '库门还关着钥匙在管事手里' }] }] }
    await writeAudit(book, 1, dropped)
    const droppedResult = verifyRuleAudit(book, 1, join(book, ruleAuditRelativePath(1)))
    expect(droppedResult.verified).toBe(false)

    const unknown = { ...base, verdicts: [{ rule_id: 'GHOST-1', verdict: 'pass' }] }
    await writeAudit(book, 1, unknown)
    const unknownCli = await call(context, root, ['chapter', 'audit-verify', ...scope(root, '样书'), '--chapter', '1'])
    expect(unknownCli.exitCode).toBe(1)
    expect(unknownCli.value.verified).toBe(false)
    expect((unknownCli.value.reasons as string[]).join('\n')).toContain('GHOST-1 is not in the current chapter rules')
    expect((unknownCli.value.reasons as string[]).join('\n')).toContain('missing verdict for OUT-001-NR')

    const missing = { ...base, verdicts: [] }
    await writeAudit(book, 1, missing)
    const missingResult = verifyRuleAudit(book, 1, join(book, ruleAuditRelativePath(1)))
    expect(missingResult.verified).toBe(false)
    if (!missingResult.verified) expect(missingResult.reasons.join('\n')).toContain('missing verdict for OUT-001-NR')
  })

  it('rejects a hash mismatch and a path that leaves the book', async context => {
    const { root, book } = await synthetic(context)
    const rules = extractChapterRules(book, 1)
    const bodyHash = createHash('sha256').update(body).digest('hex')
    await writeAudit(book, 1, {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: 'a'.repeat(64),
      rules_sha256: rules.rules_sha256,
      verdicts: [{ rule_id: 'OUT-001-NR', verdict: 'pass' }],
    })
    const staleBody = await call(context, root, ['chapter', 'audit-verify', ...scope(root, '样书'), '--chapter', '1'])
    expect(staleBody.exitCode).toBe(1)
    expect((staleBody.value.reasons as string[]).join('\n')).toContain('body_sha256 does not match')

    await writeAudit(book, 1, {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: bodyHash,
      rules_sha256: 'b'.repeat(64),
      verdicts: [{ rule_id: 'OUT-001-NR', verdict: 'pass' }],
    })
    const staleRules = verifyRuleAudit(book, 1, join(book, ruleAuditRelativePath(1)))
    expect(staleRules.verified).toBe(false)
    if (!staleRules.verified) expect(staleRules.reasons.join('\n')).toContain('rules_sha256 does not match')

    const outside = join(root, 'outside.json')
    await writeFile(outside, '{}')
    const escaped = await call(context, root, ['chapter', 'audit-verify', ...scope(root, '样书'), '--chapter', '1', '--input', '../outside.json'])
    expect(escaped.exitCode).toBe(2)
    const absolute = await call(context, root, ['chapter', 'audit-verify', ...scope(root, '样书'), '--chapter', '1', '--input', outside])
    expect(absolute.exitCode).toBe(2)
    const absent = await call(context, root, ['chapter', 'audit-verify', ...scope(root, '样书'), '--chapter', '2', '--input', '草稿/审稿/第002章.rules.json'])
    expect(absent.exitCode).toBe(1)
    expect((absent.value.reasons as string[]).join('\n')).toContain('audit file does not exist')
  })

  it('rejects an illegal rule_audit value and accepts a file that sets only that key', async context => {
    const broken = await synthetic(context, { rule_audit: 'maybe' })
    await writeAudit(broken.book, 1, { schema: RULE_AUDIT_SCHEMA, body_sha256: 'a'.repeat(64), rules_sha256: 'b'.repeat(64), verdicts: [] })
    const invalid = await call(context, broken.root, ['chapter', 'audit-verify', ...scope(broken.root, '样书'), '--chapter', '1'])
    expect(invalid.exitCode).toBe(2)
    expect(invalid.value.error_code).toBe('INVALID_INPUT')

    const { root, book } = await synthetic(context, { rule_audit: 'off', rule_sources: [] })
    const rules = extractChapterRules(book, 1)
    expect(rules.rules).toEqual([])
    await writeAudit(book, 1, {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: createHash('sha256').update(body).digest('hex'),
      rules_sha256: rules.rules_sha256,
      verdicts: [],
    })
    const verified = await call(context, root, ['chapter', 'audit-verify', ...scope(root, '样书'), '--chapter', '1'])
    expect(verified.exitCode, verified.stderr).toBe(0)
    expect(verified.value.verified).toBe(true)
  })
})

describe('rule audit commit gate', () => {
  async function readyBook(context: TestContext, check: unknown) {
    const root = await workspace(context)
    const input = join(root, 'initial.json')
    await writeFile(input, JSON.stringify({
      schema_version: 1, book_title: '样书', last_chapter: 0,
      context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房外' } },
    }))
    const created = await call(context, root, ['project', 'init', ...scope(root, '样书'), '--kind', 'long', '--input', input])
    expect(created.exitCode, created.stderr).toBe(0)
    const book = join(root, '样书')
    await cp(join(fixtures, 'workflow-outline.md'), join(book, '大纲/细纲_第001章.md'))
    await cp(join(fixtures, 'workflow-body.md'), join(book, '正文/第001章.md'))
    await mkdir(join(book, '设定'), { recursive: true })
    await writeFile(join(book, '设定/写作检查.json'), JSON.stringify(check))
    const snapshot = await call(context, root, ['chapter', 'snapshot', ...scope(root, '样书'), '--chapter', '1'])
    expect(snapshot.exitCode, snapshot.stderr).toBe(0)
    return { root, book, snapshot: snapshot.value as { body_sha256: string; outline_sha256: string } }
  }

  function transaction(snapshot: { body_sha256: string; outline_sha256: string }, extra: Record<string, unknown> = {}) {
    return {
      schema_version: 1, mode: 'append', chapter: 1, chapter_title: '账册', expected_state_revision: 0,
      expected_body_sha256: snapshot.body_sha256, expected_outline_sha256: snapshot.outline_sha256,
      delta: { result: '取得账册并发现缺页', character_changes: [], foreshadow_changes: [], timeline_events: [], constraints: [],
        next_chapter_commitments: ['追查缺页'], retired_context_items: [], retired_characters: [] },
      context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '库房内' },
        long_term_constraints: [], active_character_names: [], continuity_risks: [] },
      character_snapshots: {},
      ...extra,
    }
  }

  async function commit(context: TestContext, root: string, document: unknown) {
    const input = join(root, 'transaction.json')
    await writeFile(input, JSON.stringify(document))
    return call(context, root, ['chapter', 'commit', ...scope(root, '样书'), '--chapter', '1', '--input', input])
  }

  it('commits when the gate is off and records an accepted exception only in the chapter record', async context => {
    const { root, book, snapshot } = await readyBook(context, {})
    const rules = extractChapterRules(book, 1)
    await writeAudit(book, 1, {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: snapshot.body_sha256,
      rules_sha256: rules.rules_sha256,
      verdicts: rules.rules.map(rule => rule.id === 'OUT-001-NR'
        ? { rule_id: rule.id, verdict: 'violate', evidence: [{ line: 1, quote: '库房一刻钟后封门，账册还在里面。' }] }
        : { rule_id: rule.id, verdict: 'pass' }),
    })
    const committed = await commit(context, root, transaction(snapshot, {
      accepted_findings: [{ rule_id: 'OUT-001-NR', reason: '作者保留这一句' }],
    }))
    expect(committed.exitCode, committed.stderr).toBe(0)
    const record = await readFile(join(book, '追踪/逐章记录/第001章.md'), 'utf8')
    expect(record).toContain('## 接受的规则例外')
    expect(record).toContain('- OUT-001-NR｜作者保留这一句')
    const state = JSON.parse(await readFile(join(book, '追踪/_tracking-state.json'), 'utf8')) as { schema_version: number }
    expect(state.schema_version).toBe(TRACKING_SCHEMA_VERSION)
    expect(JSON.stringify(state)).not.toContain('accepted_findings')
    expect(JSON.stringify(state)).not.toContain('接受的规则例外')
  })

  it('requires a verified file when the gate is on and lets an accepted violate through', async context => {
    const blocked = await readyBook(context, { rule_audit: 'required' })
    const missing = await commit(context, blocked.root, transaction(blocked.snapshot))
    expect(missing.exitCode).toBe(2)
    expect(missing.value.message).toContain('rule audit is required')

    const rules = extractChapterRules(blocked.book, 1)
    await writeAudit(blocked.book, 1, {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: blocked.snapshot.body_sha256,
      rules_sha256: rules.rules_sha256,
      verdicts: rules.rules.map(rule => rule.id === 'OUT-001-NR'
        ? { rule_id: rule.id, verdict: 'violate', evidence: [{ line: 1, quote: '库房一刻钟后封门，账册还在里面。' }] }
        : { rule_id: rule.id, verdict: 'pass' }),
    })
    const open = await commit(context, blocked.root, transaction(blocked.snapshot))
    expect(open.exitCode).toBe(2)
    expect(String(open.value.message)).toContain('unresolved violate OUT-001-NR')

    const accepted = await commit(context, blocked.root, transaction(blocked.snapshot, {
      accepted_findings: [{ rule_id: 'OUT-001-NR', reason: '作者保留这一句' }],
    }))
    expect(accepted.exitCode, accepted.stderr).toBe(0)
    const record = await readFile(join(blocked.book, '追踪/逐章记录/第001章.md'), 'utf8')
    expect(record).toContain('OUT-001-NR｜作者保留这一句')
    expect(JSON.stringify(JSON.parse(await readFile(join(blocked.book, '追踪/_tracking-state.json'), 'utf8')))).not.toContain('accepted_findings')
  })

  it('commits a passing audit when the gate is required and ignores unclear', async context => {
    const { root, book, snapshot } = await readyBook(context, { rule_audit: 'required' })
    const rules = extractChapterRules(book, 1)
    await writeAudit(book, 1, {
      schema: RULE_AUDIT_SCHEMA,
      body_sha256: snapshot.body_sha256,
      rules_sha256: rules.rules_sha256,
      verdicts: rules.rules.map(rule => rule.id === 'OUT-001-P1'
        ? { rule_id: rule.id, verdict: 'unclear', reason: '邻章没有对应句子' }
        : { rule_id: rule.id, verdict: 'pass' }),
    })
    const committed = await commit(context, root, transaction(snapshot))
    expect(committed.exitCode, committed.stderr).toBe(0)
    const record = await readFile(join(book, '追踪/逐章记录/第001章.md'), 'utf8')
    expect(record).not.toContain('接受的规则例外')
  })
})
