/** Independent fiction editor with Session-owned drafts and versioned saves. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, useRef, useState } from 'react'
import { IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { registerStoryTab } from './story-mode.ts'
import { registerFileRedirect } from './file-redirect.tsx'
import { NS, zh, en } from './locales/index.ts'
import { endpoint } from './workbench-ui.ts'
import { json, useWorkspace } from './workspace-client.ts'
import { receiveFile, reconcileBuffers, type FileBuffer, type FilePayload } from './editor-buffer.ts'
import { latestSettledMutation } from './activity.ts'
import { buildFileTree } from './file-tree.ts'
import { FileTreeNodes } from './file-tree-view.tsx'
import { MarkdownPreview } from './markdown-preview.tsx'
import { ContinuityDashboard } from './continuity-dashboard.tsx'
import './plugin.css'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    /** A novel file opened from the current Session. */
    story: { readonly creativeFile: { readonly sessionId: SessionId; readonly path: string } }
  }
}

interface StoryMemory { selected: string | undefined; source: boolean; buffers: Record<string, FileBuffer>; view?: 'overview' | 'files'; project?: string }
/** Create fiction-only Session state.
 * @returns the persisted fiction editor store.
 */
export function createStoryStore() {
  return defineStore({
    persist: 'creative.story.v1',
    init: (): StoryMemory => ({ selected: undefined, source: false, buffers: {}, view: 'overview' }),
    actions: {
      select: (draft, path: string) => { draft.selected = path; draft.view = 'files' },
      view: (draft, value: 'overview' | 'files') => { draft.view = value },
      project: (draft, value: string) => { draft.project = value },
      source: (draft, value: boolean) => { draft.source = value },
      buffers: (draft, update: (current: Record<string, FileBuffer>) => Record<string, FileBuffer>) => { draft.buffers = update(draft.buffers) },
    },
  })
}

