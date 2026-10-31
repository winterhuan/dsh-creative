// @vitest-environment jsdom
/** The writing sidebar lists a book tree and saves chapter text with the read version. */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import { SessionId } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { WriterDesk } from '../src/client/desk.tsx'
import { zh } from '../src/client/locales.ts'

const cwd = '/ws'
const tree: Record<string, { name: string, type: 'file' | 'directory' }[]> = {
  '/ws': [{ name: 'novel', type: 'directory' }],
  '/ws/novel': [
    { name: '设定', type: 'directory' },
    { name: '正文', type: 'directory' },
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
          data: new TextEncoder().encode(absolutePath.endsWith('世界观.md') ? '设定稿' : '旧稿'),
          eof: true,
        },
      }),
    },
  } as ClientRemote
}

it('navigates the section tree and saves a chapter with the last read version', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ path: 'novel/正文/第001章.md', bytes: 6, version: 'v2' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<WriterDesk sessionId={SessionId('session-1')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  expect(await screen.findByRole('navigation', { name: zh.tree })).toBeTruthy()
  expect(await screen.findByRole('button', { name: zh.setting })).toBeTruthy()
  expect(screen.getByRole('button', { name: zh.chapters })).toBeTruthy()
  expect(await screen.findByRole('button', { name: '第001章.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.setting }))
  // collapsing setting should hide its file; chapters stay open by default
  expect(screen.queryByRole('button', { name: '世界观.md' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: zh.setting }))
  expect(await screen.findByRole('button', { name: '世界观.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '世界观.md' }))
  expect(await screen.findByRole('textbox', { name: 'novel/设定/世界观.md' })).toBeTruthy()
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
