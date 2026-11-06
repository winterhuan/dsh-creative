import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const scraperPath = require.resolve('../skills/story-short-scan/scripts/heiyan-booklist-scraper.js')
const transportPath = require.resolve('../skills/browser-cdp/scripts/ego-session.cjs')
const { main, fetchBookList, fetchBookDetail } = require(scraperPath)
const { openRunStore, localDateStamp } = require(transportPath)
const roots: string[] = []
function root() {
  const dir = mkdtempSync(path.join(tmpdir(), 'writer-heiyan-'))
  roots.push(dir)
  return dir
}
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }) })

const book = { id: 1, name: '已采集作品', classifyStr: '男频', words: 12345 }
const first = () => ({ code: 200, data: { total: 40, rows: [{ ...book }] } })
function fake(responses: unknown[], opts: { login?: boolean, handoffError?: boolean } = {}) {
  const session = {
    spaceId: null as number | null, uncertain: false, handedOff: false,
    calls: [] as string[], finished: 0,
    open() { this.spaceId = 42; this.calls.push('open') },
    takeOver() { this.calls.push('takeOver') },
    evalJSON(js: string) {
      if (js.includes('host:location.host')) return { host: 'manage.zhangwenpindu.cn' }
      if (js.includes('loggedIn:')) return { loggedIn: opts.login !== false }
      this.calls.push(js.includes('/manage/book/list') ? 'list' : 'detail')
      const response = responses.shift()
      if (response instanceof Error) throw response
      return response
    },
    handOff() {
      this.calls.push('handOff')
      if (opts.handoffError) throw new Error('Admin-Token=SECRET')
      this.handedOff = true
    },
    endAndReport() {
      this.calls.push('end')
      if (!this.uncertain && !this.handedOff) this.finished++
    },
  }
  return session
}
function setup(responses: unknown[], opts = {}) {
  const dir = root()
  const session = fake(responses, opts)
  const runStore = openRunStore({ root: path.join(dir, 'runs'), runId: 'local-run', params: { channel: 'all', pages: 2, detail: false }, parserRevision: '1' })
  return { dir, session, runStore, options: { session, runStore, pages: 2, outdir: dir, sleep() {} } }
}

