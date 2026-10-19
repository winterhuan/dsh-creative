import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, type TestContext } from 'vitest'
import { main } from '../src/cli/main.ts'
import { buildContext } from '../src/core/context.ts'
import { diffFacts, earlySkillHits, effectiveAttrs, loadFacts, queryFacts, recordFacts, staleFacts } from '../src/core/facts.ts'
import { extractChapterRules } from '../src/core/rules.ts'
import { initialize } from '../src/core/tracking/store.ts'
import { countVisibleChars, evaluateWordcount } from '../src/core/wordcount.ts'

const cases = resolve(import.meta.dirname, 'fixtures/regression')

function fixture(name: string): Record<string, string> {
  return Object.fromEntries(name.split('\n').filter(line => line.includes(':')).map(line => {
    const index = line.indexOf(':')
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
  }))
}

async function book(context: TestContext, lastChapter = 1): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-facts-')))
  context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const directory = join(root, '样书')
  await mkdir(join(directory, '正文'), { recursive: true })
  initialize(directory, {
    schema_version: 1, book_title: '样书', last_chapter: lastChapter,
    context: {
      position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '铁笼' },
      long_term_constraints: [], active_character_names: [], continuity_risks: [],
      recent_chapters: [], next_chapter_commitments: [],
    },
    character_snapshots: {},
    foreshadow: [],
    timeline_events: [],
  })
  return directory
}

async function commitBody(directory: string, chapter: number, text: string): Promise<string> {
  const path = join(directory, '正文', `第${String(chapter).padStart(3, '0')}章.md`)
  await writeFile(path, text)
  const actual = countVisibleChars(text)
  const evaluated = evaluateWordcount(text, actual)
  const record = {
    metric: 'visible_chars_v1', target: actual, actual, status: evaluated.status,
    resolution: 'within_user_band', body_sha256: createHash('sha256').update(text).digest('hex'),
  }
  const statePath = join(directory, '追踪/_tracking-state.json')
  const state = JSON.parse(await readFile(statePath, 'utf8')) as { wordcount_records: Record<string, unknown> }
  state.wordcount_records[String(chapter)] = record
  await writeFile(statePath, JSON.stringify(state))
  return record.body_sha256
}

async function runCli(args: string[]): Promise<{ code: number; value: Record<string, unknown> }> {
  let out = ''
  const write = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out += String(chunk)
    return true
  }) as typeof process.stdout.write
  try {
    const code = await main(args)
    return { code, value: JSON.parse(out) as Record<string, unknown> }
  } finally {
    process.stdout.write = write
  }
}

