// @vitest-environment jsdom
/** Dual-tab workspace tree: rail shell, root expand, dirty confirm, save. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  try { localStorage.clear() } catch { /* ignore */ }
})
import { WriterDesk } from '../src/client/desk.tsx'
import { zh } from '../src/client/locales.ts'
import {
  WRITER_RAIL_DEFAULT_WIDTH,
  WRITER_RAIL_HANDLE_WIDTH,
  WRITER_RAIL_MIN_WIDTH,
  WRITER_RAIL_STORAGE_KEY,
  WRITER_STAGE_MIN_WIDTH,
  fitRailWidth,
  readRailChrome,
} from '../src/client/rail-chrome.ts'

const cwd = '/ws'
const tree: Record<string, { name: string, type: 'file' | 'directory', size?: number }[]> = {
  '/ws': [
    { name: '拆文库', type: 'directory' },
    { name: 'novel', type: 'directory' },
  ],
  '/ws/拆文库': [{ name: '样本', type: 'directory' }],
  '/ws/拆文库/样本': [
    { name: '笔记.md', type: 'file' },
    { name: 'cover.png', type: 'file', size: 12 },
  ],
  '/ws/novel': [
    { name: '设定', type: 'directory' },
    { name: '正文', type: 'directory' },
    { name: 'meta.json', type: 'file' },
  ],
  '/ws/novel/设定': [{ name: '世界观.md', type: 'file' }],
  '/ws/novel/正文': [
    { name: '第001章.md', type: 'file' },
    { name: '第一卷', type: 'directory' },
  ],
  '/ws/novel/正文/第一卷': [{ name: '第002章.md', type: 'file' }],
}

function remote(): ClientRemote {
  return {
    workspaceFiles: {
      list: async (_session: string, path: string) => ({
        ok: true as const,
        value: { path, entries: tree[path] ?? [], truncated: false },
      }),
      readBytes: async (_session: string, absolutePath: string) => ({
        ok: true as const,
        value: {
          absolutePath,
          version: 'v1',
          offset: 0,
          data: new TextEncoder().encode(
            absolutePath.endsWith('世界观.md') ? '设定稿'
              : absolutePath.endsWith('meta.json') ? '{"k":1}'
                : '旧稿',
          ),
          eof: true,
        },
      }),
    },
  } as ClientRemote
}

