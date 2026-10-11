// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParentSettings } from '../src/client/forms.tsx'
import { StudyDesk } from '../src/client/desk.tsx'
import { dashboard } from '../src/dashboard.ts'
import { updateStudy } from '../src/learning.ts'
import { en } from '../src/client/locales.ts'
import { NOW, DAY, setup, start, attempt, mistake, confirm } from './fixtures.ts'

const t = (key: keyof typeof en) => en[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear() })
const answerTask = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt }
const initial = () => updateStudy(updateStudy(updateStudy(undefined, setup, Date.now()), start, Date.now()), { action: 'task', task: answerTask }, Date.now())

function installFetch(state = initial()) {
  const requests: { revision: number; change: unknown }[] = []
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.startsWith('/student/print?')) return new Response(JSON.stringify({ receipt: 'request id is HP_DeskJet_4900-123' }))
    if (options?.body) {
      const body = JSON.parse(String(options.body)); requests.push(body)
      if (body.revision !== state.revision) return new Response(JSON.stringify({ error: '学习档案已更新' }), { status: 409 })
      state = updateStudy(state, body.change, Date.now())
    }
    const query = new URL(url, 'http://localhost').searchParams
    const offset = Number(query.get('mistakeOffset') ?? 0)
    const subject = query.get('subject') as 'chinese' | 'math' | 'english' | null
    const status = query.get('mistakeStatus') as 'all' | 'due' | 'reviewing' | 'mastered' | null
    const mapGrade = query.get('mapGrade')
    const mapTerm = query.get('mapTerm') as 'first' | 'second' | null
    return new Response(JSON.stringify(dashboard(state, Date.now(), { subject: subject ?? 'math', mistakeOffset: offset, mistakeStatus: status ?? 'all', ...(mapGrade ? { mapGrade: Number(mapGrade) } : {}), ...(mapTerm ? { mapTerm } : {}) })))
  })
  vi.stubGlobal('fetch', fetch)
  return { requests, fetch, read: () => state }
}

function worksheetState() {
  let state = updateStudy(undefined, setup, NOW)
  state = updateStudy(state, { action: 'concept', concept: { id: 'ten', subject: 'math', name: '凑十', definition: '先组成十', example: '8+2=10', source: '课本' } }, NOW)
  state = updateStudy(state, { action: 'confirm-concept', id: 'ten', userConfirmation: '家长核对' }, NOW)
  state = updateStudy(state, { action: 'objective', objective: { id: 'add', subject: 'math', title: '凑十加法', goal: '解释步骤', conceptIds: ['ten'], method: 'represent' } }, NOW)
  state = updateStudy(state, { action: 'mistake', mistake }, NOW)
  state = updateStudy(state, confirm, NOW)
  state = updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'add' }, NOW)
  return updateStudy(state, { action: 'worksheet', worksheet: { id: 'sheet', subject: 'math', objectiveId: 'add', items: [{ id: 'q1', mistakeId: mistake.id, prompt: '请计算 9+6。', answer: '15', explanation: '先凑十。', answerEvidence: '9+1+5=15' }] } }, NOW)
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
    await screen.findByText(`My answer: ${attempt.response}`)
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
  expect(screen.getByRole('heading', { name: 'Confirmed mistakes · Math · 1' })).toBeTruthy()
  fireEvent.click(screen.getByText('Blurry addition'))
  expect(screen.getByText('Question: 8 + 7?')).toBeTruthy()
  expect(screen.getByText('Original answer: 13')).toBeTruthy()
  expect(backend.read().mistakes[0]).toMatchObject({ prompt: '8 + 7?', learnerAnswer: '13', uncertainties: '' })
})

