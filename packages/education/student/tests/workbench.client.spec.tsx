// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ParentSettings } from '../src/client/forms.tsx'
import { StudyDesk } from '../src/client/desk.tsx'
import { dashboard } from '../src/dashboard.ts'
import { timeStatus } from '../src/learning/status.ts'
import { updateStudy } from '../src/learning/update/index.ts'
import { en } from '../src/client/locales.ts'
import { NOW, MINUTE, DAY, setup, material, course, start, attempt, mistake, confirm } from './fixtures.ts'

const t = (key: keyof typeof en) => en[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear() })
const answerTask = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt }
const initial = () => updateStudy(updateStudy(updateStudy(undefined, setup, Date.now()), start, Date.now()), { action: 'task', task: answerTask }, Date.now())

function installFetch(state = initial()) {
  const requests: { revision: number; change: unknown }[] = []
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.body) {
      const body = JSON.parse(String(options.body)); requests.push(body)
      if (body.revision !== state.revision) return new Response(JSON.stringify({ error: '学习档案已更新' }), { status: 409 })
      state = updateStudy(state, body.change, Date.now())
    }
    const query = new URL(url, 'http://localhost').searchParams
    if (query.has('revision') && Number(query.get('revision')) === state.revision && !options?.body) {
      return new Response(JSON.stringify({ serverNow: Date.now(), revision: state.revision, unchanged: true, time: timeStatus(state, Date.now()) }))
    }
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

async function openDesk(tab: 'Knowledge map' | 'Mistakes' | 'Parent setup') {
  fireEvent.click(await screen.findByRole('button', { name: 'Parent' }))
  fireEvent.click(screen.getByRole('button', { name: tab }))
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
    await waitFor(() => expect(backend.read().task?.hintLevel).toBe(1))
    expect(String(ask.mock.calls[0]?.[0])).not.toContain('不会做时先教')
    fireEvent.click(screen.getByRole('button', { name: 'Another hint' }))
    await waitFor(() => expect(backend.read().task?.hintLevel).toBe(2))
    expect(String(ask.mock.calls[1]?.[0])).toContain('不会做时先教')
    view.rerender(<StudyDesk sessionId="one" visible running ask={ask} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: 'Finish and rest' }))
    await screen.findByText(/Take a break away/)
    expect(backend.read().sessions[0]?.endedAt).toBeDefined()
    expect(backend.read().rewards).toEqual([])
  })

  it('records 不会 from the task and sends a hinted-correct grade', async () => {
  const backend = installFetch()
  const ask = vi.fn().mockResolvedValue(undefined)
  const view = render(<StudyDesk sessionId="stuck" visible running={false} ask={ask} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: en.wont }))
  await waitFor(() => expect(backend.read().attempts[0]).toMatchObject({ result: 'stuck', response: '不会' }))
  expect(String(ask.mock.calls[0]?.[0])).toContain('不会做时先教')
  view.unmount()
  const sheet = updateStudy(worksheetState(), { action: 'worksheet', worksheet: { id: 'pair', subject: 'math', objectiveId: 'add', items: [
    { id: 'a', prompt: '请计算 9+6。', answer: '15', explanation: '先凑十。', answerEvidence: '9+1+5=15' },
  ] } }, NOW)
  const graded = installFetch(sheet)
  render(<StudyDesk sessionId="hinted-grade" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
  const details = screen.getAllByText('凑十加法 · 1 questions · Not checked yet 1')[0]!.closest('details')!
  fireEvent.click(details.querySelector('summary')!)
  const panel = within(details)
  fireEvent.click(panel.getByRole('radio', { name: en.markCorrect }))
  fireEvent.click(panel.getByRole('checkbox', { name: en.hintedCorrect }))
  fireEvent.click(panel.getByRole('button', { name: 'Save marks · 1' }))
  await screen.findByText('Marks saved')
  expect(graded.read().paperResults[0]).toMatchObject({ itemId: 'a', result: 'correct', assistance: 'hint' })
})

