import { useEffect, useState } from 'react'
import type { Command } from '../schema.ts'
import type { CheckInIntensity } from '../learning/mastery.ts'
import type { Translate } from './locales.ts'
import { FigureView } from './figure-view.tsx'
import { hintPromptFor, stuckPrompt } from './prompts.ts'
import { assistKeys, clock, day, focusKeys, intensityHelpKeys, intensityKeys, planKeys, reasonText, reminderKeys, type Activity, type Mode, type ScopeChoice, type Subject } from './display.ts'
import type { Dashboard } from '../dashboard.ts'

type Study = NonNullable<Dashboard['study']>
type Curriculum = NonNullable<Study['curriculum']>
type Goal = { id: string; title: string }
type Act = (command: Command, withTutor?: boolean, prompt?: string) => Promise<void>

/** The learner's page: one recommended next step, the current question, and a folded set of other ways to practise. */
export function TodayView({ study, now, serverNow, remaining, subject, activity, setActivity, goal, clearGoal, curriculum, selectedObjectiveId, chooseGoal, intensityLabel, openParent, openCheckins, scope, setScope, scopeUnits, start, startRecommended, startDiagnosis, chosenIntensity, disabled, running, act, tutor, t, prompts }: {
  study: Study
  now: number
  serverNow: number
  remaining: number
  subject: Subject
  activity: Activity
  setActivity: (activity: Activity) => void
  goal: Goal | undefined
  clearGoal: () => void
  curriculum: Curriculum | null
  selectedObjectiveId: string
  chooseGoal: (goal: { id: string; subject: Subject }) => void
  intensityLabel: string
  openParent: () => void
  openCheckins: () => void
  scope: ScopeChoice
  setScope: (scope: ScopeChoice) => void
  scopeUnits: { id: string; name: string }[]
  start: (subject: Subject, mode: Mode) => Promise<void>
  startRecommended: () => void
  startDiagnosis: (subject: Subject, intensity: CheckInIntensity) => Promise<void>
  chosenIntensity: CheckInIntensity
  disabled: boolean
  running: boolean
  act: Act
  tutor: (text: string) => Promise<void>
  t: Translate
  prompts: { daily: string; dictation: string }
}) {
  const active = study.active
  const task = study.task?.sessionId === active?.id ? study.task : undefined
  const available = !!active
  const pastSuggestion = !!active && now >= active.deadline
  const recommendation = study.recommendation
  const progress = curriculum?.scope.current ? study.courses.find(item => item.subject === subject)?.progress : undefined
  const frontierIndex = progress ? curriculum?.units.findIndex(unit => unit.id === progress.unitId) ?? -1 : -1
  const schoolUnit = frontierIndex >= 0 ? curriculum?.units[frontierIndex] : undefined
  const homeUnit = curriculum?.scope.current ? [...curriculum.units].reverse().find(unit => curriculum.concepts.some(concept => concept.unit === unit.id && concept.level !== 'untouched')) : undefined
  const objectiveDays = curriculum?.scope.current ? curriculum.objectives.find(item => item.id === task?.objectiveId)?.independentDays : undefined
  const explain = study.understandingReminders[0]
  return <>
    <section className="student-status"><h3>{t('goal')}</h3><p>{study.profile.nickname} · {t('todayStars')}: {study.todayStars}</p>
      <p className="student-timer">{t('dailyRemaining')}: {clock(remaining)} · {t('due')}: {study.dueCount} · {t('weakPoints')}: {study.weakPoints.length}</p>
      {schoolUnit && <p>{t('schoolFrontier')}: {schoolUnit.name} · {t(progress?.posture === 'catch-up' ? 'catchUp' : 'keepUp')}{progress?.pace === 'review' ? ` · ${t('reviewWeek')}` : ''} · {t('homeProgress')}: {homeUnit?.name ?? t('homeNotStarted')}</p>}
      {schoolUnit && <p>{t('schoolHere')}</p>}
      <p className="student-muted">{t(subject === 'chinese' ? 'chineseMethod' : subject === 'math' ? 'mathMethod' : 'englishMethod')}</p>
      {active ? <><p>{t(active.subject)} · {t(active.mode)}</p><p className="student-timer">{t('time')}: {clock(Math.max(0, active.deadline - now))}</p>
        {pastSuggestion && <p role="status">{t('expired')}</p>}
      </> : study.phase === 'break' && study.breakRemainingMs - (now - serverNow) > 0 ? <p>{t('rest')} · {clock(study.breakRemainingMs - (now - serverNow))}</p>
        : study.phase === 'daily-complete' ? <p>{t('done')}</p> : null}
    </section>
    {active && <>
      <section className="student-focus"><p className="student-muted">{t('chatHelp')}</p>{task ? <Task study={study} goalTitle={goalTitle(study, task.objectiveId)} days={objectiveDays} disabled={disabled || running} t={t} act={act} /> : <p>{t('waiting')}</p>}
        {available && (running ? <p role="status">{t('tutorWorking')}</p>
          : (!task || study.feedback || task.response !== undefined || task.hintLevel > 0) && <button disabled={disabled} onClick={() => { void tutor('').catch(() => {}) }}>{t(!task ? 'prepareTask' : study.feedback ? 'nextTask' : task.response !== undefined ? 'retryFeedback' : 'retryHint')}</button>)}
      </section>
      <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void act({ action: 'stop', sessionId: active.id, reflection: String(form.get('reflection') ?? '') }) }}>
        {(explain || task?.objectiveId) && <p>{t('explainPrompt')}{explain ? ` · ${explain.title}` : ''}</p>}
        <label>{t('reflection')}<textarea aria-label={t('reflection')} name="reflection" maxLength={2000} placeholder={t('explainPrompt')} /></label><button disabled={disabled} type="submit">{t('stop')}</button>
      </form>
    </>}
    {!active && <section className="student-plan"><h3>{t('todayPlan')}</h3>
      {recommendation ? <><p>{t(planKeys[recommendation.kind])} · {t(recommendation.subject)}{recommendation.title ? ` · ${recommendation.title}` : ''}</p>
        <p className="student-muted">{reasonText([recommendation.reason], t)}</p>
        {recommendation.redirectedFrom && <p className="student-muted">{t('prerequisiteFor')}: {recommendation.redirectedFrom.title}</p>}
        {recommendation.kind === 'hold' ? <button type="button" onClick={openParent}>{t('updateSchoolProgress')}</button>
          : <button type="button" className="student-primary" disabled={disabled || running} onClick={startRecommended}>{t('startNow')}</button>}
        {recommendation.kind !== 'hold' && study.phase !== 'ready' && <p className="student-muted">{t('planBlocked')}</p>}
      </> : <p>{t('allDone')}</p>}
      {goal && <p>{t('learningGoal')}: {goal.title} <button type="button" onClick={clearGoal}>{t('clearGoal')}</button></p>}
      {study.weakPoints.length > 0 && <details><summary>{t('weakPoints')} · {study.weakPoints.length}</summary><p className="student-muted">{t('weakHint')}</p>
        {study.weakPoints.map(item => <div key={item.id}><p>{t(item.subject)} · {item.title} · {t(levelKey(item.level))}</p><p className="student-muted">{reasonText(item.reasons, t)}</p>
          <button type="button" disabled={disabled || running} aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>
        </div>)}
      </details>}
    </section>}
    {!active && <Alternate study={study} activity={activity} setActivity={setActivity} disabled={disabled || running} t={t} goal={goal} intensityLabel={intensityLabel} openCheckins={openCheckins} scope={scope} setScope={setScope} scopeUnits={scopeUnits} start={start} />}
    {!active && (() => {
      const unit = progress && curriculum ? curriculum.units.find(item => item.id === progress.unitId) : undefined
      const causes = study.errorProfile.filter(item => item.subject === subject).slice(0, 3)
      if (unit?.focus === undefined && causes.length === 0) return null
      return <section><h3>{t('routineTitle')} · {t(subject)}</h3>
        <p className="student-muted">{t('routineHelp')}</p>
        {unit?.focus !== undefined && <p>{unit.name}：{t(focusKeys[unit.focus])}</p>}
        {causes.length > 0 && <p className="student-muted">{t('topCauses')}：{causes.map(item => `${t(item.type)} ×${item.count}`).join('、')}</p>}
        <div className="student-segments">
          <button type="button" disabled={disabled || running} onClick={() => { void tutor(prompts.daily).catch(() => {}) }}>{t('printDailySheet')}</button>
          <button type="button" disabled={disabled || running} onClick={() => { void tutor(prompts.dictation).catch(() => {}) }}>{t('dictation')}</button>
        </div>
      </section>
    })()}
    {!active && study.understandingReminders.length > 0 && <section><h3>{t('remindersTitle')}</h3><p className="student-muted">{t('remindersHint')}</p>
      {study.understandingReminders.map(item => <p key={`${item.code}-${item.objectiveId ?? item.title}`}>{t(reminderKeys[item.code])} · {item.title}</p>)}
    </section>}
    {!active && study.diagnostic && <section><h3>{t('diagnosisTitle')} · {t(subject)}</h3>
      <p>{study.diagnostic.lastAt !== undefined ? `${t('diagnosisLast')}: ${day(study.diagnostic.lastAt)} · ${t('nextCheck')}: ${day(study.diagnostic.nextAt)}` : t('diagnosisNever')} · {t('coverage')}: {study.diagnostic.coverage.probed} / {study.diagnostic.coverage.total}</p>
      <p className="student-muted">{t(study.diagnostic.due ? 'diagnosisDue' : 'diagnosisNotDue')}{study.diagnostic.samples[chosenIntensity].length > 0 ? ` · ${t('diagnosisSample')}: ${study.diagnostic.samples[chosenIntensity].map(item => item.title).join(' · ')}` : ''}</p>
      <p className="student-muted">{t('intensity')}: {t(intensityKeys[chosenIntensity])} · {t(intensityHelpKeys[chosenIntensity])} <button type="button" onClick={openCheckins}>{t('chooseIntensity')}</button></p>
      {study.diagnostic.samples[chosenIntensity].length > 0 && <button type="button" disabled={disabled || running} onClick={() => { void startDiagnosis(subject, chosenIntensity) }}>{t(study.diagnostic.due ? 'startDiagnosis' : 'repeatDiagnosis')}</button>}
      {(() => { const last = study.checkIns.find(item => item.subject === subject); return last && last.results.length > 0 ? <details open={!study.diagnostic.due}><summary>{t('diagnosisResults')} · {day(last.startedAt)} · {t(intensityKeys[last.intensity])}</summary>
        <p className="student-muted">{t('assistIndependent')} {last.counts.independent} · {t('assistHint')} {last.counts.helped} · {t('wrong')} {last.counts.wrong}</p>
        {last.results.map(item => <div key={item.id}><p>{item.title} · {t(item.result)} · {t(assistKeys[item.assistance])}</p>
          {item.objectiveId !== null && (item.result !== 'correct' || item.assistance !== 'independent') && <button type="button" disabled={disabled || running} aria-pressed={selectedObjectiveId === item.objectiveId} onClick={() => chooseGoal({ id: item.objectiveId ?? '', subject })}>{t('chooseGoal')} · {item.title}</button>}
        </div>)}
      </details> : null })()}
    </section>}
  </>
}

