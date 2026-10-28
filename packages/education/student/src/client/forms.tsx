import { useState, type FormEvent, type ReactNode } from 'react'
import type { Command, StudyState } from '../schema.ts'
import { errorTypesBySubject } from '../vocabulary.ts'
import type { Dashboard } from '../dashboard.ts'
import type { Translate } from './locales.ts'

export type ChangeStudy = (command: Command, revision?: number) => Promise<Dashboard>
export const subjects = ['chinese', 'math', 'english'] as const
const read = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

/** Labelled native field with browser validation, preserving unsaved text across polling. */
export function Field({ name, label, value = '', type = 'text', min, max, required = true }: { name: string; label: string; value?: string | number; type?: string; min?: number; max?: number; required?: boolean }) {
  return <label>{label}<input name={name} defaultValue={value} type={type} min={min} max={max} required={required} maxLength={2000} /></label>
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
export function ParentSettings({ data, change, t, curriculum = null, subject = 'math', onSubject }: {
  data: Dashboard
  change: ChangeStudy
  t: Translate
  curriculum?: NonNullable<Dashboard['study']>['curriculum']
  subject?: typeof subjects[number]
  onSubject?: (subject: typeof subjects[number]) => void
}) {
  const [progressError, setProgressError] = useState('')
  const study = data.study
  const profile = study?.profile
  const today = new Date(data.serverNow + 8 * 60 * 60 * 1000)
  const currentYear = today.getUTCFullYear() - (today.getUTCMonth() < 8 ? 1 : 0)
  const years = Array.from({ length: 7 }, (_, index) => `${currentYear + 1 - index}–${currentYear + 2 - index}`)
  const limits = profile?.limits ?? { blockMinutes: 10, breakMinutes: 5, dailyMinutes: 20 }
  return <section>
    <p>{t('parentHelp')}</p>
    {!!study?.active && <p role="status">{t('settingsWhileActive')}</p>}
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
        <label>{t('schoolYear')}<select name="schoolYear" aria-label={t('schoolYear')} defaultValue="" required>
          <option value="" disabled>{t('chooseSchoolYear')}</option>
          {years.map(year => <option key={year} value={year}>{year}</option>)}
        </select></label>
        <p>{t('schoolYearHelp')}</p>
        <Field name="schoolAlias" label={t('schoolAlias')} required={false} />
        <p>{t('schoolAliasHelp')}</p>
        <label>{t('schoolSystem')}<select name="schoolSystem" aria-label={t('schoolSystem')}><option value="five-four">{t('five-four')}</option><option value="six-three">{t('six-three')}</option></select></label>
      </>}
      {(['blockMinutes', 'breakMinutes', 'dailyMinutes'] as const).map(name => <Field key={name} name={name} label={t(name)} value={limits[name]} type="number" min={name === 'dailyMinutes' ? 10 : 5} max={name === 'dailyMinutes' ? 30 : 15} />)}
      <Field name="parentConfirmation" label={t('parentConfirmation')} />
    </SaveForm>
    {profile && <>
      <h3>{t('curriculum')}</h3><p>{t('materialHelp')}</p>
      {study.courses.map(course => <p key={course.subject}>{t(course.subject)} · {study.materials.find(item => item.id === course.materialId)?.title} · {course.unit}</p>)}
      <SaveForm revision={data.revision} t={t} disabled={!!study.active} submit={async (form, revision) => {
        const materialId = crypto.randomUUID()
        const selected = read(form, 'subject')
        const courseSubject = subjects.find(item => item === selected) ?? subject
        const unitId = read(form, 'unitId')
        const unit = curriculum?.scope.current ? curriculum.units.find(item => item.id === unitId) : undefined
        const { region, grade, term, schoolYear, schoolSystem } = profile
        const saved = await change({ action: 'configure-course', material: { id: materialId, subject: courseSubject, scope: { region, grade, term, schoolYear, schoolSystem }, title: curriculum?.scope.current ? curriculum.title : t(courseSubject), publisher: t('mapMaterialPublisher'), edition: curriculum?.scope.current ? curriculum.id : t('mapMaterialEdition'), editionStatus: 'identified', kind: 'official-textbook', locator: curriculum?.scope.current ? `knowledge/curriculum/${curriculum.id}.json` : t('mapMaterialLocator'), evidence: t('mapMaterialEvidence') }, course: { subject: courseSubject, materialId, unit: unit?.name ?? read(form, 'unit'), parentConfirmation: t('materialConfirm') } }, revision)
        if (!unit) return saved
        const existing = saved.study?.courses.find(item => item.subject === courseSubject)?.progress
        return change({ action: 'school-progress', subject: courseSubject, unitId: unit.id, posture: existing?.posture ?? 'keep-up', preview: existing?.preview ? 'on' : 'off', pace: existing?.pace ?? 'teaching', parentConfirmation: t('confirmSchoolProgress') }, saved.revision)
      }}>
        <label>{t('subject')}<select name="subject" aria-label={t('subject')} value={subject} onChange={event => { const next = subjects.find(item => item === event.target.value); if (next) onSubject?.(next) }}>{subjects.map(item => <option key={item} value={item}>{t(item)}</option>)}</select></label>
        {curriculum?.scope.current ? <label>{t('unit')}<select name="unitId" aria-label={t('unit')} key={subject} defaultValue={study.courses.find(item => item.subject === subject)?.progress?.unitId ?? ''} required>
          <option value="" disabled>{t('chooseUnit')}</option>
          {curriculum.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </select></label> : <Field name="unit" label={t('unit')} />}
        <label className="student-check"><input type="checkbox" required />{t('materialConfirm')}</label>
      </SaveForm>
      {curriculum?.scope.current && <>
        <h3>{t('schoolFrontier')}</h3>
        <p>{t('schoolProgressHelp')}</p>
        {onSubject && <nav className="student-segments" aria-label={t('schoolFrontier')}>{subjects.map(item => <button key={item} type="button" aria-pressed={subject === item} onClick={() => onSubject(item)}>{t(item)}</button>)}</nav>}
        {study.courses.some(course => course.subject === subject) ? <form key={`${subject}:${study.courses.find(course => course.subject === subject)?.progress?.unitId ?? ''}`} onSubmit={event => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const submitter = (event.nativeEvent as SubmitEvent).submitter
          const move = submitter instanceof HTMLButtonElement ? submitter.value : 'stay'
          const units = curriculum.units
          const selected = String(form.get('unitId') ?? '')
          const index = units.findIndex(unit => unit.id === selected)
          const next = units[index + 1]
          if (index < 0) return
          if (move === 'next' && !next) { setProgressError(t('noNextUnit')); return }
          setProgressError('')
          void change({ action: 'school-progress', subject, unitId: move === 'next' && next ? next.id : selected, posture: form.get('posture') === 'catch-up' ? 'catch-up' : 'keep-up', preview: form.get('preview') === 'on' ? 'on' : 'off', pace: move === 'review' ? 'review' : 'teaching', parentConfirmation: t('confirmSchoolProgress') }, data.revision)
        }}>
          <label>{t('schoolFrontier')}<select name="unitId" aria-label={t('schoolFrontier')} defaultValue={study.courses.find(course => course.subject === subject)?.progress?.unitId ?? curriculum.units[0]?.id} required>{curriculum.units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
          <label>{t('keepUp')}<select name="posture" aria-label={t('keepUp')} defaultValue={study.courses.find(course => course.subject === subject)?.progress?.posture ?? 'keep-up'}><option value="keep-up">{t('keepUp')}</option><option value="catch-up">{t('catchUp')}</option></select></label>
          <label className="student-check"><input type="checkbox" name="preview" defaultChecked={study.courses.find(course => course.subject === subject)?.progress?.preview === true} />{t('previewUnit')}</label>
          <label className="student-check"><input type="checkbox" required />{t('confirmSchoolProgress')}</label>
          {progressError && <p role="alert">{progressError}</p>}
          <div className="student-segments">
            <button type="submit" value="stay" disabled={!!study.active}>{t('stillThisUnit')}</button>
            <button type="submit" value="next" disabled={!!study.active}>{t('nextSchoolUnit')}</button>
            <button type="submit" value="review" disabled={!!study.active}>{t('reviewWeek')}</button>
          </div>
        </form> : <p>{t('schoolProgressNeedsCourse')}</p>}
      </>}
      <h3>{t('openmaicTitle')}</h3>
      <p className="student-muted">{t('openmaicBaseHelp')}</p>
      <p>{t('openmaicEffective')}: {data.interactiveLessons.baseUrl}</p>
      <SaveForm revision={data.revision} t={t} submit={(form, revision) => change({ action: 'openmaic-settings', baseUrl: read(form, 'baseUrl'), parentConfirmation: t('openmaicConfirm') }, revision)}>
        <Field name="baseUrl" label={t('openmaicBase')} value={study.openmaic?.savedBaseUrl ?? ''} required={false} />
        <p className="student-muted">{t('openmaicAccessHint')}</p>
      </SaveForm>
      {data.study && <div>
        <h3>{t('archiveTerm')}</h3>
        <p className="student-muted">{t('archiveTermHelp')}</p>
        <button type="button" disabled={!!study.active} onClick={() => {
          if (!window.confirm(t('archiveTermConfirm'))) return
          void change({ action: 'archive-term', parentConfirmation: t('archiveTermConfirmation') }, data.revision).catch(() => {})
        }}>{t('archiveTerm')}</button>
      </div>}
    </>}
  </section>
}

/** Confirmation retains the unedited image transcription until a user explicitly saves it. */
export function MistakeConfirmation({ mistake, revision, change, t }: { mistake: StudyState['mistakes'][number]; revision: number; change: ChangeStudy; t: Translate }) {
  return <details><summary>{mistake.topic}</summary>
    <p>{t('learnerAnswer')}: {mistake.learnerAnswer}</p>
    {mistake.uncertainties && <p>{t('uncertainties')}: {mistake.uncertainties}</p>}
    <SaveForm revision={revision} t={t} button="confirm" submit={(form, base) => {
      const picked = read(form, 'errorType')
      const errorType = errorTypesBySubject[mistake.subject].find(candidate => candidate === picked)
      return change({ action: 'confirm-mistake', id: mistake.id, prompt: read(form, 'prompt'), learnerAnswer: read(form, 'learnerAnswer'), correction: read(form, 'correction'), explanation: read(form, 'explanation'), answerEvidence: read(form, 'answerEvidence'), ...(errorType !== undefined ? { errorType } : {}), userConfirmation: t('confirmMistake') }, base)
    }}>
      {(['prompt', 'learnerAnswer', 'correction', 'explanation', 'answerEvidence'] as const).map(name => <label key={name}>{t(name)}<textarea aria-label={t(name)} name={name} defaultValue={mistake[name]} required maxLength={2000} /></label>)}
      <label>{t('errorTypeLabel')}<select name="errorType" defaultValue={mistake.errorType ?? ''}>
        <option value="">{t('errorTypeNone')}</option>
        {errorTypesBySubject[mistake.subject].map(type => <option key={type} value={type}>{t(type)}</option>)}
      </select></label>
      <label className="student-check"><input type="checkbox" required />{t('confirmMistake')}</label>
    </SaveForm>
  </details>
}
