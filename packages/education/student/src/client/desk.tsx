import { useEffect, useState } from 'react'
import type { Dashboard, MistakeStatus } from '../dashboard.ts'
import type { Command } from '../schema.ts'
import type { CheckInIntensity } from '../learning/mastery.ts'
import type { AskTutor, StudyPhoto } from './bridge.ts'
import { ParentSettings } from './forms.tsx'
import type { Translate } from './locales.ts'
import { useStudy } from './workspace.ts'
import { intensityKeys, levelKeys, subjects, type Activity, type Mode, type ScopeChoice, type Subject } from './display.ts'
import { IdeasView } from './ideas-view.tsx'
import { MapView } from './map-view.tsx'
import { PracticeView } from './practice-view.tsx'
import { LessonsPanel, lessonsForSubject, openClassroom } from './lessons-view.tsx'
import { continuePrompt, dailySheetPrompt, diagnosePrompt, dictationPrompt, dueClearPrompt, explorePrompt, goalPrompt, interestPracticePrompt, openmaicGeneratePrompt, openmaicRetryPrompt, openmaicReviewPrompt, organizePrompt, previewPrompt, reviewPrompt, teachPrompt, teachQueuePrompt } from './prompts.ts'
import { TodayView } from './today-view.tsx'

type Study = NonNullable<Dashboard['study']>
type Goal = { id: string; title: string }
type View = 'student' | 'parent'
type ParentTab = 'map' | 'ideas' | 'mistakes' | 'parent'
const subjectPreference = 'student-desk:subject'

function storedSubject(): Subject {
  try { const value = window.localStorage.getItem(subjectPreference); return value === 'chinese' || value === 'english' ? value : 'math' } catch { return 'math' }
}
function storeSubject(value: Subject) {
  try { window.localStorage.setItem(subjectPreference, value) } catch { /* The preference is a convenience; blocked storage falls back to the default subject. */ }
}