describe('heiyan real main with local sessions', () => {
  it.each([
    ['null response', null, '第2页接口无响应'],
    ['API failure', { code: 500, msg: 'Admin-Token=SECRET' }, '第2页接口返回错误'],
    ['transport exception', new Error('Authorization: Bearer SECRET'), '第2页采集异常'],
    ['malformed response', { code: 200, data: {} }, '第2页列表结构异常'],
  ])('preserves first page and reports partial for %s', (_name, response, reason) => {
    const f = setup([first(), response])
    const original = path.join(f.dir, `黑岩书库列表_all_${localDateStamp()}.md`)
    writeFileSync(original, 'existing complete report')
    const result = main(f.options)
    expect(result).toMatchObject({ written: 1, failed: 1, partial: true })
    expect(result.partialReasons.join()).toContain(reason)
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(f.runStore.get('page-1').rows).toEqual([book])
    expect(f.runStore.get('page-2')).toBeUndefined()
    expect(readFileSync(original, 'utf8')).toBe('existing complete report')
    const partial = readFileSync(original.replace(/\.md$/, '.partial.md'), 'utf8')
    expect(partial).toContain(book.name)
    expect(partial).toContain('采集未完成')
    expect(partial).not.toContain('SECRET')
    expect(f.session.finished).toBe(0)
  })

  it.each([false, true])('stops after later-page 401, including handoff failure=%s', (handoffError) => {
    const f = setup([first(), { code: 401, msg: 'SECRET' }, { data: book }], { handoffError })
    const result = main({ ...f.options, detail: true })
    expect(result).toMatchObject({ written: 1, failed: 1, partial: true })
    expect(result.partialReasons.join()).toContain('401')
    expect(f.session.calls).toEqual(['open', 'list', 'list', 'handOff', 'end'])
    expect(f.session.finished).toBe(0)
  })

  it('reports failed without overwriting an existing report on first-page failure', () => {
    const f = setup([{ code: 500, msg: 'SECRET' }])
    const original = path.join(f.dir, `黑岩书库列表_all_${localDateStamp()}.md`)
    writeFileSync(original, 'preserved')
    expect(main(f.options)).toMatchObject({ written: 0, failed: 1, partial: false })
    expect(readFileSync(original, 'utf8')).toBe('preserved')
    expect(f.session.finished).toBe(0)
  })

  it('hands off a missing login without fetching or finishing', () => {
    const f = setup([], { login: false })
    expect(main(f.options)).toMatchObject({ written: 0, failed: 1 })
    expect(f.session.calls).toEqual(['open', 'handOff', 'end'])
    expect(f.session.finished).toBe(0)
  })

  it('treats empty array as a normal end and completes cleanly', () => {
    const f = setup([first(), { code: 200, data: { rows: [] } }])
    expect(main(f.options)).toMatchObject({ written: 1, failed: 0, partial: false, partialReasons: [] })
    expect(f.session.finished).toBe(1)
    expect(readdirSync(f.dir).filter((name) => name.endsWith('.md'))).toEqual([`黑岩书库列表_all_${localDateStamp()}.md`])
  })

  it('resumes committed pages without requesting them again', () => {
    const f = setup([first(), null])
    expect(main(f.options).partial).toBe(true)
    const nextSession = fake([{ code: 200, data: { total: 40, rows: [{ ...book, id: 2, name: '续采作品' }] } }])
    const resumed = main({ ...f.options, session: nextSession })
    expect(resumed).toMatchObject({ written: 1, failed: 0, partial: false })
    expect(nextSession.calls.filter((call) => call === 'list')).toHaveLength(1)
    expect(readFileSync(path.join(f.dir, `黑岩书库列表_all_${localDateStamp()}.md`), 'utf8')).toContain('续采作品')
  })

  it('preserves list data and stops remaining details after detail 401', () => {
    const f = setup([{ code: 200, data: { rows: [{ ...book }, { ...book, id: 2 }], total: 2 } }, { code: 401 }])
    const result = main({ ...f.options, pages: 1, detail: true })
    expect(result).toMatchObject({ written: 1, failed: 1, partial: true })
    expect(result.partialReasons.join()).toContain('详情认证失败（401）')
    expect(f.session.calls).toEqual(['open', 'list', 'detail', 'handOff', 'end'])
    expect(f.session.finished).toBe(0)
  })

  it('handles HTTP 401 in page context without serializing credentials', () => {
    for (const fetcher of [fetchBookList, fetchBookDetail]) {
      let expression = ''
      fetcher({ evalJSON(js: string) { expression = js; return null } }, 1)
      expect(expression).toContain('r.status===401?{code:401}:r.json()')
      expect(expression).not.toContain('JSON.stringify(m)')
    }
  })

  it.each([['partial', 2], ['failed', 1], ['success', 0]])('runCli uses exit %s', (kind, exit) => {
    const dir = root()
    const program = `
      const { cliMain } = require(${JSON.stringify(scraperPath)});
      const { runCli, openRunStore } = require(${JSON.stringify(transportPath)});
      const responses = ${JSON.stringify(kind === 'success' ? [first(), { code: 200, data: { rows: [] } }] : kind === 'partial' ? [first(), { code: 500, msg: 'SECRET' }] : [{ code: 500, msg: 'SECRET' }])};
      const session = { spaceId: null, open(){}, evalJSON(js){
        if(js.includes('host:location.host')) return {host:'local'};
        if(js.includes('loggedIn:')) return {loggedIn:true};
        return responses.shift();
      }, endAndReport(){ if(this.uncertain) console.log('RETAINED'); } };
      const runStore = openRunStore({root:${JSON.stringify(path.join(dir, 'runs'))}, runId:'local', params:{}, parserRevision:'1'});
      runCli(() => cliMain({session, runStore, pages:2, outdir:${JSON.stringify(dir)}, sleep(){}}), 'heiyan');
    `
    const child = spawnSync(process.execPath, ['-e', program], { encoding: 'utf8', timeout: 20_000 })
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    expect(child.status).toBe(exit)
    expect(child.stdout + child.stderr).not.toContain('SECRET')
    if (kind !== 'success') expect(child.stdout).toContain('RETAINED')
    if (kind === 'partial') expect(child.stderr).toContain('第2页接口返回错误')
    if (kind === 'failed') expect(child.stderr).toContain('第1页接口返回错误')
  })
})