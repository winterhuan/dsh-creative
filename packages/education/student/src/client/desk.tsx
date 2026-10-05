import { useEffect, useState, type FormEvent } from 'react'
import type { Dashboard } from '../dashboard.ts'
import type { Command } from '../schema.ts'
import type { AskTutor, StudyPhoto } from './bridge.ts'
import { Field, MistakeConfirmation, ParentSettings, subjects } from './forms.tsx'
import type { Translate } from './locales.ts'
import { useStudy } from './workspace.ts'

type Study = NonNullable<Dashboard['study']>
function time(ms: number) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
const continuePrompt = '请加载 study 技能，查询当前工作区 study_status。继续已开始的学习段，不重复 start；如有已保存答案先核对并 record，如请求了提示则在对话中给提示。每道新题先用 task 保存，一次一题。到时先停止并建议休息。'

/** Workbench actions share the same persisted state as the native tutoring tools. */
export function StudyDesk({ sessionId, visible, ask, running, t }: { sessionId: string; visible: boolean; ask: AskTutor; running: boolean; t: Translate }) {
  const workspace = useStudy(sessionId, visible, t('networkError'))
  const { data, busy, change } = workspace
  const [tab, setTab] = useState<'today' | 'mistakes' | 'growth' | 'parent'>('today')
  const [epoch, setEpoch] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  useEffect(() => {
    if (!visible) return
    const timer = window.setInterval(() => setNow(Date.now() + workspace.offset.current), 1000)
    return () => window.clearInterval(timer)
  }, [visible, workspace.offset])
  async function tutor(text = continuePrompt, photo?: StudyPhoto) {
    setSending(true); setSendError('')
    try { await ask(text, photo) }
    catch (reason) { setSendError(reason instanceof Error ? reason.message : t('sendError')); throw reason }
    finally { setSending(false) }
  }
  async function act(command: Command, withTutor = false) {
    try { await change(command); if (withTutor) await tutor() } catch { /* The request or tutor notice retains the failed action and its data. */ }
  }
  const study = data?.study
  const disabled = busy || sending
  const active = study?.active
  const available = !!active && now < active.deadline && study?.phase === 'studying'
  return <main className="student-desk" aria-label={t('title')}>
    <nav aria-label={t('title')}>{(['today', 'mistakes', 'growth', 'parent'] as const).map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>{t(name)}</button>)}</nav>
    <button type="button" disabled={disabled} onClick={() => { void workspace.reload().then(() => setEpoch(value => value + 1)) }}>{t('reload')}</button>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {sendError && <p role="alert">{sendError}</p>}
    {!data ? !workspace.error && <progress aria-label={t('busy')} /> : !study && tab !== 'parent' ? <section><p>{t('setupFirst')}</p><button onClick={() => setTab('parent')}>{t('parent')}</button></section> : <>
      {tab === 'parent' && <ParentSettings key={epoch} data={data} change={change} t={t} />}
      {study && tab === 'today' && <>
        <section><h3>{t('goal')}</h3><p>{study.profile.nickname} · {t('stars')}: {study.stars}</p>
          {active ? <><p>{t(active.subject)} · {t(active.mode)}</p><p className="student-timer">{t('time')}: {time(active.deadline - now)}</p>
            {!available && <p role="status">{t('expired')}</p>}
          </> : study.phase === 'break' && study.breakRemainingMs - (now - data.serverNow) > 0 ? <p>{t('rest')} · {time(study.breakRemainingMs - (now - data.serverNow))}</p>
            : study.phase === 'daily-complete' ? <p>{t('done')}</p> : <StartForm study={study} disabled={disabled || running} t={t} start={(subject, mode) => act({ action: 'start', id: crypto.randomUUID(), subject, mode }, true)} />}
        </section>
        {active && <>
          <section>{study.task?.sessionId === active.id ? <Task key={study.task.id} study={study} available={available} disabled={disabled || running} t={t} act={act} /> : <p>{t('waiting')}</p>}
            {available && <button disabled={disabled || running} onClick={() => { void tutor().catch(() => {}) }}>{t('continue')}</button>}
          </section>
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: 'stop', sessionId: active.id, reflection: String(form.get('reflection') ?? '') }) }}>
            <label>{t('reflection')}<textarea aria-label={t('reflection')} name="reflection" maxLength={2000} /></label><button disabled={disabled} type="submit">{t('stop')}</button>
          </form>
        </>}
      </>}
      {study && tab === 'mistakes' && <>
        <PhotoIntake ask={tutor} disabled={disabled || running} t={t} />
        <section><h3>{t('due')} · {study.dueCount}</h3>{study.dueMistakes.length === 0 && <p>{t('empty')}</p>}
          {study.dueMistakes.map(item => <p key={item.id}>{t(item.subject)} · {item.topic}</p>)}
          {study.dueMistakes.length > 0 && <button onClick={() => setTab('today')}>{t('review')}</button>}
        </section>
        <section><h3>{t('pending')} · {study.pendingCount}</h3>{study.pendingMistakes.length === 0 && <p>{t('empty')}</p>}
          {study.pendingMistakes.map(item => <MistakeConfirmation key={`${epoch}-${item.id}`} mistake={item} revision={data.revision} change={change} t={t} />)}
        </section><p>{t('bounded')}</p>
      </>}
      {study && tab === 'growth' && <>
        <section><h3>{t('stars')}: {study.stars}</h3><p>{t('starsHelp')}</p></section>
        <section><h3>{t('evidence')}</h3>{study.progress.length === 0 && <p>{t('empty')}</p>}
          {study.progress.map(item => <p key={JSON.stringify([item.subject, item.topic, item.materialId])}>{item.topic} · {t(item.level === 'independent-on-three-days' ? 'independent' : 'practising')}</p>)}
          {study.recentAttempts.map(item => <details key={item.id}><summary>{item.topic} · {t(item.result)}</summary><p>{item.prompt}</p><p>{item.response}</p><p>{item.feedback}</p><p>{item.answerEvidence}</p></details>)}
        </section><p>{t('bounded')}</p>
      </>}
    </>}
  </main>
}