it('keeps answers available after the suggested time and offers a start during the suggested break', async () => {
    let state = updateStudy(updateStudy(updateStudy(undefined, setup, NOW), start, NOW), { action: 'task', task: answerTask }, NOW)
    const backend = installFetch(state)
    const view = render(<StudyDesk sessionId="one" visible running={false} ask={vi.fn()} t={t} />)
    const submit = await screen.findByRole('button', { name: 'Submit answer' })
    expect(submit.closest('fieldset')?.disabled).toBe(false)
    expect(await screen.findByText(/past the suggested time/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start learning' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start now' })).toBeNull()
    view.unmount()
    state = updateStudy(backend.read(), { action: 'stop', sessionId: start.id, reflection: '' }, Date.now())
    installFetch(state)
    render(<StudyDesk sessionId="two" visible running={false} ask={vi.fn()} t={t} />)
    await screen.findByText(/Take a break away/)
    expect((await screen.findByRole('button', { name: 'Start now' }) as HTMLButtonElement).disabled).toBe(false)
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

  it('polls conditionally once loaded and keeps the displayed data when evidence is unchanged', async () => {
    const backend = installFetch(initial())
    render(<StudyDesk sessionId="poll" visible running={false} ask={vi.fn()} t={t} />)
    await screen.findByText(attempt.prompt)
    expect(backend.fetch).toHaveBeenCalledTimes(1)
    expect(String(backend.fetch.mock.calls[0]?.[0])).not.toContain('&revision=')
    // Real clocks: the interval fires once with the revision the panel already displays.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 3400)) })
    const pollUrl = String(backend.fetch.mock.calls.at(-1)?.[0])
    expect(pollUrl).toContain(`&revision=${backend.read().revision}`)
    expect(screen.getByText(attempt.prompt)).toBeTruthy()
    expect(backend.fetch.mock.calls.filter(([url]) => !String(url).includes('&revision='))).toHaveLength(1)
  })
})

it('allows editing and explicitly confirming an image transcription including the original answer', async () => {
  const state = updateStudy(updateStudy(undefined, setup, Date.now()), { action: 'mistake', mistake: { id: 'image-1', subject: 'math', topic: 'Blurry addition', prompt: '8 + ?', learnerAnswer: '14', correction: '15', explanation: 'Make ten', answerEvidence: '8+2+5=15', uncertainties: 'Check second digit' } }, Date.now())
  const backend = installFetch(state)
  render(<StudyDesk sessionId="one" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
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
  await openDesk('Mistakes')
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
  await openDesk('Knowledge map')
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
  await openDesk('Knowledge map')
  fireEvent.click(await screen.findByRole('button', { name: 'Practise this goal · 凑十加法' }))
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  await screen.findByText('Learning goal: 凑十加法')
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('add'), undefined))
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'foundation' })
})

it('previews the sheet as HTML and prints through the browser dialog', async () => {
  const print = vi.fn()
  vi.stubGlobal('print', print)
  const backend = installFetch(worksheetState())
  render(<StudyDesk sessionId="paper" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
  fireEvent.click(screen.getByText('凑十加法 · 1 questions · Not checked yet 1'))
  fireEvent.click(screen.getByRole('button', { name: en.previewPrintSheet }))
  const dialog = await screen.findByRole('dialog', { name: 'Math review sheet' })
  expect(within(dialog).getByText('1. 请计算 9+6。')).toBeTruthy()
  expect(within(dialog).getAllByText((_, element) => element?.textContent === en.sheetNameDate)).toHaveLength(1)
  expect(backend.fetch.mock.calls.some(([url]) => String(url).startsWith('/student/print?'))).toBe(false)
  fireEvent.click(within(dialog).getByRole('button', { name: en.printSheet }))
  expect(print).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('confirms high-confidence transcriptions in one batch and leaves the rest for review', async () => {
  const sheet = updateStudy(worksheetState(), { action: 'worksheet', worksheet: { id: 'pair', subject: 'math', objectiveId: 'add', items: [
    { id: 'a', prompt: '请计算 3+4。', answer: '7', explanation: '加法', answerEvidence: '3+4=7' },
    { id: 'b', prompt: '请计算 8+5。', answer: '13', explanation: '凑十', answerEvidence: '8+2+5=13' },
  ] } }, NOW)
  let state = sheet
  state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'pair', itemId: 'a', response: '7', result: 'correct', assistance: 'independent', uncertainties: '', confidence: 'high' } }, NOW)
  state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'pair', itemId: 'b', response: '1?', result: 'incorrect', assistance: 'independent', uncertainties: '字迹不清', confidence: 'low' } }, NOW)
  const backend = installFetch(state)
  render(<StudyDesk sessionId="batch" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
  const details = screen.getAllByText('凑十加法 · 2 questions · Not checked yet 2')[0]!.closest('details')!
  fireEvent.click(details.querySelector('summary')!)
  fireEvent.click(within(details).getByRole('button', { name: `${en.confirmHighConfidence} · 1` }))
  await screen.findByText(en.confirmPaperDone)
  expect(backend.read().paperResults).toHaveLength(1)
  expect(backend.read().paperResults[0]).toMatchObject({ itemId: 'a', result: 'correct' })
  expect(backend.read().paperDrafts).toHaveLength(1)
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
  await openDesk('Mistakes')
  fireEvent.click(screen.getByRole('button', { name: 'English' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Due review · English' }))
  expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByRole('combobox', { name: 'Learning mode' }) as HTMLSelectElement).value).toBe('review')
  expect(backend.requests).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Start learning' }))
  await waitFor(() => expect(ask).toHaveBeenCalledOnce())
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'english', mode: 'review' })
})