it('uses left-rail shell, auto-expands roots, lazy-loads, and saves', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
    JSON.stringify({ path: 'novel/正文/第001章.md', bytes: 6, version: 'v2' }),
    { status: 200 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  const { container } = render(<WriterDesk sessionId={SessionId('session-1')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)

  expect(container.querySelector('.writer-rail')).toBeTruthy()
  expect(container.querySelector('.writer-stage')).toBeTruthy()
  expect(container.querySelector('.writer-masthead')).toBeTruthy()
  const mastheadActions = container.querySelector('.writer-masthead-actions')
  expect(mastheadActions).toBeTruthy()
  expect(mastheadActions?.querySelector('.writer-counts')).toBeTruthy()
  expect(mastheadActions?.querySelector('.writer-connection')).toBeTruthy()
  const search = container.querySelector('.writer-search-slot input') as HTMLInputElement
  expect(search.disabled).toBe(false)
  expect(search.closest('[role="search"]')).toBeTruthy()
  expect(screen.getByPlaceholderText(zh.search)).toBeTruthy()
  expect(await screen.findByText(zh.localOnly)).toBeTruthy()
  const connection = container.querySelector('.writer-connection')
  expect(connection?.getAttribute('data-health')).toBe('ok')
  expect(connection?.getAttribute('title')).toContain(zh.localWorkspace)
  expect(connection?.getAttribute('title')).toContain(zh.healthOk)
  expect(container.querySelector('.writer-status-dot')).toBeTruthy()
  expect(screen.getByText(new RegExp(zh.healthOk))).toBeTruthy()
  expect(container.querySelector('.writer-workspace')?.textContent).toBe('ws')
  expect(container.querySelector('.writer-workspace')?.getAttribute('title')).toBe('/ws')
  expect(screen.getByRole('button', { name: zh.reload })).toBeTruthy()
  expect(screen.getByTitle(zh.filesCountHint)).toBeTruthy()

  const librariesTab = await screen.findByRole('tab', { name: new RegExp(zh.libraries) })
  const projectsTab = screen.getByRole('tab', { name: new RegExp(zh.projects) })
  expect(librariesTab.textContent).toContain('1')
  expect(projectsTab.textContent).toContain('1')
  expect(librariesTab.getAttribute('aria-selected')).toBe('true')
  expect(librariesTab.getAttribute('aria-controls')).toBe('writer-workspace-panel')
  expect(librariesTab.classList.contains('writer-tab')).toBe(true)
  expect(container.querySelector('#writer-workspace-panel')?.getAttribute('role')).toBe('tabpanel')

  // Depth-0 root opens by default and lazy-loads children (no click).
  const sample = await screen.findByRole('button', { name: /样本/ })
  expect(sample.getAttribute('aria-expanded')).toBe('true')
  expect(await screen.findByRole('button', { name: '笔记.md' })).toBeTruthy()
  const png = screen.getByRole('button', { name: 'cover.png' })
  expect((png as HTMLButtonElement).disabled).toBe(true)
  const filesLabel = zh.filesLoaded.replace('{n}', '2')
  const counts = container.querySelector('.writer-counts')
  expect(counts?.getAttribute('aria-label')).toBe(
    zh.countsSummary.replace('{libraries}', '1').replace('{projects}', '1').replace('{files}', filesLabel),
  )
  expect(counts?.textContent).toContain(`1 ${zh.countLibraries}`)
  expect(counts?.textContent).toContain(`1 ${zh.countProjects}`)
  expect(counts?.textContent).toContain(`${filesLabel} ${zh.countFiles}`)

  fireEvent.click(projectsTab)
  const novel = await screen.findByRole('button', { name: /novel/ })
  expect(novel.getAttribute('aria-expanded')).toBe('true')
  expect(await screen.findByRole('button', { name: 'meta.json' })).toBeTruthy()
  expect(await screen.findByRole('button', { name: /设定/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /设定/ }))
  expect(await screen.findByRole('button', { name: '世界观.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '世界观.md' }))
  expect(await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })).toBeTruthy()
  const crumbs = screen.getByRole('navigation', { name: zh.breadcrumbs })
  expect(crumbs.textContent).toBe('novel / 设定 / 世界观.md')
  expect(crumbs.textContent).not.toContain('／')
  const pathLabel = container.querySelector('.writer-document-title')
  expect(pathLabel?.getAttribute('title')).toBe('novel/设定/世界观.md')
  expect(pathLabel?.textContent).toBe('世界观.md')
  expect(screen.getByLabelText(zh.toggleLineNumbers).getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.writer-line-gutter')).toBeTruthy()
  expect(screen.getByText(/UTF-8/)).toBeTruthy()
  expect(screen.getByText(/B$/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: /正文/ }))
  expect(await screen.findByRole('button', { name: '第001章.md' })).toBeTruthy()
  const volumeToggle = screen.getByRole('button', { name: /第一卷/ })
  expect(volumeToggle.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(volumeToggle)
  expect(await screen.findByRole('button', { name: '第002章.md' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '第001章.md' }))
  const editor = await screen.findByRole('textbox', { name: 'novel/正文/第001章.md' })
  fireEvent.change(editor, { target: { value: '新稿' } })
  fireEvent.click(screen.getByRole('button', { name: zh.save }))
  await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled() })
  const [url, init] = fetchMock.mock.calls[0] ?? []
  expect(String(url)).toContain('/writer/file')
  expect(JSON.parse(String(init?.body))).toEqual({ content: '新稿', baseVersion: 'v1' })
})

it('asks before switching files when the draft is dirty', async () => {
  render(<WriterDesk sessionId={SessionId('session-2')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(zh.projects) }))
  await screen.findByRole('button', { name: /novel/ })
  fireEvent.click(await screen.findByRole('button', { name: /设定/ }))
  fireEvent.click(await screen.findByRole('button', { name: '世界观.md' }))
  const editor = await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })
  fireEvent.change(editor, { target: { value: '脏稿' } })

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  fireEvent.click(await screen.findByRole('button', { name: 'meta.json' }))
  expect(confirm).toHaveBeenCalledWith(zh.confirmDiscard)
  expect(screen.getByRole('textbox', { name: 'novel/设定/世界观.md' })).toBeTruthy()

  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'meta.json' }))
  expect(await screen.findByRole('textbox', { name: 'novel/meta.json' })).toBeTruthy()
  confirm.mockRestore()
})

