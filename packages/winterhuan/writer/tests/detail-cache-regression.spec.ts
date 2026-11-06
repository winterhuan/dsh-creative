import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const jjwxc = require('../skills/story-long-scan/scripts/jjwxc-rank-scraper.js')
const fanqie = require('../skills/story-long-scan/scripts/fanqie-rank-scraper.js')
type Details = Record<string, { collect?: string, title?: string, err?: string }>

function store() {
  const entries = new Map<string, Details>()
  return {
    entries,
    get(key: string) { return entries.get(key) },
    commit(key: string, value: Details) { entries.set(key, value) },
  }
}

function sessionReturning(result: Details) {
  let calls = 0
  return { get calls() { return calls }, evalJSON() { calls++; return result } }
}

type Session = ReturnType<typeof sessionReturning>
type Store = ReturnType<typeof store>
const fetchers: [string, (session: Session, ids: string[], run: Store, identity?: string) => Details][] = [
  ['晋江', (session, ids, run, identity = '12') => jjwxc.fetchDetails(session, ids, run, identity, '0').map],
  ['番茄', (session, ids, run, identity = 'rank-1-2-cat') => fanqie.fetchDetails(session, ids, run, identity)],
]

for (const [name, fetchDetails] of fetchers) {
  it(`${name}跨榜同序号批次隔离详情缓存`, () => {
    const run = store()
    fetchDetails(sessionReturning({ A: { collect: '11', title: 'A' } }), ['A'], run, 'first')
    const second = sessionReturning({ A: { collect: '22', title: 'A2' } })
    expect(fetchDetails(second, ['A'], run, 'second').A.collect).toBe('22')
    expect(second.calls).toBe(1)
  })

  it(`${name}同分类书目替换和顺序变动使缓存失效`, () => {
    const run = store()
    fetchDetails(sessionReturning({ A: { collect: '1', title: 'A' }, B: { collect: '2', title: 'B' } }), ['A', 'B'], run)
    expect(run.entries.size).toBe(1)
    const reordered = sessionReturning({ B: { collect: '3', title: 'B2' }, A: { collect: '4', title: 'A2' } })
    expect(fetchDetails(reordered, ['B', 'A'], run).B.title).toBe('B2')
    expect(reordered.calls).toBe(1)
    const changed = sessionReturning({ B: { collect: '5', title: 'B3' }, C: { collect: '6', title: 'C' } })
    expect(fetchDetails(changed, ['B', 'C'], run).C.title).toBe('C')
    expect(changed.calls).toBe(1)
  })

  it(`${name}验证成功的完整批次正确复用`, () => {
    const run = store()
    fetchDetails(sessionReturning({ A: { collect: '9', title: 'A' } }), ['A'], run)
    const unused = sessionReturning({})
    expect(fetchDetails(unused, ['A'], run).A.collect).toBe('9')
    expect(unused.calls).toBe(0)
  })

  it(`${name}失败和不完整详情不缓存，重试可恢复`, () => {
    for (const response of [{}, { A: { err: 'network' } }, { A: { collect: '', title: '' } }]) {
      const run = store()
      fetchDetails(sessionReturning(response), ['A'], run)
      expect(run.entries.size).toBe(0)
      const retry = sessionReturning({ A: { collect: '9', title: 'A' } })
      expect(fetchDetails(retry, ['A'], run).A.title).toBe('A')
      expect(retry.calls).toBe(1)
      expect(run.entries.size).toBe(1)
    }
  })
}
