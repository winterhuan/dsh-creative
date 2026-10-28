// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyDesk } from '../src/client/desk.tsx'
import { ParentSettings } from '../src/client/forms.tsx'
import { LessonsPanel } from '../src/client/lessons-view.tsx'
import { en } from '../src/client/locales.ts'
import { dashboard } from '../src/dashboard.ts'
import { updateStudy } from '../src/learning/update/index.ts'
import { NOW, setup } from './fixtures.ts'

const t = (key: keyof typeof en) => en[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const ready = {
  id: 'om-1', status: 'ready' as const, createdAt: '2026-10-28T06:00:00.000Z', updatedAt: '2026-10-28T06:05:00.000Z',
  title: '凑十', requirement: '用凑十讲 8+7', base: 'http://localhost:3000',
  classroomId: 'room-1', url: 'http://localhost:3000/classroom/room-1',
  summary: { fetchedAt: '2026-10-28T07:00:00.000Z', outline: '先凑十再加', scenes: [{ title: '摆一摆', summary: '8 和 2 凑成 10' }] },
}

describe('interactive lesson desk', () => {
  it('opens an http classroom URL, copies it, and asks the tutor to retry or review', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const onRetry = vi.fn()
    const onReview = vi.fn()
    render(<LessonsPanel lessons={[
      ready,
      { ...ready, id: 'om-bad', title: '坏链接', url: 'javascript:alert(1)', classroomId: undefined, summary: undefined },
      { ...ready, id: 'om-fail', status: 'failed', title: '失败的课', url: undefined, classroomId: undefined, summary: undefined, retryable: true, runId: 'run-9', error: '生成中断' },
    ]} disabled={false} running={false} t={t} onGenerate={vi.fn()} onRetry={onRetry} onReview={onReview} />)
    expect(screen.getByText('http://localhost:3000/classroom/room-1')).toBeTruthy()
    expect(screen.queryByText('javascript:alert(1)')).toBeNull()
    expect(screen.getByText('先凑十再加')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.openmaicOpen }))
    expect(open).toHaveBeenCalledWith('http://localhost:3000/classroom/room-1', '_blank', 'noopener,noreferrer')
    fireEvent.click(screen.getByRole('button', { name: en.openmaicCopy }))
    expect(writeText).toHaveBeenCalledWith(ready.url)
    fireEvent.click(screen.getByRole('button', { name: en.openmaicRetry }))
    expect(onRetry).toHaveBeenCalledWith('run-9')
    fireEvent.click(screen.getByRole('button', { name: en.openmaicReview }))
    expect(onReview).toHaveBeenCalledWith('room-1')
  })

  it('asks the tutor to generate from the student page', async () => {
    const ask = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dashboard(updateStudy(undefined, setup, Date.now()), Date.now())), { headers: { 'content-type': 'application/json' } })))
    render(<StudyDesk sessionId="om" visible running={false} ask={ask} t={t} />)
    fireEvent.click(await screen.findByRole('button', { name: en.openLesson }))
    await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('references/openmaic.md'), undefined))
    expect(String(ask.mock.calls[0]?.[0])).toContain('单独一行')
    expect(String(ask.mock.calls[0]?.[0])).toContain('购物超市钱')
    expect(String(ask.mock.calls[0]?.[0])).toContain('interest-hooks.md')
    expect(String(ask.mock.calls[0]?.[0])).not.toContain('](')
  })

  it('saves an OpenMAIC address from parent setup', async () => {
    const change = vi.fn(async (command: unknown) => dashboard(updateStudy(updateStudy(undefined, setup, NOW), command, NOW + 1), NOW))
    render(<ParentSettings data={dashboard(updateStudy(undefined, setup, NOW), NOW)} change={change} t={t} />)
    const input = screen.getByLabelText(en.openmaicBase)
    fireEvent.change(input, { target: { value: 'http://127.0.0.1:3000/' } })
    const form = input.closest('form')
    if (!form) throw new Error('missing form')
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findAllByText('Saved')
    expect(change).toHaveBeenCalledWith({ action: 'openmaic-settings', baseUrl: 'http://127.0.0.1:3000/', parentConfirmation: en.openmaicConfirm }, 1)
  })

  it('pins go to class when a lesson is ready and shows generating', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const base = dashboard(updateStudy(undefined, setup, Date.now()), Date.now())
    const generating = { ...ready, id: 'om-gen', status: 'generating' as const, title: '正在生成', url: undefined, classroomId: undefined, summary: undefined }
    const body = { ...base, interactiveLessons: { ...base.interactiveLessons, lessons: [ready, generating] } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })))
    render(<StudyDesk sessionId="ready-lesson" visible running={false} ask={vi.fn()} t={t} />)
    expect(await screen.findByText(/Generating · 正在生成/)).toBeTruthy()
    expect((screen.getByRole('button', { name: en.openLesson }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: en.goToClass }))
    expect(open).toHaveBeenCalledWith(ready.url, '_blank', 'noopener,noreferrer')
  })

  it('saves interest tags from parent setup', async () => {
    const change = vi.fn(async (command: unknown) => dashboard(updateStudy(updateStudy(undefined, setup, NOW), command, NOW + 1), NOW))
    render(<ParentSettings data={dashboard(updateStudy(undefined, setup, NOW), NOW)} change={change} t={t} />)
    const input = screen.getByLabelText('Tag 6')
    fireEvent.change(input, { target: { value: '天文观测' } })
    const form = input.closest('form')
    if (!form) throw new Error('missing form')
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }))
    await screen.findAllByText('Saved')
    expect(change).toHaveBeenCalledWith({ action: 'interests', tags: ['购物超市钱', '运动球类', '动物宠物', '故事角色动画', '积木拼搭手工', '天文观测'], parentConfirmation: en.interestConfirm }, 1)
  })
})