it('searches filenames, previews markdown, and saves with ⌘S', async () => {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ path: 'novel/设定/世界观.md', bytes: 6, version: 'v2' }),
    { status: 200 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  const { container } = render(<WriterDesk sessionId={SessionId('session-3')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)

  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(zh.projects) }))
  const search = screen.getByLabelText(zh.searchLabel)
  fireEvent.change(search, { target: { value: '世界观' } })
  expect(await screen.findByRole('button', { name: '世界观.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '世界观.md' }))
  const editor = await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })
  expect(screen.getByText(zh.dirtySaved)).toBeTruthy()
  expect(screen.getByText(/LF/)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: zh.modePreview }))
  expect(container.querySelector('.writer-preview')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.modeEdit }))

  const editArea = await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })
  fireEvent.change(editArea, { target: { value: '新设定' } })
  expect(screen.getByText(zh.dirtyPending)).toBeTruthy()
  fireEvent.keyDown(document, { key: 's', metaKey: true })
  await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled() })
  const [, init] = fetchMock.mock.calls[0] ?? []
  expect(JSON.parse(String(init?.body))).toEqual({ content: '新设定', baseVersion: 'v1' })
})

it('focuses search on ⌘K when the chat composer is not focused', async () => {
  render(<WriterDesk sessionId={SessionId('session-4')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  const search = await screen.findByLabelText(zh.searchLabel)
  expect(document.activeElement).not.toBe(search)
  fireEvent.keyDown(document, { key: 'k', metaKey: true })
  expect(document.activeElement).toBe(search)
})

it('shows a scan-failed banner with retry when the workspace root is unreadable', async () => {
  const failing: ClientRemote = {
    workspaceFiles: {
      list: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'down' } }),
      readBytes: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'down' } }),
    },
  } as ClientRemote
  render(<WriterDesk sessionId={SessionId('session-5')} cwd={cwd} remote={failing} t={key => zh[key]} visible />)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText(zh.scanFailed)).toBeTruthy()
  expect(screen.getAllByText(zh.healthFailed).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: zh.retryScan })).toBeTruthy()
})

it('shows a conflict dialog with keep and reload actions', async () => {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ error: 'version mismatch' }),
    { status: 412 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  render(<WriterDesk sessionId={SessionId('session-6')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(zh.projects) }))
  fireEvent.click(await screen.findByRole('button', { name: /设定/ }))
  fireEvent.click(await screen.findByRole('button', { name: '世界观.md' }))
  const editor = await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })
  fireEvent.change(editor, { target: { value: '冲突稿' } })
  fireEvent.click(screen.getByRole('button', { name: zh.save }))
  expect(await screen.findByRole('dialog', { name: zh.conflictTitle })).toBeTruthy()
  expect(screen.getByRole('button', { name: zh.conflictKeep })).toBeTruthy()
  expect(screen.getByRole('button', { name: zh.conflictReload })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.conflictKeep }))
  await vi.waitFor(() => {
    expect(screen.queryByRole('dialog', { name: zh.conflictTitle })).toBeNull()
  })
  expect((screen.getByRole('button', { name: zh.save }) as HTMLButtonElement).disabled).toBe(true)
})

it('lets empty tabs switch view and empty copy when both sides are 0', async () => {
  const emptyRemote: ClientRemote = {
    workspaceFiles: {
      list: async (_session: string, path: string) => ({
        ok: true as const,
        value: { path, entries: [], truncated: false },
      }),
      readBytes: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'n/a' } }),
    },
  } as ClientRemote
  render(<WriterDesk sessionId={SessionId('session-empty')} cwd={cwd} remote={emptyRemote} t={key => zh[key]} visible />)

  const librariesTab = await screen.findByRole('tab', { name: new RegExp(zh.libraries) })
  const projectsTab = screen.getByRole('tab', { name: new RegExp(zh.projects) })
  expect(librariesTab.textContent).toContain('0')
  expect(projectsTab.textContent).toContain('0')
  // Default when both empty: writing projects.
  expect(projectsTab.getAttribute('aria-selected')).toBe('true')
  expect(librariesTab.getAttribute('aria-selected')).toBe('false')
  expect(await screen.findByText(zh.emptyProjects)).toBeTruthy()

  fireEvent.click(librariesTab)
  expect(librariesTab.getAttribute('aria-selected')).toBe('true')
  expect(projectsTab.getAttribute('aria-selected')).toBe('false')
  expect(await screen.findByText(zh.emptyLibraries)).toBeTruthy()
  expect(screen.queryByText(zh.emptyProjects)).toBeNull()

  fireEvent.click(projectsTab)
  expect(projectsTab.getAttribute('aria-selected')).toBe('true')
  expect(librariesTab.getAttribute('aria-selected')).toBe('false')
  expect(await screen.findByText(zh.emptyProjects)).toBeTruthy()
  expect(screen.queryByText(zh.emptyLibraries)).toBeNull()
})


