// @vitest-environment jsdom
/** Dual-tab workspace tree: rail shell, root expand, dirty confirm, save. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import { SessionId } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
import { WriterDesk } from '../src/client/desk.tsx'
import { zh } from '../src/client/locales.ts'

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
  const search = container.querySelector('.writer-search-slot input') as HTMLInputElement
  expect(search.disabled).toBe(false)
  expect(search.closest('[role="search"]')).toBeTruthy()
  expect(screen.getByPlaceholderText(zh.search)).toBeTruthy()
  expect((await screen.findAllByText(zh.healthOk)).length).toBeGreaterThan(0)
  expect(container.querySelector('.writer-workspace')?.textContent).toBe('ws')
  expect(container.querySelector('.writer-workspace')?.getAttribute('title')).toBe('/ws')
  expect(screen.getByText(zh.localWorkspace)).toBeTruthy()
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
  expect(screen.getByText(zh.countsSummary.replace('{libraries}', '1').replace('{projects}', '1').replace('{files}', filesLabel))).toBeTruthy()

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
  expect(crumbs.textContent).toContain('设定')
  expect(crumbs.textContent).toContain('世界观.md')
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