/** Workbench actions share the same persisted state as the native tutoring tools. */
export function StudyDesk({ sessionId, visible, ask, running, t }: { sessionId: string; visible: boolean; ask: AskTutor; running: boolean; t: Translate }) {
  const [subject, setSubject] = useState<Subject>(storedSubject)
  const [mistakeOffset, setMistakeOffset] = useState(0)
  const [mistakeStatus, setMistakeStatus] = useState<MistakeStatus>('all')
  const [mapGrade, setMapGrade] = useState<number>()
  const [mapTerm, setMapTerm] = useState<'first' | 'second'>()
  const [selectedConceptId, setSelectedConceptId] = useState('')
  const [intensities, setIntensities] = useState<Partial<Record<Subject, CheckInIntensity>>>({})
  const [scopeChoice, setScopeChoice] = useState<Partial<Record<Subject, ScopeChoice>>>({})
  const [view, setView] = useState<View>('student')
  const [parentTab, setParentTab] = useState<ParentTab>('map')
  const scopeOf = (target: Subject): ScopeChoice => scopeChoice[target] ?? {}
  const activeScope = scopeOf(subject)
  const showMap = view === 'parent' && parentTab === 'map'
  const tab = view === 'student' ? 'today' : parentTab === 'map' || parentTab === 'ideas' ? 'map' : parentTab === 'mistakes' ? 'mistakes' : 'parent'
  const showBook = view === 'parent' && (parentTab === 'map' || parentTab === 'ideas')
  const workspace = useStudy(sessionId, visible, t('networkError'), { tab, offset: mistakeOffset, subject, status: mistakeStatus, ...(showBook && mapGrade !== undefined ? { mapGrade } : {}), ...(showBook && mapTerm !== undefined ? { mapTerm } : {}), ...(activeScope.grade !== undefined ? { diagGrade: activeScope.grade } : {}), ...(activeScope.term !== undefined ? { diagTerm: activeScope.term } : {}), ...(activeScope.unit ? { diagUnit: activeScope.unit } : {}) })
  const { data, busy, change } = workspace
  const [activity, setActivity] = useState<Activity>({ subject: storedSubject(), mode: 'foundation' })
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('')
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
    try { await ask(text.trim() === '' ? continuePrompt : text, photo) }
    catch (reason) { setSendError(reason instanceof Error ? reason.message : t('sendError')); throw reason }
    finally { setSending(false) }
  }
  async function act(command: Command, withTutor = false, prompt = continuePrompt) {
    try { await change(command); if (withTutor) await tutor(prompt) } catch { /* The request or tutor notice retains the failed action and its data. */ }
  }
  function selectSubject(item: Subject) { setSubject(item); storeSubject(item) }
  const now = Math.max(localNow + workspace.offset.current, data?.serverNow ?? 0)
  const study = data?.study
  const subjectLoading = !!study && study.confirmedSubject !== subject
  const disabled = busy || sending
  const active = study?.active
  useEffect(() => {
    if (active) { selectSubject(active.subject); setActivity({ subject: active.subject, mode: active.mode }) }
  }, [active?.id])
  const curriculum = study?.curriculum ?? null
  const scopeGrade = curriculum?.scope.grade ?? mapGrade ?? study?.profile.grade ?? 1
  const scopeTerm = curriculum?.scope.term ?? mapTerm ?? study?.profile.term ?? 'first'
  const goals: Goal[] = [...(curriculum && curriculum.scope.current ? curriculum.objectives : []).map(item => ({ id: item.id, title: item.title })), ...(study?.objectives ?? []).map(item => ({ id: item.id, title: item.title }))]
  const planOf = (target: Subject) => study?.diagnostics.find(plan => plan.subject === target)
  const chosenIntensity = (target: Subject): CheckInIntensity => intensities[target] ?? planOf(target)?.recommendedIntensity ?? 'standard'
  function resolveMode(target: Subject, mode: Mode): Mode {
    if (mode === 'review' || mode === 'explore' || mode === 'diagnose') return mode
    return study?.courses.some(item => item.subject === target) ? 'school' : 'foundation'
  }
  function chooseGoal(goal: { id: string; subject: Subject }) {
    selectSubject(goal.subject); setActivity({ subject: goal.subject, mode: 'foundation' }); setSelectedObjectiveId(goal.id); setMistakeOffset(0); setView('student')
  }
  function scopeCommand(target: Subject): { scope: { grade: number; term: 'first' | 'second'; units?: string[] } } | Record<string, never> {
    const scope = scopeOf(target)
    if (scope.grade === undefined && scope.term === undefined) return {}
    return { scope: { grade: scope.grade ?? study?.profile.grade ?? 2, term: scope.term ?? study?.profile.term ?? 'first', ...(scope.unit ? { units: [scope.unit] } : {}) } }
  }
  function startDiagnosis(target: Subject, intensity: CheckInIntensity) {
    if (!study) return Promise.resolve()
    const scope = scopeOf(target)
    const scoped = scope.grade !== undefined || scope.term !== undefined
    const plan = scoped ? study.scopedDiagnostic : planOf(target)
    const ids = plan?.samples[intensity].map(item => item.id) ?? []
    selectSubject(target); setActivity({ subject: target, mode: 'diagnose' }); setSelectedObjectiveId(''); setMistakeOffset(0); setView('student')
    return act({ action: 'start', id: crypto.randomUUID(), subject: target, mode: 'diagnose', intensity, ...(scoped ? scopeCommand(target) : {}) }, true, diagnosePrompt(intensity, ids, t))
  }
  function start(target: Subject, mode: Mode, inquiry?: string) {
    if (mode === 'diagnose') return startDiagnosis(target, chosenIntensity(target))
    const next = resolveMode(target, mode)
    const prompt = next === 'review' ? reviewPrompt : next === 'explore' ? explorePrompt(inquiry) : selectedObjectiveId ? goalPrompt(selectedObjectiveId) : continuePrompt
    return act({ action: 'start', id: crypto.randomUUID(), subject: target, mode: next, ...((next === 'foundation' || next === 'school') ? scopeCommand(target) : {}) }, true, prompt)
  }
  function lessonRequest() {
    const recommendation = study?.recommendation
    const objectiveId = recommendation?.objectiveId || selectedObjectiveId || undefined
    const subjectKey = recommendation?.objectiveId ? recommendation.subject : subject
    const progress = study?.courses.find(item => item.subject === subjectKey)?.progress
    const unitName = recommendation?.objectiveId ? recommendation.unitName : (progress ? curriculum?.units.find(unit => unit.id === progress.unitId)?.name : undefined)
    return {
      objectiveId,
      unitName,
      subjectLabel: t(subjectKey),
      tags: study?.interests ?? [],
      focus: study?.interestFocus ?? '',
    }
  }
  function startInterest() {
    const recommendation = study?.recommendation
    if (!recommendation || recommendation.kind === 'hold' || !study) return
    const mode: Mode = resolveMode(recommendation.subject, 'foundation')
    const request = lessonRequest()
    selectSubject(recommendation.subject); setActivity({ subject: recommendation.subject, mode }); setSelectedObjectiveId(recommendation.objectiveId ?? ''); setMistakeOffset(0)
    const teaching = recommendation.reason.code === 'needs-teaching' || recommendation.reason.code === 'prerequisite-gap'
    const scene = interestPracticePrompt(request.objectiveId, request.tags, request.focus, request.unitName)
    const prompt = teaching && recommendation.objectiveId ? `${teachPrompt(recommendation.objectiveId)}${scene}` : scene
    void act({ action: 'start', id: crypto.randomUUID(), subject: recommendation.subject, mode }, true, prompt)
  }
  function startDue() {
    const items = study?.dueToday ?? []
    const first = items[0]
    if (!study || !first) return
    selectSubject(first.subject); setActivity({ subject: first.subject, mode: 'review' }); setSelectedObjectiveId(''); setMistakeOffset(0)
    void act({ action: 'start', id: crypto.randomUUID(), subject: first.subject, mode: 'review' }, true, dueClearPrompt(items.map(item => item.id)))
  }
  function startRecommended() {
    const recommendation = study?.recommendation
    if (!recommendation || recommendation.kind === 'hold' || !study) return
    if (recommendation.kind === 'diagnose') { void startDiagnosis(recommendation.subject, chosenIntensity(recommendation.subject)); return }
    const mode: Mode = recommendation.kind === 'review' ? 'review' : resolveMode(recommendation.subject, 'foundation')
    selectSubject(recommendation.subject); setActivity({ subject: recommendation.subject, mode }); setSelectedObjectiveId(mode === 'review' ? '' : recommendation.objectiveId ?? ''); setMistakeOffset(0)
    const teaching = recommendation.reason.code === 'needs-teaching'
    const prompt = recommendation.kind === 'review' ? reviewPrompt : teaching && recommendation.objectiveId ? teachPrompt(recommendation.objectiveId) : teaching ? teachQueuePrompt(recommendation.title ?? '') : recommendation.kind === 'preview' && recommendation.objectiveId ? previewPrompt(recommendation.objectiveId) : recommendation.objectiveId ? goalPrompt(recommendation.objectiveId) : continuePrompt
    void act({ action: 'start', id: crypto.randomUUID(), subject: recommendation.subject, mode }, true, prompt)
  }
  const parentSettings = view === 'parent' && parentTab === 'parent'
  return <main className="student-desk" aria-label={t('title')}>
    <header className="student-top">
      <nav className="student-views" aria-label={t('title')}>
        <button type="button" aria-pressed={view === 'student'} onClick={() => setView('student')}>{t('today')}</button>
        <button type="button" aria-pressed={view === 'parent'} onClick={() => setView('parent')}>{t('parentView')}</button>
      </nav>
      {view === 'parent' && <nav className="student-tabs" aria-label={t('parentView')}>
        <button type="button" aria-pressed={parentTab === 'map'} onClick={() => setParentTab('map')}>{t('map')}</button>
        <button type="button" aria-pressed={parentTab === 'ideas'} onClick={() => setParentTab('ideas')}>{t('ideas')}</button>
        <button type="button" aria-label={t('mistakes')} aria-pressed={parentTab === 'mistakes'} onClick={() => setParentTab('mistakes')}>{t('mistakes')}{study && study.dueTotal > 0 ? ` · ${study.dueTotal}` : ''}</button>
        <button type="button" aria-pressed={parentTab === 'parent'} onClick={() => setParentTab('parent')}>{t('parent')}</button>
      </nav>}
      <div className="student-toolbar">
        {study && !parentSettings && <nav className="student-subjects" aria-label={t('subject')}>{subjects.map(item => <button key={item} type="button" aria-pressed={subject === item} onClick={() => { selectSubject(item); setActivity({ subject: item, mode: 'foundation' }); setSelectedObjectiveId(''); setMistakeOffset(0); setMistakeStatus('all') }}>{t(item)}</button>)}</nav>}
        <button type="button" className="student-quiet" disabled={disabled} onClick={() => { void workspace.reload().then(() => setEpoch(value => value + 1)) }}>{t('reload')}</button>
      </div>
    </header>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {sendError && <p role="alert">{sendError}</p>}
    {!data ? !workspace.error && <progress aria-label={t('busy')} /> : !study && view !== 'parent' ? <section><p>{t('setupFirst')}</p><button onClick={() => { setView('parent'); setParentTab('parent') }}>{t('parent')}</button></section> : subjectLoading && !parentSettings ? <progress aria-label={t('busy')} /> : <>
      {study && view === 'student' && <TodayView study={study} subject={subject} activity={activity} setActivity={setActivity} goal={goals.find(item => item.id === selectedObjectiveId)} clearGoal={() => setSelectedObjectiveId('')} curriculum={curriculum} selectedObjectiveId={selectedObjectiveId} chooseGoal={chooseGoal} intensityLabel={`${t(intensityKeys[chosenIntensity(subject)])} · ${planOf(subject)?.samples[chosenIntensity(subject)].length ?? 0}`} openParent={() => { setView('parent'); setParentTab('parent') }} openCheckins={() => { setView('parent'); setParentTab('map') }} scope={activeScope} setScope={next => setScopeChoice(previous => ({ ...previous, [subject]: next }))} scopeUnits={study.scopedUnits ?? []} start={start} startRecommended={startRecommended} startDiagnosis={startDiagnosis} chosenIntensity={chosenIntensity(subject)} disabled={disabled} running={running} act={act} tutor={tutor} t={t} prompts={{ daily: dailySheetPrompt(subject), dictation: dictationPrompt(subject) }} lessons={lessonsForSubject(data.interactiveLessons?.lessons ?? [], subject)} onInterestPractice={startInterest} onOpenLesson={() => { const request = lessonRequest(); void tutor(openmaicGeneratePrompt(request.subjectLabel, request.objectiveId, request.tags, request.focus, request.unitName)).catch(() => {}) }} onClearDue={startDue} onOpenClassroom={openClassroom} />}
      {study && view === 'student' && data.interactiveLessons && <LessonsPanel lessons={lessonsForSubject(data.interactiveLessons.lessons, subject)} {...(data.interactiveLessons.error !== undefined ? { error: data.interactiveLessons.error } : {})} disabled={disabled} running={running} t={t} onRetry={runId => { void tutor(openmaicRetryPrompt(runId)).catch(() => {}) }} onReview={classroomId => { void tutor(openmaicReviewPrompt(classroomId)).catch(() => {}) }} />}
      {study && showMap && <MapView study={study} curriculum={curriculum} subject={subject} selectedConceptId={selectedConceptId} setSelectedConceptId={setSelectedConceptId} selectedObjectiveId={selectedObjectiveId} clearGoal={() => setSelectedObjectiveId('')} chooseGoal={chooseGoal} active={!!active} scopeGrade={scopeGrade} scopeTerm={scopeTerm} setMapGrade={setMapGrade} setMapTerm={setMapTerm} clearBrowse={() => { setMapGrade(undefined); setMapTerm(undefined) }} intensities={intensities} setIntensity={(target, level) => setIntensities(previous => ({ ...previous, [target]: level }))} scopeOf={scopeOf} setScope={(target, next) => setScopeChoice(previous => ({ ...previous, [target]: next }))} selectSubject={selectSubject} startDiagnosis={startDiagnosis} disabled={disabled} running={running} organize={() => { void tutor(organizePrompt(subject)).catch(() => {}) }} change={command => change(command).then(() => undefined)} t={t} />}
      {study && view === 'parent' && parentTab === 'ideas' && <IdeasView study={study} curriculum={curriculum} t={t} onOpenConcept={id => { setSelectedConceptId(id); setParentTab('map') }} />}
      {study && view === 'parent' && parentTab === 'mistakes' && <PracticeView study={study} now={now} subject={subject} goals={goals} mistakeStatus={mistakeStatus} setMistakeStatus={setMistakeStatus} setMistakeOffset={setMistakeOffset} revision={data.revision} disabled={disabled} running={running} change={change} ask={tutor} onReview={item => { selectSubject(item); setActivity({ subject: item, mode: 'review' }); setSelectedObjectiveId(''); setView('student') }} epoch={epoch} t={t} />}
      {parentSettings && <ParentSettings key={epoch} data={data} change={change} t={t} curriculum={curriculum} subject={subject} onSubject={item => { selectSubject(item); setActivity({ subject: item, mode: 'foundation' }) }} />}
      {study && parentSettings && <Growth study={study} curriculum={curriculum} subject={subject} goals={goals} t={t} />}
    </>}
  </main>
}

