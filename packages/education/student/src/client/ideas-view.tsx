import type { Dashboard } from '../dashboard.ts'
import type { Translate } from './locales.ts'

type Study = NonNullable<Dashboard['study']>
type Curriculum = NonNullable<Study['curriculum']>
type Edge = { id: string; fromId: string; toId: string; kind: 'contrast' | 'part-of' | 'cause-effect'; explanation: string }
function isGrouped(edge: { id: string; fromId: string; toId: string; kind: string; explanation: string }): edge is Edge {
  return edge.kind === 'contrast' || edge.kind === 'part-of' || edge.kind === 'cause-effect'
}
function grouped(relations: readonly { id: string; fromId: string; toId: string; kind: string; explanation: string }[]): Edge[] {
  const result: Edge[] = []
  for (const edge of relations) if (isGrouped(edge)) result.push(edge)
  return result
}

/** Parent concepts: compare / classify / cause for the open book, then the subject's cross-grade idea list. */
export function IdeasView({ study, curriculum, t, onOpenConcept }: {
  study: Study
  curriculum: Curriculum | null
  t: Translate
  onOpenConcept?: (id: string) => void
}) {
  const nameOf = (id: string) => curriculum?.concepts.find(item => item.id === id)?.name ?? study.concepts.find(item => item.id === id)?.name ?? id
  const open = (id: string) => {
    if (!onOpenConcept) return
    if (curriculum?.concepts.some(item => item.id === id) || study.concepts.some(item => item.id === id)) onOpenConcept(id)
  }
  const ConceptLink = ({ id }: { id: string }) => onOpenConcept && (curriculum?.concepts.some(item => item.id === id) || study.concepts.some(item => item.id === id))
    ? <button type="button" className="student-quiet" onClick={() => open(id)}>{nameOf(id)}</button>
    : <span>{nameOf(id)}</span>
  const shipped = grouped(curriculum?.relations ?? [])
  const confirmed = grouped(study.relations)
  const edges = [...shipped, ...confirmed.filter(edge => !shipped.some(item => item.id === edge.id))]
  const contrasts = edges.filter(edge => edge.kind === 'contrast')
  const causes = edges.filter(edge => edge.kind === 'cause-effect')
  const classes = new Map<string, Edge[]>()
  for (const edge of edges) {
    if (edge.kind !== 'part-of') continue
    const members = classes.get(edge.toId) ?? []
    members.push(edge)
    classes.set(edge.toId, members)
  }
  const ideaConcepts = (ideaId: string) => curriculum?.concepts.filter(item => (item.ideaIds ?? []).includes(ideaId)) ?? []
  return <>
    <section>
      <h3>{t('ideas')}</h3>
      <p className="student-muted">{t('ideasHelp')}</p>
      {onOpenConcept && <p className="student-muted">{t('ideasOpenOnMap')}</p>}
    </section>
    <section><h3>{t('compareGroup')}</h3>
      {contrasts.length === 0 ? <p className="student-muted">{t('relationEmpty')}</p> : contrasts.map(edge => <div key={edge.id} className="student-unit">
        <div className="student-pair"><p><ConceptLink id={edge.fromId} /></p><p><ConceptLink id={edge.toId} /></p></div>
        <p className="student-muted">{edge.explanation}</p>
      </div>)}
    </section>
    <section><h3>{t('classifyGroup')}</h3>
      {classes.size === 0 ? <p className="student-muted">{t('relationEmpty')}</p> : [...classes].map(([category, members]) => <div key={category} className="student-unit">
        <p><ConceptLink id={category} /></p>
        <ul>{members.map(edge => <li key={edge.id}><ConceptLink id={edge.fromId} /><p className="student-muted">{edge.explanation}</p></li>)}</ul>
      </div>)}
    </section>
    <section><h3>{t('causeGroup')}</h3>
      {causes.length === 0 ? <p className="student-muted">{t('relationEmpty')}</p> : causes.map(edge => <div key={edge.id} className="student-unit">
        <p><ConceptLink id={edge.fromId} /> → <ConceptLink id={edge.toId} /></p>
        <p className="student-muted">{edge.explanation}</p>
      </div>)}
    </section>
    <section><h3>{t('ideaCatalog')}</h3>
      {curriculum && curriculum.ideas.length > 0 ? curriculum.ideas.map(idea => {
        const linked = ideaConcepts(idea.id)
        return <div key={idea.id} className="student-unit">
          <p>{idea.name}</p>
          <p>{t('definition')}: {idea.definition}</p>
          <p className="student-muted">{t('example')}: {idea.example}</p>
          {linked.length > 0 && <p className="student-muted">{t('ideaOnMap')}: {linked.map((item, index) => <span key={item.id}>{index > 0 ? ' · ' : ''}<ConceptLink id={item.id} /></span>)}</p>}
        </div>
      }) : <p>{t('mapUnavailable')}</p>}
    </section>
  </>
}