it('keeps due review available during a suggested break and shows the suggestion', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW - DAY)
  state = updateStudy(state, { action: 'mistake', mistake }, NOW - DAY)
  state = updateStudy(state, confirm, NOW - DAY)
  state = updateStudy(state, start, NOW)
  state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW)
  const backend = installFetch(state)
  render(<StudyDesk sessionId="break" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByText(/Take a break away/)
  await openDesk('Mistakes')
  expect((screen.getByRole('button', { name: 'Due review · Math' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.getByText(/Review can start now/)).toBeTruthy()
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
  expect(screen.getByText('Suggested time left today: 20:00 · Due for review: 0 · Weak points: 0')).toBeTruthy()
})

it('uses the server clock immediately without showing more than the block limit', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const serverNow = NOW + 5000
  const state = updateStudy(updateStudy(undefined, setup, serverNow), start, serverNow)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(dashboard(state, serverNow)))))
  render(<StudyDesk sessionId="clock" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByText('Suggested time left: 10:00')
  expect(screen.getByText('Suggested time left today: 20:00 · Due for review: 0 · Weak points: 0')).toBeTruthy()
})

it('keeps math goals and lessons off the Chinese today page', async () => {
  window.localStorage.clear()
  let state = updateStudy(undefined, setup, NOW - 3 * DAY)
  state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id: 'math-due', objectiveId: 'm2a-o-tables', topic: '口诀错题' } }, NOW - 2 * DAY)
  state = updateStudy(state, { ...confirm, id: 'math-due' }, NOW - 2 * DAY + MINUTE)
  state = updateStudy(state, { ...start, id: 'check', mode: 'diagnose' }, NOW)
  state = updateStudy(state, { action: 'task', task: { id: 'p1', sessionId: 'check', subject: 'math', topic: '摸底', prompt: '第 1 题', objectiveId: 'm2a-o-tables' } }, NOW + MINUTE)
  state = updateStudy(state, { action: 'answer', taskId: 'p1', response: '答' }, NOW + MINUTE)
  state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'p1', sessionId: 'check', topic: '摸底', prompt: '第 1 题', response: '答', result: 'incorrect', objectiveId: 'm2a-o-tables' } }, NOW + MINUTE)
  state = updateStudy(state, { action: 'stop', sessionId: 'check', reflection: '' }, NOW + 2 * MINUTE)
  const lessons = [
    { id: 'om-math', status: 'ready' as const, createdAt: '2026-10-28T06:00:00.000Z', updatedAt: '2026-10-28T06:05:00.000Z', title: '数学乘法课', requirement: '练乘法', subject: 'math' as const, objectiveId: 'm2a-o-tables', base: 'http://localhost:3000', classroomId: 'room-math', url: 'http://localhost:3000/classroom/math' },
    { id: 'om-zh', status: 'ready' as const, createdAt: '2026-10-28T06:00:00.000Z', updatedAt: '2026-10-28T06:06:00.000Z', title: '语文识字课', requirement: '认生字', subject: 'chinese' as const, base: 'http://localhost:3000', classroomId: 'room-zh', url: 'http://localhost:3000/classroom/zh' },
  ]
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const subject = new URL(url, 'http://localhost').searchParams.get('subject') as 'chinese' | 'math' | 'english' | null
    const body = dashboard(state, NOW + 3 * MINUTE, { subject: subject ?? 'math' })
    return new Response(JSON.stringify({ ...body, interactiveLessons: { ...body.interactiveLessons, lessons } }))
  }))
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="subjects" visible running={false} ask={ask} t={t} />)
  expect((await screen.findAllByText(/熟记并运用2～9的乘法口诀/)).length).toBeGreaterThan(0)
  expect(screen.getByText('数学乘法课')).toBeTruthy()
  expect(screen.queryByText('语文识字课')).toBeNull()
  expect(screen.getByText(/口诀错题/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Chinese' }))
  await screen.findByText('语文识字课')
  expect(screen.queryByText(/熟记并运用2～9的乘法口诀/)).toBeNull()
  expect(screen.queryByText('数学乘法课')).toBeNull()
  expect(screen.queryByText(/口诀错题/)).toBeNull()
  expect(screen.queryByText('http://localhost:3000/classroom/math')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: en.openLesson }))
  await waitFor(() => expect(ask).toHaveBeenCalled())
  const prompt = String(ask.mock.calls.at(-1)?.[0])
  expect(prompt).not.toContain('m2a-o-tables')
  expect(prompt).toContain('Chinese')
})