it('keeps separate subject notebooks with their own counts and pages', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const state = updateStudy(undefined, setup, NOW)
  state.mistakes = Array.from({ length: 21 }, (_, index) => ({ ...mistake, id: `error-${index}`, topic: `Topic ${index}`, confirmedAt: NOW, dueAt: NOW + DAY, userConfirmation: 'Parent checked', uncertainties: '', stage: 0, independentDays: [] }))
  state.mistakes.push(...Array.from({ length: 2 }, (_, index) => ({ ...mistake, id: `chinese-${index}`, subject: 'chinese' as const, topic: `Chinese topic ${index}`, confirmedAt: NOW, dueAt: NOW + DAY, userConfirmation: 'Parent checked', uncertainties: '', stage: 0, independentDays: [] })))
  state.mistakes.push({ ...mistake, id: 'english-0', subject: 'english', topic: 'English topic', confirmedAt: NOW, dueAt: NOW + DAY, userConfirmation: 'Parent checked', uncertainties: '', stage: 0, independentDays: [] })
  state.mistakes.push({ ...mistake, id: 'pending', stage: 0, independentDays: [] })
  const backend = installFetch(state)
  render(<StudyDesk sessionId="notebook" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByRole('button', { name: 'Start learning' })
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  expect(screen.getByRole('heading', { name: 'Confirmed mistakes · Math · 21' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Chinese' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'English' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Due for review · 0' })).toBeTruthy()
  const entry = screen.getByText('Topic 20').closest('details')!
  fireEvent.click(within(entry).getByText('Topic 20'))
  expect(within(entry).getByText(`Corrected answer: ${mistake.correction}`)).toBeTruthy()
  expect(within(entry).getByText(`Answer evidence: ${mistake.answerEvidence}`)).toBeTruthy()
  expect(within(entry).getByText(/Next review:/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByText('Topic 0')
  expect(screen.queryByText('Topic 20')).toBeNull()
  expect(screen.getByText('Page 2 / 2')).toBeTruthy()
  expect(backend.fetch).toHaveBeenCalledWith(expect.stringContaining('mistakeOffset=20'), expect.anything())
  fireEvent.click(screen.getByRole('button', { name: 'Chinese' }))
  await screen.findByText('Chinese topic 1')
  expect(screen.getByRole('heading', { name: 'Confirmed mistakes · Chinese · 2' })).toBeTruthy()
  expect(screen.queryByText('Topic 0')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  await screen.findByText('English topic')
  expect(screen.queryByText('Chinese topic 1')).toBeNull()
  expect(backend.fetch).toHaveBeenCalledWith(expect.stringContaining('mistakeOffset=0&subject=english'), expect.anything())
})

it('confirms a concept before showing it as a learning goal source', async () => {
  let state = updateStudy(undefined, setup, NOW)
  state = updateStudy(state, { action: 'concept', concept: { id: 'ten', subject: 'math', name: '凑十', definition: '先组成十', example: '8+2=10', source: '课本' } }, NOW)
  const backend = installFetch(state)
  render(<StudyDesk sessionId="concept" visible running={false} ask={vi.fn()} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Knowledge map' }))
  fireEvent.click(await screen.findByText('凑十 · Awaiting parent review'))
  fireEvent.change(screen.getByLabelText('Parent confirmation'), { target: { value: '家长核对概念定义' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm concept' }))
  await waitFor(() => expect(backend.read().concepts[0]?.confirmedAt).toBeDefined())
  expect(backend.read().concepts[0]?.userConfirmation).toBe('家长核对概念定义')
})

it('shows a different learning method for each selected subject', async () => {
  installFetch(updateStudy(undefined, setup, NOW))
  render(<StudyDesk sessionId="subjects" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByText(en.mathMethod)
  fireEvent.click(screen.getByRole('button', { name: 'Chinese' }))
  await screen.findByText(en.chineseMethod)
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  await screen.findByText(en.englishMethod)
})

it('starts foundation practice with the learner-selected knowledge goal', async () => {
  const backend = installFetch(worksheetState())
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="goal" visible running={false} ask={ask} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Knowledge map' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Practise this goal · 凑十加法' }))
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  await screen.findByText('Learning goal: 凑十加法')
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('add'), undefined))
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'foundation' })
})

it.skipIf(process.platform === 'win32')('requires PDF preview and confirmation before submitting a print job', async () => {
  const confirmPrint = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
  vi.stubGlobal('confirm', confirmPrint)
  const backend = installFetch(worksheetState())
  render(<StudyDesk sessionId="paper" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByRole('button', { name: 'Start learning' })
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  fireEvent.click(screen.getByText('凑十加法 · 1 questions · Checked 0/1'))
  const print = screen.getByRole('button', { name: 'Send to printer' }) as HTMLButtonElement
  expect(print.disabled).toBe(true)
  fireEvent.click(screen.getByRole('link', { name: 'Preview PDF' }))
  expect(print.disabled).toBe(false)
  fireEvent.click(print)
  expect(backend.fetch.mock.calls.some(([url]) => String(url).startsWith('/student/print?'))).toBe(false)
  fireEvent.click(print)
  await screen.findByText('Queued: request id is HP_DeskJet_4900-123')
  expect(confirmPrint).toHaveBeenCalledTimes(2)
  expect(backend.fetch).toHaveBeenCalledWith(expect.stringContaining('/student/print?'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('"confirmed":true') }))
})

it('requires an explicit school year and saves an empty optional course note', async () => {
  const change = vi.fn(async (command: unknown) => dashboard(updateStudy(undefined, command, NOW), NOW))
  render(<ParentSettings data={dashboard(undefined, NOW)} change={change} t={t} />)
  const year = screen.getByRole('combobox', { name: 'School year' }) as HTMLSelectElement
  expect(year.value).toBe('')
  expect(year.validity.valueMissing).toBe(true)
  expect([...year.options].map(option => option.value)).toContain('2026–2027')
  fireEvent.change(year, { target: { value: '2026–2027' } })
  fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: '小禾' } })
  fireEvent.change(screen.getByLabelText('Parent confirmation'), { target: { value: '家长确认以上档案和时长' } })
  expect((screen.getByLabelText('Course note (optional)') as HTMLInputElement).required).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved')
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ action: 'setup', profile: expect.objectContaining({ schoolYear: '2026–2027', schoolAlias: '' }) }), 0)
})

