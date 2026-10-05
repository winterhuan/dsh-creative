import { useState, type FormEvent, type ReactNode } from 'react'
import type { Command, StudyState } from '../schema.ts'
import type { Dashboard } from '../dashboard.ts'
import type { Translate } from './locales.ts'

export type ChangeStudy = (command: Command, revision?: number) => Promise<Dashboard>
export const subjects = ['chinese', 'math', 'english'] as const
const read = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

/** Labelled native field with browser validation, preserving unsaved text across polling. */
export function Field({ name, label, value = '', type = 'text', min, max }: { name: string; label: string; value?: string | number; type?: string; min?: number; max?: number }) {
  return <label>{label}<input name={name} defaultValue={value} type={type} min={min} max={max} required maxLength={2000} /></label>
}

function SaveForm({ revision, submit, children, t, disabled = false, button = 'save' }: {
  revision: number; submit: (data: FormData, revision: number) => Promise<Dashboard>; children: ReactNode; t: Translate; disabled?: boolean; button?: 'save' | 'confirm'
}) {
  const [base, setBase] = useState(revision)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const values = new FormData(event.currentTarget)
    setBusy(true); setSaved(false); setError('')
    try { const result = await submit(values, base); setBase(result.revision); setSaved(true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : t('networkError')) }
    finally { setBusy(false) }
  }
  return <form onSubmit={event => { void save(event) }} onChange={() => setSaved(false)}>
    <fieldset disabled={disabled || busy}>{children}<button type="submit">{busy ? t('busy') : t(button)}</button></fieldset>
    {error && <p role="alert">{error}</p>}{saved && <p role="status">{t('saved')}</p>}
  </form>
}

/** Parent-confirmed setup, limits and an atomic textbook/course update. */
export function ParentSettings({ data, change, t }: { data: Dashboard; change: ChangeStudy; t: Translate }) {
  const study = data.study
  const profile = study?.profile
  const limits = profile?.limits ?? { blockMinutes: 10, breakMinutes: 5, dailyMinutes: 20 }
  return <section>
    <p>{t('parentHelp')}</p>
    <SaveForm key={profile ? 'limits' : 'setup'} revision={data.revision} t={t} disabled={!!study?.active} submit={(form, revision) => {
      const limits = { blockMinutes: Number(form.get('blockMinutes')), breakMinutes: Number(form.get('breakMinutes')), dailyMinutes: Number(form.get('dailyMinutes')) }
      const parentConfirmation = read(form, 'parentConfirmation')
      if (profile) return change({ action: 'limits', limits, parentConfirmation }, revision)
      return change({ action: 'setup', profile: { nickname: read(form, 'nickname'), region: read(form, 'region'), grade: Number(form.get('grade')), term: form.get('term') === 'second' ? 'second' : 'first', schoolYear: read(form, 'schoolYear'), schoolAlias: read(form, 'schoolAlias'), schoolSystem: form.get('schoolSystem') === 'six-three' ? 'six-three' : 'five-four', limits, parentConfirmation } }, revision)
    }}>
      {profile ? <p>{profile.nickname} · {profile.region} · {profile.grade} · {t(profile.term)} · {profile.schoolYear} · {t(profile.schoolSystem)}</p> : <>
        <Field name="nickname" label={t('nickname')} />
        <Field name="region" label={t('region')} value="上海市" />
        <Field name="grade" label={t('grade')} value={2} type="number" min={1} max={6} />
        <label>{t('term')}<select name="term" aria-label={t('term')}><option value="first">{t('first')}</option><option value="second">{t('second')}</option></select></label>
        <Field name="schoolYear" label={t('schoolYear')} />
        <Field name="schoolAlias" label={t('schoolAlias')} />
        <label>{t('schoolSystem')}<select name="schoolSystem" aria-label={t('schoolSystem')}><option value="five-four">{t('five-four')}</option><option value="six-three">{t('six-three')}</option></select></label>
      </>}
      {(['blockMinutes', 'breakMinutes', 'dailyMinutes'] as const).map(name => <Field key={name} name={name} label={t(name)} value={limits[name]} type="number" min={name === 'dailyMinutes' ? 10 : 5} max={name === 'dailyMinutes' ? 30 : 15} />)}
      <Field name="parentConfirmation" label={t('parentConfirmation')} />
    </SaveForm>
    {profile && <>
      <h3>{t('curriculum')}</h3><p>{t('materialHelp')}</p>
      {study.courses.map(course => <p key={course.subject}>{t(course.subject)} · {study.materials.find(item => item.id === course.materialId)?.title} · {course.unit}</p>)}
      <SaveForm revision={data.revision} t={t} disabled={!!study.active} submit={(form, revision) => {
        const materialId = crypto.randomUUID()
        const selected = read(form, 'subject')
        const subject = subjects.find(item => item === selected) ?? 'math'
        const { region, grade, term, schoolYear, schoolSystem } = profile
        return change({ action: 'configure-course', material: { id: materialId, subject, scope: { region, grade, term, schoolYear, schoolSystem }, title: read(form, 'title'), publisher: read(form, 'publisher'), edition: read(form, 'edition'), editionStatus: 'identified', kind: 'official-textbook', locator: read(form, 'locator'), evidence: read(form, 'evidence') }, course: { subject, materialId, unit: read(form, 'unit'), parentConfirmation: t('materialConfirm') } }, revision)
      }}>
        <label>{t('subject')}<select name="subject" aria-label={t('subject')}>{subjects.map(subject => <option key={subject} value={subject}>{t(subject)}</option>)}</select></label>
        {(['title', 'publisher', 'edition', 'locator', 'evidence', 'unit'] as const).map(name => <Field key={name} name={name} label={t(name === 'title' ? 'titleField' : name === 'evidence' ? 'evidenceField' : name)} />)}
        <label className="student-check"><input type="checkbox" required />{t('materialConfirm')}</label>
      </SaveForm>
    </>}
  </section>
}

/** Confirmation retains the unedited image transcription until a user explicitly saves it. */
export function MistakeConfirmation({ mistake, revision, change, t }: { mistake: StudyState['mistakes'][number]; revision: number; change: ChangeStudy; t: Translate }) {
  return <details><summary>{mistake.topic}</summary>
    <p>{t('learnerAnswer')}: {mistake.learnerAnswer}</p>
    {mistake.uncertainties && <p>{t('uncertainties')}: {mistake.uncertainties}</p>}
    <SaveForm revision={revision} t={t} button="confirm" submit={(form, base) => change({ action: 'confirm-mistake', id: mistake.id, prompt: read(form, 'prompt'), learnerAnswer: read(form, 'learnerAnswer'), correction: read(form, 'correction'), explanation: read(form, 'explanation'), answerEvidence: read(form, 'answerEvidence'), userConfirmation: t('confirmMistake') }, base)}>
      {(['prompt', 'learnerAnswer', 'correction', 'explanation', 'answerEvidence'] as const).map(name => <label key={name}>{t(name)}<textarea aria-label={t(name)} name={name} defaultValue={mistake[name]} required maxLength={2000} /></label>)}
      <label className="student-check"><input type="checkbox" required />{t('confirmMistake')}</label>
    </SaveForm>
  </details>
}
