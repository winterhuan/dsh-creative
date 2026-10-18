import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readlinkSync, readdirSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { auditBook, BOOK_AUDIT_CHECKS, BOOK_AUDIT_SCHEMA, renderBookAudit, type BookAuditCheck, type BookAuditFinding, type BookAuditReport } from '../src/core/audit.ts'

const fixture = resolve(import.meta.dirname, 'fixtures/regression/book-audit')
const entry = resolve(import.meta.dirname, '../src/cli.ts')
const loader = import.meta.resolve('tsx')

async function workspace(context: TestContext): Promise<{ root: string; book: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-story-audit-'))
  context.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const book = join(root, '样书')
  await cp(fixture, book, { recursive: true })
  return { root, book }
}

async function call(context: TestContext, cwd: string, args: string[]) {
  const child = execa(process.execPath, ['--import', loader, entry, ...args, '--json'], {
    cwd, reject: false, cancelSignal: context.signal,
  })
  context.onTestFinished(async () => { child.kill('SIGTERM'); await child })
  const result = await child
  expect(result.timedOut).toBe(false)
  expect(result.signal).toBeUndefined()
  return { ...result, value: JSON.parse(result.stdout) as BookAuditReport & { error_code?: string; message?: string } }
}

function scope(root: string, extra: string[] = []): string[] {
  return ['book', 'audit', '--workspace', root, '--book', '样书', ...extra]
}

function treeHash(root: string): string {
  const hash = createHash('sha256')
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name)
      const stat = lstatSync(path)
      hash.update(relative(root, path))
      hash.update(stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : 'file')
      if (stat.isSymbolicLink()) hash.update(readlinkSync(path))
      else if (stat.isDirectory()) walk(path)
      else if (stat.isFile()) hash.update(readFileSync(path))
    }
  }
  walk(root)
  return hash.digest('hex')
}

function evidence(report: BookAuditReport, check: string): string[] {
  return report.findings.filter(item => item.check === check).map(item => item.evidence ?? item.category)
}

