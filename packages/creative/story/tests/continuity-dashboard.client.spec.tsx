// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContinuityDashboard } from '../src/client/continuity-dashboard.tsx'
import { writingCheckWithGate } from '../src/client/gates-card.tsx'
import { parseTrackingView, selectForeshadow } from '../src/client/tracking-view.ts'
import { en, zh, type CreativeTranslate } from '../src/client/locales/index.ts'
import type { WorkspacePayload } from '../src/client/workspace-client.ts'

const source = readFileSync(resolve(import.meta.dirname, 'fixtures/continuity-state.json'), 'utf8')
const t: CreativeTranslate = (key, params = {}) => zh[key].replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? ''))
const tEn: CreativeTranslate = (key, params = {}) => en[key].replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? ''))
const sourcePaths = ['追踪/_tracking-state.json', '追踪/上下文.md', '追踪/伏笔.md', '追踪/角色状态/林舟.md',
  '追踪/时间线/读者已知.md', '追踪/时间线/作者真相.md', '大纲/卷纲.md', '设定/世界观.md']
const workspace: WorkspacePayload = { cwd: '/books', books: ['other', '神机诸天录'], files: ['神机诸天录/', 'other/'].flatMap(prefix => sourcePaths.map(path => ({
  path: prefix + path, bytes: 100, version: 'v1',
}))), truncated: false, mode: 'dsh-session' }
const response = (content = source) => new Response(JSON.stringify({ content, version: 'v1' }))

function harness({ sessionId = 'session-a', refresh = 0, translate = t, listing = workspace } = {}) {
  const onSource = vi.fn()
  function Harness({ sessionId, refresh }: { sessionId: string; refresh: number }) {
    const [project, setProject] = useState('神机诸天录')
    return <ContinuityDashboard sessionId={sessionId} workspace={listing} workspaceError={false} refresh={refresh}
      selectedProject={project} onProject={setProject} onSource={onSource} onRefresh={vi.fn()} t={translate} />
  }
  const view = render(<Harness sessionId={sessionId} refresh={refresh} />)
  return { ...view, onSource, update: (sessionId: string, refresh: number) => view.rerender(<Harness sessionId={sessionId} refresh={refresh} />) }
}

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('continuity display data', () => {
  it('reads supported versions and rejects future versions or impossible facts', () => {
    expect(parseTrackingView(source).last_committed_chapter).toBe(500)
    const state = JSON.parse(source)
    state.schema_version = 4
    expect(parseTrackingView(JSON.stringify(state)).schema_version).toBe(4)
    state.schema_version = 6
    expect(() => parseTrackingView(JSON.stringify(state))).toThrow()
    state.schema_version = 5
    state.timeline.E001.reveal_chapter = 501
    expect(() => parseTrackingView(JSON.stringify(state))).toThrow()
    expect(() => parseTrackingView('{broken')).toThrow()
  })

  it('matches the CLI deadline semantics on the same 500-chapter fixture', () => {
    const state = parseTrackingView(source)
    expect(selectForeshadow(state, 'due').map(row => row.id)).toEqual(['F002', 'F001'])
    expect(selectForeshadow(state, 'overdue').map(row => row.id)).toEqual(['F002'])
    expect(selectForeshadow(state, 'unscheduled').map(row => row.id)).toEqual(['F011'])
    expect(selectForeshadow(state, 'resolved').map(row => row.id)).toEqual(['F012'])
    expect(selectForeshadow(state, 'open')).toHaveLength(11)
  })
})

