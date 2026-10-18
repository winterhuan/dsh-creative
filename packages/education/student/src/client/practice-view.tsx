import { useState, type FormEvent } from 'react'
import type { Dashboard, MistakeStatus } from '../dashboard.ts'
import type { AskTutor, StudyPhoto } from './bridge.ts'
import { MistakeConfirmation, type ChangeStudy } from './forms.tsx'
import type { Translate } from './locales.ts'
import { mistakePhotoPrompt, paperPhotoPrompt, practiceSheetPrompt, reviewSheetPrompt } from './prompts.ts'
import { errorTypesBySubject, type ErrorTypeValue } from '../vocabulary.ts'
import type { Subject } from './display.ts'

type Study = NonNullable<Dashboard['study']>
type Goal = { id: string; title: string }
type Mark = 'correct' | 'partial' | 'incorrect'
const markKeys = { correct: 'markCorrect', partial: 'markPartial', incorrect: 'markWrong' } as const

/** Parent practice page: the mistake notebook, printed sheets, and due review. */
export function PracticeView({ study, now, subject, goals, mistakeStatus, setMistakeStatus, setMistakeOffset, sessionId, revision, disabled, running, change, ask, onReview, epoch, t }: {
  study: Study
  now: number
  subject: Subject
  goals: Goal[]
  mistakeStatus: MistakeStatus
  setMistakeStatus: (status: MistakeStatus) => void
  setMistakeOffset: (offset: number) => void
  sessionId: string
  revision: number
  disabled: boolean
  running: boolean
  change: ChangeStudy
  ask: AskTutor
  onReview: (subject: Subject) => void
  epoch: number
  t: Translate
}) {
  return <>
    <PhotoIntake ask={ask} disabled={disabled || running} t={t} />
    <section><h3>{t('notebook')} · {t(subject)} · {study.confirmedCount}</h3>
      <nav className="student-segments" aria-label={t('mistakeStatus')}>{(['all', 'due', 'reviewing', 'mastered'] as const).map(name => <button key={name} type="button" aria-pressed={mistakeStatus === name} onClick={() => { setMistakeStatus(name); setMistakeOffset(0) }}>{t(name === 'all' ? 'all' : name === 'due' ? 'bookDue' : name === 'reviewing' ? 'bookReviewing' : 'bookMastered')}{name === 'all' ? '' : ` · ${study.mistakeBook[name]}`}</button>)}</nav>
      {study.confirmedMistakes.length === 0 && <p>{t('empty')}</p>}
      {study.confirmedMistakes.map(item => <details key={item.id}><summary>{item.topic}{item.stage >= 4 ? ` · ${t('bookMastered')}` : item.dueAt !== undefined && item.dueAt <= now ? ` · ${t('dueNow')}` : ''}</summary>
        <p>{t('prompt')}: {item.prompt}</p><p>{t('learnerAnswer')}: {item.learnerAnswer}</p>
        <p>{t('correction')}: {item.correction}</p><p>{t('explanation')}: {item.explanation}</p>
        <p>{t('answerEvidence')}: {item.answerEvidence}</p>
        <p>{t('errorTypeLabel')}: {item.errorType !== undefined ? t(item.errorType) : t('errorTypeNone')}</p>
        <p>{t('reviewStage')}: {item.stage + 1} / 5{item.dueAt !== undefined ? ` · ${t('nextReview')}: ${item.dueAt <= now ? t('dueNow') : new Date(item.dueAt).toLocaleString()}` : ''}</p>
        {study.worksheets.filter(sheet => sheet.sources.some(source => source.mistakeId === item.id)).map(sheet => <p key={sheet.id} className="student-muted">{t('relatedWorksheets')}: {sheet.objectiveTitle} · {t('graded')} {sheet.results.length}/{sheet.items.length}</p>)}
        <MistakeObjective mistake={item} objectives={goals} change={change} t={t} />
      </details>)}
      {study.confirmedCount > 20 && <div className="student-pages">
        <button type="button" disabled={study.confirmedOffset === 0} onClick={() => setMistakeOffset(study.confirmedOffset - 20)}>{t('previousPage')}</button>
        <span>{t('page')} {Math.floor(study.confirmedOffset / 20) + 1} / {Math.ceil(study.confirmedCount / 20)}</span>
        <button type="button" disabled={study.confirmedOffset + 20 >= study.confirmedCount} onClick={() => setMistakeOffset(study.confirmedOffset + 20)}>{t('nextPage')}</button>
      </div>}
    </section>
    <section><h3>{t('worksheets')}</h3>
      <p className="student-muted">{t('reviewSheetHelp')}</p>
      <p>{t('reviewReady')}: {study.reviewPlan.picks}{study.reviewPlan.remaining > 0 ? ` · ${t('reviewLater')}: ${study.reviewPlan.remaining}` : ''}{study.reviewPlan.unlinkedDue > 0 ? ` · ${t('reviewUnlinked')}: ${study.reviewPlan.unlinkedDue}` : ''}{study.reviewPlan.openSheets > 0 ? ` · ${t('reviewOpenSheets')}: ${study.reviewPlan.openSheets}` : ''}</p>
      <button type="button" disabled={disabled || running || goals.length === 0} onClick={() => { void ask(practiceSheetPrompt(subject)).catch(() => {}) }}>{t('createWorksheet')}</button>
      <button type="button" disabled={disabled || running || study.reviewPlan.picks === 0} onClick={() => { void ask(reviewSheetPrompt(subject)).catch(() => {}) }}>{t('printConsolidation')}</button>
      {study.worksheets.length === 0 && <p>{t('empty')}</p>}
      {study.worksheets.map(sheet => <WorksheetActions key={sheet.id} worksheet={sheet} sessionId={sessionId} revision={revision} canPrint={study.printAvailable} change={change} ask={ask} disabled={disabled || running} t={t} />)}
    </section>
    <section><h3>{t('due')} · {study.dueCount}</h3>{study.dueMistakes.length === 0 && <p>{t('empty')}</p>}
      {study.dueMistakes.map(item => <p key={item.id}>{t(item.subject)} · {item.topic}</p>)}
      {study.dueSubjects.map(item => <button key={item} disabled={disabled || running} onClick={() => onReview(item)}>{t('review')} · {t(item)}</button>)}
      {study.dueSubjects.length > 0 && study.phase !== 'ready' && <p>{t('reviewBlocked')}</p>}
    </section>
    <section><h3>{t('pending')} · {study.pendingCount}</h3>{study.pendingMistakes.length === 0 && <p>{t('empty')}</p>}
      {study.pendingMistakes.map(item => <MistakeConfirmation key={`${epoch}-${item.id}`} mistake={item} revision={revision} change={change} t={t} />)}
    </section><p>{t('mistakeBounded')}</p>
  </>
}

