/** Read-only continuity overview using committed tracking and links to existing project files. */
import { useState } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import { isStoryWorkbenchPath, parseCreativePath, projectPath } from '../project-path.ts'
import type { CreativeTranslate } from './locales/index.ts'
import type { WorkspacePayload } from './workspace-client.ts'
import { useTracking } from './tracking-reader.ts'
import { selectForeshadow, type TrackingView, type ForeshadowFilter } from './tracking-view.ts'

const sections = ['summary', 'characters', 'foreshadow', 'timeline', 'sources'] as const
type Section = typeof sections[number]
const filters: readonly ForeshadowFilter[] = ['due', 'overdue', 'open', 'unscheduled', 'resolved', 'all']
const hookStatus = { 已埋: 'open', 已回收: 'resolved', 已过期: 'expired', 放弃: 'abandoned' } as const
const importance = { 高: 'high', 中: 'medium', 低: 'low' } as const
const revealStatus = { 未揭示: 'hidden', 部分揭示: 'partial', 已揭示: 'revealed' } as const
const PAGE_SIZE = 20

interface Props {
  readonly sessionId: string
  readonly workspace: WorkspacePayload | undefined
  readonly workspaceError: boolean
  readonly refresh: number
  readonly selectedProject: string | undefined
  readonly onProject: (root: string) => void
  readonly onSource: (path: string) => void
  readonly onRefresh: () => void
  readonly t: CreativeTranslate
}

/** Display the selected book; all actions either read or navigate to its existing editor.
 * @param props - current Session listing, selection, localized copy and navigation callbacks.
 * @returns overview, filtered lists or an actionable empty/error state.
 */