type Props = PropsRuntime<'sidebar.right.pane.tab'> & PropsStore<ReturnType<typeof createStoryStore>> & PropsLocale<typeof NS>
function StoryEditorContent({ sessionId, t, useStore, actions, useChat, useTabInfo }: Props) {
  const { tab } = useTabInfo()
  const navigation = tab.navigation.params
  useEffect(() => {
    if (navigation?.creativeFile.sessionId === sessionId) actions.select(navigation.creativeFile.path)
  }, [navigation, sessionId, actions])
  const { workspace, error, reload, refresh } = useWorkspace(sessionId)
  const view = useStore(memory => memory.view ?? (memory.selected === undefined ? 'overview' : 'files'))
  const project = useStore(memory => memory.project)
  const selected = useStore(memory => memory.selected)
  const source = useStore(memory => memory.source)
  const buffers = useStore(memory => memory.buffers)
  const active = selected ?? workspace?.files.find(file => file.path.includes('正文'))?.path ?? workspace?.files[0]?.path
  const buffer = active === undefined ? undefined : buffers[active]
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (active === undefined) return
    const parts = active.split('/')
    setExpanded(current => ({ ...current, ...Object.fromEntries(parts.slice(0, -1).map((_, index) => [parts.slice(0, index + 1).join('/'), true])) }))
  }, [active])
  const [readError, setReadError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const latestBuffers = useRef(buffers)
  latestBuffers.current = buffers
  const mutation = useChat(latestSettledMutation)
  const previousMutation = useRef(mutation)
  useEffect(() => {
    if (previousMutation.current === mutation) return
    previousMutation.current = mutation
    reload()
  }, [mutation, reload])
  useEffect(() => {
    globalThis.addEventListener('focus', reload)
    return () => { globalThis.removeEventListener('focus', reload) }
  }, [reload])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.values(latestBuffers.current).some(value => value.source === 'human' && value.content !== value.saved)) event.preventDefault()
    }
    globalThis.addEventListener('beforeunload', warn)
    return () => { globalThis.removeEventListener('beforeunload', warn) }
  }, [])
  useEffect(() => {
    if (workspace !== undefined) actions.buffers(current => reconcileBuffers(current, new Set(workspace.files.map(file => file.path)), workspace.truncated, t('editor.removedNotice')))
  }, [workspace, actions, t])
  const version = workspace?.files.find(file => file.path === active)?.version
  useEffect(() => {
    if (view !== 'files' || active === undefined || version === undefined) return
    setReadError(undefined)
    const controller = new AbortController()
    void fetch(endpoint('file', sessionId, active), { signal: controller.signal }).then(response => json<FilePayload>(response)).then(file => {
      if (!controller.signal.aborted) actions.buffers(current => ({ ...current, [active]: receiveFile(current[active], file, t('editor.conflict.diskDraft', { path: active })) }))
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setReadError(String(reason))
    })
    return () => { controller.abort() }
  }, [active, version, sessionId, t, actions, view])
  const save = async () => {
    if (active === undefined || buffer === undefined || inFlight.current || buffer.conflict !== undefined || buffer.missing) return
    const path = active
    const submitted = buffer.content
    inFlight.current = true
    setSaving(true)
    try {
      const response = await fetch(endpoint('file', sessionId, path), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: submitted, baseVersion: buffer.version }) })
      if (response.status === 412) {
        const file = await json<FilePayload>(await fetch(endpoint('file', sessionId, path)))
        actions.buffers(current => ({ ...current, [path]: receiveFile(current[path], file, t('editor.conflict.diskDraft', { path })) }))
      } else {
        const file = await json<FilePayload>(response)
        actions.buffers(current => {
          const latest = current[path]
          return { ...current, [path]: latest !== undefined && latest.content !== submitted
            ? { ...latest, saved: file.content, version: file.version, error: undefined }
            : { content: file.content, saved: file.content, version: file.version, source: 'disk' } }
        })
        reload()
      }
    } catch (reason) {
      actions.buffers(current => current[path] === undefined ? current : { ...current, [path]: { ...current[path], error: String(reason) } })
    } finally { inFlight.current = false; setSaving(false) }
  }
  return <div className="creative-workspace" data-workbench="story">
    <header className="story-workbench-heading">
      <span>{t('workbench.title')}</span>
      <nav className="story-dashboard-tabs" aria-label={t('dashboard.navigation')}>
        <button aria-pressed={view === 'overview'} onClick={() => actions.view('overview')}>{t('dashboard.title')}</button>
        <button aria-pressed={view === 'files'} onClick={() => actions.view('files')}>{t('dashboard.files')}</button>
      </nav>
      <button className="creative-save" onClick={reload}>{t('workbench.reloadFiles')}</button>
    </header>
    {view === 'overview' ? <ContinuityDashboard key={sessionId} sessionId={sessionId} workspace={workspace} workspaceError={error !== undefined}
      refresh={refresh} selectedProject={project} onProject={actions.project} onSource={actions.select} onRefresh={reload} t={t} /> : <>
    <aside className="creative-tree">
      <nav aria-label={t('tree.story.files')}>
        <FileTreeNodes nodes={buildFileTree(workspace?.files ?? [], '')} depth={0} expanded={expanded} selected={active}
          onToggle={(path, open) => setExpanded(current => current[path] === open ? current : { ...current, [path]: open })}
          onSelect={actions.select} />
      </nav>
    </aside>
    <main className="creative-editor">
      {readError !== undefined && <div role="alert" className="creative-error">{readError}</div>}
      {error !== undefined && <div role="alert" className="creative-error">{error}</div>}
      {buffer === undefined ? <div className="creative-empty">{t('editor.empty.story.prefix')} <code>{t('editor.empty.story.command')}</code>{t('editor.empty.story.suffix')}</div> : <>
        <header><span className="creative-editor-path" title={active}>{active}</span><div className="creative-editor-actions"><button className="creative-save" onClick={() => actions.source(!source)}>{t(source ? 'editor.mode.preview' : 'editor.mode.source')}</button><button className="creative-save" disabled={saving || buffer.missing || buffer.conflict !== undefined || buffer.content === buffer.saved} onClick={() => { void save() }}>{t('editor.save')}</button></div></header>
        {buffer.error !== undefined && <div role="alert" className="creative-error">{buffer.error}</div>}
        {buffer.conflict !== undefined && <div role="alert" className="creative-conflict">{buffer.conflict.message}<button onClick={() => actions.buffers(current => ({ ...current, [active!]: { ...buffer, saved: buffer.conflict?.theirs ?? buffer.saved, version: buffer.conflict?.theirsVersion ?? buffer.version, conflict: undefined } }))}>{t('editor.conflict.keepDraft')}</button></div>}
        {source || !active?.endsWith('.md') ? <textarea aria-label={active} value={buffer.content} onChange={event => { const content = event.target.value; actions.buffers(current => ({ ...current, [active!]: { ...buffer, content, source: 'human' } })) }} /> : <MarkdownPreview t={t} label={active ?? ""} content={buffer.content} />}
      </>}
    </main>
    </>}
  </div>
}
/** A restored tab in an ordinary Session closes without loading novel files. */
function StoryEditor(props: Props) {
  const preset = props.useSessions(state => state.byId[props.sessionId]?.projectionValues?.agentPreset)
  const { tab } = props.useTabInfo()
  useEffect(() => { if (typeof preset === 'string' && preset !== 'story') tab.actions.close() }, [preset, tab.actions])
  return preset === 'story' ? <StoryEditorContent {...props} /> : null
}
export const name = 'story'
export const inject = ['slots', 'sessions', 'uiSession', 'locale', 'sidebarRightTabs']
/** Register the fiction sidebar.
 * @param context - DSH browser services.
 */
export function apply(context: Context): void {
  context.effect(() => context.locale.register(NS, { zh, en }), 'story: locales')
  registerFileRedirect(context, 'story')
  const t = context.locale.bind(NS)
  context.effect(() => registerStoryTab(context, { id: '@winterhuan/dsh-story', kind: 'story', title: () => t('workbench.title'), guide: [{ id: 'story', order: 21, title: () => t('workbench.title'), description: () => t('workbench.description'), icon: IconEditOutlineRegular }] }), 'story: sidebar')
  context.slots.inject('sidebar.right.pane.tab', () => context.slots.register({ name: 'sidebar.right.pane.tab', key: '@winterhuan/dsh-story', locale: NS, store: createStoryStore }, StoryEditor))
}