function Growth({ study, curriculum, subject, goals, t }: { study: Study; curriculum: Study['curriculum'] | null; subject: Subject; goals: Goal[]; t: Translate }) {
  const weekly = study.weekly
  return <>
    {weekly && <section><h3>{t('weeklyTitle')}</h3>
      <p>{t('weeklyTime')}: {weekly.minutesByDay.reduce((sum, item) => sum + item.minutes, 0)} {t('minuteUnit')} · {t('weeklyActiveDays')} {weekly.activeDays}/7</p>
      <p>{t('weeklyMastered')} {weekly.masteredGoals} · {t('weeklyPractised')} {weekly.practisedGoals} · {t('weeklyMistakesNew')} {weekly.newMistakes} · {t('weeklyConsolidated')} {weekly.consolidatedMistakes}</p>
      <p>{t('weeklyDueDone')} {weekly.dueCompletion.done}/{weekly.dueCompletion.total}{weekly.errorCauses.length > 0 ? ` · ${t('weeklyCauses')}: ${weekly.errorCauses.map(cause => `${t(cause.type)} ×${cause.count}`).join('、')}` : ''}</p>
    </section>}
    <section><h3>{t('stars')}: {study.stars}</h3><p>{t('starsHelp')}</p></section>
    {curriculum && curriculum.scope.current && <section><h3>{t('masteryOverview')} · {t(subject)}</h3>
      <p>{t('levelMastered')}: {curriculum.summary.mastered} · {t('levelPractising')}: {curriculum.summary.practising + curriculum.summary.stalled} · {t('levelWeak')}: {curriculum.summary.weak + curriculum.summary.due} · {t('levelUntouched')}: {curriculum.summary.untouched}</p>
      {curriculum.objectives.filter(item => item.attempts > 0 || item.activeMistakes > 0).map(item => <p key={item.id}>{item.title} · {t(levelKeys[item.level])} · {t('independent')}: {item.independentDays}</p>)}
    </section>}
    <section><h3>{t('evidence')}</h3>{study.progress.length === 0 && <p>{t('empty')}</p>}
      {study.progress.map(item => <p key={JSON.stringify([item.subject, item.topic, item.materialId, item.objectiveId])}>{goals.find(goal => goal.id === item.objectiveId)?.title ?? item.topic} · {t(item.level === 'independent-on-three-days' ? 'independent' : 'practising')}</p>)}
      {study.recentAttempts.map(item => <details key={item.id}><summary>{item.topic} · {t(item.result)}</summary><p>{item.prompt}</p><p>{item.response}</p><p>{item.feedback}</p><p>{item.answerEvidence}</p></details>)}
    </section><p>{t('bounded')}</p>
  </>
}