it('defaults the left rail width and persists collapse / resize chrome', async () => {
  const { container } = render(<WriterDesk sessionId={SessionId('session-rail')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  await screen.findByRole('tab', { name: new RegExp(zh.libraries) })

  const desk = container.querySelector('.writer-desk') as HTMLElement
  expect(desk.getAttribute('data-rail-collapsed')).toBeNull()
  expect(desk.style.getPropertyValue('--writer-rail-width')).toBe(`${String(WRITER_RAIL_DEFAULT_WIDTH)}px`)

  const rail = container.querySelector('.writer-rail') as HTMLElement
  const handle = container.querySelector('.writer-rail-resize') as HTMLElement
  const searchSlot = container.querySelector('.writer-search-slot') as HTMLElement
  const searchInput = searchSlot.querySelector('input') as HTMLInputElement
  expect(rail.hidden).toBe(false)
  expect(handle.hidden).toBe(false)
  expect(searchSlot).toBeTruthy()
  expect(searchInput).toBeTruthy()

  const toggle = screen.getByRole('button', { name: zh.collapseRail })
  expect(toggle.getAttribute('aria-expanded')).toBe('true')
  expect(toggle.getAttribute('aria-controls')).toBe('writer-rail')
  fireEvent.click(toggle)
  expect(desk.getAttribute('data-rail-collapsed')).toBe('true')
  expect(rail.hidden).toBe(true)
  expect(handle.hidden).toBe(true)
  expect(screen.queryByRole('tab', { name: new RegExp(zh.libraries) })).toBeNull()
  expect(screen.getByRole('button', { name: zh.expandRail }).getAttribute('aria-expanded')).toBe('false')
  expect(readRailChrome()).toEqual({ width: WRITER_RAIL_DEFAULT_WIDTH, collapsed: true })

  fireEvent.click(screen.getByRole('button', { name: zh.expandRail }))
  expect(desk.getAttribute('data-rail-collapsed')).toBeNull()
  expect(rail.hidden).toBe(false)
  expect(handle.hidden).toBe(false)
  expect(screen.getByRole('tab', { name: new RegExp(zh.libraries) })).toBeTruthy()

  expect(handle.getAttribute('role')).toBe('separator')
  expect(handle.getAttribute('aria-valuenow')).toBe(String(WRITER_RAIL_DEFAULT_WIDTH))
  fireEvent.keyDown(handle, { key: 'Home' })
  expect(desk.style.getPropertyValue('--writer-rail-width')).toBe(`${String(WRITER_RAIL_MIN_WIDTH)}px`)
  expect(readRailChrome().width).toBe(WRITER_RAIL_MIN_WIDTH)
  expect(localStorage.getItem(WRITER_RAIL_STORAGE_KEY)).toContain(String(WRITER_RAIL_MIN_WIDTH))
})

it('drags the rail resize handle to set width', async () => {
  const { container } = render(<WriterDesk sessionId={SessionId('session-drag')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  await screen.findByRole('tab', { name: new RegExp(zh.libraries) })
  const desk = container.querySelector('.writer-desk') as HTMLElement
  const handle = container.querySelector('.writer-rail-resize') as HTMLElement

  handle.setPointerCapture = vi.fn()
  handle.releasePointerCapture = vi.fn()
  handle.hasPointerCapture = vi.fn(() => true)

  fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 300 })
  fireEvent.pointerMove(handle, { pointerId: 7, clientX: 380 })
  fireEvent.pointerUp(handle, { pointerId: 7, clientX: 380 })

  expect(desk.style.getPropertyValue('--writer-rail-width')).toBe('300px')
  expect(readRailChrome()).toEqual({ width: 300, collapsed: false })
})

it('caps the CSS rail width when the desk is narrower than the preferred rail', async () => {
  const Original = globalThis.ResizeObserver
  class FakeObserver {
    callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      void target
      this.callback(
        [{ contentRect: { width: 200 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeObserver)
  try {
    const { container } = render(<WriterDesk sessionId={SessionId('session-fit')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
    await screen.findByRole('tab', { name: new RegExp(zh.libraries) })
    const desk = container.querySelector('.writer-desk') as HTMLElement
    const deskClientWidth = 200
    const expected = fitRailWidth(WRITER_RAIL_DEFAULT_WIDTH, deskClientWidth)
    expect(expected).toBeLessThan(WRITER_RAIL_MIN_WIDTH)
    expect(expected).toBeLessThan(WRITER_RAIL_DEFAULT_WIDTH)
    expect(expected).toBe(deskClientWidth - WRITER_RAIL_HANDLE_WIDTH - WRITER_STAGE_MIN_WIDTH) // rail shrinks with desk
    await waitFor(() => {
      expect(desk.style.getPropertyValue('--writer-rail-width')).toBe(`${String(expected)}px`)
    })
  } finally {
    vi.stubGlobal('ResizeObserver', Original)
  }
})
