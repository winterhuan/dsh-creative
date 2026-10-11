import { useEffect, useState, type FormEvent } from 'react'
import type { Dashboard } from '../dashboard.ts'
import type { Command } from '../schema.ts'
import type { AskTutor, StudyPhoto } from './bridge.ts'
import { Field, MistakeConfirmation, ParentSettings, subjects, type ChangeStudy } from './forms.tsx'
import type { Translate } from './locales.ts'
import { useStudy } from './workspace.ts'

type Activity = { subject: 'chinese' | 'math' | 'english'; mode: 'foundation' | 'school' | 'review' | 'explore' }
type Study = NonNullable<Dashboard['study']>
function time(ms: number) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
const continuePrompt = '请加载 study 技能，查询当前工作区 study_status。继续已开始的学习段，不重复 start；先核对当前题目：未反馈的已保存答案先评估并 record；无答案且已请求提示时先在对话中给提示；已有反馈或尚未出题时才准备下一题。每道新题先用 task 保存，一次一题。到时先停止并建议休息。'

/** Workbench actions share the same persisted state as the native tutoring tools. */
export function StudyDesk({ sessionId, visible, ask, running, t }: { sessionId: string; visible: boolean; ask: AskTutor; running: boolean; t: Translate }) {
  const [subject, setSubject] = useState<Activity['subject']>('math')
  const [mistakeOffset, setMistakeOffset] = useState(0)
  const workspace = useStudy(sessionId, visible, t('networkError'), mistakeOffset, subject)
  const { data, busy, change } = workspace
  const [tab, setTab] = useState<'today' | 'mistakes' | 'growth' | 'parent'>('today')
  const [activity, setActivity] = useState<Activity>({ subject: 'math', mode: 'foundation' })
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('')
  const [paperSheetId, setPaperSheetId] = useState('')
  const [epoch, setEpoch] = useState(0)
  const [localNow, setLocalNow] = useState(Date.now())
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  useEffect(() => {
    if (!visible) return
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [visible, workspace.offset])
  async function tutor(text = continuePrompt, photo?: StudyPhoto) {
    setSending(true); setSendError('')
    try { await ask(text, photo) }
    catch (reason) { setSendError(reason instanceof Error ? reason.message : t('sendError')); throw reason }
    finally { setSending(false) }
  }
  async function act(command: Command, withTutor = false, prompt = continuePrompt) {
    try { await change(command); if (withTutor) await tutor(prompt) } catch { /* The request or tutor notice retains the failed action and its data. */ }
  }
  const now = Math.max(localNow + workspace.offset.current, data?.serverNow ?? 0)
  const study = data?.study
  const subjectLoading = !!study && study.confirmedSubject !== subject
  const disabled = busy || sending
  const active = study?.active
  const paperSheet = study?.worksheets.find(item => item.id === paperSheetId) ?? study?.worksheets[0]
  useEffect(() => {
    if (active && subject !== active.subject) { setSubject(active.subject); setActivity({ subject: active.subject, mode: active.mode }); setSelectedObjectiveId(''); setMistakeOffset(0) }
  }, [active?.id, active?.subject, active?.mode])
  const task = study?.task?.sessionId === active?.id ? study?.task : undefined
  const remaining = Math.max(0, (study?.remainingMs ?? 0) - (active && data ? Math.max(0, Math.min(now, active.deadline) - data.serverNow) : 0))
  const available = !!active && now < active.deadline && study?.phase === 'studying'
  return <main className="student-desk" aria-label={t('title')}>
    <nav aria-label={t('title')}>{(['today', 'mistakes', 'growth', 'parent'] as const).map(name => <button key={name} type="button" aria-pressed={tab === name} onClick={() => setTab(name)}>{t(name)}</button>)}</nav>
    {study && tab !== 'parent' && <nav aria-label={t('subject')}>{subjects.map(item => <button key={item} type="button" disabled={!!active} aria-pressed={subject === item} onClick={() => { setSubject(item); setActivity({ subject: item, mode: 'foundation' }); setSelectedObjectiveId(''); setMistakeOffset(0) }}>{t(item)}</button>)}</nav>}
    <button type="button" disabled={disabled} onClick={() => { void workspace.reload().then(() => setEpoch(value => value + 1)) }}>{t('reload')}</button>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {sendError && <p role="alert">{sendError}</p>}
    {!data ? !workspace.error && <progress aria-label={t('busy')} /> : !study && tab !== 'parent' ? <section><p>{t('setupFirst')}</p><button onClick={() => setTab('parent')}>{t('parent')}</button></section> : subjectLoading && tab !== 'parent' ? <progress aria-label={t('busy')} /> : <>
      {tab === 'parent' && <ParentSettings key={epoch} data={data} change={change} t={t} />}
      {study && tab === 'today' && <>
        <section><h3>{t('goal')}</h3><p>{study.profile.nickname} · {t('todayStars')}: {study.todayStars}</p>
          <p className="student-timer">{t('dailyRemaining')}: {time(remaining)} · {t('due')}: {study.dueCount}</p>
          {active ? <><p>{t(active.subject)} · {t(active.mode)}</p><p className="student-timer">{t('time')}: {time(active.deadline - now)}</p>
            {!available && <p role="status">{t('expired')}</p>}
          </> : study.phase === 'break' && study.breakRemainingMs - (now - data.serverNow) > 0 ? <p>{t('rest')} · {time(study.breakRemainingMs - (now - data.serverNow))}</p>
            : study.phase === 'daily-complete' ? <p>{t('done')}</p> : <StartForm study={study} activity={activity} choose={setActivity} disabled={disabled || running} t={t} start={(subject, mode) => act({ action: 'start', id: crypto.randomUUID(), subject, mode }, true, mode === 'foundation' && selectedObjectiveId ? `${continuePrompt} 本段优先围绕已确认学习目标 ${selectedObjectiveId} 出题，并在 task 中写 objectiveId。` : continuePrompt)} />}
        </section>
        <section><h3>{t(subject)} · {t('learningMethod')}</h3><p>{t(subject === 'chinese' ? 'chineseMethod' : subject === 'math' ? 'mathMethod' : 'englishMethod')}</p>
          <button type="button" disabled={disabled || running} onClick={() => { void tutor(`请加载 study 技能，查询当前工作区 ${subject} 科目的概念、学习目标和错题。根据已确认教材或标注的通用资料，提出一个概念定义、例子及依据，先仅保存待确认概念；经家长核对后再创建学习目标或概念关系，不替家长确认。`).catch(() => {}) }}>{t('organizeConcepts')}</button>
          {study.concepts.map(item => <details key={item.id}><summary>{item.name}{item.confirmedAt === undefined ? ` · ${t('pendingConcept')}` : ''}</summary>
            <p>{t('definition')}: {item.definition}</p><p>{t('example')}: {item.example}</p><p>{t('source')}: {item.source}</p>
            {item.confirmedAt === undefined && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: 'confirm-concept', id: item.id, definition: String(form.get('definition') ?? ''), example: String(form.get('example') ?? ''), source: String(form.get('source') ?? ''), userConfirmation: String(form.get('confirmation') ?? '') }) }}>
              {(['definition', 'example', 'source'] as const).map(name => <label key={name}>{t(name)}<textarea name={name} defaultValue={item[name]} required maxLength={2000} /></label>)}
              <label>{t('parentConfirmation')}<input name="confirmation" required maxLength={2000} /></label><button disabled={disabled} type="submit">{t('confirmConcept')}</button>
            </form>}
          </details>)}
          {study.relations.map(item => <p key={item.id}>{study.concepts.find(concept => concept.id === item.fromId)?.name ?? item.fromId} · {t(item.kind)} · {study.concepts.find(concept => concept.id === item.toId)?.name ?? item.toId}: {item.explanation} · {t('source')}: {item.source}</p>)}
          {study.objectives.map(item => <div key={item.id}><p>{item.title} · {t(item.method)}: {item.goal}</p>
            <button type="button" disabled={!!active} aria-pressed={selectedObjectiveId === item.id} onClick={() => setSelectedObjectiveId(item.id)}>{t('chooseGoal')} · {item.title}</button>
          </div>)}
          {selectedObjectiveId && !active && <button type="button" onClick={() => setSelectedObjectiveId('')}>{t('clearGoal')}</button>}
        </section>
        {active && <>
          <section><p>{t('chatHelp')}</p>{task ? <Task key={task.id} study={study} available={available} disabled={disabled || running} t={t} act={act} /> : <p>{t('waiting')}</p>}
            {available && (running || sending ? <p role="status">{t('tutorWorking')}</p>
              : (!task || study.feedback || task.response !== undefined || task.hintRequested) && <button disabled={disabled} onClick={() => { void tutor().catch(() => {}) }}>{t(!task ? 'prepareTask' : study.feedback ? 'nextTask' : task.response !== undefined ? 'retryFeedback' : 'retryHint')}</button>)}
          </section>
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: 'stop', sessionId: active.id, reflection: String(form.get('reflection') ?? '') }) }}>
            <label>{t('reflection')}<textarea aria-label={t('reflection')} name="reflection" maxLength={2000} /></label><button disabled={disabled} type="submit">{t('stop')}</button>
          </form>
        </>}
      </>}
      {study && tab === 'mistakes' && <>
        <PhotoIntake ask={tutor} disabled={disabled || running} t={t} />
        <section><h3>{t('notebook')} · {t(subject)} · {study.confirmedCounts[subject]}</h3>
          {study.confirmedMistakes.length === 0 && <p>{t('empty')}</p>}
          {study.confirmedMistakes.map(item => <details key={item.id}><summary>{item.topic}</summary>
            <p>{t('prompt')}: {item.prompt}</p><p>{t('learnerAnswer')}: {item.learnerAnswer}</p>
            <p>{t('correction')}: {item.correction}</p><p>{t('explanation')}: {item.explanation}</p>
            <p>{t('answerEvidence')}: {item.answerEvidence}</p>
            <MistakeObjective mistake={item} objectives={study.objectives} change={change} t={t} />
            {item.dueAt !== undefined && <p>{t('nextReview')}: {item.dueAt <= now ? t('dueNow') : new Date(item.dueAt).toLocaleString()}</p>}
          </details>)}
          {study.confirmedCount > 20 && <div className="student-pages">
            <button type="button" disabled={study.confirmedOffset === 0} onClick={() => setMistakeOffset(study.confirmedOffset - 20)}>{t('previousPage')}</button>
            <span>{t('page')} {Math.floor(study.confirmedOffset / 20) + 1} / {Math.ceil(study.confirmedCount / 20)}</span>
            <button type="button" disabled={study.confirmedOffset + 20 >= study.confirmedCount} onClick={() => setMistakeOffset(study.confirmedOffset + 20)}>{t('nextPage')}</button>
          </div>}
        </section>
        <section><h3>{t('worksheets')}</h3>
          <button type="button" disabled={disabled || running || study.objectives.length === 0 || study.confirmedCount === 0} onClick={() => { void tutor(`请加载 study 技能，查询 ${subject} 科已确认且关联学习目标的错题。针对一个学习目标生成不超过五道自编变式题，逐题实际求解并写答案依据，用 worksheet 保存练习单；不要复制已保存的原题，也不要把答案写入题干。`).catch(() => {}) }}>{t('createWorksheet')}</button>
          {study.worksheets.length === 0 && <p>{t('empty')}</p>}
          {study.worksheets.map(sheet => <WorksheetActions key={sheet.id} worksheet={sheet} sessionId={sessionId} revision={data.revision} canPrint={study.printAvailable} t={t} />)}
          {paperSheet && <>
            <label>{t('worksheet')}<select aria-label={t('worksheet')} value={paperSheet.id} onChange={event => setPaperSheetId(event.target.value)}>{study.worksheets.map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.id}</option>)}</select></label>
            <PhotoIntake ask={tutor} disabled={disabled || running} t={t} variant="paper" prompt={`请加载 study 技能，查询练习单 ${paperSheet.id}。实际读取这张纸上作答照片，按练习单题号逐项转录学生原答案。先向我展示转录和不确定之处，等待确认；核对答案依据后才用 paper-result 逐题保存。纸上结果不需要开始计时学习段，不按上传次数发星。`} />
          </>}
          {study.paperResults.map(result => <p key={`${result.worksheetId}-${result.itemId}`}>{result.worksheetId} · {result.itemId} · {t(result.result)}: {result.response}</p>)}
        </section>
        <section><h3>{t('due')} · {study.dueCount}</h3>{study.dueMistakes.length === 0 && <p>{t('empty')}</p>}
          {study.dueMistakes.map(item => <p key={item.id}>{t(item.subject)} · {item.topic}</p>)}
          {study.dueSubjects.map(item => <button key={item} disabled={disabled || running || study.phase !== 'ready'} onClick={() => { setActivity({ subject: item, mode: 'review' }); setTab('today') }}>{t('review')} · {t(item)}</button>)}
          {study.dueSubjects.length > 0 && study.phase !== 'ready' && <p>{t('reviewBlocked')}</p>}
        </section>
        <section><h3>{t('pending')} · {study.pendingCount}</h3>{study.pendingMistakes.length === 0 && <p>{t('empty')}</p>}
          {study.pendingMistakes.map(item => <MistakeConfirmation key={`${epoch}-${item.id}`} mistake={item} revision={data.revision} change={change} t={t} />)}
        </section><p>{t('mistakeBounded')}</p>
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

