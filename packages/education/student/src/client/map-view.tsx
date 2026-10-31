import { useState } from 'react'
import type { Command } from '../schema.ts'
import type { Dashboard } from '../dashboard.ts'
import type { CheckInIntensity, ObjectiveInsight } from '../learning/mastery.ts'
import type { Translate } from './locales.ts'
import { MasteryDots } from './mastery-dots.tsx'
import { assistKeys, day, intensityHelpKeys, intensityKeys, levelKeys, reasonText, sampleKeys, type ScopeChoice, type Subject } from './display.ts'

type Study = NonNullable<Dashboard['study']>
type Curriculum = NonNullable<Study['curriculum']>
type Concept = Curriculum['concepts'][number]
type Level = ObjectiveInsight['level']
type MapFilter = 'all' | 'needs-work' | 'untouched'
const levels = ['mastered', 'practising', 'stalled', 'weak', 'due', 'untouched'] as const

function matchesFilter(level: Level, filter: MapFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'untouched') return level === 'untouched'
  return level === 'weak' || level === 'due' || level === 'stalled'
}

/** Parent map: unit spine with inline concept detail, pending concepts, and folded check-ins. */
export function MapView({ study, curriculum, subject, selectedConceptId, setSelectedConceptId, selectedObjectiveId, clearGoal, chooseGoal, active, scopeGrade, scopeTerm, setMapGrade, setMapTerm, clearBrowse, intensities, setIntensity, scopeOf, setScope, selectSubject, startDiagnosis, disabled, running, organize, change, t }: {
  study: Study
  curriculum: Curriculum | null
  subject: Subject
  selectedConceptId: string
  setSelectedConceptId: (id: string) => void
  selectedObjectiveId: string
  clearGoal: () => void
  chooseGoal: (goal: { id: string; subject: Subject }) => void
  active: boolean
  scopeGrade: number
  scopeTerm: 'first' | 'second'
  setMapGrade: (grade: number) => void
  setMapTerm: (term: 'first' | 'second') => void
  clearBrowse: () => void
  intensities: Partial<Record<Subject, CheckInIntensity>>
  setIntensity: (subject: Subject, intensity: CheckInIntensity) => void
  scopeOf: (subject: Subject) => ScopeChoice
  setScope: (subject: Subject, scope: ScopeChoice) => void
  selectSubject: (subject: Subject) => void
  startDiagnosis: (subject: Subject, intensity: CheckInIntensity) => Promise<void>
  disabled: boolean
  running: boolean
  organize: () => void
  change: (command: Command) => Promise<void>
  t: Translate
}) {
  const [filter, setFilter] = useState<MapFilter>('all')
  const progress = curriculum?.scope.current ? study.courses.find(item => item.subject === subject)?.progress : undefined
  const frontierIndex = progress ? curriculum?.units.findIndex(unit => unit.id === progress.unitId) ?? -1 : -1
  function unitNote(unitId: string) {
    if (!progress || frontierIndex < 0 || !curriculum) return undefined
    const index = curriculum.units.findIndex(unit => unit.id === unitId)
    if (index === frontierIndex) return t('schoolHere')
    if (progress.preview && progress.pace === 'teaching' && index === frontierIndex + 1) return t('previewUnit')
    if (index > frontierIndex) return t('notTaughtYet')
    return undefined
  }
  const selectedConcept = curriculum?.concepts.find(item => item.id === selectedConceptId)
  const chosen = (target: Subject): CheckInIntensity => intensities[target] ?? study.diagnostics.find(plan => plan.subject === target)?.recommendedIntensity ?? 'standard'
  const summary = curriculum?.summary
  return <>
    <section>
      <h3>{curriculum ? curriculum.title : t('map')}</h3>
      <div className="student-scope">
        <label>{t('mapScope')}<select aria-label={t('grade')} value={scopeGrade} onChange={event => setMapGrade(Number(event.target.value))}><option value={1}>{t('gradeOne')}</option><option value={2}>{t('gradeTwo')}</option></select></label>
        <label>{t('term')}<select aria-label={t('term')} value={scopeTerm} onChange={event => setMapTerm(event.target.value === 'second' ? 'second' : 'first')}><option value="first">{t('first')}</option><option value="second">{t('second')}</option></select></label>
        {(scopeGrade !== study.profile.grade || scopeTerm !== study.profile.term) && <button type="button" onClick={clearBrowse}>{t('backToCurrent')}</button>}
      </div>
      {curriculum && !curriculum.scope.current && <p role="status">{t('mapBrowsing')}</p>}
      {summary && <p className="student-muted">{t('levelMastered')} {summary.mastered} · {t('levelPractising')} {summary.practising} · {t('levelWeak')} {summary.weak + summary.due} · {t('levelUntouched')} {summary.untouched}{summary.stalled > 0 ? ` · ${t('levelStalled')} ${summary.stalled}` : ''}</p>}
      {curriculum && <details><summary>{t('mapBasis')}</summary><p>{curriculum.basis}</p></details>}
      {!curriculum && <p>{t('mapUnavailable')}</p>}
      {selectedObjectiveId && !active && <button type="button" onClick={clearGoal}>{t('clearGoal')}</button>}
    </section>
    {curriculum && <section>
      <h3>{t('mindMap')}</h3>
      <p className="student-muted">{t('mindMapHelp')}</p>
      <nav className="student-segments" aria-label={t('mapFilter')}>
        {([
          ['all', 'mapFilterAll'],
          ['needs-work', 'mapFilterNeedsWork'],
          ['untouched', 'mapFilterUntouched'],
        ] as const).map(([value, key]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(key)}</button>)}
      </nav>
      <div className="student-legend">{levels.map(level => <span key={level}><span className={`student-dot student-level-${level}`} />{t(levelKeys[level])}</span>)}</div>
      {curriculum.units.map(unit => {
        const own = curriculum.concepts.filter(item => item.unit === unit.id)
        const shown = own.filter(item => matchesFilter(item.level, filter))
        if (filter !== 'all' && shown.length === 0) return null
        const note = unitNote(unit.id)
        const open = unit.id === selectedConcept?.unit || (frontierIndex >= 0 && curriculum.units[frontierIndex]?.id === unit.id)
        return <details key={`${unit.id}:${open ? selectedConceptId || 'frontier' : 'rest'}:${filter}`} className="student-mindmap-unit" {...(open ? { open: true } : {})}>
          <summary>{unit.name} · {t('levelMastered')} {unit.mastered}/{unit.concepts}{unit.weak + unit.due > 0 ? ` · ${t('levelWeak')} ${unit.weak + unit.due}` : ''}</summary>
          {note && <p className="student-muted">{note}</p>}
          <StackedBar counts={countLevels(own)} t={t} />
          <p className="student-muted">{unit.summary}</p>
          {shown.length === 0 ? <p className="student-muted">{t('mapFilterEmpty')}</p> : <ul className="student-mindmap-branch">
            {shown.map(item => <li key={item.id} className="student-mindmap-node">
              <button type="button" className={`student-mindmap-concept student-level-${item.level}`} aria-pressed={selectedConceptId === item.id} onClick={() => setSelectedConceptId(item.id)}>
                <span className={`student-dot student-level-${item.level}`} />{item.name}
              </button>
              {selectedConceptId === item.id && <ConceptDetail curriculum={curriculum} concept={item} selectedObjectiveId={selectedObjectiveId} chooseGoal={chooseGoal} setSelectedConceptId={setSelectedConceptId} t={t} />}
            </li>)}
          </ul>}
        </details>
      })}
      {filter !== 'all' && curriculum.units.every(unit => curriculum.concepts.filter(item => item.unit === unit.id).filter(item => matchesFilter(item.level, filter)).length === 0) && <p className="student-muted">{t('mapFilterEmpty')}</p>}
    </section>}
    {(study.objectives.length > 0 || study.concepts.length > 0) && <section><h3>{t('learningGoal')} · {t('pendingConcept')}</h3>
      {study.concepts.map(item => <details key={item.id}><summary>{item.name}{item.confirmedAt === undefined ? ` · ${t('pendingConcept')}` : ''}</summary>
        <p>{t('definition')}: {item.definition}</p><p>{t('example')}: {item.example}</p><p>{t('source')}: {item.source}</p>
        {item.confirmedAt === undefined && <form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); void change({ action: 'confirm-concept', id: item.id, definition: String(form.get('definition') ?? ''), example: String(form.get('example') ?? ''), source: String(form.get('source') ?? ''), userConfirmation: t('confirmConcept') }).catch(() => {}) }}>
          {(['definition', 'example', 'source'] as const).map(name => <label key={name}>{t(name)}<textarea name={name} defaultValue={item[name]} required maxLength={2000} /></label>)}
          <button disabled={disabled} type="submit">{t('confirmConcept')}</button>
        </form>}
      </details>)}
      {study.relations.map(item => <p key={item.id}>{study.concepts.find(concept => concept.id === item.fromId)?.name ?? item.fromId} · {t(item.kind)} · {study.concepts.find(concept => concept.id === item.toId)?.name ?? item.toId}: {item.explanation} · {t('source')}: {item.source}</p>)}
      {study.objectives.map(item => <div key={item.id}><p>{item.title} · {t(item.method)}: {item.goal}</p>
        <button type="button" aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal({ id: item.id, subject })}>{t('chooseGoal')} · {item.title}</button>
      </div>)}
      <button type="button" disabled={disabled || running} onClick={organize}>{t('organizeConcepts')}</button>
    </section>}
    {!(study.objectives.length > 0 || study.concepts.length > 0) && <section>
      <button type="button" disabled={disabled || running} onClick={organize}>{t('organizeConcepts')}</button>
    </section>}
    <details className="student-fold">
      <summary>{t('diagnosisTitle')}</summary>
      <p className="student-muted">{t('checkinHelp')}</p>
      {study.diagnostics.map(plan => {
        const target = plan.subject
        const scope = scopeOf(target)
        const scoped = scope.grade !== undefined || scope.term !== undefined
        const scopedPlan = scoped && target === subject ? study.scopedDiagnostic : null
        const shown = scopedPlan ?? plan
        const intensity = chosen(target)
        const sample = shown.samples[intensity]
        const history = study.checkIns.filter(item => item.subject === target)
        const scopeUnits = scoped && target === subject ? (study.scopedUnits ?? []) : []
        return <section key={target}><h3>{t(target)} · {t(shown.due ? 'diagnosisDue' : 'diagnosisNotDue')}</h3>
          <p>
            <label>{t('scopeLabel')}<select aria-label={t('scopeLabel')} value={scoped ? `${scope.grade ?? study.profile.grade}-${scope.term ?? study.profile.term}` : 'current'} onChange={event => {
              const value = event.target.value
              if (value === 'current') { setScope(target, {}); return }
              const [grade, term] = value.split('-') as [string, 'first' | 'second']
              setScope(target, { grade: Number(grade), term })
              if (target !== subject) selectSubject(target)
            }}>
              <option value="current">{t('scopeCurrent')}</option>
              {([[1, 'first'], [1, 'second'], [2, 'first'], [2, 'second']] as const).filter(([grade, term]) => !(grade === study.profile.grade && term === study.profile.term)).map(([grade, term]) => <option key={`${grade}-${term}`} value={`${grade}-${term}`}>{t(grade === 1 ? 'gradeOne' : 'gradeTwo')} · {t(term)}</option>)}
            </select></label>
            {scoped && target === subject && <label>{t('scopeUnit')}<select aria-label={t('scopeUnit')} value={scope.unit ?? ''} onChange={event => setScope(target, { ...scope, ...(event.target.value ? { unit: event.target.value } : {}) })}>
              <option value="">{t('scopeWholeMap')}</option>
              {scopeUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select></label>}
          </p>
          <p>{shown.lastAt !== undefined ? `${t('diagnosisLast')}: ${day(shown.lastAt)} · ${t('nextCheck')}: ${day(shown.nextAt)}` : t('diagnosisNever')}</p>
          <p>{t('coverage')}: {shown.coverage.probed} / {shown.coverage.total}</p>
          <progress value={shown.coverage.probed} max={Math.max(1, shown.coverage.total)} aria-label={t('coverage')} />
          <nav className="student-segments" aria-label={t('intensity')}>{(['light', 'standard', 'deep'] as const).map(level => <button key={level} type="button" aria-pressed={intensity === level} onClick={() => setIntensity(target, level)}>{t(intensityKeys[level])} · {shown.samples[level].length}{shown.recommendedIntensity === level ? ` · ${t('recommended')}` : ''}</button>)}</nav>
          <p className="student-muted">{t(intensityHelpKeys[intensity])}</p>
          {sample.length > 0 ? <p className="student-muted">{t('diagnosisSample')}: {sample.map(item => `${item.title} · ${t(sampleKeys[item.reason])}`).join('；')}</p> : <p>{t('empty')}</p>}
          <button type="button" disabled={disabled || running || sample.length === 0} onClick={() => { void startDiagnosis(target, intensity) }}>{t(shown.due ? 'startDiagnosis' : 'repeatDiagnosis')} · {t(target)}</button>
          {history.length > 0 && <details><summary>{t('history')} · {history.length}</summary>
            {history.map(item => <div key={item.sessionId}><p>{day(item.startedAt)} · {t(intensityKeys[item.intensity])} · {t('assistIndependent')} {item.counts.independent} · {t('assistHint')} {item.counts.helped} · {t('wrong')} {item.counts.wrong}</p>
              {item.results.map(result => <p key={result.id} className="student-muted">{result.title} · {t(result.result)} · {t(assistKeys[result.assistance])}</p>)}
            </div>)}
          </details>}
        </section>
      })}
    </details>
  </>
}