it('shows the knowledge map and mistake book on the main tab and starts the recommended review', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW - DAY)
  state = updateStudy(state, { action: 'mistake', mistake }, NOW - DAY)
  state = updateStudy(state, confirm, NOW - DAY)
  const backend = installFetch(state)
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="main" visible running={false} ask={ask} t={t} />)
  await screen.findByText('Start with a check-in to find direction · Math')
  await screen.findByRole('heading', { name: 'Clear today' })
  expect(screen.queryByRole('heading', { name: 'Knowledge map · Math' })).toBeNull()
  await openDesk('Knowledge map')
  await screen.findByRole('heading', { name: '数学二年级上册知识地图' })
  expect(screen.getByRole('heading', { name: 'Concept relations · 15' })).toBeTruthy()
  expect(screen.getByText(en.selectConcept)).toBeTruthy()
  expect(screen.getByRole('button', { name: '1. 两位数不退位减法' })).toBeTruthy()
  fireEvent.click(screen.getByText(/表内乘法 · Mastered/))
  fireEvent.click(screen.getByRole('button', { name: '乘法的意义' }))
  expect(screen.getByText('Definition: 求几个相同加数的和，可以用乘法，比连加更简便。')).toBeTruthy()
  expect(screen.getAllByText(/乘法的意义 · Prerequisite for · 2、4、8的乘法口诀/).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByText('100 以内数的加减法（二） · Mastered 0/3'))
  expect(screen.getAllByRole('img', { name: 'Mastered 0 · Practising 0 · Not practised lately 0 · Needs work 0 · Review due 0 · Not started 3' }).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Clear these 1' }))
  await waitFor(() => expect(ask).toHaveBeenCalledOnce())
  expect(ask.mock.calls[0]?.[0]).toContain('到期错题')
  expect(ask.mock.calls[0]?.[0]).toContain('error-1')
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
  await screen.findByText('Suggested time left today: 20:00 · Due for review: 1 · Weak points: 1')
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
  await openDesk('Mistakes')
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
  await openDesk('Knowledge map')
  await screen.findByRole('heading', { name: '数学二年级上册知识地图' })
  expect(screen.queryByText('身体尺')).toBeNull()
  fireEvent.click(screen.getByText(/100 以内数的加减法（二） · Mastered/))
  expect(screen.getAllByRole('button', { name: /Practise this goal/ }).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Concepts' }))
  expect(screen.getByRole('heading', { name: 'Concepts' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Compare' })).toBeTruthy()
  expect(screen.getByText('我的学校')).toBeTruthy()
  expect(screen.getByText('我的房间')).toBeTruthy()
  expect(screen.getByText(en.ideasHelp)).toBeTruthy()
  expect(screen.getByText('身体尺')).toBeTruthy()
  expect(screen.getByText('千以内的数')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Knowledge map' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Grade' }), { target: { value: '1' } })
  await screen.findByRole('heading', { name: '数学一年级上册知识地图' })
  fireEvent.click(screen.getByRole('button', { name: 'Concepts' }))
  expect(screen.getByText('身体尺')).toBeTruthy()
  expect(screen.getByText('千以内的数')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Knowledge map' }))
  expect(screen.getByText(/Browsing another grade or term/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Practise this goal/ })).toBeNull()
  expect(backend.fetch).toHaveBeenCalledWith(expect.stringContaining('mapGrade=1'), expect.anything())
  fireEvent.change(screen.getByRole('combobox', { name: 'Term' }), { target: { value: 'second' } })
  await screen.findByRole('heading', { name: '数学一年级下册知识地图' })
  fireEvent.click(screen.getByRole('button', { name: 'Back to current term' }))
  await screen.findByRole('heading', { name: '数学二年级上册知识地图' })
})

it('asks for a mixed unit practice sheet', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  installFetch(worksheetState())
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="paper" visible running={false} ask={ask} t={t} />)
  await openDesk('Mistakes')
  fireEvent.click(screen.getByRole('button', { name: 'Print a practice sheet' }))
  await waitFor(() => expect(ask).toHaveBeenCalled())
  const prompt = String(ask.mock.calls[0]?.[0])
  expect(prompt).toContain('questions.md')
  expect(prompt).toContain('6 到 8')
  expect(prompt).not.toContain('不超过 5')
})