function levelKey(level: Study['weakPoints'][number]['level']) {
  return level === 'due' ? 'levelDue' as const : level === 'weak' ? 'levelWeak' as const : level === 'stalled' ? 'levelStalled' as const : level === 'mastered' ? 'levelMastered' as const : level === 'practising' ? 'levelPractising' as const : 'levelUntouched' as const
}

function goalTitle(study: Study, objectiveId: string | undefined): string | undefined {
  if (!objectiveId) return undefined
  return study.curriculum?.objectives.find(item => item.id === objectiveId)?.title ?? study.objectives.find(item => item.id === objectiveId)?.title
}

function Alternate({ study, activity, setActivity, disabled, start, goal, intensityLabel, openCheckins, scope, setScope, scopeUnits, t }: {
  study: Study
  activity: Activity
  setActivity: (activity: Activity) => void
  disabled: boolean
  start: (subject: Subject, mode: Mode) => Promise<void>
  goal: Goal | undefined
  intensityLabel: string
  openCheckins: () => void
  scope: ScopeChoice
  setScope: (scope: ScopeChoice) => void
  scopeUnits: { id: string; name: string }[]
  t: Translate
}) {
  const { subject, mode } = activity
  const confirmed = study.courses.some(item => item.subject === subject)
  const due = study.dueSubjects.includes(subject)
  const uiMode = mode === 'review' || mode === 'explore' || mode === 'diagnose' ? mode : 'sync'
  const alternate = uiMode !== 'sync' || goal !== undefined
  const [open, setOpen] = useState(alternate)
  useEffect(() => { if (alternate) setOpen(true) }, [alternate])
  const scoped = scope.grade !== undefined || scope.term !== undefined
  return <details className="student-fold" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t('otherWays')}</summary>
    <form onSubmit={event => { event.preventDefault(); void start(subject, mode) }}><fieldset disabled={disabled}>
      <label>{t('mode')}<select aria-label={t('mode')} value={uiMode} onChange={event => {
        const value = event.target.value
        const next: Mode = value === 'review' || value === 'explore' || value === 'diagnose' ? value : confirmed ? 'school' : 'foundation'
        setActivity({ subject, mode: next })
      }}>
        <option value="sync">{t('sync')}</option>
        <option value="review" disabled={!due}>{t('review')}</option>
        <option value="diagnose">{t('diagnose')}</option>
        <option value="explore">{t('explore')}</option>
      </select></label>
      <p>{t(uiMode === 'sync' ? 'syncHelp' : uiMode === 'review' ? 'reviewHelp' : uiMode === 'diagnose' ? 'diagnoseHelp' : 'exploreHelp')}</p>
      {(uiMode === 'sync' || uiMode === 'diagnose') && <p>
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
      {uiMode === 'diagnose' && <p>{t('intensity')}: {intensityLabel} <button type="button" onClick={openCheckins}>{t('chooseIntensity')}</button></p>}
      {!confirmed && uiMode === 'sync' && <p>{t('unconfirmed')}</p>}
      <button type="submit" className="student-primary" disabled={uiMode === 'review' && !due}>{t('start')}</button>
    </fieldset></form>
  </details>
}