export function ContinuityDashboard({ sessionId, workspace, workspaceError, refresh, selectedProject, onProject, onSource, onRefresh, t }: Props) {
  const roots = workspace?.books ?? [...new Set((workspace?.files ?? []).flatMap(file => {
    const parsed = parseCreativePath(file.path)
    return isStoryWorkbenchPath(parsed) && parsed.domain === 'story' ? [parsed.projectRoot] : []
  }))].sort()
  const root = selectedProject !== undefined && roots.includes(selectedProject) ? selectedProject : roots[0]
  const path = root === undefined ? undefined : projectPath(root, '追踪/_tracking-state.json')
  const tracking = useTracking(sessionId, path, refresh, workspace?.files.find(file => file.path === path)?.version)
  const [section, setSection] = useState<Section>('summary')
  return <section className="story-dashboard" aria-label={t('dashboard.title')}>
    <div className="story-dashboard-heading">
      <label>{t('dashboard.book')}<select aria-label={t('dashboard.book')} value={root ?? ''} onChange={event => onProject(event.target.value)} disabled={roots.length < 2}>
        {roots.length === 0 && <option value="">{t('dashboard.noBooks')}</option>}
        {roots.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <span className="story-dashboard-muted">{t('dashboard.readOnly')}</span>
    </div>
    {workspace?.truncated && <p className="story-dashboard-notice">{t('dashboard.truncated')}</p>}
    {workspaceError && <p role="alert" className="story-dashboard-notice">{t('dashboard.workspaceError')} <button onClick={onRefresh}>{t('dashboard.retry')}</button></p>}
    {tracking.status === 'error' && <p role="alert" className="story-dashboard-notice">{t(tracking.failure === 'invalid' ? 'dashboard.invalid' : 'dashboard.readError')}{tracking.state && <> {t('dashboard.stale')}</>} <button onClick={onRefresh}>{t('dashboard.retry')}</button></p>}
    {tracking.state === undefined ? (tracking.status === 'loading' || workspace === undefined) && !workspaceError
      ? <div className="story-dashboard-empty" aria-busy="true"><StateDot state="ongoing" /></div>
      : workspace !== undefined && tracking.status === 'missing' && <div className="story-dashboard-empty"><p>{root === undefined ? t('dashboard.noBooks') : t('dashboard.uninitialized', { book: root })}</p><p>{t(root === undefined ? 'dashboard.noBooksHint' : 'dashboard.initializeHint')}</p></div>
      : <>
        <div className="story-dashboard-heading"><h2>{tracking.state.book_title}</h2><span className="story-dashboard-muted">{t('dashboard.revision', { chapter: tracking.state.last_committed_chapter, revision: tracking.state.state_revision })}</span></div>
        <nav className="story-dashboard-tabs" aria-label={t('dashboard.sections')}>
          {sections.map(value => <button key={value} aria-pressed={section === value} onClick={() => setSection(value)}>{t(`dashboard.section.${value}`)}</button>)}
        </nav>
        <DashboardContent key={`${sessionId}\0${root}\0${section}`} state={tracking.state} section={section} root={root ?? ''} workspace={workspace} onSource={onSource} t={t} />
      </>}
  </section>
}

function Lines({ values, t }: { values: readonly string[]; t: CreativeTranslate }) {
  return values.length ? <ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul> : <p className="story-dashboard-muted">{t('dashboard.none')}</p>
}

function DashboardContent({ state, section, root, workspace, onSource, t }: {
  state: TrackingView; section: Section; root: string; workspace: WorkspacePayload | undefined; onSource: (path: string) => void; t: CreativeTranslate
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ForeshadowFilter>('due')
  const [reader, setReader] = useState(true)
  const [offset, setOffset] = useState(0)
  const needle = search.trim().toLocaleLowerCase()
  const matches = (value: unknown) => JSON.stringify(value).toLocaleLowerCase().includes(needle)
  const chapterLabel = (value: number | null) => value === null ? t('dashboard.unscheduled') : t('dashboard.chapter', { chapter: value })
  const source = (relative: string) => {
    const path = projectPath(root, relative)
    return <button className="story-dashboard-source" disabled={!workspace?.files.some(file => file.path === path)} onClick={() => onSource(path)}>{t('dashboard.source', { path: relative })}</button>
  }
  if (section === 'summary') return <>
    <div className="story-dashboard-metrics">
      <div><span>{t('dashboard.committed')}</span><strong>{state.last_committed_chapter}</strong></div>
      <div><span>{t('dashboard.nextChapter')}</span><strong>{state.last_committed_chapter + 1}</strong></div>
      <div><span>{t('dashboard.filter.due')}</span><strong>{selectForeshadow(state, 'due').length}</strong></div>
      <div><span>{t('dashboard.risks')}</span><strong>{state.context.continuity_risks.length}</strong></div>
    </div>
    <p className="story-dashboard-muted">{t('dashboard.commitMeaning')}</p>
    <section className="story-dashboard-card"><h3>{t('dashboard.position')}</h3><p>{state.context.position.volume} · {state.context.position.story_time} · {state.context.position.scene}</p></section>
    <section className="story-dashboard-card"><h3>{t('dashboard.commitments')}</h3><Lines values={state.context.next_chapter_commitments} t={t} /></section>
    <section className="story-dashboard-card"><h3>{t('dashboard.risks')}</h3><Lines values={state.context.continuity_risks} t={t} /></section>
    <section className="story-dashboard-card"><h3>{t('dashboard.constraints')}</h3><Lines values={state.context.long_term_constraints} t={t} /></section>
    <section className="story-dashboard-card"><h3>{t('dashboard.recent')}</h3><Lines values={state.context.recent_chapters.map(row => `${chapterLabel(row.chapter)} · ${row.summary}`)} t={t} />{source('追踪/上下文.md')}</section>
  </>
  const characters = Object.entries(state.characters).filter(row => matches(row)).sort(([a], [b]) => a.localeCompare(b))
  const hooks = selectForeshadow(state, filter).filter(row => matches(row))
  const events = Object.values(state.timeline).map(row => ({
    id: row.id, story_time: row.story_time, characters: row.characters, reveal_status: row.reveal_status,
    reveal_chapter: row.reveal_chapter, first_recorded_chapter: row.first_recorded_chapter,
    content: reader ? row.reader_knowledge : row.objective_fact,
  })).filter(row => matches(row)).sort((a, b) => a.first_recorded_chapter - b.first_recorded_chapter || a.id.localeCompare(b.id))
  const files = (workspace?.files ?? []).filter(file => {
    const parsed = parseCreativePath(file.path)
    return parsed?.projectRoot === root && /^(设定|大纲|追踪)(\/|\.md$)/u.test(parsed.relativePath) && matches(file.path)
  })
  const total = section === 'characters' ? characters.length : section === 'foreshadow' ? hooks.length : section === 'timeline' ? events.length : files.length
  const start = Math.min(offset, Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE)
  return <>
    <div className="story-dashboard-filters">
      <input type="search" aria-label={t('dashboard.search')} placeholder={t('dashboard.search')} value={search} onChange={event => { setSearch(event.target.value); setOffset(0) }} />
      {section === 'foreshadow' && <select aria-label={t('dashboard.filter')} value={filter} onChange={event => { const value = filters.find(value => value === event.target.value); if (value) setFilter(value); setOffset(0) }}>
        {filters.map(value => <option key={value} value={value}>{t(`dashboard.filter.${value}`)}</option>)}
      </select>}
      {section === 'timeline' && <div className="story-dashboard-tabs">
        <button aria-pressed={reader} onClick={() => { setReader(true); setOffset(0) }}>{t('dashboard.reader')}</button>
        <button aria-pressed={!reader} onClick={() => { setReader(false); setOffset(0) }}>{t('dashboard.author')}</button>
      </div>}
    </div>
    {section === 'foreshadow' && <p className="story-dashboard-muted">{t('dashboard.dueReference', { chapter: state.last_committed_chapter + 1 })}</p>}
    {total === 0 && <p className="story-dashboard-empty">{t('dashboard.noMatches')}</p>}
    {section === 'characters' && characters.slice(start, start + PAGE_SIZE).map(([name, row]) => <details className="story-dashboard-card" key={name}>
      <summary><span>{name}</span><span className="story-dashboard-muted">{row.location} · {row.state}</span></summary>
      <dl>{(['identity', 'goal', 'location', 'state'] as const).map(field => <div key={field}><dt>{t(`dashboard.field.${field}`)}</dt><dd>{row[field]}</dd></div>)}</dl>
      {(['abilities_resources', 'relationships', 'knowledge', 'open_threads'] as const).map(field => <div key={field}><h3>{t(`dashboard.field.${field}`)}</h3><Lines values={row[field]} t={t} /></div>)}
      {source(`追踪/角色状态/${name}.md`)}
    </details>)}
    {section === 'foreshadow' && hooks.slice(start, start + PAGE_SIZE).map(row => <article className="story-dashboard-card" key={row.id}>
      <div className="story-dashboard-heading"><h3>{row.id} · {t(`dashboard.status.${hookStatus[row.status]}`)}</h3><span className="story-dashboard-muted">{t(`dashboard.importance.${importance[row.importance]}`)}</span></div>
      <p>{row.summary}</p><dl><div><dt>{t('dashboard.planted')}</dt><dd>{chapterLabel(row.planted_chapter)}</dd></div><div><dt>{t('dashboard.planned')}</dt><dd>{chapterLabel(row.planned_resolution_chapter)}</dd></div></dl>
      {source('追踪/伏笔.md')}
    </article>)}
    {section === 'timeline' && events.slice(start, start + PAGE_SIZE).map(row => <article className="story-dashboard-card" key={row.id}>
      <h3>{row.id} · {row.story_time}</h3><p>{row.content}</p><p className="story-dashboard-muted">{t(`dashboard.reveal.${revealStatus[row.reveal_status]}`)}{row.reveal_chapter !== null && ` · ${chapterLabel(row.reveal_chapter)}`}</p>
      {source(reader ? '追踪/时间线/读者已知.md' : '追踪/时间线/作者真相.md')}
    </article>)}
    {section === 'sources' && <ul className="story-dashboard-sources">{files.slice(start, start + PAGE_SIZE).map(file => <li key={file.path}><button onClick={() => onSource(file.path)}>{parseCreativePath(file.path)?.relativePath}</button></li>)}</ul>}
    {total > 0 && <nav className="story-dashboard-pagination" aria-label={t('dashboard.pagination')}>
      <button disabled={start === 0} onClick={() => setOffset(Math.max(0, start - PAGE_SIZE))}>{t('dashboard.previous')}</button>
      <span>{t('dashboard.range', { start: start + 1, end: Math.min(start + PAGE_SIZE, total), total })}</span>
      <button disabled={start + PAGE_SIZE >= total} onClick={() => setOffset(start + PAGE_SIZE)}>{t('dashboard.next')}</button>
    </nav>}
  </>
}
