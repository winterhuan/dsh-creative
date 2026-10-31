// @vitest-environment jsdom
/** Dual-tab workspace tree: expand roots lazily and save editable files. */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
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

it('shows library and project tabs, lazy-loads the real tree, and saves', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
    JSON.stringify({ path: 'novel/正文/第001章.md', bytes: 6, version: 'v2' }),
    { status: 200 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  render(<WriterDesk sessionId={SessionId('session-1')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)

  const librariesTab = await screen.findByRole('tab', { name: new RegExp(zh.libraries) })
  const projectsTab = screen.getByRole('tab', { name: new RegExp(zh.projects) })
  expect(librariesTab.textContent).toContain('1')
  expect(projectsTab.textContent).toContain('1')

  // Preferred view is libraries when any exist.
  expect(librariesTab.getAttribute('aria-selected')).toBe('true')
  expect(await screen.findByRole('button', { name: /样本/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /样本/ }))
  expect(await screen.findByRole('button', { name: '笔记.md' })).toBeTruthy()
  const png = screen.getByRole('button', { name: 'cover.png' })
  expect((png as HTMLButtonElement).disabled).toBe(true)

  fireEvent.click(projectsTab)
  expect(await screen.findByRole('button', { name: /novel/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /novel/ }))
  expect(await screen.findByRole('button', { name: 'meta.json' })).toBeTruthy()
  expect(await screen.findByRole('button', { name: /设定/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /设定/ }))
  expect(await screen.findByRole('button', { name: '世界观.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '世界观.md' }))
  expect(await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })).toBeTruthy()

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