describe('book audit', () => {
  it('reports the regression checks, stays deterministic, and does not write', async context => {
    const { root, book } = await workspace(context)
    const before = treeHash(book)
    const state = await readFile(join(book, '追踪/_tracking-state.json'))
    const first = await call(context, root, scope(root, ['--from', '1', '--to', '3']))
    const second = await call(context, root, scope(root, ['--from', '1', '--to', '3']))
    expect(first.exitCode, first.stderr).toBe(1)
    expect(second.stdout).toBe(first.stdout)
    expect(treeHash(book)).toBe(before)
    expect(await readFile(join(book, '追踪/_tracking-state.json'))).toEqual(state)
    expect(first.value.schema).toBe(BOOK_AUDIT_SCHEMA)
    expect(first.value.range).toEqual({ from: 1, to: 3 })
    expect(first.value.state_revision).toBe(4)
    expect(first.value.checks.map(item => item.id)).toEqual(BOOK_AUDIT_CHECKS.map(item => item.id))
    expect(first.value.checks.find(item => item.id === 'chapter')?.status).toBe('fail')
    expect(first.value.checks.filter(item => item.status === 'warn').map(item => item.id)).toEqual(['health', 'cast-cards', 'reader-value-stale', 'void-entries'])
    expect(evidence(first.value, 'chapter')).toContain('bad-end')
    expect(first.value.findings.some(item => item.category === 'missing-body' && item.chapter === 2)).toBe(true)
    expect(first.value.findings.some(item => item.category === 'VOID_TERM')).toBe(false)
    expect(first.value.findings.some(item => item.check === 'health' && item.category === 'overdue-foreshadow')).toBe(true)
    expect(first.value.findings.some(item => item.check === 'health' && item.category === 'stale-character')).toBe(false)
    expect(evidence(first.value, 'cast-cards')).toEqual(['丙'])
    const bodyHash = createHash('sha256').update(await readFile(join(book, '正文/第001章.md'))).digest('hex')
    expect(evidence(first.value, 'reader-value-stale')).toEqual([
      `record=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa body=${bodyHash} wordcount=0000000000000000000000000000000000000000000000000000000000000000`,
    ])
    expect(first.value.findings.find(item => item.check === 'reader-value-stale')?.message).toContain('当前正文、字数记录')
    expect(first.value.checks.find(item => item.id === 'reader-value-stale')?.summary).toBe('1 条读者价值记录的正文哈希不一致')
    expect(first.value.findings.some(item => item.check === 'reader-value-stale' && item.chapter === 2)).toBe(false)
    expect(first.value).not.toHaveProperty('report_path')
    expect(evidence(first.value, 'void-entries')).toEqual([
      'void:foreshadow[F002]:放弃',
      'void:long_term_constraints[1]:作废',
      'void:continuity_risks[0]:旧港',
      'void:long_term_constraints[0]:旧港',
    ])
    expect(first.value.counts.blocking).toBeGreaterThan(0)
    expect(first.value.counts.fail).toBe(1)
    expect(first.value.counts.warn).toBe(4)
    expect(first.value.counts.pass).toBe(0)
    const rendered = renderBookAudit(first.value)
    expect(rendered.startsWith('# 全书体检 第1-3章\n')).toBe(true)
    expect(rendered).toContain('bad-end')
    expect(rendered).not.toMatch(/[0-9a-f]{64}/u)
    expect(rendered).toContain(bodyHash.slice(0, 8))
    expect(auditBook(book, { from: 1, to: 3 })).toEqual(first.value)
  })

  it('treats a matching reader-value hash as current and reports a stale character at chapter 25', async context => {
    const { book } = await workspace(context)
    const body = await readFile(join(book, '正文/第001章.md'))
    const digest = createHash('sha256').update(body).digest('hex')
    const statePath = join(book, '追踪/_tracking-state.json')
    const state = JSON.parse(await readFile(statePath, 'utf8')) as {
      wordcount_records: { '1': { body_sha256: string } }
      reader_value_records: { '1': { body_sha256: string } }
    }
    state.wordcount_records['1'].body_sha256 = digest
    state.reader_value_records['1'].body_sha256 = digest
    await writeFile(statePath, JSON.stringify(state))
    const matched = auditBook(book, { from: 1, to: 1 })
    expect(matched.findings.some(item => item.check === 'reader-value-stale')).toBe(false)
    const wide = auditBook(book, { from: 1, to: 25 })
    expect(wide.findings.some(item => item.check === 'health' && item.category === 'stale-character' && item.evidence === 'age=24')).toBe(true)
    expect(wide.checks.find(item => item.id === 'chapter')?.summary).toContain('没有正文')
  })

  it('exits 0 when the range has no blocking finding', async context => {
    const { root } = await workspace(context)
    const clean = await call(context, root, scope(root, ['--from', '3', '--to', '3']))
    expect(clean.exitCode, clean.stderr).toBe(0)
    expect(clean.value.findings.every(item => item.severity === 'hint')).toBe(true)
    expect(clean.value.counts.blocking).toBe(0)
    expect(clean.value.counts.fail).toBe(0)
    for (const check of clean.value.checks) {
      const rows = clean.value.findings.filter(item => item.check === check.id)
      if (rows.length === 0) expect(check.status === 'pass' || check.status === 'skip').toBe(true)
      else expect(check.status).toBe('warn')
    }
  })

  it('rejects a bad range, an escaped path, and a symlink, and writes only the report', async context => {
    const { root, book } = await workspace(context)
    const reversed = await call(context, root, scope(root, ['--from', '3', '--to', '1']))
    expect(reversed.exitCode).toBe(2)
    expect(reversed.value.error_code).toBe('INVALID_ARGUMENT')
    const outside = await call(context, root, scope(root, ['--from', '1', '--to', '1', '--write', '../逃.md']))
    expect(outside.exitCode).toBe(2)
    const absolute = await call(context, root, scope(root, ['--from', '1', '--to', '1', '--write', '/tmp/体检.md']))
    expect(absolute.exitCode).toBe(2)
    const tracking = await call(context, root, scope(root, ['--from', '1', '--to', '1', '--write', '追踪/笔记.md']))
    expect(tracking.exitCode).toBe(2)
    expect(treeHash(book)).toBe(treeHash(book))
    const state = await readFile(join(book, '追踪/_tracking-state.json'))
    await mkdir(join(book, '别处'), { recursive: true })
    await symlink(join(book, '别处'), join(book, '链接'))
    const linked = await call(context, root, scope(root, ['--from', '3', '--to', '3', '--write', '链接/体检.md']))
    expect(linked.exitCode).toBe(2)
    expect(linked.value.message).toContain('symlink')
    await mkdir(join(book, '草稿'), { recursive: true })
    await symlink(join(book, '别处/不是报告'), join(book, '草稿/替身.md'))
    const linkedFile = await call(context, root, scope(root, ['--from', '3', '--to', '3', '--write', '草稿/替身.md']))
    expect(linkedFile.exitCode).toBe(2)
    const before = await readFile(join(book, '追踪/_tracking-state.json'))
    expect(before).toEqual(state)
    const written = await call(context, root, scope(root, ['--from', '3', '--to', '3', '--write']))
    expect(written.exitCode, written.stderr).toBe(0)
    expect(written.value.report_path).toBe('草稿/体检_第3-3章.md')
    const reportPath = join(book, '草稿/体检_第3-3章.md')
    expect(await readFile(reportPath, 'utf8')).toBe(renderBookAudit(written.value))
    expect(await readFile(join(book, '追踪/_tracking-state.json'))).toEqual(state)
    const named = await call(context, root, scope(root, ['--from', '3', '--to', '3', '--write', '草稿/另一份.md']))
    expect(named.exitCode).toBe(0)
    expect(named.value.report_path).toBe('草稿/另一份.md')
    expect(await readFile(join(book, '草稿/另一份.md'), 'utf8')).toContain('report_path: 草稿/另一份.md')
    const files = readdirSync(join(book, '草稿')).sort()
    expect(files).toEqual(['体检_第3-3章.md', '另一份.md', '替身.md'])
  })

  it('keeps a custom check list in registry order', async context => {
    const { book } = await workspace(context)
    const selected = BOOK_AUDIT_CHECKS.filter(check => check.id === 'void-entries' || check.id === 'cast-cards')
    const report = auditBook(book, { from: 1, to: 1, checks: selected })
    expect(report.checks.map(item => item.id)).toEqual(['cast-cards', 'void-entries'])
    expect(report.findings.every((item: BookAuditFinding) => item.check === 'void-entries' || item.check === 'cast-cards')).toBe(true)
    expect(report.counts.skip).toBe(0)
    expect(report.counts.warn).toBe(2)
  })

  it('sorts line numbers numerically and groups repeated hints in Markdown', async context => {
    const { book } = await workspace(context)
    const lines = [27, 3, 9, 100, 8, 11, 4, 15, 2, 6, 20, 1, 30, 12]
    const noisy: BookAuditCheck = {
      id: 'lines',
      run: () => ({
        status: 'pass',
        summary: '行号',
        findings: lines.map(line => ({
          check: 'lines', severity: 'hint' as const, chapter: 2, category: 'em-dash', message: '少用破折号',
          source: { path: '正文/第002章.md', line },
        })),
      }),
    }
    const blocking: BookAuditCheck = {
      id: 'late',
      run: () => ({
        status: 'fail',
        summary: '阻断',
        findings: [{ check: 'late', severity: 'blocking', chapter: 9, category: 'forbidden', message: '后出现的阻断' }],
      }),
    }
    const report = auditBook(book, { from: 1, to: 1, checks: [noisy, blocking] })
    expect(report.findings.map(item => item.check)).toEqual(['late', ...lines.map(() => 'lines')])
    expect(report.findings.filter(item => item.check === 'lines').map(item => item.source?.line)).toEqual([1, 2, 3, 4, 6, 8, 9, 11, 12, 15, 20, 27, 30, 100])
    expect(report.findings).toHaveLength(15)
    expect(report.checks.find(item => item.id === 'lines')?.status).toBe('warn')
    const rendered = renderBookAudit(report)
    expect(rendered).toContain('lines 第2章 em-dash 14 处：第 1、2、3、4、6、8、9、11、12、15、20、27…行：少用破折号 (正文/第002章.md)')
    expect(rendered).toContain('late 第9章 forbidden：后出现的阻断')
  })
})
