// @vitest-environment jsdom
/** The writing sidebar lists a book and saves chapter text with the read version. */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
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
  '/ws/novel/正文': [{ name: '第001章.md', type: 'file' }],
}

function remote(): ClientRemote {
  return {
    workspaceFiles: {
      list: async (_session: string, path: string) => ({
        ok: true as const,
        value: { path, entries: tree[path] ?? [], truncated: false },
      }),
      readBytes: async () => ({
        ok: true as const,
        value: {
          absolutePath: '/ws/novel/正文/第001章.md',
          version: 'v1',
          offset: 0,
          data: new TextEncoder().encode('旧稿'),
          eof: true,
        },
      }),
    },
  } as ClientRemote
}

it('edits a chapter and sends the last read version', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ path: 'novel/正文/第001章.md', bytes: 6, version: 'v2' }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  render(<WriterDesk sessionId={SessionId('session-1')} cwd={cwd} remote={remote()} t={key => zh[key]} visible />)
  expect(await screen.findByRole('button', { name: '第001章.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.setting }))
  expect(await screen.findByRole('button', { name: '世界观.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: zh.chapters }))
  const chapter = await screen.findByRole('button', { name: '第001章.md' })
  fireEvent.click(chapter)
  const editor = await screen.findByRole('textbox', { name: 'novel/正文/第001章.md' })
  fireEvent.change(editor, { target: { value: '新稿' } })
  fireEvent.click(screen.getByRole('button', { name: zh.save }))
  await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalled() })
  const [url, init] = fetchMock.mock.calls[0] ?? []
  expect(String(url)).toContain('/writer/file')
  expect(JSON.parse(String(init?.body))).toEqual({ content: '新稿', baseVersion: 'v1' })
})