it('offers the preceding school year before September without silently selecting it', () => {
  const beforeSeptember = Date.parse('2026-08-31T23:00:00+08:00')
  render(<ParentSettings data={dashboard(undefined, beforeSeptember)} change={vi.fn()} t={t} />)
  const year = screen.getByRole('combobox', { name: 'School year' }) as HTMLSelectElement
  expect(year.value).toBe('')
  expect([...year.options].map(option => option.value)).toEqual(['', '2026–2027', '2025–2026', '2024–2025', '2023–2024', '2022–2023', '2021–2022', '2020–2021'])
})

it('carries the due subject into review without starting until the learner chooses', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW - DAY)
  state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, subject: 'english' } }, NOW - DAY)
  state = updateStudy(state, confirm, NOW - DAY)
  const backend = installFetch(state)
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="review" visible running={false} ask={ask} t={t} />)
  await screen.findByRole('button', { name: 'Start learning' })
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Due review · English' }))
  expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByRole('combobox', { name: 'Learning mode' }) as HTMLSelectElement).value).toBe('review')
  expect(backend.requests).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
  await waitFor(() => expect(ask).toHaveBeenCalledOnce())
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'english', mode: 'review' })
})

it('keeps due review unavailable during a break', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW - DAY)
  state = updateStudy(state, { action: 'mistake', mistake }, NOW - DAY)
  state = updateStudy(state, confirm, NOW - DAY)
  state = updateStudy(state, start, NOW)
  state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW)
  const backend = installFetch(state)
  render(<StudyDesk sessionId="break" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByText(/Take a break away/)
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  expect((screen.getByRole('button', { name: 'Due review · Math' }) as HTMLButtonElement).disabled).toBe(true)
  expect(backend.requests).toHaveLength(0)
})