it('links worksheets to their source mistakes and shows review stages', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  installFetch(worksheetState())
  render(<StudyDesk sessionId="links" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
  fireEvent.click(screen.getByText('凑十加法 · 1 questions · Not checked yet 1'))
  expect(screen.getByText('1. 请计算 9+6。')).toBeTruthy()
  expect(screen.getByText('Answer key: 15 · Source mistake: 加法')).toBeTruthy()
  fireEvent.click(screen.getByText('加法'))
  expect(screen.getByText(/Review stage: 1 \/ 5/)).toBeTruthy()
  expect(screen.getByText('Related worksheets: 凑十加法 · Checked 0/1')).toBeTruthy()
})

it('lets the parent mark a printed sheet per question and discard it', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + DAY)
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
  const backend = installFetch(worksheetState())
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="grade" visible running={false} ask={ask} t={t} />)
  await openDesk('Mistakes')
  expect(screen.getByText(/Ready for review: 0 · Sheets not yet checked: 1/)).toBeTruthy()
  fireEvent.click(screen.getByText('凑十加法 · 1 questions · Not checked yet 1'))
  const save = screen.getByRole('button', { name: 'Save marks' }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  fireEvent.click(screen.getByRole('radio', { name: 'Wrong' }))
  fireEvent.change(screen.getByLabelText('What the child wrote (optional)'), { target: { value: '14' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save marks · 1' }))
  await screen.findByText('Marks saved')
  expect(backend.read().paperResults[0]).toMatchObject({ itemId: 'q1', result: 'incorrect', response: '14', feedback: '家长批改' })
  expect(backend.read().mistakes[0]).toMatchObject({ stage: 0 })
  await screen.findByText(/Ready for review: 1/)
  fireEvent.click(screen.getByRole('button', { name: 'Print a review sheet' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('kind=review-sheet subject=math'), undefined))
  fireEvent.click(screen.getByRole('button', { name: 'Discard this sheet' }))
  await waitFor(() => expect(backend.read().worksheets[0]?.discardedAt).toBeDefined())
  await waitFor(() => expect(screen.queryByText(/凑十加法 · 1 questions/)).toBeNull())
})

it('offers a recurring check-in and starts it as a diagnose block', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const backend = installFetch(updateStudy(undefined, setup, NOW - DAY))
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="checkin" visible running={false} ask={ask} t={t} />)
  await screen.findByRole('heading', { name: 'Learning check-in · Math' })
  expect(screen.getByText(/No check-in yet · Coverage: 0 \/ 8/)).toBeTruthy()
  expect(screen.getByText(/Check-in intensity: Standard · 6 questions, mostly choices/)).toBeTruthy()
  expect(screen.getByText(/A check-in is suggested · This round probes: 计算100以内不退位和退位减法并用加法验算/)).toBeTruthy()
  expect(screen.getByText('Start with a check-in to find direction · Math')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Start check-in' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining('kind=diagnose'), undefined))
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'diagnose' })
})