describe('read-only continuity dashboard', () => {
  it('uses named child files when an older running host omits the book catalog', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetcher)
    const files = ['正文.md', '追踪/_tracking-state.json', '拆文库/参考书/概要.md', '神机诸天录/追踪/_tracking-state.json']
      .map(path => ({ path, bytes: 100, version: 'v1' }))
    const view = harness({ listing: { cwd: '/Users/winter/workspace/shenji', files, truncated: false, mode: 'dsh-session' } })
    await view.findByText('雾港来信')
    expect(view.getAllByRole('option').map(option => option.textContent)).toEqual(['神机诸天录'])
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('path')).toBe('神机诸天录/追踪/_tracking-state.json')
  })

  it('honors an empty book catalog even when stale files contain a book path', () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const view = harness({ listing: { ...workspace, books: [] } })
    expect(view.getByRole('combobox').textContent).toBe('暂无作品')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([t, tEn])('selects books and reads tracking even when only library files fit in the listing', async translate => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetcher)
    const files = [{ path: '拆文库/参考书/概要.md', bytes: 1, version: 'v1' }]
    const view = harness({ translate, listing: { ...workspace, files, truncated: true } })
    await view.findByText('雾港来信')
    expect(view.getAllByRole('option').map(option => option.textContent)).toEqual(['other', '神机诸天录'])
    expect(view.getByText(translate('dashboard.truncated'))).toBeTruthy()
    fireEvent.change(view.getByRole('combobox', { name: translate('dashboard.book') }), { target: { value: 'other' } })
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect(new URL(String(fetcher.mock.calls[1]![0])).searchParams.get('path')).toBe('other/追踪/_tracking-state.json')
  })

  it('lists named child books without treating the workspace or shared analysis as a book', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetcher)
    const files = ['拆文库/龙蛇演义/概要.md', '追踪/_tracking-state.json', '正文.md', '神机诸天录/追踪/_tracking-state.json', '雨夜/正文.md']
      .map(path => ({ path, bytes: 100, version: 'v1' }))
    const view = harness({ listing: { ...workspace, cwd: '/workspace/shenji', books: ['神机诸天录', '雨夜'], files } })
    await view.findByText('雾港来信')
    expect(view.getAllByRole('option').map(option => option.textContent)).toEqual(['神机诸天录', '雨夜'])
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).searchParams.get('path') === '神机诸天录/追踪/_tracking-state.json')).toBe(true)
  })

  it('shows no books for an empty workspace or a shared library without querying workspace tracking', () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const view = harness({ listing: { ...workspace, cwd: '/workspace/shenji', books: [], files: [{ path: '拆文库/参考书/概要.md', bytes: 1, version: 'v1' }] } })
    expect(view.getByRole('combobox').textContent).toBe('暂无作品')
    expect(view.getByText(/请打开作品目录的上一级工作区/)).toBeTruthy()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not claim tracking is missing when the workspace cannot be read', () => {
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    const view = render(<ContinuityDashboard sessionId="session-a" workspace={undefined} workspaceError refresh={0}
      selectedProject={undefined} onProject={vi.fn()} onSource={vi.fn()} onRefresh={vi.fn()} t={t} />)
    expect(view.getByRole('alert').textContent).toContain(t('dashboard.workspaceError'))
    expect(view.queryByText(/还没有长篇追踪记录/)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([t, tEn])('shows committed progress, obligations and sourced characters without write requests', async translate => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response())
    vi.stubGlobal('fetch', fetcher)
    const view = harness({ translate })
    await view.findByText('雾港来信')
    expect(view.getByText('500')).toBeTruthy()
    expect(view.getByText('501')).toBeTruthy()
    expect(view.getByText('交代失踪证人的去向')).toBeTruthy()
    expect(view.getByText(translate('dashboard.commitMeaning'))).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: translate('dashboard.section.characters') }))
    fireEvent.click(view.getByText('林舟', { exact: true }))
    expect(view.getByText('船只已离港')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: translate('dashboard.source', { path: '追踪/角色状态/林舟.md' }) }))
    expect(view.onSource).toHaveBeenCalledWith('神机诸天录/追踪/角色状态/林舟.md')
    expect(fetcher.mock.calls.every(([, options]) => options?.method === undefined || options.method === 'GET')).toBe(true)
  })

  it('filters due foreshadowing and paginates large lists without hiding old promises', async () => {
    const state = JSON.parse(source)
    for (let index = 15; index <= 55; index++) state.foreshadow[`F${String(index).padStart(3, '0')}`] = {
      ...state.foreshadow.F001, id: `F${String(index).padStart(3, '0')}`, planned_resolution_chapter: 600, summary: `后续线索${index}`,
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response(JSON.stringify(state))))
    const view = harness()
    await view.findByText('雾港来信')
    fireEvent.click(view.getByRole('button', { name: '伏笔' }))
    expect(view.getByText('线索1：旧港钥匙')).toBeTruthy()
    expect(view.getByText('线索2：旧港钥匙')).toBeTruthy()
    expect(view.queryByText('线索3：旧港钥匙')).toBeNull()
    fireEvent.change(view.getByRole('combobox', { name: '伏笔筛选' }), { target: { value: 'all' } })
    expect(view.getByText('1–20 / 共 55 条')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '下一页' }))
    expect(view.getByText('21–40 / 共 55 条')).toBeTruthy()
    fireEvent.change(view.getByRole('searchbox'), { target: { value: '后续线索55' } })
    expect(view.getByText('1–1 / 共 1 条')).toBeTruthy()
  })

  it('keeps reader knowledge separate from author truth, including search', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response()))
    const view = harness()
    await view.findByText('雾港来信')
    fireEvent.click(view.getByRole('button', { name: '时间线' }))
    expect(view.getByText('证人失踪')).toBeTruthy()
    expect(view.queryByText(/SECRET/)).toBeNull()
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'SECRET' } })
    expect(view.getByText('没有匹配的记录')).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '作者真相' }))
    expect(view.getByText('SECRET：证人藏在北塔')).toBeTruthy()
  })

  it('retains same-book content with a stale notice after failed refresh, and clears it on deletion', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 404 }))
    vi.stubGlobal('fetch', fetcher)
    const view = harness()
    await view.findByText('雾港来信')
    view.update('session-a', 1)
    await view.findByRole('alert')
    expect(view.getByText('雾港来信')).toBeTruthy()
    expect(view.getByRole('alert').textContent).toContain('上次读取')
    view.update('session-a', 2)
    await view.findByText(/还没有长篇追踪记录/)
    expect(view.queryByText('雾港来信')).toBeNull()
  })

  it('ignores late book and Session responses and never displays the previous book while loading', async () => {
    const first = Promise.withResolvers<Response>()
    const second = Promise.withResolvers<Response>()
    const third = Promise.withResolvers<Response>()
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
    vi.stubGlobal('fetch', fetcher)
    const view = harness()
    fireEvent.change(view.getByRole('combobox', { name: '小说' }), { target: { value: 'other' } })
    expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true)
    await act(async () => second.resolve(response(source.replace('雾港来信', '第二本书'))))
    await view.findByText('第二本书')
    await act(async () => first.resolve(response()))
    expect(view.queryByText('雾港来信')).toBeNull()
    view.update('session-b', 0)
    expect(view.queryByText('第二本书')).toBeNull()
    await act(async () => third.resolve(response(source.replace('雾港来信', '新会话作品'))))
    await view.findByText('新会话作品')
    const lastUrl = new URL(String(fetcher.mock.calls[2]![0]))
    expect(lastUrl.searchParams.get('sessionId')).toBe('session-b')
    expect(lastUrl.searchParams.get('path')).toBe('other/追踪/_tracking-state.json')
  })

  it('reports malformed state and aborts pending work on unmount', async () => {
    const pending = Promise.withResolvers<Response>()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response('{broken')).mockReturnValueOnce(pending.promise)
    vi.stubGlobal('fetch', fetcher)
    const view = harness()
    await view.findByRole('alert')
    expect(view.getByRole('alert').textContent).toContain('格式不受支持或内容损坏')
    expect(view.queryByText('500')).toBeNull()
    view.update('session-a', 1)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    view.unmount()
    expect(fetcher.mock.calls[1]![1]?.signal?.aborted).toBe(true)
    await act(async () => pending.resolve(response()))
  })

  it.each([t, tEn])('shows health risks on the overview and opens their sources', async translate => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response()))
    const view = harness({ translate })
    await view.findByRole('heading', { name: translate('dashboard.health.title') })
    expect(view.getByText(translate('dashboard.health.overdueForeshadow'))).toBeTruthy()
    expect(view.getByText(translate('dashboard.health.unscheduledForeshadow'))).toBeTruthy()
    expect(view.getByText(translate('dashboard.health.item', { id: 'F002', summary: '线索2：旧港钥匙' }))).toBeTruthy()
    expect(view.getByText(translate('dashboard.health.item', { id: 'F011', summary: '未定回收线索' }))).toBeTruthy()
    expect(view.getByText(translate('dashboard.health.legend', { planted: 30, character: 20, thread: 40, chapter: 501 }))).toBeTruthy()
    fireEvent.click(view.getAllByRole('button', { name: translate('dashboard.source', { path: '追踪/伏笔.md' }) })[0]!)
    expect(view.onSource).toHaveBeenCalledWith('神机诸天录/追踪/伏笔.md')
  })

  it('opens a stale character and an unrevealed timeline fact from the risk card', async () => {
    const state = JSON.parse(source)
    state.timeline.E001.updated_chapter = 400
    state.timeline.E001.first_recorded_chapter = 400
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response(JSON.stringify(state))))
    const view = harness()
    await view.findByRole('heading', { name: '风险' })
    expect(view.getByText('角色状态久未更新')).toBeTruthy()
    expect(view.getByText('林舟 · 调查员｜手臂受伤')).toBeTruthy()
    expect(view.getAllByText('长期未收的线索').length).toBeGreaterThan(0)
    expect(view.getByText('E001 · SECRET：证人藏在北塔')).toBeTruthy()
    expect(view.getByText('林舟 · 证人失踪')).toBeTruthy()
    fireEvent.click(view.getAllByRole('button', { name: '查看来源：追踪/角色状态/林舟.md' })[0]!)
    fireEvent.click(view.getByRole('button', { name: '查看来源：追踪/时间线/作者真相.md' }))
    expect(view.onSource).toHaveBeenCalledWith('神机诸天录/追踪/角色状态/林舟.md')
    expect(view.onSource).toHaveBeenCalledWith('神机诸天录/追踪/时间线/作者真相.md')
  })

  it('shows an empty risk card when nothing is past the thresholds', async () => {
    const state = JSON.parse(source)
    for (const row of Object.values(state.foreshadow) as { planned_resolution_chapter: number | null; planted_chapter: number; status: string }[]) {
      if (row.planned_resolution_chapter === null) row.planted_chapter = 490
      else if (row.planned_resolution_chapter < 501) row.planned_resolution_chapter = 600
    }
    state.timeline.E001.reveal_status = '已揭示'
    state.timeline.E001.reveal_chapter = 500
    state.characters['林舟'].open_threads = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response(JSON.stringify(state))))
    const view = harness()
    await view.findByText('暂无超阈值风险')
    expect(view.queryByText('逾期未回收')).toBeNull()
  })

  it('pages a long risk list without dropping later rows', async () => {
    const state = JSON.parse(source)
    state.foreshadow = {}
    state.characters['林舟'].open_threads = []
    state.timeline.E001.reveal_status = '已揭示'
    state.timeline.E001.reveal_chapter = 500
    state.timeline.E001.updated_chapter = 500
    for (let index = 1; index <= 25; index += 1) {
      const id = `F${String(index).padStart(3, '0')}`
      state.foreshadow[id] = {
        id, summary: `逾期线索${String(index)}`, planted_chapter: 1, planned_resolution_chapter: 2,
        status: '已埋', importance: '低', updated_chapter: 500,
      }
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response(JSON.stringify(state))))
    const view = harness()
    await view.findByText('1–20 / 共 25 条')
    expect(view.getByText('F001 · 逾期线索1')).toBeTruthy()
    expect(view.queryByText('F021 · 逾期线索21')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '下一页' }))
    expect(view.getByText('21–25 / 共 25 条')).toBeTruthy()
    expect(view.getByText('F025 · 逾期线索25')).toBeTruthy()
  })

  it('writes required onto this book only after confirmation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = new URL(String(input), 'http://localhost').searchParams.get('path') ?? ''
      if (path.endsWith('写作检查.json')) {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as { content: string; intent?: string }
          return new Response(JSON.stringify({ content: body.content, version: 'v2' }))
        }
        return new Response(JSON.stringify({ error: 'missing' }), { status: 404 })
      }
      return response()
    })
    vi.stubGlobal('fetch', fetcher)
    const view = harness()
    await view.findByText('雾港来信')
    fireEvent.click(view.getByText('写作门禁'))
    expect(await view.findByText('只改这本书的设定/写作检查.json，不改其他作品')).toBeTruthy()
    const setRequired = view.getAllByRole('button', { name: '设为 required' })[0]!
    fireEvent.click(setRequired)
    fireEvent.click(view.getByRole('button', { name: '确认修改这本书' }))
    await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(true))
    const saved = fetcher.mock.calls.find(([, init]) => init?.method === 'PUT')
    const body = JSON.parse(String(saved?.[1]?.body)) as { content: string; intent?: string }
    expect(body.intent).toBe('create')
    expect(JSON.parse(body.content)).toEqual({ rule_audit: 'required' })
    expect(new URL(String(saved?.[0]), 'http://localhost').searchParams.get('path')).toBe('神机诸天录/设定/写作检查.json')
    expect(writingCheckWithGate('{"punctuation":"preserve"}\n', 'facts_diff', 'off')).toContain('"facts_diff": "off"')
  })

  it('preserves source project paths and explains incomplete discovery', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation(async () => response()))
    const view = harness({ listing: { ...workspace, truncated: true } })
    await view.findByText('雾港来信')
    expect(view.getByText(/文件列表未完整显示/)).toBeTruthy()
    fireEvent.change(view.getByRole('combobox', { name: '小说' }), { target: { value: 'other' } })
    await view.findByText('雾港来信')
    fireEvent.click(view.getByRole('button', { name: '规划与来源' }))
    fireEvent.click(view.getByRole('button', { name: '大纲/卷纲.md' }))
    expect(view.onSource).toHaveBeenCalledWith('other/大纲/卷纲.md')
  })
})