it('shows the saved answer with feedback and offers the next question', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = initial()
  state = updateStudy(state, { action: 'answer', taskId: attempt.id, response: attempt.response }, NOW)
  state = updateStudy(state, { action: 'record', attempt }, NOW)
  installFetch(state)
  render(<StudyDesk sessionId="feedback" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByText(`My answer: ${attempt.response}`)
  expect(screen.getByText(attempt.feedback)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Next question' })).toBeTruthy()
  expect(screen.getByText('Time left today: 20:00 · Due for review: 0 · Weak points: 0')).toBeTruthy()
})

it('uses the server clock immediately without showing more than the block limit', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const serverNow = NOW + 5000
  const state = updateStudy(updateStudy(undefined, setup, serverNow), start, serverNow)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dashboard(state, serverNow)))))
  render(<StudyDesk sessionId="clock" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByText('Time left: 10:00')
  expect(screen.getByText('Time left today: 20:00 · Due for review: 0 · Weak points: 0')).toBeTruthy()
})

it('shows the knowledge map and mistake book on the main tab and starts the recommended review', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW - DAY)
  state = updateStudy(state, { action: 'mistake', mistake }, NOW - DAY)
  state = updateStudy(state, confirm, NOW - DAY)
  const backend = installFetch(state)
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="main" visible running={false} ask={ask} t={t} />)
  await screen.findByRole('heading', { name: 'Knowledge map · Math' })
  expect(screen.getByText('乘法初步 · Mastered 0/2')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Confirmed mistakes · Math' })).toBeTruthy()
  expect(screen.getByText('Due: 1 · Reviewing: 0 · Consolidated: 0 · Awaiting confirmation: 0')).toBeTruthy()
  expect(screen.getByText('Review due mistakes first · Math')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Open knowledge map' }))
  await screen.findByRole('heading', { name: '数学二年级上册知识地图' })
  expect(screen.getByRole('heading', { name: 'Concept relations · 9' })).toBeTruthy()
  fireEvent.click(screen.getByText('乘法初步 · Mastered 0/2'))
  fireEvent.click(screen.getByText('乘法的意义 · Not started'))
  expect(screen.getByText('Definition: 求几个相同加数的和，可以用乘法，比连加更简便。')).toBeTruthy()
  expect(screen.getAllByText(/乘法的意义 · Prerequisite for · 2、4、8的乘法口诀/).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Start now' }))
  await waitFor(() => expect(ask).toHaveBeenCalledOnce())
  expect(ask.mock.calls[0]?.[0]).toContain('到期错题')
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'review' })
})

it('surfaces a weak knowledge point and starts practice around it', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW - 2 * DAY)
  state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, objectiveId: 'm2a-o-tables' } }, NOW - 2 * DAY)
  state = updateStudy(state, confirm, NOW - 2 * DAY)
  const backend = installFetch(state)
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="weak" visible running={false} ask={ask} t={t} />)
  await screen.findByText('Time left today: 20:00 · Due for review: 1 · Weak points: 1')
  fireEvent.click(screen.getByText('Weak points · 1'))
  expect(screen.getByText('Math · 熟记并运用2～9的乘法口诀 · Review due')).toBeTruthy()
  expect(screen.getByText('Mistakes due for review 1 · Open mistakes not yet reviewed 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Practise this goal · 熟记并运用2～9的乘法口诀' }))
  await screen.findByText('Learning goal: 熟记并运用2～9的乘法口诀')
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('m2a-o-tables'), undefined))
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'foundation' })
})