it('shows the class frontier and saves a parent confirmation of the same unit', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW)
  state = updateStudy(state, { action: 'material', material }, NOW)
  state = updateStudy(state, { action: 'course', course }, NOW)
  state = updateStudy(state, { action: 'school-progress', subject: 'math', unitId: 'm2a-u-mul', posture: 'keep-up', preview: 'off', pace: 'teaching', parentConfirmation: '家长确认学校数学教到表内乘法。' }, NOW)
  const backend = installFetch(state)
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="frontier" visible running={false} ask={ask} t={t} />)
  expect(await screen.findByText('School progress: 表内乘法 · Keep up with school · Practised through: No practice in this book yet')).toBeTruthy()
  expect(screen.getByText('School is here')).toBeTruthy()
  await openDesk('Parent setup')
  expect(within(screen.getByRole('combobox', { name: 'Current school unit' })).getByRole('option', { name: '表内乘法' })).toBeTruthy()
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Confirm school progress' }))
  fireEvent.click(screen.getByRole('button', { name: 'Still on this unit' }))
  await waitFor(() => expect(backend.read().courses.find(item => item.subject === 'math')?.progress?.confirmedAt).toBe(NOW))
})

it('lists every subject on the check-in tab and starts a light check-in', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const backend = installFetch(updateStudy(undefined, setup, NOW - DAY))
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="tab" visible running={false} ask={ask} t={t} />)
  await openDesk('Knowledge map')
  await screen.findByRole('heading', { name: 'Chinese · A check-in is suggested' })
  expect(screen.getByRole('heading', { name: 'English · A check-in is suggested' })).toBeTruthy()
  expect(screen.getByText('Coverage: 0 / 9')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: 'Standard · 6 · Recommended' })).toHaveLength(3)
  fireEvent.click(screen.getAllByRole('button', { name: 'Light · 3' })[1]!)
  expect(screen.getByText('3 choice questions, a few minutes')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Start check-in · Math' }))
  await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.stringContaining(en.intensityLight), undefined))
  expect(backend.read().sessions[0]).toMatchObject({ subject: 'math', mode: 'diagnose', intensity: 'light' })
  expect(ask.mock.calls[0]?.[0]).toContain('m2a-o-meaning')
})

it('confirms a transcribed draft in the panel and records the chosen error cause', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = worksheetState()
  state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'sheet', itemId: 'q1', response: '14', result: 'incorrect', assistance: 'independent', uncertainties: '答数有点糊' } }, NOW)
  const backend = installFetch(state)
  render(<StudyDesk sessionId="drafts" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
  fireEvent.click(screen.getByText('凑十加法 · 1 questions · Not checked yet 1'))
  const drafts = screen.getByRole('group', { name: en.draftsTitle })
  expect(within(drafts).getByText(`${en.uncertainties}: 答数有点糊`)).toBeTruthy()
  expect(within(drafts).getByRole('radio', { name: en.markWrong }).getAttribute('aria-checked')).toBe('true')
  fireEvent.change(within(drafts).getByLabelText(en.errorTypeLabel), { target: { value: 'carry-borrow' } })
  fireEvent.click(within(drafts).getByRole('button', { name: `${en.confirmPaper} · 1` }))
  await screen.findByText(en.confirmPaperDone)
  expect(backend.read().paperDrafts).toEqual([])
  expect(backend.read().paperResults[0]).toMatchObject({ itemId: 'q1', result: 'incorrect', response: '14', feedback: '家长核对照片转录' })
  expect(backend.read().mistakes[0]).toMatchObject({ id: mistake.id, errorType: 'carry-borrow' })
})