function StartForm({ study, disabled, start, t }: { study: Study; disabled: boolean; start: (subject: 'chinese' | 'math' | 'english', mode: 'foundation' | 'school' | 'review' | 'explore') => Promise<void>; t: Translate }) {
  const [subject, setSubject] = useState<'chinese' | 'math' | 'english'>('math')
  const [mode, setMode] = useState<'foundation' | 'school' | 'review' | 'explore'>('foundation')
  const confirmed = study.courses.some(item => item.subject === subject)
  const due = study.dueSubjects.includes(subject)
  return <form onSubmit={event => { event.preventDefault(); void start(subject, mode) }}><fieldset disabled={disabled}>
    <label>{t('subject')}<select aria-label={t('subject')} value={subject} onChange={event => { setSubject(subjects.find(item => item === event.target.value) ?? 'math'); setMode('foundation') }}>{subjects.map(item => <option key={item} value={item}>{t(item)}</option>)}</select></label>
    <label>{t('mode')}<select aria-label={t('mode')} value={mode} onChange={event => { const value = event.target.value; setMode(value === 'school' || value === 'review' || value === 'explore' ? value : 'foundation') }}>{(['foundation', 'school', 'review', 'explore'] as const).map(item => <option key={item} value={item} disabled={(item === 'school' && !confirmed) || (item === 'review' && !due)}>{t(item)}</option>)}</select></label>
    {!confirmed && <p>{t('unconfirmed')}</p>}
    <button type="submit" disabled={(mode === 'school' && !confirmed) || (mode === 'review' && !due)}>{t('start')}</button>
  </fieldset></form>
}

function Task({ study, available, disabled, t, act }: { study: Study; available: boolean; disabled: boolean; t: Translate; act: (command: Command, withTutor?: boolean) => Promise<void> }) {
  const task = study.task
  if (!task) return null
  return <><h3>{task.topic}</h3><p className="student-question">{task.prompt}</p>
    {study.feedback ? <><p>{t(study.feedback.result)}</p><p>{study.feedback.feedback}</p></> : task.response !== undefined ? <><p>{task.response}</p><p role="status">{t('submitted')}</p></> : <form onSubmit={event => { event.preventDefault(); void act({ action: 'answer', taskId: task.id, response: String(new FormData(event.currentTarget).get('answer') ?? '') }, true) }}>
      <fieldset disabled={!available || disabled}><Field name="answer" label={t('answer')} /><button type="submit">{t('submit')}</button>
        <button type="button" onClick={() => { void act({ action: 'hint', taskId: task.id }, true) }}>{t('hint')}</button>
      </fieldset>
    </form>}
    {task.hintRequested && <p>{t('hinted')}</p>}
  </>
}

function PhotoIntake({ ask, disabled, t }: { ask: AskTutor; disabled: boolean; t: Translate }) {
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
    try { await ask('请加载 study 技能，实际读取这张题目照片，逐项转录原题和学生回答，核对推导与答案依据，以 mistake 保存为待确认错题。不要猜测不清楚的文字，不要替用户确认；请我到学习工作台核对。此步只录入资料，不开始教学。', photo); setPhoto(undefined) }
    catch { /* Tutor submission notice is owned by the workbench. */ }
  }
  return <section><h3>{t('photo')}</h3><p>{t('photoHelp')}</p><form onSubmit={event => { void submit(event) }}>
    <label>{t('photo')}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || reading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file) }} /></label>
    {photo && <img src={photo.preview} alt={t('preview')} />}
    <button type="submit" disabled={!photo || disabled || reading}>{t('sendPhoto')}</button>
    {error && <p role="alert">{error}</p>}
  </form></section>
}