function MistakeObjective({ mistake, objectives, change, t }: { mistake: Study['confirmedMistakes'][number]; objectives: Goal[]; change: ChangeStudy; t: Translate }) {
  const [error, setError] = useState('')
  return <>
    <form onSubmit={event => {
      event.preventDefault(); setError('')
      const objectiveId = String(new FormData(event.currentTarget).get('objectiveId') ?? '')
      void change({ action: 'link-mistake', mistakeId: mistake.id, objectiveId }).catch(reason => setError(reason instanceof Error ? reason.message : t('networkError')))
    }}>
      <label>{t('learningGoal')}<select name="objectiveId" defaultValue={mistake.objectiveId ?? ''} required>
        <option value="" disabled>{t('unclassified')}</option>
        {objectives.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label>
      <button type="submit" disabled={objectives.length === 0}>{t('linkGoal')}</button>
    </form>
    <form onSubmit={event => {
      event.preventDefault(); setError('')
      const picked = String(new FormData(event.currentTarget).get('errorType') ?? '')
      const errorType = errorTypesBySubject[mistake.subject].find(candidate => candidate === picked) ?? ''
      void change({ action: 'classify-mistake', mistakeId: mistake.id, errorType }).catch(reason => setError(reason instanceof Error ? reason.message : t('networkError')))
    }}>
      <label>{t('errorTypeLabel')}<select name="errorType" defaultValue={mistake.errorType ?? ''}>
        <option value="">{t('errorTypeNone')}</option>
        {errorTypesBySubject[mistake.subject].map(type => <option key={type} value={type}>{t(type)}</option>)}
      </select></label>
      <button type="submit">{t('saveErrorType')}</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </>
}

function WorksheetActions({ worksheet, sessionId, revision, canPrint, change, ask, disabled, t }: { worksheet: Study['worksheets'][number]; sessionId: string; revision: number; canPrint: boolean; change: ChangeStudy; ask: AskTutor; disabled: boolean; t: Translate }) {
  const [previewed, setPreviewed] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [marks, setMarks] = useState<Record<string, Mark>>(() => Object.fromEntries(worksheet.results.flatMap(item => item.result === 'unassessed' ? [] : [[item.itemId, item.result]])))
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [causes, setCauses] = useState<Record<string, ErrorTypeValue | ''>>({})
  const [paper, setPaper] = useState<Record<string, { result?: Mark; response: string; errorType: ErrorTypeValue | '' }>>(() => Object.fromEntries(worksheet.drafts.map(draft => [draft.itemId, { ...(draft.result === 'correct' || draft.result === 'partial' || draft.result === 'incorrect' ? { result: draft.result } : {}), response: draft.response, errorType: draft.errorType ?? '' }])))
  const [saving, setSaving] = useState(false)
  const changed = worksheet.items.filter(item => {
    const before = worksheet.results.find(result => result.itemId === item.id)
    const mark = marks[item.id]
    return mark !== undefined && (mark !== before?.result || (answers[item.id]?.trim() ?? '') !== '')
  })
  function markAllRight() {
    setMarks(previous => {
      const next = { ...previous }
      for (const item of worksheet.items) {
        const saved = worksheet.results.find(result => result.itemId === item.id)
        if (saved && saved.result !== 'unassessed') continue
        if (next[item.id] !== undefined) continue
        next[item.id] = 'correct'
      }
      return next
    })
  }
  async function grade() {
    setSaving(true); setError(''); setMessage('')
    try {
      await change({ action: 'grade-sheet', grade: { worksheetId: worksheet.id, userConfirmation: t('gradeConfirmation'), results: changed.map(item => {
        const response = answers[item.id]?.trim()
        const mark = marks[item.id] ?? 'correct'
        const cause = causes[item.id]
        return { itemId: item.id, result: mark, ...(response ? { response } : {}), ...(mark !== 'correct' && cause ? { errorType: cause } : {}) }
      }) } }, revision)
      setAnswers({}); setMessage(t('gradesSaved'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('networkError')) }
    finally { setSaving(false) }
  }
  const paperEntries = worksheet.drafts.flatMap(draft => {
    const value = paper[draft.itemId]
    return value?.result !== undefined ? [{ itemId: draft.itemId, result: value.result, response: value.response, ...(value.errorType !== '' ? { errorType: value.errorType } : {}) }] : []
  })
  const patchPaper = (itemId: string, patch: Partial<{ result: Mark; response: string; errorType: ErrorTypeValue | '' }>): void => {
    setPaper(previous => {
      const prev = previous[itemId]
      return { ...previous, [itemId]: { ...(prev?.result !== undefined ? { result: prev.result } : {}), response: prev?.response ?? '', errorType: prev?.errorType ?? '', ...patch } }
    })
  }
  async function confirmPaper() {
    setSaving(true); setError(''); setMessage('')
    try {
      await change({ action: 'confirm-paper', worksheetId: worksheet.id, userConfirmation: t('confirmPaper'), results: paperEntries }, revision)
      setMessage(t('confirmPaperDone'))
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('networkError')) }
    finally { setSaving(false) }
  }
  async function discard() {
    if (!window.confirm(t('discardConfirm'))) return
    setError('')
    try { await change({ action: 'discard-sheet', worksheetId: worksheet.id }, revision) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('networkError')) }
  }
  const href = `/student/worksheet.pdf?sessionId=${encodeURIComponent(sessionId)}&id=${encodeURIComponent(worksheet.id)}`
  async function print() {
    if (!previewed || !window.confirm(t('printConfirm'))) return
    setPrinting(true); setMessage(''); setError('')
    try {
      const response = await fetch(`/student/print?sessionId=${encodeURIComponent(sessionId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision, worksheetId: worksheet.id, confirmed: true }) })
      const result = await response.json() as { receipt?: string; error?: string }
      if (!response.ok) throw new Error(result.error ?? t('printError'))
      setMessage(`${t('queued')}: ${result.receipt ?? ''}`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : t('printError')) }
    finally { setPrinting(false) }
  }
  return <details><summary>{worksheet.objectiveTitle} · {worksheet.items.length} {t('questions')} · {worksheet.open ? `${t('notGraded')} ${worksheet.items.length - worksheet.results.length}` : `${t('graded')} ${worksheet.results.length}/${worksheet.items.length}`}</summary>
    <p className="student-muted">{t('createdAt')}: {new Date(worksheet.createdAt).toLocaleDateString()} · {t('gradeHelp')}</p>
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setPreviewed(true)}>{t('previewPdf')}</a>
    <button type="button" disabled={!canPrint || !previewed || printing} onClick={() => { void print() }}>{t('printWorksheet')}</button>
    {!canPrint && <p>{t('printUnavailable')}</p>}
    <button type="button" disabled={disabled || saving} onClick={markAllRight}>{t('markAllCorrect')}</button>
    {worksheet.items.map((item, index) => {
      const source = worksheet.sources.find(candidate => candidate.itemId === item.id)
      const result = worksheet.results.find(candidate => candidate.itemId === item.id)
      return <fieldset key={item.id} className="student-grade" disabled={disabled || saving}>
        <p>{index + 1}. {item.prompt}</p>
        <p className="student-muted">{t('referenceAnswer')}: {item.answer} · {source?.mistakeId ? `${t('sourceMistake')}: ${source.topic}` : t('practiceItem')}{result ? ` · ${t(result.result)}: ${result.response}` : ''}</p>
        <div className="student-segments" role="radiogroup" aria-label={`${index + 1}`}>{(['correct', 'partial', 'incorrect'] as const).map(mark => <button key={mark} type="button" role="radio" aria-checked={marks[item.id] === mark} onClick={() => setMarks(previous => ({ ...previous, [item.id]: mark }))}>{t(markKeys[mark])}</button>)}</div>
        {marks[item.id] !== undefined && marks[item.id] !== 'correct' && <label>{t('childAnswer')}<input value={answers[item.id] ?? ''} maxLength={2000} onChange={event => { const value = event.target.value; setAnswers(previous => ({ ...previous, [item.id]: value })) }} /></label>}
        {marks[item.id] !== undefined && marks[item.id] !== 'correct' && <label>{t('errorTypeLabel')}<select value={causes[item.id] ?? ''} onChange={event => { const type = errorTypesBySubject[worksheet.subject].find(candidate => candidate === event.target.value); setCauses(previous => ({ ...previous, [item.id]: type ?? '' })) }}><option value="">{t('errorTypeNone')}</option>{errorTypesBySubject[worksheet.subject].map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label>}
      </fieldset>
    })}
    {worksheet.drafts.length > 0 && <fieldset className="student-grade" disabled={disabled || saving}>
      <legend>{t('draftsTitle')}</legend><p className="student-muted">{t('draftsHelp')}</p>
      {worksheet.drafts.map(draft => {
        const index = worksheet.items.findIndex(item => item.id === draft.itemId)
        const value = paper[draft.itemId]
        return <div key={draft.itemId}>
          <p>{index >= 0 ? `${index + 1}. ${worksheet.items[index]?.prompt ?? ''}` : draft.itemId}</p>
          <label>{t('learnerAnswer')}<input value={value?.response ?? draft.response} maxLength={2000} onChange={event => { patchPaper(draft.itemId, { response: event.target.value }) }} /></label>
          {draft.uncertainties !== '' && <p className="student-muted">{t('uncertainties')}: {draft.uncertainties}</p>}
          <div className="student-segments" role="radiogroup" aria-label={t('draftChoice')}>{(['correct', 'partial', 'incorrect'] as const).map(mark => <button key={mark} type="button" role="radio" aria-checked={value?.result === mark} onClick={() => { patchPaper(draft.itemId, { result: mark }) }}>{t(markKeys[mark])}</button>)}</div>
          {(value?.result === 'partial' || value?.result === 'incorrect') && <label>{t('errorTypeLabel')}<select value={value.errorType} onChange={event => { const type = errorTypesBySubject[worksheet.subject].find(candidate => candidate === event.target.value); patchPaper(draft.itemId, { errorType: type ?? '' }) }}><option value="">{t('errorTypeNone')}</option>{errorTypesBySubject[worksheet.subject].map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label>}
        </div>
      })}
      <button type="button" className="student-primary" disabled={disabled || saving || paperEntries.length === 0} onClick={() => { void confirmPaper() }}>{t('confirmPaper')}{paperEntries.length > 0 ? ` · ${paperEntries.length}` : ''}</button>
    </fieldset>}
    <PhotoIntake ask={ask} disabled={disabled || saving} t={t} variant="paper" prompt={paperPhotoPrompt(worksheet.id)} />
    <button type="button" className="student-primary" disabled={disabled || saving || changed.length === 0} onClick={() => { void grade() }}>{t('saveGrades')}{changed.length > 0 ? ` · ${changed.length}` : ''}</button>
    <button type="button" className="student-quiet" disabled={disabled || saving} onClick={() => { void discard() }}>{t('discardSheet')}</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>
}

function PhotoIntake({ ask, disabled, t, variant = 'mistake', prompt = mistakePhotoPrompt }: { ask: AskTutor; disabled: boolean; t: Translate; variant?: 'mistake' | 'paper'; prompt?: string }) {
  const [photo, setPhoto] = useState<StudyPhoto>()
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  async function select(file?: File) {
    setPhoto(undefined); setError('')
    if (!file) return
    const mediaType = file.type
    if (file.size > 8_388_608 || !['image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) { setError(t('photoError')); return }
    setReading(true)
    try {
      const preview = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error(t('photoError'))); reader.onerror = () => reject(new Error(t('photoError'))); reader.readAsDataURL(file) })
      if (mediaType === 'image/png' || mediaType === 'image/jpeg' || mediaType === 'image/webp') setPhoto({ mediaType, data: preview.slice(preview.indexOf(',') + 1), preview, name: file.name })
    } catch { setError(t('photoError')) } finally { setReading(false) }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!photo) return
    try { await ask(prompt, photo); setPhoto(undefined) }
    catch { /* Tutor submission notice is owned by the workbench. */ }
  }
  return <section><h3>{t(variant === 'mistake' ? 'photo' : 'paperPhoto')}</h3><p>{t(variant === 'mistake' ? 'photoHelp' : 'paperPhotoHelp')}</p><form onSubmit={event => { void submit(event) }}>
    <label>{t('photo')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file) }} /></label>
    {photo && <img src={photo.preview} alt={t('preview')} />}
    <button type="submit" disabled={!photo || disabled || reading}>{t('sendPhoto')}</button>
    {error && <p role="alert">{error}</p>}
  </form></section>
}