function StartForm({ study, activity, choose, disabled, start, t }: { study: Study; activity: Activity; choose: (activity: Activity) => void; disabled: boolean; start: (subject: Activity['subject'], mode: Activity['mode']) => Promise<void>; t: Translate }) {
  const { subject, mode } = activity
  const confirmed = study.courses.some(item => item.subject === subject)
  const due = study.dueSubjects.includes(subject)
  return <form onSubmit={event => { event.preventDefault(); void start(subject, mode) }}><fieldset disabled={disabled}>
    <label>{t('mode')}<select aria-label={t('mode')} value={mode} onChange={event => { const value = event.target.value; choose({ subject, mode: value === 'school' || value === 'review' || value === 'explore' ? value : 'foundation' }) }}>{(['foundation', 'school', 'review', 'explore'] as const).map(item => <option key={item} value={item} disabled={(item === 'school' && !confirmed) || (item === 'review' && !due)}>{t(item)}</option>)}</select></label>
    <p>{t(mode === 'foundation' ? 'foundationHelp' : mode === 'school' ? 'schoolHelp' : mode === 'review' ? 'reviewHelp' : 'exploreHelp')}</p>
    {!confirmed && <p>{t('unconfirmed')}</p>}
    <button type="submit" disabled={(mode === 'school' && !confirmed) || (mode === 'review' && !due)}>{t('start')}</button>
  </fieldset></form>
}

