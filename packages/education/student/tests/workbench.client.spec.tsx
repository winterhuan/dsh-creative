// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudyDesk } from '../src/client/desk.tsx'
import { dashboard } from '../src/dashboard.ts'
import { updateStudy } from '../src/learning.ts'
import { en } from '../src/client/locales.ts'
import { NOW, setup, start, attempt } from './fixtures.ts'

const t = (key: keyof typeof en) => en[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const answerTask = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt }
const initial = () => updateStudy(updateStudy(updateStudy(undefined, setup, Date.now()), start, Date.now()), { action: 'task', task: answerTask }, Date.now())

function installFetch(state = initial()) {
  const requests: { revision: number; change: unknown }[] = []
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.body) {
      const body = JSON.parse(String(options.body)); requests.push(body)
      if (body.revision !== state.revision) return new Response(JSON.stringify({ error: '学习档案已更新' }), { status: 409 })
      state = updateStudy(state, body.change, Date.now())
    }
    return new Response(JSON.stringify(dashboard(state, Date.now())))
  })
  vi.stubGlobal('fetch', fetch)
  return { requests, fetch, read: () => state }
}

describe('learning workbench', () => {
  it('saves the original answer before native tutoring and recovers it after remount', async () => {
    const backend = installFetch()
    const ask = vi.fn().mockRejectedValue(new Error('Tutor unavailable'))
    const view = render(<StudyDesk sessionId="one" visible running={false} ask={ask} t={t} />)
    await screen.findByText(attempt.prompt)
    fireEvent.change(screen.getByLabelText('My answer'), { target: { value: attempt.response } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }))
    await screen.findByText('Tutor unavailable')
    expect(backend.read().task?.response).toBe(attempt.response)
    expect(ask).toHaveBeenCalledTimes(1)
    view.unmount()
    render(<StudyDesk sessionId="two" visible running={false} ask={ask} t={t} />)
    await screen.findByText(attempt.response)
    expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull()
    expect(backend.requests).toHaveLength(1)
  })

  it('records a hint and permits stopping even while the tutor is running', async () => {
    const backend = installFetch()
    const ask = vi.fn().mockResolvedValue(undefined)
    const view = render(<StudyDesk sessionId="one" visible running={false} ask={ask} t={t} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Give me a hint' }))
    await waitFor(() => expect(backend.read().task?.hintRequested).toBe(true))
    view.rerender(<StudyDesk sessionId="one" visible running ask={ask} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Finish and rest' }))
    await screen.findByText(/Take a break away/)
    expect(backend.read().sessions[0]?.endedAt).toBeDefined()
    expect(backend.read().rewards).toEqual([])
  })

  it('blocks answers for an expired block and does not offer a new start during the break', async () => {
    let state = updateStudy(updateStudy(updateStudy(undefined, setup, NOW), start, NOW), { action: 'task', task: answerTask }, NOW)
    const backend = installFetch(state)
    const view = render(<StudyDesk sessionId="one" visible running={false} ask={vi.fn()} t={t} />)
    const submit = await screen.findByRole('button', { name: 'Submit answer' })
    expect(submit.closest('fieldset')?.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Start learning' })).toBeNull()
    view.unmount()
    state = updateStudy(backend.read(), { action: 'stop', sessionId: start.id, reflection: '' }, Date.now())
    installFetch(state)
    render(<StudyDesk sessionId="two" visible running={false} ask={vi.fn()} t={t} />)
    await screen.findByText(/Take a break away/)
    expect(screen.queryByRole('button', { name: 'Start learning' })).toBeNull()
  })

  it('does not poll hidden tabs and aborts a pending read on session removal', async () => {
    let signal: AbortSignal | undefined
    let finish: (response: Response) => void = () => { throw new Error('Request not started') }
    const fetch = vi.fn((_url: string, options: RequestInit) => { signal = options.signal ?? undefined; return new Promise<Response>(resolve => { finish = resolve }) })
    vi.stubGlobal('fetch', fetch)
    const view = render(<StudyDesk sessionId="one" visible={false} running={false} ask={vi.fn()} t={t} />)
    expect(fetch).not.toHaveBeenCalled()
    view.rerender(<StudyDesk sessionId="one" visible running={false} ask={vi.fn()} t={t} />)
    expect(fetch).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => finish(new Response(JSON.stringify(dashboard(initial(), Date.now())))))
    expect(screen.queryByText(attempt.prompt)).toBeNull()
  })
})

it('allows editing and explicitly confirming an image transcription including the original answer', async () => {
  const state = updateStudy(updateStudy(undefined, setup, Date.now()), { action: 'mistake', mistake: { id: 'image-1', subject: 'math', topic: 'Blurry addition', prompt: '8 + ?', learnerAnswer: '14', correction: '15', explanation: 'Make ten', answerEvidence: '8+2+5=15', uncertainties: 'Check second digit' } }, Date.now())
  const backend = installFetch(state)
  render(<StudyDesk sessionId="one" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByRole('button', { name: 'Start learning' })
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  fireEvent.click(screen.getByText('Blurry addition'))
  fireEvent.change(screen.getByLabelText('Question'), { target: { value: '8 + 7?' } })
  fireEvent.change(screen.getByLabelText('Original answer'), { target: { value: '13' } })
  fireEvent.click(screen.getByLabelText('I checked the original question, correction and evidence and resolved all uncertainties'))
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and schedule review' }))
  await screen.findByRole('heading', { name: 'Awaiting confirmation · 0' })
  expect(backend.read().mistakes[0]).toMatchObject({ prompt: '8 + 7?', learnerAnswer: '13', uncertainties: '' })
})
