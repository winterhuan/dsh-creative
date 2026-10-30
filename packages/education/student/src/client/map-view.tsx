import type { Command } from '../schema.ts'
import type { Dashboard } from '../dashboard.ts'
import type { CheckInIntensity, ObjectiveInsight } from '../learning/mastery.ts'
import type { Translate } from './locales.ts'
import { MasteryDots } from './mastery-dots.tsx'
import { assistKeys, day, intensityHelpKeys, intensityKeys, levelKeys, reasonText, sampleKeys, type ScopeChoice, type Subject } from './display.ts'

type Study = NonNullable<Dashboard['study']>
type Curriculum = NonNullable<Study['curriculum']>
type Level = ObjectiveInsight['level']
const levels = ['mastered', 'practising', 'stalled', 'weak', 'due', 'untouched'] as const

/** Parent map: unit cards, concept detail, and the three subjects' check-ins. */
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
  const conceptName = (id: string) => curriculum?.concepts.find(item => item.id === id)?.name ?? id
  const selectedConcept = curriculum?.concepts.find(item => item.id === selectedConceptId)
  const chosen = (target: Subject): CheckInIntensity => intensities[target] ?? study.diagnostics.find(plan => plan.subject === target)?.recommendedIntensity ?? 'standard'
  return <>
    <section><h3>{curriculum ? curriculum.title : t('map')}</h3>
      <div className="student-scope">
        <label>{t('mapScope')}<select aria-label={t('grade')} value={scopeGrade} onChange={event => setMapGrade(Number(event.target.value))}><option value={1}>{t('gradeOne')}</option><option value={2}>{t('gradeTwo')}</option></select></label>
        <label>{t('term')}<select aria-label={t('term')} value={scopeTerm} onChange={event => setMapTerm(event.target.value === 'second' ? 'second' : 'first')}><option value="first">{t('first')}</option><option value="second">{t('second')}</option></select></label>
        {(scopeGrade !== study.profile.grade || scopeTerm !== study.profile.term) && <button type="button" onClick={clearBrowse}>{t('backToCurrent')}</button>}
      </div>
      {curriculum && !curriculum.scope.current && <p role="status">{t('mapBrowsing')}</p>}
      {curriculum ? <>
        <p>{t('levelMastered')}: {curriculum.summary.mastered} · {t('levelPractising')}: {curriculum.summary.practising} · {t('levelStalled')}: {curriculum.summary.stalled} · {t('levelWeak')}: {curriculum.summary.weak} · {t('levelDue')}: {curriculum.summary.due} · {t('levelUntouched')}: {curriculum.summary.untouched}</p>
        <details><summary>{t('mapBasis')}</summary><p>{curriculum.basis}</p></details>
        {selectedObjectiveId && !active && <button type="button" onClick={clearGoal}>{t('clearGoal')}</button>}
      </> : <p>{t('mapUnavailable')}</p>}
    </section>
    {curriculum && <section><h3>{t('mindMap')}</h3>
      <p className="student-muted">{t('mindMapHelp')}</p>
      <div className="student-legend">{levels.map(level => <span key={level}><span className={`student-dot student-level-${level}`} />{t(levelKeys[level])}</span>)}</div>
      <MindMapTree curriculum={curriculum} selectedConceptId={selectedConceptId} setSelectedConceptId={setSelectedConceptId} selectedObjectiveId={selectedObjectiveId} chooseGoal={chooseGoal} active={active} t={t} />
    </section>}
    {curriculum && <section><h3>{t('knowledgePoints')}</h3>
      <p className="student-muted">{t('selectConcept')}</p>
      <div className="student-legend">{levels.map(level => <span key={level}><span className={`student-dot student-level-${level}`} />{t(levelKeys[level])}</span>)}</div>
      {selectedConcept ? <div className="student-plan"><h3>{selectedConcept.name} · {t(levelKeys[selectedConcept.level])}</h3>
        <p>{t('definition')}: {selectedConcept.definition}</p><p>{t('example')}: {selectedConcept.example}</p>
        {(selectedConcept.ideaIds ?? []).map(id => { const idea = curriculum.ideas.find(item => item.id === id); return idea ? <p key={id}>{idea.name}: {idea.definition}</p> : null })}
        {selectedConcept.facts !== undefined && selectedConcept.facts.length > 0 && <ul>{selectedConcept.facts.map(fact => <li key={fact}>{t('facts')}: {fact}</li>)}</ul>}
        <p className="student-muted">{t('source')}: {selectedConcept.source}</p>
        {selectedConcept.lastAt !== undefined && <p className="student-muted">{t('lastPractised')}: {day(selectedConcept.lastAt)}{selectedConcept.activeMistakes > 0 ? ` · ${t('bookReviewing')} ${selectedConcept.activeMistakes}` : ''}</p>}
        {curriculum.objectives.filter(item => item.conceptIds.includes(selectedConcept.id)).map(item => <div key={item.id}><p>{t('learningGoal')} · {item.title} · {t(levelKeys[item.level])} · {t(item.method)}</p><MasteryDots days={curriculum.scope.current ? item.independentDays : undefined} t={t} /><p className="student-muted">{item.goal}</p>
          {item.reasons.length > 0 && item.level !== 'untouched' && <p className="student-muted">{reasonText(item.reasons, t)}</p>}
          {curriculum.scope.current && <button type="button" aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>}
        </div>)}
        {curriculum.relations.filter(relation => relation.fromId === selectedConcept.id || relation.toId === selectedConcept.id).map(relation => <p key={relation.id} className="student-muted">{conceptName(relation.fromId)} · {t(relation.kind)} · {conceptName(relation.toId)}: {relation.explanation}</p>)}
      </div> : null}
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
        {curriculum.objectives.filter(item => item.unit === unit.id).map(item => <div key={item.id}><p>{t('learningGoal')} · {item.title} · {t(levelKeys[item.level])} · {t(item.method)}</p><MasteryDots days={curriculum.scope.current ? item.independentDays : undefined} t={t} /><p className="student-muted">{item.goal}</p>
          {curriculum.scope.current && <button type="button" aria-pressed={selectedObjectiveId === item.id} onClick={() => chooseGoal(item)}>{t('chooseGoal')} · {item.title}</button>}
        </div>)}
      </details> })}
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
    </section>}
    <section>{curriculum && <><h3>{t('relationsLabel')} · {curriculum.relations.length}</h3>
      {curriculum.relations.map(relation => <p key={relation.id}>{conceptName(relation.fromId)} · {t(relation.kind)} · {conceptName(relation.toId)}: {relation.explanation}</p>)}</>}
      <button type="button" disabled={disabled || running} onClick={organize}>{t('organizeConcepts')}</button>
    </section>
    <section><h3>{t('diagnosisTitle')}</h3><p className="student-muted">{t('checkinHelp')}</p></section>
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
  </>
}