it('filters the mistake book by review status', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const state = updateStudy(undefined, setup, NOW)
  state.mistakes = [
    { ...mistake, id: 'due-1', topic: 'Due topic', confirmedAt: NOW - DAY, dueAt: NOW - 1, userConfirmation: 'Parent checked', uncertainties: '', stage: 0, independentDays: [] },
    { ...mistake, id: 'done-1', topic: 'Consolidated topic', confirmedAt: NOW - DAY, dueAt: NOW + 30 * DAY, userConfirmation: 'Parent checked', uncertainties: '', stage: 4, independentDays: ['2026-10-01'] },
  ]
  const backend = installFetch(state)
  render(<StudyDesk sessionId="filter" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByRole('button', { name: 'Start learning' })
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  expect(screen.getByRole('heading', { name: 'Confirmed mistakes · Math · 2' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Consolidated · 1' }))
  await screen.findByRole('heading', { name: 'Confirmed mistakes · Math · 1' })
  expect(screen.getByText('Consolidated topic · Consolidated')).toBeTruthy()
  expect(screen.queryByText('Due topic · Due now')).toBeNull()
  expect(backend.fetch).toHaveBeenCalledWith(expect.stringContaining('mistakeStatus=mastered'), expect.anything())
  fireEvent.click(screen.getByRole('button', { name: 'Due · 1' }))
  await screen.findByText('Due topic · Due now')
  expect(screen.queryByText('Consolidated topic · Consolidated')).toBeNull()
})

it('lets the learner tap a choice as the answer', async () => {
  const choiceTask = { ...answerTask, choices: ['15', '14', '16'] }
  const backend = installFetch(updateStudy(updateStudy(updateStudy(undefined, setup, Date.now()), start, Date.now()), { action: 'task', task: choiceTask }, Date.now()))
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="choice" visible running={false} ask={ask} t={t} />)
  await screen.findByText('Tap an answer')
  expect(screen.queryByLabelText('My answer')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '15' }))
  await waitFor(() => expect(backend.read().task?.response).toBe('15'))
  expect(ask).toHaveBeenCalledOnce()
  await screen.findByText('My answer: 15')
})

it('browses another grade and term on the knowledge map without goal buttons', async () => {
  const backend = installFetch(updateStudy(undefined, setup, NOW))
  render(<StudyDesk sessionId="browse" visible running={false} ask={vi.fn()} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Knowledge map' }))
  await screen.findByRole('heading', { name: '数学二年级上册知识地图' })
  expect(screen.getAllByRole('button', { name: /Practise this goal/ }).length).toBeGreaterThan(0)
  fireEvent.change(screen.getByRole('combobox', { name: 'Grade' }), { target: { value: '1' } })
  await screen.findByRole('heading', { name: '数学一年级上册知识地图' })
  expect(screen.getByText(/Browsing another grade or term/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Practise this goal/ })).toBeNull()
  expect(backend.fetch).toHaveBeenCalledWith(expect.stringContaining('mapGrade=1'), expect.anything())
  fireEvent.change(screen.getByRole('combobox', { name: 'Term' }), { target: { value: 'second' } })
  await screen.findByRole('heading', { name: '数学一年级下册知识地图' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to current term' }))
  await screen.findByRole('heading', { name: '数学二年级上册知识地图' })
})

it('links worksheets to their source mistakes and shows review stages', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  installFetch(worksheetState())
  render(<StudyDesk sessionId="links" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByRole('button', { name: 'Start learning' })
  fireEvent.click(screen.getByRole('button', { name: 'Mistakes' }))
  fireEvent.click(screen.getByText('凑十加法 · 1 questions · Checked 0/1'))
  expect(screen.getByText('1. 请计算 9+6。 · Source mistake: 加法 · Not checked yet')).toBeTruthy()
  fireEvent.click(screen.getByText('加法'))
  expect(screen.getByText(/Review stage: 1 \/ 5/)).toBeTruthy()
  expect(screen.getByText('Related worksheets: 凑十加法 · Checked 0/1')).toBeTruthy()
})

it('offers a recurring check-in and starts it as a diagnose block', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const backend = installFetch(updateStudy(undefined, setup, NOW - DAY))
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="checkin" visible running={false} ask={ask} t={t} />)
  await screen.findByRole('heading', { name: 'Learning check-in · Math' })
  expect(screen.getByText('No check-in yet')).toBeTruthy()
  expect(screen.getByText(/A check-in is suggested · This round probes: 把同数连加改写成乘法算式并说明意义/)).toBeTruthy()
  expect(screen.getByText('Start with a check-in to find direction · Chinese')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Start check-in' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('kind=diagnose'), undefined))
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'diagnose' })
})