const phaseKeys = { demo: 'phaseDemo', guide: 'phaseGuide', try: 'phaseTry', vary: 'phaseVary' } as const

function Task({ study, goalTitle: title, days, disabled, t, act }: { study: Study; goalTitle: string | undefined; days: number | undefined; disabled: boolean; t: Translate; act: Act }) {
  const task = study.task
  if (!task) return null
  const lit = Math.min(3, days ?? 0)
  const hintLabel = task.hintLevel > 0 ? t('hintMore') : t('hint')
  return <><h3>{task.topic}</h3>{title && <p className="student-muted">{t('learningGoal')}: {title}</p>}
    {task.phase && <p className="student-muted">{t(phaseKeys[task.phase])}</p>}
    {days !== undefined && <p className="student-mastery" aria-label={`${t('masteryProgress')} ${lit}/3`}>{[0, 1, 2].map(index => <span key={index} className={index < lit ? 'student-level-mastered' : 'student-level-untouched'} />)}</p>}
    <p className="student-question">{task.prompt}</p>
    {task.figure && <FigureView figure={task.figure} t={t} />}
    {task.response !== undefined && <p>{t('answer')}: {task.response}</p>}
    {study.feedback ? <><p className="student-result">{t(study.feedback.result)}</p><p>{study.feedback.feedback}</p></> : task.response !== undefined ? <p role="status">{t('submitted')}</p> : task.choices ? <fieldset disabled={disabled}>
      <p>{t('chooseAnswer')}</p>
      <div className="student-choices">{task.choices.map(choice => <button key={choice} type="button" onClick={() => { void act({ action: 'answer', taskId: task.id, response: choice }, true) }}>{choice}</button>)}</div>
      <button type="button" onClick={() => { void act({ action: 'hint', taskId: task.id }, true, hintPromptFor(task)) }}>{hintLabel}</button>
      <button type="button" onClick={() => { void act({ action: 'stuck', taskId: task.id }, true, stuckPrompt) }}>{t('wont')}</button>
    </fieldset> : <form onSubmit={event => { event.preventDefault(); void act({ action: 'answer', taskId: task.id, response: String(new FormData(event.currentTarget).get('answer') ?? '') }, true) }}>
      <fieldset disabled={disabled}><label>{t('answer')}<input name="answer" required maxLength={2000} /></label><button type="submit">{t('submit')}</button>
        <button type="button" onClick={() => { void act({ action: 'hint', taskId: task.id }, true, hintPromptFor(task)) }}>{hintLabel}</button>
        <button type="button" onClick={() => { void act({ action: 'stuck', taskId: task.id }, true, stuckPrompt) }}>{t('wont')}</button>
      </fieldset>
    </form>}
    {task.hintLevel > 0 && <p>{t('hinted')} · {t('hintLevel')} {task.hintLevel}</p>}
  </>
}