function MindMapTree({ curriculum, selectedConceptId, setSelectedConceptId, selectedObjectiveId, chooseGoal, active: _active, t }: {
  curriculum: Curriculum
  selectedConceptId: string
  setSelectedConceptId: (id: string) => void
  selectedObjectiveId: string
  chooseGoal: (goal: { id: string; subject: Subject }) => void
  active: boolean
  t: Translate
}) {
  const conceptName = (id: string) => curriculum.concepts.find(item => item.id === id)?.name ?? id
  return <div className="student-mindmap" role="tree" aria-label={t('mindMap')}>
    {curriculum.units.map(unit => {
      const concepts = curriculum.concepts.filter(item => item.unit === unit.id)
      return <div key={unit.id} className="student-mindmap-unit" role="treeitem" aria-expanded="true">
        <p className="student-mindmap-root">{unit.name}</p>
        <ul className="student-mindmap-branch">
          {concepts.map(concept => {
            const links = curriculum.relations.filter(relation => relation.fromId === concept.id || relation.toId === concept.id)
            const goals = curriculum.objectives.filter(item => item.conceptIds.includes(concept.id))
            return <li key={concept.id} className="student-mindmap-node">
              <button type="button" className={`student-mindmap-concept student-level-${concept.level}`} aria-pressed={selectedConceptId === concept.id} onClick={() => setSelectedConceptId(concept.id)}>
                <span className={`student-dot student-level-${concept.level}`} />{concept.name}
              </button>
              {links.length > 0 && <ul className="student-mindmap-links">{links.map(relation => {
                const other = relation.fromId === concept.id ? relation.toId : relation.fromId
                return <li key={relation.id}><button type="button" className="student-quiet" onClick={() => setSelectedConceptId(other)}>{t(relation.kind)} · {conceptName(other)}</button></li>
              })}</ul>}
              {goals.length > 0 && curriculum.scope.current && <ul className="student-mindmap-goals">{goals.map(goal => <li key={goal.id}>
                <button type="button" aria-pressed={selectedObjectiveId === goal.id} onClick={() => chooseGoal(goal)}>{t('chooseGoal')} · {goal.title}</button>
              </li>)}</ul>}
            </li>
          })}
        </ul>
      </div>
    })}
  </div>
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