it('classifies a mistake in the notebook and shows the routine card with its cause', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  let state = updateStudy(undefined, setup, NOW)
  state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, objectiveId: 'm2a-o-sub' } }, NOW)
  state = updateStudy(state, confirm, NOW)
  const backend = installFetch(state)
  const ask = vi.fn().mockResolvedValue(undefined)
  render(<StudyDesk sessionId="routine" visible running={false} ask={ask} t={t} />)
  await openDesk('Mistakes')
  fireEvent.click(screen.getByText(mistake.topic))
  fireEvent.change(screen.getByLabelText(en.errorTypeLabel), { target: { value: 'carry-borrow' } })
  fireEvent.click(screen.getByRole('button', { name: en.saveErrorType }))
  await waitFor(() => expect(backend.read().mistakes[0]?.errorType).toBe('carry-borrow'))
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  await screen.findByRole('heading', { name: `${en.routineTitle} · Math` })
  expect(screen.getByText(`${en.topCauses}：${en['carry-borrow']} ×1`)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: en.printDailySheet }))
  expect(String(ask.mock.calls[0]?.[0])).toContain('kind=elements')
  expect(String(ask.mock.calls[0]?.[0])).toContain('daily-routine.md')
})

it('draws a saved task figure beside the question', async () => {
  const task = { ...answerTask, figure: { kind: 'clock' as const, clocks: [{ hour: 3, minute: 0 }] } }
  installFetch(updateStudy(updateStudy(updateStudy(undefined, setup, Date.now()), start, Date.now()), { action: 'task', task }, Date.now()))
  render(<StudyDesk sessionId="figure" visible running={false} ask={vi.fn()} t={t} />)
  expect(await screen.findByRole('img', { name: en.figureClock })).toBeTruthy()
  expect(screen.getByText(task.prompt)).toBeTruthy()
})

it('marks unmarked questions right and keeps a question the parent already marked wrong', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  const state = updateStudy(worksheetState(), { action: 'worksheet', worksheet: { id: 'pair', subject: 'math', objectiveId: 'add', items: [
    { id: 'a', prompt: '请计算 9+6。', answer: '15', explanation: '先凑十。', answerEvidence: '9+1+5=15' },
    { id: 'b', prompt: '请计算 8+3。', answer: '11', explanation: '先凑十。', answerEvidence: '8+2+1=11' },
  ] } }, NOW)
  const backend = installFetch(state)
  render(<StudyDesk sessionId="marks" visible running={false} ask={vi.fn()} t={t} />)
  await openDesk('Mistakes')
  const sheet = screen.getByText('凑十加法 · 2 questions · Not checked yet 2').closest('details')!
  fireEvent.click(sheet.querySelector('summary')!)
  const view = within(sheet)
  const first = view.getByRole('radiogroup', { name: '1' })
  const second = view.getByRole('radiogroup', { name: '2' })
  fireEvent.click(within(first).getByRole('radio', { name: en.markWrong }))
  fireEvent.click(view.getByRole('button', { name: en.markAllCorrect }))
  expect(within(first).getByRole('radio', { name: en.markWrong }).getAttribute('aria-checked')).toBe('true')
  expect(within(second).getByRole('radio', { name: en.markCorrect }).getAttribute('aria-checked')).toBe('true')
  fireEvent.click(view.getByRole('button', { name: 'Save marks · 2' }))
  await screen.findByText('Marks saved')
  expect(backend.read().paperResults).toEqual(expect.arrayContaining([
    expect.objectContaining({ itemId: 'a', result: 'incorrect' }),
    expect.objectContaining({ itemId: 'b', result: 'correct' }),
  ]))
})

it('shows the explain-it-back reminder after a helped answer', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 5 * MINUTE)
  let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
  const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt, objectiveId: 'm2a-o-meaning' }
  state = updateStudy(state, { action: 'task', task }, NOW)
  state = updateStudy(state, { action: 'hint', taskId: task.id }, NOW)
  state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
  state = updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: 'm2a-o-meaning', assistance: 'hint' } }, NOW + 2 * MINUTE)
  state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 3 * MINUTE)
  installFetch(state)
  render(<StudyDesk sessionId="remind" visible running={false} ask={vi.fn()} t={t} />)
  await screen.findByRole('heading', { name: en.remindersTitle })
  expect(screen.getByText(`${en.remindFirst} · 把同数连加改写成乘法算式并说明意义`)).toBeTruthy()
})