describe('fact ledger', () => {
  it('appends a change and reports R4 R7 R8 R9 conflicts', async context => {
    const directory = await book(context, 7)
    const hash = await commitBody(directory, 1, '铁笼地面是铁板。')
    await commitBody(directory, 7, '账和伤在这一章核对。')
    const rows = ['R4', 'R7', 'R8', 'R9'].map(name => fixture(readFileSync(join(cases, `${name}.md`), 'utf8')))
    const ledgerValue = (row: Record<string, string>) => /^\d+$/u.test(row.ledger ?? '') ? Number(row.ledger) : row.ledger
    const claimValue = (row: Record<string, string>) => /^\d+$/u.test(row.claim ?? '') ? Number(row.claim) : row.claim
    const recorded = recordFacts(directory, 1, {
      entries: rows.map(row => ({
        id: row.id, kind: row.kind, subject: row.subject, since: row.id?.startsWith('VENUE') ? 1 : 7,
        attrs: { [row.attr ?? '']: ledgerValue(row) },
      })),
    })
    expect(recorded.added).toBe(4)
    const original = loadFacts(directory).entries.find(entry => entry.id === 'VENUE-铁笼')
    expect(original?.attrs).toEqual({ 地面: '铁板' })
    expect(original?.source.body_sha256).toBe(hash)
    const changed = recordFacts(directory, 7, {
      entries: [{ id: 'VENUE-铁笼', kind: '场地', subject: '地下拳场铁笼', attrs: { 地面: '水泥地' }, reason: '后文改了地面' }],
    })
    expect(changed.changed).toBe(1)
    const updated = loadFacts(directory).entries.find(entry => entry.id === 'VENUE-铁笼')
    expect(updated?.attrs).toEqual({ 地面: '铁板' })
    expect(updated?.changes).toHaveLength(1)
    expect(effectiveAttrs(updated ?? { attrs: {}, changes: [] })).toEqual({ 地面: '水泥地' })
    const same = recordFacts(directory, 7, { entries: [] })
    expect(same.covered_chapters).toContain(7)
    for (const row of rows.filter(item => item.id !== 'VENUE-铁笼')) {
      const diff = diffFacts(directory, 7, { claims: [{ id: row.id, attrs: { [row.attr ?? '']: claimValue(row) } }] })
      expect(diff.ok, row.id).toBe(false)
      expect(diff.conflicts[0]?.attr).toBe(row.attr)
    }
    const unknown = diffFacts(directory, 7, { claims: [{ id: 'MISSING', attrs: { 地面: '铁板' } }] })
    expect(unknown.ok).toBe(true)
    expect(unknown.unmatched.map(item => item.id)).toEqual(['MISSING'])
    const queried = queryFacts(directory, { kind: '伤情', subject: '金牙' })
    expect(queried.items.map(item => item.id)).toEqual(['INJ-金牙-前臂'])
  })

  it('flags an ability token before since and a stale source chapter', async context => {
    const directory = await book(context, 2)
    const skill = fixture(await readFile(join(cases, 'R5.md'), 'utf8'))
    await commitBody(directory, 1, skill.body ?? '')
    await commitBody(directory, 2, '这一章才学会。')
    recordFacts(directory, 2, {
      entries: [{ id: skill.id, kind: skill.kind, subject: skill.subject, since: Number(skill.since), attrs: { 名称: skill.token } }],
    })
    const hits = earlySkillHits(directory, 1, skill.body ?? '')
    expect(hits.map(hit => hit.id)).toEqual([`skill:${skill.id ?? ''}`])
    await mkdir(join(directory, '大纲'), { recursive: true })
    await writeFile(join(directory, '大纲/细纲_第001章.md'), '- 爽点：无\n')
    const rules = extractChapterRules(directory, 1)
    expect(rules.scan.some(hit => hit.kind === 'skill' && hit.id === `skill:${skill.id ?? ''}`)).toBe(true)
    await writeFile(join(directory, '正文/第002章.md'), '正文改过。')
    const stale = staleFacts(directory)
    expect(stale.stale.map(item => item.id)).toContain(skill.id)
    expect(stale.missing_chapters).toContain(1)
    const bundle = buildContext(directory, { chapter: 3, text: skill.token })
    expect(bundle.facts.some(item => item.id === skill.id)).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(bundle.facts), 'utf8')).toBeLessThanOrEqual(2048)
  })

  it('keeps the fact diff gate off unless the book requires it', async context => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-story-facts-cli-')))
    context.onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
    const directory = join(root, '样书')
    await mkdir(join(directory, '正文'), { recursive: true })
    initialize(directory, {
      schema_version: 1, book_title: '样书', last_chapter: 1,
      context: {
        position: { volume: '第一卷', volume_start_chapter: 1, story_time: '夜', scene: '铁笼' },
        long_term_constraints: [], active_character_names: [], continuity_risks: [],
        recent_chapters: [], next_chapter_commitments: [],
      },
      character_snapshots: {}, foreshadow: [], timeline_events: [],
    })
    await commitBody(directory, 1, '铁板。')
    const input = join(directory, 'claims.json')
    await writeFile(input, JSON.stringify({ entries: [{ id: 'VENUE-铁笼', kind: '场地', attrs: { 地面: '铁板' } }] }))
    const recorded = await runCli(['facts', 'record', '--workspace', root, '--book', '样书', '--chapter', '1', '--input', input])
    expect(recorded.code, JSON.stringify(recorded.value)).toBe(0)
    const claims = join(directory, 'diff.json')
    await writeFile(claims, JSON.stringify({ claims: [{ id: 'VENUE-铁笼', attrs: { 地面: '水泥地' } }] }))
    const diff = await runCli(['facts', 'diff', '--workspace', root, '--book', '样书', '--chapter', '1', '--input', claims])
    expect(diff.code).toBe(1)
    expect(diff.value.ok).toBe(false)
    const quiet = await runCli(['facts', 'query', '--workspace', root, '--book', '样书', '--kind', '场地'])
    expect(quiet.code).toBe(0)
    expect(quiet.value.total).toBe(1)
  })
})