function Task({ study, available, disabled, t, act }: { study: Study; available: boolean; disabled: boolean; t: Translate; act: (command: Command, withTutor?: boolean) => Promise<void> }) {
  const task = study.task
  if (!task) return null
  return <><h3>{task.topic}</h3><p className="student-question">{task.prompt}</p>
    {task.response !== undefined && <p>{t('answer')}: {task.response}</p>}
    {study.feedback ? <><p>{t(study.feedback.result)}</p><p>{study.feedback.feedback}</p></> : task.response !== undefined ? <p role="status">{t('submitted')}</p> : <form onSubmit={event => { event.preventDefault(); void act({ action: 'answer', taskId: task.id, response: String(new FormData(event.currentTarget).get('answer') ?? '') }, true) }}>
      <fieldset disabled={!available || disabled}><Field name="answer" label={t('answer')} /><button type="submit">{t('submit')}</button>
        <button type="button" onClick={() => { void act({ action: 'hint', taskId: task.id }, true) }}>{t('hint')}</button>
      </fieldset>
    </form>}
    {task.hintRequested && <p>{t('hinted')}</p>}
  </>
}

function MistakeObjective({ mistake, objectives, change, t }: { mistake: Study['confirmedMistakes'][number]; objectives: Study['objectives']; change: ChangeStudy; t: Translate }) {
  const [error, setError] = useState('')
  return <form onSubmit={event => {
    event.preventDefault(); setError('')
    const objectiveId = String(new FormData(event.currentTarget).get('objectiveId') ?? '')
    void change({ action: 'link-mistake', mistakeId: mistake.id, objectiveId }).catch(reason => setError(reason instanceof Error ? reason.message : t('networkError')))
  }}>
    <label>{t('learningGoal')}<select name="objectiveId" defaultValue={mistake.objectiveId ?? ''} required>
      <option value="" disabled>{t('unclassified')}</option>
      {objectives.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select></label>
    <button type="submit" disabled={objectives.length === 0}>{t('linkGoal')}</button>
    {error && <p role="alert">{error}</p>}
  </form>
}

function WorksheetActions({ worksheet, sessionId, revision, canPrint, t }: { worksheet: Study['worksheets'][number]; sessionId: string; revision: number; canPrint: boolean; t: Translate }) {
  const [previewed, setPreviewed] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
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
  return <details><summary>{worksheet.id} · {worksheet.items.length} {t('questions')}</summary>
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={() => setPreviewed(true)}>{t('previewPdf')}</a>
    <button type="button" disabled={!canPrint || !previewed || printing || !!message} onClick={() => { void print() }}>{t('printWorksheet')}</button>
    {!canPrint && <p>{t('printUnavailable')}</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>
}

const mistakePhotoPrompt = '请加载 study 技能，实际读取这张题目照片，逐项转录原题和学生回答，核对推导与答案依据，以 mistake 保存为待确认错题。不要猜测不清楚的文字，不要替用户确认；请我到学习工作台核对。此步只录入资料，不开始教学。'
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