function ConceptDetail({ curriculum, concept, selectedObjectiveId, chooseGoal, setSelectedConceptId, t }: {
  curriculum: Curriculum
  concept: Concept
  selectedObjectiveId: string
  chooseGoal: (goal: { id: string; subject: Subject }) => void
  setSelectedConceptId: (id: string) => void
  t: Translate
}) {
  const goals = curriculum.objectives.filter(item => item.conceptIds.includes(concept.id))
  const relations = curriculum.relations.filter(relation => relation.fromId === concept.id || relation.toId === concept.id)
  const nameOf = (id: string) => curriculum.concepts.find(item => item.id === id)?.name ?? id
  return <div className="student-map-inline" aria-live="polite">
    <p>{t('definition')}: {concept.definition}</p>
    <p>{t('example')}: {concept.example}</p>
    {(concept.ideaIds ?? []).map(id => { const idea = curriculum.ideas.find(item => item.id === id); return idea ? <p key={id}>{idea.name}: {idea.definition}</p> : null })}
    {concept.facts !== undefined && concept.facts.length > 0 && <ul>{concept.facts.map(fact => <li key={fact}>{fact}</li>)}</ul>}
    <p className="student-muted">{t('source')}: {concept.source}</p>
    {concept.lastAt !== undefined && <p className="student-muted">{t('lastPractised')}: {day(concept.lastAt)}{concept.activeMistakes > 0 ? ` · ${t('bookReviewing')} ${concept.activeMistakes}` : ''}</p>}
    {goals.map(item => <div key={item.id}>
      <p>{t('learningGoal')} · {item.title} · {t(levelKeys[item.level])} · {t(item.method)}</p>
      <MasteryDots days={curriculum.scope.current ? item.independentDays : undefined} t={t} />
      <p className="student-muted">{item.goal}</p>
      {item.reasons.length > 0 && item.level !== 'untouched' && <p className="student-muted">{reasonText(item.reasons, t)}</p>}
      {curriculum.scope.current && <button type="button" aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>}
    </div>)}
    {relations.length > 0 && <div className="student-map-links">
      <p className="student-muted">{t('relationsLabel')}</p>
      {relations.map(relation => <p key={relation.id} className="student-muted">
        <button type="button" className="student-quiet" onClick={() => setSelectedConceptId(relation.fromId)}>{nameOf(relation.fromId)}</button>
        {` · ${t(relation.kind)} · `}
        <button type="button" className="student-quiet" onClick={() => setSelectedConceptId(relation.toId)}>{nameOf(relation.toId)}</button>
        {`: ${relation.explanation}`}
      </p>)}
    </div>}
  </div>
}

function countLevels(concepts: readonly Concept[]): Record<Level, number> {
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
