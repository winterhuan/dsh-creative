import { useEffect, useState, type FormEvent } from 'react'
import type { Dashboard, MistakeStatus } from '../dashboard.ts'
import type { Command } from '../schema.ts'
import type { CheckInIntensity, InsightReason, ObjectiveInsight } from '../learning.ts'
import type { AskTutor, StudyPhoto } from './bridge.ts'
import { Field, MistakeConfirmation, ParentSettings, subjects, type ChangeStudy } from './forms.tsx'
import type { Translate } from './locales.ts'
import { errorTypesBySubject, type ErrorTypeValue } from '../vocabulary.ts'
import { useStudy } from './workspace.ts'

type Activity = { subject: 'chinese' | 'math' | 'english'; mode: 'foundation' | 'school' | 'review' | 'explore' | 'diagnose' }
/** A check-in or learning scope: the current term, another grade/term, or one unit of it. */
type ScopeChoice = { grade?: number; term?: 'first' | 'second'; unit?: string }
type Study = NonNullable<Dashboard['study']>
type Tab = 'today' | 'map' | 'checkin' | 'mistakes' | 'growth' | 'parent'
type Goal = { id: string; title: string }
type Level = ObjectiveInsight['level']
type Curriculum = NonNullable<Study['curriculum']>
const levels = ['mastered', 'practising', 'stalled', 'weak', 'due', 'untouched'] as const
const intensityKeys = { light: 'intensityLight', standard: 'intensityStandard', deep: 'intensityDeep' } as const
const intensityHelpKeys = { light: 'intensityLightHelp', standard: 'intensityStandardHelp', deep: 'intensityDeepHelp' } as const
const sampleKeys = { untouched: 'sampleUntouched', stalled: 'sampleStalled', recheck: 'sampleRecheck', progress: 'sampleProgress' } as const
const assistKeys = { independent: 'assistIndependent', hint: 'assistHint', 'worked-example': 'assistWorked' } as const
const focusKeys = { literacy: 'focusLiteracy', pinyin: 'focusPinyin', reading: 'focusReading', writing: 'focusWriting', concepts: 'focusConcepts', calculation: 'focusCalculation', geometry: 'focusGeometry', measurement: 'focusMeasurement', words: 'focusWords', sentences: 'focusSentences', story: 'focusStory', listen: 'focusListen', project: 'focusProject', review: 'focusReview' } as const
const reminderKeys = { 'first-explain': 'remindFirst', 'after-correction': 'remindAfterFix', 'before-next': 'remindNext' } as const
const date = (ms: number | undefined) => ms === undefined ? '' : new Date(ms).toLocaleDateString()
function time(ms: number) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` }
const levelKeys = { due: 'levelDue', weak: 'levelWeak', stalled: 'levelStalled', mastered: 'levelMastered', practising: 'levelPractising', untouched: 'levelUntouched' } as const
const reasonKeys = { 'due-mistakes': 'reasonDue', 'open-mistakes': 'reasonOpen', 'recent-help-or-error': 'reasonRecent', 'recurring-error': 'reasonRecurring', 'not-practised-recently': 'reasonStalled', 'not-started': 'reasonNew', 'diagnosis-due': 'reasonDiagnose', preview: 'reasonPreview', 'school-pace': 'reasonSchoolPace' } as const
const subjectPreference = 'student-desk:subject'
function storedSubject(): Activity['subject'] {
  try { const value = window.localStorage.getItem(subjectPreference); return value === 'chinese' || value === 'english' ? value : 'math' } catch { return 'math' }
}
function storeSubject(value: Activity['subject']) {
  try { window.localStorage.setItem(subjectPreference, value) } catch { /* The preference is a convenience; blocked storage falls back to the default subject. */ }
}
const continuePrompt = '请加载 study 技能，查询当前工作区 study_status。继续已开始的学习段，不重复 start；先核对当前题目：未反馈的已保存答案先评估并 record；无答案且已请求提示时先在对话中给提示；已有反馈或尚未出题时才准备下一题。每道新题先用 task 保存，一次一题。计算、听写、找依据用自由作答；识字和情境判断才用 2 到 4 个选项（choices）。到时先停止并建议休息。'
const reviewPrompt = '请加载 study 技能，查询当前工作区 study_status 和到期错题详情。本段优先复习到期错题：先让学生回忆或做一道变式：改数字和情境，保留原来的错误类型，不先展示已保存答案。一次一题，用 task 保存并写上 mistakeId 与错题关联的 objectiveId。计算用自由作答，识字和情境判断才用 2 到 4 个选项（choices）。到时先停止并建议休息。'
const goalPrompt = (objectiveId: string) => `请加载 study 技能，查询当前工作区 study_status，并用 study_status kind=curriculum 读取学习目标 ${objectiveId} 对应的知识点定义与例子。本段优先围绕该目标出题：一次一题，用 task 保存并在 task 中写 objectiveId。计算、听写、找依据用自由作答；识字和情境判断才用 2 到 4 个选项（choices）。先让学生尝试，再按需提示。到时先停止并建议休息。`
const diagnosePrompt = (intensity: CheckInIntensity, ids: string[]) => `请加载 study 技能，查询 study_status 和 study_status kind=diagnose。本段是${intensity === 'light' ? '轻量' : intensity === 'deep' ? '全面' : '常规'}摸底（最多 ${ids.length} 题），按以下学习目标各出一道短题：${ids.join('，')}。${intensity === 'light' ? '全部用 2 到 4 个选项的选择题；' : intensity === 'deep' ? '每个单元至少一道需要说理或自由作答的题，其余优先选项题；' : '优先 2 到 4 个选项的选择题；'}一题一记录，task、answer、record 都带 objectiveId；每题只给简短反馈，不展开教学，不主动提示。做完或到时就停止，用孩子能懂的话说说哪些已经会了、哪些要再练。`
function reasonText(reasons: InsightReason[], t: Translate) {
  return reasons.map(reason => reason.code === 'not-started' || reason.code === 'preview' || reason.code === 'school-pace' ? t(reasonKeys[reason.code]) : `${t(reasonKeys[reason.code])} ${reason.count}`).join(' · ')
}
const planKeys = { review: 'recommendReview', practice: 'recommendPractice', diagnose: 'recommendDiagnose', learn: 'recommendLearn', preview: 'recommendPreview', hold: 'recommendHold' } as const
const previewPrompt = (objectiveId: string) => `${goalPrompt(objectiveId)}本段是预习学校的下一单元：先告诉孩子学校还没教到这里，只围绕这一个目标出题。`
const dailySheetPrompt = (subject: Activity['subject']) => `请加载 study 技能，并阅读 references/questions.md 与 references/daily-routine.md。用 study_status kind=elements subject=${subject} 读取学校已教范围内本单元的学习要素，再用 kind=weak 看薄弱点。写一张每日小卷：4 到 6 题，kind 写 daily，每题写 objectiveId——生字或单词 2 到 3 题、句子或口算 1 到 2 题、再挑一个反复出现的错因出一道变式（换数字或情境，不照抄原题）。题干不含答案和选项，需要图时用 figure。用 worksheet 保存，之后告诉我编号。`
const dictationPrompt = (subject: Activity['subject']) => `请加载 study 技能，查询 study_status，并用 study_status kind=elements subject=${subject} 读取本单元的生字或单词与出题要点。本段用对话听写：没有进行中的学习段时，先确认面板状态并用 start 开始一段 foundation 学习段（subject=${subject}）。先让学生准备好纸笔，再用 task 一次报一个字词或一句话（自由作答），task 写 objectiveId；学生写完后对照答案用 record 反馈，写错的用 mistake 保存为待确认错题。不把答案写进题干，不一次报完。`

/** Workbench actions share the same persisted state as the native tutoring tools. */
export function StudyDesk({ sessionId, visible, ask, running, t }: { sessionId: string; visible: boolean; ask: AskTutor; running: boolean; t: Translate }) {
  const [subject, setSubject] = useState<Activity['subject']>(storedSubject)
  const [mistakeOffset, setMistakeOffset] = useState(0)
  const [mistakeStatus, setMistakeStatus] = useState<MistakeStatus>('all')
  const [mapGrade, setMapGrade] = useState<number>()
  const [mapTerm, setMapTerm] = useState<'first' | 'second'>()
  const [selectedConceptId, setSelectedConceptId] = useState('')
  const [intensities, setIntensities] = useState<Partial<Record<Activity['subject'], CheckInIntensity>>>({})
  const [scopeChoice, setScopeChoice] = useState<Partial<Record<Activity['subject'], ScopeChoice>>>({})
  const scopeOf = (target: Activity['subject']): ScopeChoice => scopeChoice[target] ?? {}
  const activeScope = scopeOf(subject)
  const workspace = useStudy(sessionId, visible, t('networkError'), { offset: mistakeOffset, subject, status: mistakeStatus, ...(mapGrade !== undefined ? { mapGrade } : {}), ...(mapTerm !== undefined ? { mapTerm } : {}), ...(activeScope.grade !== undefined ? { diagGrade: activeScope.grade } : {}), ...(activeScope.term !== undefined ? { diagTerm: activeScope.term } : {}), ...(activeScope.unit ? { diagUnit: activeScope.unit } : {}) })
  const { data, busy, change } = workspace
  const [tab, setTab] = useState<Tab>('today')
  const [activity, setActivity] = useState<Activity>({ subject: storedSubject(), mode: 'foundation' })
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
  function selectSubject(item: Activity['subject']) { setSubject(item); storeSubject(item) }
  const now = Math.max(localNow + workspace.offset.current, data?.serverNow ?? 0)
  const study = data?.study
  const subjectLoading = !!study && study.confirmedSubject !== subject
  const disabled = busy || sending
  const active = study?.active
  const paperSheet = study?.worksheets.find(item => item.id === paperSheetId) ?? study?.worksheets[0]
  useEffect(() => {
    if (active && subject !== active.subject) { selectSubject(active.subject); setActivity({ subject: active.subject, mode: active.mode }); setSelectedObjectiveId(''); setMistakeOffset(0) }
  }, [active?.id, active?.subject, active?.mode])
  const task = study?.task?.sessionId === active?.id ? study?.task : undefined
  const remaining = Math.max(0, (study?.remainingMs ?? 0) - (active && data ? Math.max(0, Math.min(now, active.deadline) - data.serverNow) : 0))
  const available = !!active && now < active.deadline && study?.phase === 'studying'
  const curriculum = study?.curriculum ?? null
  const scopeGrade = curriculum?.scope.grade ?? mapGrade ?? study?.profile.grade ?? 1
  const scopeTerm = curriculum?.scope.term ?? mapTerm ?? study?.profile.term ?? 'first'
  const goals: Goal[] = [...(curriculum && curriculum.scope.current ? curriculum.objectives : []).map(item => ({ id: item.id, title: item.title })), ...(study?.objectives ?? []).map(item => ({ id: item.id, title: item.title }))]
  const conceptName = (id: string) => curriculum?.concepts.find(item => item.id === id)?.name ?? id
  const recommendation = study?.recommendation ?? null
  const planOf = (target: Activity['subject']) => study?.diagnostics.find(plan => plan.subject === target)
  const chosenIntensity = (target: Activity['subject']): CheckInIntensity => intensities[target] ?? planOf(target)?.recommendedIntensity ?? 'standard'
  const selectedConcept = curriculum?.concepts.find(item => item.id === selectedConceptId)
  function chooseGoal(goal: { id: string; subject: Activity['subject'] }) {
    selectSubject(goal.subject); setActivity({ subject: goal.subject, mode: 'foundation' }); setSelectedObjectiveId(goal.id); setMistakeOffset(0)
  }
  function startRecommended() {
    if (!recommendation || active || recommendation.kind === 'hold') return
    if (recommendation.kind === 'diagnose') { void startDiagnosis(recommendation.subject, chosenIntensity(recommendation.subject)); return }
    const mode: Activity['mode'] = recommendation.kind === 'review' ? 'review' : 'foundation'
    selectSubject(recommendation.subject); setActivity({ subject: recommendation.subject, mode }); setSelectedObjectiveId(mode === 'foundation' ? recommendation.objectiveId ?? '' : ''); setMistakeOffset(0)
    const prompt = recommendation.kind === 'review' ? reviewPrompt : recommendation.kind === 'preview' && recommendation.objectiveId ? previewPrompt(recommendation.objectiveId) : recommendation.objectiveId ? goalPrompt(recommendation.objectiveId) : continuePrompt
    void act({ action: 'start', id: crypto.randomUUID(), subject: recommendation.subject, mode }, true, prompt)
  }
  const progress = curriculum?.scope.current ? study?.courses.find(item => item.subject === subject)?.progress : undefined
  const frontierIndex = progress ? curriculum?.units.findIndex(unit => unit.id === progress.unitId) ?? -1 : -1
  function unitNote(unitId: string) {
    if (!progress || frontierIndex < 0 || !curriculum) return undefined
    const index = curriculum.units.findIndex(unit => unit.id === unitId)
    if (index === frontierIndex) return t('schoolHere')
    if (progress.preview && progress.pace === 'teaching' && index === frontierIndex + 1) return t('previewUnit')
    if (index > frontierIndex) return t('notTaughtYet')
    return undefined
  }
  const schoolUnit = frontierIndex >= 0 ? curriculum?.units[frontierIndex] : undefined
  const homeUnit = curriculum?.scope.current ? [...curriculum.units].reverse().find(unit => curriculum.concepts.some(concept => concept.unit === unit.id && concept.level !== 'untouched')) : undefined
  function startDiagnosis(target: Activity['subject'], intensity: CheckInIntensity) {
    if (active) return Promise.resolve()
    const scope = scopeOf(target)
    const scoped = scope.grade !== undefined || scope.term !== undefined
    const plan = scoped ? study?.scopedDiagnostic : planOf(target)
    const ids = plan?.samples[intensity].map(item => item.id) ?? []
    selectSubject(target); setActivity({ subject: target, mode: 'diagnose' }); setSelectedObjectiveId(''); setMistakeOffset(0); setTab('today')
    const command: Command = { action: 'start', id: crypto.randomUUID(), subject: target, mode: 'diagnose', intensity, ...(scoped ? { scope: { grade: scope.grade ?? study?.profile.grade ?? 2, term: scope.term ?? study?.profile.term ?? 'first', ...(scope.unit ? { units: [scope.unit] } : {}) } } : {}) }
    return act(command, true, diagnosePrompt(intensity, ids))
  }
  return <main className="student-desk" aria-label={t('title')}>
    <header className="student-top">
      <nav className="student-tabs" aria-label={t('title')}>{(['today', 'map', 'checkin', 'mistakes', 'growth', 'parent'] as const).map(name => <button key={name} type="button" aria-label={t(name)} aria-pressed={tab === name} onClick={() => setTab(name)}>{t(name)}{name === 'mistakes' && study && study.dueTotal > 0 ? ` · ${study.dueTotal}` : ''}</button>)}</nav>
      <div className="student-toolbar">
        {study && tab !== 'parent' && <nav className="student-subjects" aria-label={t('subject')}>{subjects.map(item => <button key={item} type="button" disabled={!!active} aria-pressed={subject === item} onClick={() => { selectSubject(item); setActivity({ subject: item, mode: 'foundation' }); setSelectedObjectiveId(''); setMistakeOffset(0); setMistakeStatus('all') }}>{t(item)}</button>)}</nav>}
        <button type="button" className="student-quiet" disabled={disabled} onClick={() => { void workspace.reload().then(() => setEpoch(value => value + 1)) }}>{t('reload')}</button>
      </div>
    </header>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {sendError && <p role="alert">{sendError}</p>}
    {!data ? !workspace.error && <progress aria-label={t('busy')} /> : !study && tab !== 'parent' ? <section><p>{t('setupFirst')}</p><button onClick={() => setTab('parent')}>{t('parent')}</button></section> : subjectLoading && tab !== 'parent' ? <progress aria-label={t('busy')} /> : <>
      {tab === 'parent' && <ParentSettings key={epoch} data={data} change={change} t={t} curriculum={curriculum} subject={subject} onSubject={item => { selectSubject(item); setActivity({ subject: item, mode: 'foundation' }) }} />}
      {study && tab === 'today' && <>
        <section className="student-status"><h3>{t('goal')}</h3><p>{study.profile.nickname} · {t('todayStars')}: {study.todayStars}</p>
          <p className="student-timer">{t('dailyRemaining')}: {time(remaining)} · {t('due')}: {study.dueCount} · {t('weakPoints')}: {study.weakPoints.length}</p>
          {schoolUnit && <p>{t('schoolFrontier')}: {schoolUnit.name} · {t(progress?.posture === 'catch-up' ? 'catchUp' : 'keepUp')}{progress?.pace === 'review' ? ` · ${t('reviewWeek')}` : ''} · {t('homeProgress')}: {homeUnit?.name ?? t('homeNotStarted')}</p>}
          {active ? <><p>{t(active.subject)} · {t(active.mode)}</p><p className="student-timer">{t('time')}: {time(active.deadline - now)}</p>
            {!available && <p role="status">{t('expired')}</p>}
          </> : study.phase === 'break' && study.breakRemainingMs - (now - data.serverNow) > 0 ? <p>{t('rest')} · {time(study.breakRemainingMs - (now - data.serverNow))}</p>
            : study.phase === 'daily-complete' ? <p>{t('done')}</p> : <StartForm study={study} activity={activity} choose={setActivity} disabled={disabled || running} t={t} goal={goals.find(item => item.id === selectedObjectiveId)} clearGoal={() => setSelectedObjectiveId('')} intensityLabel={`${t(intensityKeys[chosenIntensity(activity.subject)])} · ${planOf(activity.subject)?.samples[chosenIntensity(activity.subject)].length ?? 0}`} chooseIntensity={() => setTab('checkin')} scope={activeScope} setScope={next => setScopeChoice(previous => ({ ...previous, [subject]: next }))} scopeUnits={study.scopedUnits ?? []} start={(subject, mode) => mode === 'diagnose' ? startDiagnosis(subject, chosenIntensity(subject)) : act({ action: 'start', id: crypto.randomUUID(), subject, mode, ...(activeScope.grade !== undefined || activeScope.term !== undefined ? { scope: { grade: activeScope.grade ?? study.profile.grade, term: activeScope.term ?? study.profile.term, ...(activeScope.unit ? { units: [activeScope.unit] } : {}) } } : {}) }, true, mode === 'foundation' && selectedObjectiveId ? goalPrompt(selectedObjectiveId) : mode === 'review' ? reviewPrompt : continuePrompt)} />}
        </section>
        {!active && (() => {
          const unit = progress && curriculum ? curriculum.units.find(item => item.id === progress.unitId) : undefined
          const causes = study.errorProfile.filter(item => item.subject === subject).slice(0, 3)
          if (unit?.focus === undefined && causes.length === 0) return null
          return <section><h3>{t('routineTitle')} · {t(subject)}</h3>
            <p className="student-muted">{t('routineHelp')}</p>
            {unit?.focus !== undefined && <p>{unit.name}：{t(focusKeys[unit.focus])}</p>}
            {causes.length > 0 && <p className="student-muted">{t('topCauses')}：{causes.map(item => `${t(item.type)} ×${item.count}`).join('、')}</p>}
            <div className="student-segments">
              <button type="button" disabled={disabled || running} onClick={() => { void tutor(dailySheetPrompt(subject)).catch(() => {}) }}>{t('printDailySheet')}</button>
              <button type="button" disabled={disabled || running || study.phase !== 'ready'} onClick={() => { void tutor(dictationPrompt(subject)).catch(() => {}) }}>{t('dictation')}</button>
            </div>
          </section>
        })()}
        {!active && study.understandingReminders.length > 0 && <section><h3>{t('remindersTitle')}</h3><p className="student-muted">{t('remindersHint')}</p>
          {study.understandingReminders.map(item => <p key={`${item.code}-${item.objectiveId ?? item.title}`}>{t(reminderKeys[item.code])} · {item.title}</p>)}
        </section>}
        {active && <>
          <section className="student-focus"><p className="student-muted">{t('chatHelp')}</p>{task ? <Task key={task.id} study={study} goals={goals} available={available} disabled={disabled || running} t={t} act={act} /> : <p>{t('waiting')}</p>}
            {available && (running || sending ? <p role="status">{t('tutorWorking')}</p>
              : (!task || study.feedback || task.response !== undefined || task.hintRequested) && <button disabled={disabled} onClick={() => { void tutor().catch(() => {}) }}>{t(!task ? 'prepareTask' : study.feedback ? 'nextTask' : task.response !== undefined ? 'retryFeedback' : 'retryHint')}</button>)}
          </section>
          <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: 'stop', sessionId: active.id, reflection: String(form.get('reflection') ?? '') }) }}>
            <label>{t('reflection')}<textarea aria-label={t('reflection')} name="reflection" maxLength={2000} /></label><button disabled={disabled} type="submit">{t('stop')}</button>
          </form>
        </>}
        {!active && <section className="student-plan"><h3>{t('todayPlan')}</h3>
          {recommendation ? <><p>{t(planKeys[recommendation.kind])} · {t(recommendation.subject)}{recommendation.title ? ` · ${recommendation.title}` : ''}</p>
            <p className="student-muted">{reasonText([recommendation.reason], t)}</p>
            {recommendation.kind === 'hold' ? <button type="button" onClick={() => setTab('parent')}>{t('updateSchoolProgress')}</button>
              : study.phase === 'ready' ? <button type="button" className="student-primary" disabled={disabled || running} onClick={startRecommended}>{t('startNow')}</button> : <p>{t('planBlocked')}</p>}
          </> : <p>{t('allDone')}</p>}
          {study.weakPoints.length > 0 && <details><summary>{t('weakPoints')} · {study.weakPoints.length}</summary><p className="student-muted">{t('weakHint')}</p>
            {study.weakPoints.map(item => <div key={item.id}><p>{t(item.subject)} · {item.title} · {t(levelKeys[item.level])}</p><p className="student-muted">{reasonText(item.reasons, t)}</p>
              <button type="button" disabled={disabled || running} aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>
            </div>)}
          </details>}
        </section>}
        {!active && study.diagnostic && <section><h3>{t('diagnosisTitle')} · {t(subject)}</h3>
          <p>{study.diagnostic.lastAt !== undefined ? `${t('diagnosisLast')}: ${date(study.diagnostic.lastAt)} · ${t('nextCheck')}: ${date(study.diagnostic.nextAt)}` : t('diagnosisNever')} · {t('coverage')}: {study.diagnostic.coverage.probed} / {study.diagnostic.coverage.total}</p>
          <p className="student-muted">{t(study.diagnostic.due ? 'diagnosisDue' : 'diagnosisNotDue')}{study.diagnostic.samples[chosenIntensity(subject)].length > 0 ? ` · ${t('diagnosisSample')}: ${study.diagnostic.samples[chosenIntensity(subject)].map(item => item.title).join(' · ')}` : ''}</p>
          <p className="student-muted">{t('intensity')}: {t(intensityKeys[chosenIntensity(subject)])} · {t(intensityHelpKeys[chosenIntensity(subject)])} <button type="button" onClick={() => setTab('checkin')}>{t('chooseIntensity')}</button></p>
          {study.diagnostic.samples[chosenIntensity(subject)].length > 0 && <button type="button" disabled={disabled || running || study.phase !== 'ready'} onClick={() => { void startDiagnosis(subject, chosenIntensity(subject)) }}>{t(study.diagnostic.due ? 'startDiagnosis' : 'repeatDiagnosis')}</button>}
          {(() => { const last = study.checkIns.find(item => item.subject === subject); return last && last.results.length > 0 ? <details open={!study.diagnostic.due}><summary>{t('diagnosisResults')} · {date(last.startedAt)} · {t(intensityKeys[last.intensity])}</summary>
            <p className="student-muted">{t('assistIndependent')} {last.counts.independent} · {t('assistHint')} {last.counts.helped} · {t('wrong')} {last.counts.wrong}</p>
            {last.results.map(item => <div key={item.id}><p>{item.title} · {t(item.result)} · {t(assistKeys[item.assistance])}</p>
              {item.objectiveId !== null && (item.result !== 'correct' || item.assistance !== 'independent') && <button type="button" disabled={disabled || running} aria-pressed={selectedObjectiveId === item.objectiveId} onClick={() => chooseGoal({ id: item.objectiveId ?? '', subject })}>{t('chooseGoal')} · {item.title}</button>}
            </div>)}
          </details> : null })()}
        </section>}
        {!active && curriculum && curriculum.scope.current && <section><h3>{t('map')} · {t(subject)}</h3>
          <p>{t('levelMastered')}: {curriculum.summary.mastered} / {curriculum.summary.concepts} · {t('levelPractising')}: {curriculum.summary.practising + curriculum.summary.stalled} · {t('levelWeak')}: {curriculum.summary.weak + curriculum.summary.due} · {t('levelUntouched')}: {curriculum.summary.untouched}</p>
          {curriculum.units.map(unit => { const note = unitNote(unit.id); return <UnitLine key={unit.id} label={`${unit.name} · ${t('levelMastered')} ${unit.mastered}/${unit.concepts}${unit.weak > 0 ? ` · ${t('levelWeak')} ${unit.weak}` : ''}${unit.due > 0 ? ` · ${t('levelDue')} ${unit.due}` : ''}`} {...(note ? { note } : {})} counts={countLevels(curriculum.concepts.filter(item => item.unit === unit.id))} t={t} /> })}
          <button type="button" onClick={() => setTab('map')}>{t('openMap')}</button>
        </section>}
        {!active && <section><h3>{t('notebook')} · {t(subject)}</h3>
          <p>{t('bookDue')}: {study.mistakeBook.due} · {t('bookReviewing')}: {study.mistakeBook.reviewing} · {t('bookMastered')}: {study.mistakeBook.mastered} · {t('pending')}: {study.mistakeBook.pending}</p>
          {study.dueMistakes.slice(0, 5).map(item => <p key={item.id}>{t('dueNow')} · {item.topic}</p>)}
          {study.confirmedMistakes.filter(item => item.dueAt === undefined || item.dueAt > now).slice(0, 5).map(item => <p key={item.id}>{item.topic}{item.stage >= 4 ? ` · ${t('bookMastered')}` : item.dueAt !== undefined ? ` · ${t('nextReview')}: ${new Date(item.dueAt).toLocaleString()}` : ''}</p>)}
          {study.confirmedCount === 0 && study.pendingCount === 0 && <p>{t('empty')}</p>}
          <button type="button" onClick={() => setTab('mistakes')}>{t('openMistakes')}</button>
        </section>}
      </>}
      {study && tab === 'map' && <>
        <section><h3>{curriculum ? curriculum.title : t('map')}</h3>
          <div className="student-scope">
            <label>{t('mapScope')}<select aria-label={t('grade')} value={scopeGrade} onChange={event => setMapGrade(Number(event.target.value))}><option value={1}>{t('gradeOne')}</option><option value={2}>{t('gradeTwo')}</option></select></label>
            <label>{t('term')}<select aria-label={t('term')} value={scopeTerm} onChange={event => setMapTerm(event.target.value === 'second' ? 'second' : 'first')}><option value="first">{t('first')}</option><option value="second">{t('second')}</option></select></label>
            {(mapGrade !== undefined || mapTerm !== undefined) && <button type="button" onClick={() => { setMapGrade(undefined); setMapTerm(undefined) }}>{t('backToCurrent')}</button>}
          </div>
          {curriculum && !curriculum.scope.current && <p role="status">{t('mapBrowsing')}</p>}
          {curriculum ? <>
            <p>{t('levelMastered')}: {curriculum.summary.mastered} · {t('levelPractising')}: {curriculum.summary.practising} · {t('levelStalled')}: {curriculum.summary.stalled} · {t('levelWeak')}: {curriculum.summary.weak} · {t('levelDue')}: {curriculum.summary.due} · {t('levelUntouched')}: {curriculum.summary.untouched}</p>
            <details><summary>{t('mapBasis')}</summary><p>{curriculum.basis}</p></details>
            {selectedObjectiveId && !active && <button type="button" onClick={() => setSelectedObjectiveId('')}>{t('clearGoal')}</button>}
          </> : <p>{t('mapUnavailable')}</p>}
        </section>
        {curriculum && <section><h3>{t('knowledgePoints')}</h3>
          <StackedBar counts={countLevels(curriculum.concepts)} t={t} />
          <div className="student-legend">{levels.map(level => <span key={level}><span className={`student-dot student-level-${level}`} />{t(levelKeys[level])}</span>)}</div>
          <p className="student-muted">{t('mapGraph')}</p>
          <ConceptGraph curriculum={curriculum} selectedId={selectedConceptId} onSelect={setSelectedConceptId} t={t} />
          {selectedConcept ? <div className="student-plan"><h3>{selectedConcept.name} · {t(levelKeys[selectedConcept.level])}</h3>
            <p>{t('definition')}: {selectedConcept.definition}</p><p>{t('example')}: {selectedConcept.example}</p><p className="student-muted">{t('source')}: {selectedConcept.source}</p>
            {selectedConcept.lastAt !== undefined && <p className="student-muted">{t('lastPractised')}: {date(selectedConcept.lastAt)}{selectedConcept.activeMistakes > 0 ? ` · ${t('bookReviewing')} ${selectedConcept.activeMistakes}` : ''}</p>}
            {curriculum.objectives.filter(item => item.conceptIds.includes(selectedConcept.id)).map(item => <div key={item.id}><p>{t('learningGoal')} · {item.title} · {t(levelKeys[item.level])} · {t(item.method)}</p><p className="student-muted">{item.goal}</p>
              {item.reasons.length > 0 && item.level !== 'untouched' && <p className="student-muted">{reasonText(item.reasons, t)}</p>}
              {curriculum.scope.current && <button type="button" disabled={!!active} aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>}
            </div>)}
            {curriculum.relations.filter(relation => relation.fromId === selectedConcept.id || relation.toId === selectedConcept.id).map(relation => <p key={relation.id} className="student-muted">{conceptName(relation.fromId)} · {t(relation.kind)} · {conceptName(relation.toId)}: {relation.explanation}</p>)}
          </div> : <p className="student-muted">{t('selectConcept')}</p>}
        </section>}
        {curriculum && <section><h3>{t('learningPath')}</h3>
          <div className="student-chips">{curriculum.order.map((id, index) => { const concept = curriculum.concepts.find(item => item.id === id); return concept ? <button key={id} type="button" className="student-chip" aria-pressed={selectedConceptId === id} onClick={() => setSelectedConceptId(id)}><span className={`student-dot student-level-${concept.level}`} />{index + 1}. {concept.name}</button> : null })}</div>
        </section>}
        {curriculum && <section><h3>{t('unitsLabel')}</h3>
          {curriculum.units.map(unit => { const own = curriculum.concepts.filter(item => item.unit === unit.id); const note = unitNote(unit.id); return <details key={unit.id}><summary>{unit.name} · {t('levelMastered')} {unit.mastered}/{unit.concepts}{unit.weak + unit.due > 0 ? ` · ${t('levelWeak')} ${unit.weak + unit.due}` : ''}</summary>
            {note && <p className="student-muted">{note}</p>}
            <StackedBar counts={countLevels(own)} t={t} />
            <p className="student-muted">{unit.summary}</p>
            <div className="student-chips">{own.map(item => <button key={item.id} type="button" className="student-chip" aria-pressed={selectedConceptId === item.id} onClick={() => setSelectedConceptId(item.id)}><span className={`student-dot student-level-${item.level}`} />{item.name}</button>)}</div>
            {curriculum.objectives.filter(item => item.unit === unit.id).map(item => <div key={item.id}><p>{t('learningGoal')} · {item.title} · {t(levelKeys[item.level])} · {t(item.method)}</p><p className="student-muted">{item.goal}</p>
              {curriculum.scope.current && <button type="button" disabled={!!active} aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>}
            </div>)}
          </details> })}
        </section>}
        {(study.objectives.length > 0 || study.concepts.length > 0) && <section><h3>{t('learningGoal')} · {t('pendingConcept')}</h3>
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
        </section>}
        <section>{curriculum && <><h3>{t('relationsLabel')} · {curriculum.relations.length}</h3>
          {curriculum.relations.map(relation => <p key={relation.id}>{conceptName(relation.fromId)} · {t(relation.kind)} · {conceptName(relation.toId)}: {relation.explanation}</p>)}</>}
          <button type="button" disabled={disabled || running} onClick={() => { void tutor(`请加载 study 技能，查询当前工作区 ${subject} 科目的知识地图（study_status kind=curriculum）、学习目标和错题。如果学校课本或孩子的问题涉及地图之外的概念，提出一个概念定义、例子及依据，先仅保存待确认概念；经家长核对后再创建学习目标或概念关系，不替家长确认。`).catch(() => {}) }}>{t('organizeConcepts')}</button>
        </section>
      </>}
      {study && tab === 'checkin' && <>
        <section><h3>{t('diagnosisTitle')}</h3><p className="student-muted">{t('checkinHelp')}</p></section>
        {study.diagnostics.map(plan => {
          const target = plan.subject
          const scope = scopeOf(target)
          const scoped = scope.grade !== undefined || scope.term !== undefined
          const scopedPlan = scoped && target === subject ? study.scopedDiagnostic : null
          const shown = scopedPlan ?? plan
          const intensity = chosenIntensity(target)
          const sample = shown.samples[intensity]
          const history = study.checkIns.filter(item => item.subject === target)
          const setScope = (next: ScopeChoice) => setScopeChoice(previous => ({ ...previous, [target]: next }))
          const scopeUnits = scoped && target === subject ? (study.scopedUnits ?? []) : []
          return <section key={target}><h3>{t(target)} · {t(shown.due ? 'diagnosisDue' : 'diagnosisNotDue')}</h3>
            <p>
              <label>{t('scopeLabel')}<select aria-label={t('scopeLabel')} value={scoped ? `${scope.grade ?? study.profile.grade}-${scope.term ?? study.profile.term}` : 'current'} onChange={event => {
                const value = event.target.value
                if (value === 'current') { setScope({}); return }
                const [grade, term] = value.split('-') as [string, 'first' | 'second']
                setScope({ grade: Number(grade), term })
                if (target !== subject) selectSubject(target)
              }}>
                <option value="current">{t('scopeCurrent')}</option>
                {([[1, 'first'], [1, 'second'], [2, 'first'], [2, 'second']] as const).filter(([grade, term]) => !(grade === study.profile.grade && term === study.profile.term)).map(([grade, term]) => <option key={`${grade}-${term}`} value={`${grade}-${term}`}>{t(grade === 1 ? 'gradeOne' : 'gradeTwo')} · {t(term)}</option>)}
              </select></label>
              {scoped && target === subject && <label>{t('scopeUnit')}<select aria-label={t('scopeUnit')} value={scope.unit ?? ''} onChange={event => setScope({ ...scope, ...(event.target.value ? { unit: event.target.value } : {}) })}>
                <option value="">{t('scopeWholeMap')}</option>
                {scopeUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select></label>}
            </p>
            <p>{shown.lastAt !== undefined ? `${t('diagnosisLast')}: ${date(shown.lastAt)} · ${t('nextCheck')}: ${date(shown.nextAt)}` : t('diagnosisNever')}</p>
            <p>{t('coverage')}: {shown.coverage.probed} / {shown.coverage.total}</p>
            <progress value={shown.coverage.probed} max={Math.max(1, shown.coverage.total)} aria-label={t('coverage')} />
            <nav className="student-segments" aria-label={t('intensity')}>{(['light', 'standard', 'deep'] as const).map(level => <button key={level} type="button" aria-pressed={intensity === level} onClick={() => setIntensities(previous => ({ ...previous, [target]: level }))}>{t(intensityKeys[level])} · {shown.samples[level].length}{shown.recommendedIntensity === level ? ` · ${t('recommended')}` : ''}</button>)}</nav>
            <p className="student-muted">{t(intensityHelpKeys[intensity])}</p>
            {sample.length > 0 ? <p className="student-muted">{t('diagnosisSample')}: {sample.map(item => `${item.title} · ${t(sampleKeys[item.reason])}`).join('；')}</p> : <p>{t('empty')}</p>}
            <button type="button" disabled={disabled || running || study.phase !== 'ready' || !!active || sample.length === 0} onClick={() => { void startDiagnosis(target, intensity) }}>{t(shown.due ? 'startDiagnosis' : 'repeatDiagnosis')} · {t(target)}</button>
            {history.length > 0 && <details><summary>{t('history')} · {history.length}</summary>
              {history.map(item => <div key={item.sessionId}><p>{date(item.startedAt)} · {t(intensityKeys[item.intensity])} · {t('assistIndependent')} {item.counts.independent} · {t('assistHint')} {item.counts.helped} · {t('wrong')} {item.counts.wrong}</p>
                {item.results.map(result => <p key={result.id} className="student-muted">{result.title} · {t(result.result)} · {t(assistKeys[result.assistance])}</p>)}
              </div>)}
            </details>}
          </section>
        })}
      </>}
      {study && tab === 'mistakes' && <>
        <PhotoIntake ask={tutor} disabled={disabled || running} t={t} />
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
          <button type="button" disabled={disabled || running || goals.length === 0} onClick={() => { void tutor(`请加载 study 技能，并阅读 references/questions.md。先用 study_status kind=elements subject=${subject} 读取学校已教范围内本单元的出题要点与易错点，并查询 ${subject} 科知识地图和学校当前单元。按出题规则写一张练习卷：覆盖当前单元里正在教的学习目标，6 到 8 题，题型要换，孩子在纸上写答案；需要图时用 figure（清单见 questions.md），不要另做 HTML 卷。用 worksheet 保存，kind 写 practice，每题写 objectiveId。这是新练习，items 不要写 mistakeId。题干不含答案和选项；题干说「看图」时必须带对应 figure，且不要重复图里的数。保存后告诉我练习单编号。`).catch(() => {}) }}>{t('createWorksheet')}</button>
          <button type="button" disabled={disabled || running || study.reviewPlan.picks === 0} onClick={() => { void tutor(`请加载 study 技能，并阅读 references/questions.md。先用 study_status kind=review-sheet subject=${subject}：只给 picks 里的错题出题，不增不减——按每条的 variantLevel 决定变式远近（numeric 换数字、context 换情境、reasoning 用说理），保留 errorType 指出的错误类型，参考 pick.elements 的易错点和出题要点，原题有图就用同类 figure，绝不照抄原题题面；再给每条 objectiveFill 出一道新题，只写 objectiveId、不写 mistakeId。kind 写 review，每题不出现已保存答案，不要另做 HTML 卷。用 worksheet 保存，保存后告诉我练习单编号。`).catch(() => {}) }}>{t('printConsolidation')}</button>
          {study.worksheets.length === 0 && <p>{t('empty')}</p>}
          {study.worksheets.map(sheet => <WorksheetActions key={sheet.id} worksheet={sheet} sessionId={sessionId} revision={data.revision} canPrint={study.printAvailable} change={change} disabled={disabled} t={t} />)}
          {paperSheet && <>
            <label>{t('worksheet')}<select aria-label={t('worksheet')} value={paperSheet.id} onChange={event => setPaperSheetId(event.target.value)}>{study.worksheets.map(sheet => <option key={sheet.id} value={sheet.id}>{sheet.objectiveTitle} · {new Date(sheet.createdAt).toLocaleDateString()}</option>)}</select></label>
            <PhotoIntake ask={tutor} disabled={disabled || running} t={t} variant="paper" prompt={`请加载 study 技能，查询练习单 ${paperSheet.id}。实际读取这张纸上作答照片，按题号逐项转录学生原答案与判读结果，拿不准的地方写进 uncertainties，并用 paper-draft 逐题保存草稿（不要直接入库）。保存后在对话里告诉我哪几题需要核对；我会在工作台「待核对转录」里逐题确认，用 confirm-paper 入库。答错或部分正确、且题目还没有 mistakeId 时，入库后系统会记成错题；能看出错因时在 paper-draft 里写上 errorType。纸上结果为核对流程，不需要计时学习段，不按上传次数发星。`} />
          </>}
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
        {curriculum && curriculum.scope.current && <section><h3>{t('masteryOverview')} · {t(subject)}</h3>
          <p>{t('levelMastered')}: {curriculum.summary.mastered} · {t('levelPractising')}: {curriculum.summary.practising + curriculum.summary.stalled} · {t('levelWeak')}: {curriculum.summary.weak + curriculum.summary.due} · {t('levelUntouched')}: {curriculum.summary.untouched}</p>
          {curriculum.objectives.filter(item => item.attempts > 0 || item.activeMistakes > 0).map(item => <p key={item.id}>{item.title} · {t(levelKeys[item.level])} · {t('independent')}: {item.independentDays}</p>)}
        </section>}
        <section><h3>{t('evidence')}</h3>{study.progress.length === 0 && <p>{t('empty')}</p>}
          {study.progress.map(item => <p key={JSON.stringify([item.subject, item.topic, item.materialId, item.objectiveId])}>{goals.find(goal => goal.id === item.objectiveId)?.title ?? item.topic} · {t(item.level === 'independent-on-three-days' ? 'independent' : 'practising')}</p>)}
          {study.recentAttempts.map(item => <details key={item.id}><summary>{item.topic} · {t(item.result)}</summary><p>{item.prompt}</p><p>{item.response}</p><p>{item.feedback}</p><p>{item.answerEvidence}</p></details>)}
        </section><p>{t('bounded')}</p>
      </>}
    </>}
  </main>
}

function StartForm({ study, activity, choose, disabled, start, goal, clearGoal, intensityLabel, chooseIntensity, scope, setScope, scopeUnits, t }: { study: Study; activity: Activity; choose: (activity: Activity) => void; disabled: boolean; start: (subject: Activity['subject'], mode: Activity['mode']) => Promise<void>; goal: Goal | undefined; clearGoal: () => void; intensityLabel: string; chooseIntensity: () => void; scope: ScopeChoice; setScope: (scope: ScopeChoice) => void; scopeUnits: { id: string; name: string }[]; t: Translate }) {
  const { subject, mode } = activity
  const confirmed = study.courses.some(item => item.subject === subject)
  const due = study.dueSubjects.includes(subject)
  const scoped = scope.grade !== undefined || scope.term !== undefined
  const scopedMode = mode === 'foundation' || mode === 'school' || mode === 'diagnose'
  return <form onSubmit={event => { event.preventDefault(); void start(subject, mode) }}><fieldset disabled={disabled}>
    <label>{t('mode')}<select aria-label={t('mode')} value={mode} onChange={event => { const value = event.target.value; choose({ subject, mode: value === 'school' || value === 'review' || value === 'explore' || value === 'diagnose' ? value : 'foundation' }) }}>{(['foundation', 'school', 'review', 'explore', 'diagnose'] as const).map(item => <option key={item} value={item} disabled={(item === 'school' && !confirmed) || (item === 'review' && !due)}>{t(item)}</option>)}</select></label>
    <p>{t(mode === 'foundation' ? 'foundationHelp' : mode === 'school' ? 'schoolHelp' : mode === 'review' ? 'reviewHelp' : mode === 'diagnose' ? 'diagnoseHelp' : 'exploreHelp')}</p>
    {goal && mode === 'foundation' && <p>{t('learningGoal')}: {goal.title} <button type="button" onClick={clearGoal}>{t('clearGoal')}</button></p>}
    {scopedMode && <p>
      <label>{t('scopeLabel')}<select aria-label={t('scopeLabel')} value={scoped ? `${scope.grade ?? study.profile.grade}-${scope.term ?? study.profile.term}` : 'current'} onChange={event => {
        const value = event.target.value
        if (value === 'current') { setScope({}); return }
        const [grade, term] = value.split('-') as [string, 'first' | 'second']
        setScope({ grade: Number(grade), term })
      }}>
        <option value="current">{t('scopeCurrent')}</option>
        {([[1, 'first'], [1, 'second'], [2, 'first'], [2, 'second']] as const).filter(([grade, term]) => !(grade === study.profile.grade && term === study.profile.term)).map(([grade, term]) => <option key={`${grade}-${term}`} value={`${grade}-${term}`}>{t(grade === 1 ? 'gradeOne' : 'gradeTwo')} · {t(term)}</option>)}
      </select></label>
      {scoped && <label>{t('scopeUnit')}<select aria-label={t('scopeUnit')} value={scope.unit ?? ''} onChange={event => setScope({ ...scope, ...(event.target.value ? { unit: event.target.value } : {}) })}>
        <option value="">{t('scopeWholeMap')}</option>
        {scopeUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select></label>}
    </p>}
    {mode === 'diagnose' && <p>{t('intensity')}: {intensityLabel} <button type="button" onClick={chooseIntensity}>{t('chooseIntensity')}</button></p>}
    <p className="student-muted">{t(subject === 'chinese' ? 'chineseMethod' : subject === 'math' ? 'mathMethod' : 'englishMethod')}</p>
    {!confirmed && <p>{t('unconfirmed')}</p>}
    <button type="submit" className="student-primary" disabled={(mode === 'school' && !confirmed) || (mode === 'review' && !due)}>{t('start')}</button>
  </fieldset></form>
}

function Task({ study, goals, available, disabled, t, act }: { study: Study; goals: Goal[]; available: boolean; disabled: boolean; t: Translate; act: (command: Command, withTutor?: boolean) => Promise<void> }) {
  const task = study.task
  if (!task) return null
  const goal = task.objectiveId ? goals.find(item => item.id === task.objectiveId)?.title : undefined
  return <><h3>{task.topic}</h3>{goal && <p className="student-muted">{t('learningGoal')}: {goal}</p>}<p className="student-question">{task.prompt}</p>
    {task.response !== undefined && <p>{t('answer')}: {task.response}</p>}
    {study.feedback ? <><p className="student-result">{t(study.feedback.result)}</p><p>{study.feedback.feedback}</p></> : task.response !== undefined ? <p role="status">{t('submitted')}</p> : task.choices ? <fieldset disabled={!available || disabled}>
      <p>{t('chooseAnswer')}</p>
      <div className="student-choices">{task.choices.map(choice => <button key={choice} type="button" onClick={() => { void act({ action: 'answer', taskId: task.id, response: choice }, true) }}>{choice}</button>)}</div>
      <button type="button" onClick={() => { void act({ action: 'hint', taskId: task.id }, true) }}>{t('hint')}</button>
    </fieldset> : <form onSubmit={event => { event.preventDefault(); void act({ action: 'answer', taskId: task.id, response: String(new FormData(event.currentTarget).get('answer') ?? '') }, true) }}>
      <fieldset disabled={!available || disabled}><Field name="answer" label={t('answer')} /><button type="submit">{t('submit')}</button>
        <button type="button" onClick={() => { void act({ action: 'hint', taskId: task.id }, true) }}>{t('hint')}</button>
      </fieldset>
    </form>}
    {task.hintRequested && <p>{t('hinted')}</p>}
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

type Mark = 'correct' | 'partial' | 'incorrect'
const markKeys = { correct: 'markCorrect', partial: 'markPartial', incorrect: 'markWrong' } as const
function WorksheetActions({ worksheet, sessionId, revision, canPrint, change, disabled, t }: { worksheet: Study['worksheets'][number]; sessionId: string; revision: number; canPrint: boolean; change: ChangeStudy; disabled: boolean; t: Translate }) {
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
    <button type="button" className="student-primary" disabled={disabled || saving || changed.length === 0} onClick={() => { void grade() }}>{t('saveGrades')}{changed.length > 0 ? ` · ${changed.length}` : ''}</button>
    <button type="button" className="student-quiet" disabled={disabled || saving} onClick={() => { void discard() }}>{t('discardSheet')}</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>
}

const mistakePhotoPrompt = '请加载 study 技能，实际读取这张题目照片，逐项转录原题和学生回答，核对推导与答案依据，以 mistake 保存为待确认错题，并尽量在 mistake 中写上知识地图里对应的 objectiveId。不要猜测不清楚的文字，不要替用户确认；请我到学习工作台核对。此步只录入资料，不开始教学。'
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

function UnitLine({ label, note, counts, t }: { label: string; note?: string; counts: Record<Level, number>; t: Translate }) {
  return <><p className="student-unit">{label}</p>{note && <p className="student-muted">{note}</p>}<StackedBar counts={counts} t={t} /></>
}

function countLevels(concepts: readonly Curriculum['concepts'][number][]): Record<Level, number> {
  const counts: Record<Level, number> = { mastered: 0, practising: 0, stalled: 0, weak: 0, due: 0, untouched: 0 }
  for (const concept of concepts) counts[concept.level] += 1
  return counts
}

function StackedBar({ counts, t }: { counts: Record<Level, number>; t: Translate }) {
  const total = levels.reduce((sum, level) => sum + counts[level], 0)
  if (total === 0) return null
  return <div className="student-bar" role="img" aria-label={levels.map(level => `${t(levelKeys[level])} ${counts[level]}`).join(' · ')}>
    {levels.map(level => counts[level] > 0 ? <span key={level} className={`student-level-${level}`} style={{ width: `${(counts[level] / total) * 100}%` }} /> : null)}
  </div>
}

function ConceptGraph({ curriculum, selectedId, onSelect, t }: { curriculum: Curriculum; selectedId: string; onSelect: (id: string) => void; t: Translate }) {
  const width = 760
  const rowHeight = 92
  const padX = 16
  const top = 8
  const rows = curriculum.units.map(unit => curriculum.concepts.filter(concept => concept.unit === unit.id))
  const height = top + rows.length * rowHeight + 12
  const positions = new Map<string, { x: number; y: number }>()
  rows.forEach((row, rowIndex) => {
    const slot = (width - padX * 2) / Math.max(row.length, 1)
    row.forEach((concept, index) => positions.set(concept.id, { x: padX + slot * (index + 0.5), y: top + rowIndex * rowHeight + 42 }))
  })
  const label = (name: string) => name.length > 8 ? `${name.slice(0, 7)}…` : name
  return <div className="student-graph-frame"><svg className="student-graph" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t('knowledgePoints')}>
    <defs><marker id="student-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
    {curriculum.units.map((unit, rowIndex) => <text key={unit.id} x={padX} y={top + rowIndex * rowHeight + 16} className="student-graph-unit">{unit.name}</text>)}
    {curriculum.relations.map(relation => {
      const from = positions.get(relation.fromId)
      const to = positions.get(relation.toId)
      if (!from || !to) return null
      const path = from.y === to.y ? `M ${from.x} ${from.y - 14} Q ${(from.x + to.x) / 2} ${from.y - 28} ${to.x} ${to.y - 14}` : `M ${from.x} ${from.y + 14} C ${from.x} ${(from.y + to.y) / 2} ${to.x} ${(from.y + to.y) / 2} ${to.x} ${to.y - 14}`
      return <path key={relation.id} d={path} className={relation.kind === 'prerequisite' ? 'student-edge-prerequisite' : 'student-edge-other'} markerEnd="url(#student-arrow)" />
    })}
    {curriculum.concepts.map(concept => {
      const point = positions.get(concept.id)
      if (!point) return null
      const selected = selectedId === concept.id
      return <g key={concept.id} role="button" tabIndex={0} aria-label={concept.name} aria-pressed={selected} onClick={() => onSelect(concept.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(concept.id) } }}>
        <circle cx={point.x} cy={point.y} r={12} className={`student-fill-${concept.level}`} data-selected={selected} />
        <text x={point.x} y={point.y + 24} textAnchor="middle">{label(concept.name)}</text>
      </g>
    })}
  </svg></div>
}
