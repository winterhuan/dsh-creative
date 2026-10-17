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

/** Parent concepts: compare, classify and cause links for the open book, then the subject's one concept list. */
export function IdeasView({ study, curriculum, t }: { study: Study; curriculum: Curriculum | null; t: Translate }) {
  const nameOf = (id: string) => curriculum?.concepts.find(item => item.id === id)?.name ?? study.concepts.find(item => item.id === id)?.name ?? id
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
  return <>
    <section><h3>{t('compareGroup')}</h3>
      {contrasts.length === 0 ? <p className="student-muted">{t('relationEmpty')}</p> : contrasts.map(edge => <div key={edge.id} className="student-unit">
        <div className="student-pair"><p>{nameOf(edge.fromId)}</p><p>{nameOf(edge.toId)}</p></div>
        <p className="student-muted">{edge.explanation}</p>
      </div>)}
    </section>
    <section><h3>{t('classifyGroup')}</h3>
      {classes.size === 0 ? <p className="student-muted">{t('relationEmpty')}</p> : [...classes].map(([category, members]) => <div key={category} className="student-unit">
        <p>{nameOf(category)}</p>
        <ul>{members.map(edge => <li key={edge.id}>{nameOf(edge.fromId)}<p className="student-muted">{edge.explanation}</p></li>)}</ul>
      </div>)}
    </section>
    <section><h3>{t('causeGroup')}</h3>
      {causes.length === 0 ? <p className="student-muted">{t('relationEmpty')}</p> : causes.map(edge => <div key={edge.id} className="student-unit">
        <p>{nameOf(edge.fromId)} → {nameOf(edge.toId)}</p>
        <p className="student-muted">{edge.explanation}</p>
      </div>)}
    </section>
    <section><h3>{t('ideas')}</h3>
      {curriculum && curriculum.ideas.length > 0 ? <>
        <p className="student-muted">{t('ideasHelp')}</p>
        {curriculum.ideas.map(idea => <div key={idea.id} className="student-unit"><p>{idea.name}</p><p>{t('definition')}: {idea.definition}</p><p className="student-muted">{t('example')}: {idea.example}</p></div>)}
      </> : <p>{t('mapUnavailable')}</p>}
    </section>
  </>
}
