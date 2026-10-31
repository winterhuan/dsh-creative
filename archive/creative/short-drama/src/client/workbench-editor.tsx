import { episodeDirectoryForPath } from './drama-production.ts'
import type { JobView } from '@deepseek-ai/dsh-jobs/view'
import type { PartialAssistant, RunningToolCall } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarRightTabNavigation, TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  creativeRelativePath, fileMutations, mutatingCallIds, preferredWorkbenchFile, previewMutation,
  WORKBENCH_LABEL_KEYS, workbenchModeForPath, type WorkbenchMode,
} from './file-activity.js'
import { buildFileTree } from './file-tree.js'
import { NS } from './locales/index.ts'
import { JsonlPreview } from './jsonl-preview.js'
import { MarkdownPreview } from './markdown-preview.js'
import { DramaProductionView } from './drama-production-view.js'
import type { DramaDocumentTarget } from './drama-production.js'
import type { ProductionQueueEntry } from './production-runtime.js'
import type { SettledProductionIntent } from './production-intents.js'
import { parseCreativePath } from '../project-path.ts'
import { dramaDomain, useDramaProduction } from './domains/drama.tsx'
import { FileTreeNodes } from './file-tree-view.js'
import { endpoint, handleTabKey } from './workbench-ui.js'
import { SessionUnavailableNotice } from './session-notice.js'
import { needsFileRead, receiveFile, reconcileBuffers, type FileBuffer, type FilePayload } from './editor-buffer.ts'
import type { WorkbenchMemory } from './workbench-store.ts'
import { json, WorkspaceRequestError, type WorkspaceFile, type WorkspacePayload } from './workspace-client.ts'
import type { WorkbenchSlotProps } from './workbench-session.tsx'

const WORKBENCH_MODES = ['drama'] as const

const EDITOR_MODES = ['preview', 'source', 'production'] as const
function groupForPath(path: string, t: TranslateNS<typeof NS>): string {
  return path === 'short-drama.json' ? t('tree.group.project') : path.split('/', 1)[0] ?? t('tree.group.other')
}


/** Keep draft buffers, navigation, and episode production on the same mounted editor. */
export function CreativeWorkbench({
  t,
  sessionId,
  runningCalls,
  partial,
  settledMutation,
  productionQueue,
  productionIntents,
  liveJobs,
  jobsReady,
  beginProductionSubmission,
  sendProductionPrompt,
  stopProductionJob,
  removeQueuedProduction,
  workspace,
  error,
  sessionUnavailable,
  workspaceLoading,
  reload,
  open,
  navigation,
  tabId,
  consumeFileNavigation,
  savingPaths,
  beginFileSave,
  endFileSave,
  useStore,
  actions,
}: {
  readonly t: TranslateNS<typeof NS>
  readonly sessionId: string
  readonly runningCalls: readonly RunningToolCall[]
  readonly partial: PartialAssistant | null
  readonly settledMutation: string | undefined
  readonly productionQueue: readonly ProductionQueueEntry[]
  readonly productionIntents: readonly SettledProductionIntent[]
  readonly liveJobs: readonly JobView[]
  readonly jobsReady: boolean
  readonly workspace: WorkspacePayload | undefined
  readonly error: string | undefined
  readonly sessionUnavailable: boolean
  readonly workspaceLoading: boolean
  readonly reload: () => void
  readonly open: boolean
  readonly navigation: SidebarRightTabNavigation
  readonly tabId: TabId
  readonly savingPaths: ReadonlySet<string>
} & Pick<WorkbenchSlotProps, 'useStore' | 'actions' | 'beginProductionSubmission' | 'sendProductionPrompt' | 'stopProductionJob' | 'removeQueuedProduction' | 'consumeFileNavigation' | 'beginFileSave' | 'endFileSave'>) {
  const activities = useMemo(
    () => fileMutations(runningCalls, partial),
    [partial, runningCalls],
  )
  const normalizedActivities = useMemo(() => activities.flatMap((activity) => {
    const path = creativeRelativePath(activity.path, workspace?.cwd)
    return path === undefined ? [] : [{ activity, path }]
  }), [activities, workspace?.cwd])
  const primaryActivity = normalizedActivities.at(-1)
  const activityPaths = useMemo(() => new Set(normalizedActivities.map(value => value.path)), [normalizedActivities])
  const activity = primaryActivity?.activity
  const activityPath = primaryActivity?.path
  const workbench = useStore(memory => memory.workbench)
  const setWorkbench = actions.setWorkbench
  const selected = useStore(memory => memory.selected)
  const setSelected = actions.setSelected
  const buffers = useStore(memory => memory.buffers)
  const setBuffers = actions.setBuffers
  const buffersRef = useRef<Record<string, FileBuffer>>({})
  const expanded = useStore(memory => memory.expanded)
  const setExpanded = actions.setExpanded
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [contentLayout, setContentLayout] = useState('wide')
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (surface === null) return
    const observer = new ResizeObserver(() => {
      setContentLayout(surface.clientWidth < 620 ? 'compact' : surface.clientWidth < 900 ? 'medium' : 'wide')
    })
    observer.observe(surface)
    return () => { observer.disconnect() }
  }, [])
  const navRef = useRef<HTMLElement>(null)
  const activityBases = useRef(new Map<string, { readonly path: string; readonly base: string }>())
  const previousSignals = useRef<ReadonlySet<string>>(new Set())
  const previousSettledMutation = useRef(settledMutation)
  const buffer = selected === undefined ? undefined : buffers[selected]
  const selectedFile = workspace?.files.find(file => file.path === selected)
  const selectedMedia = selectedFile?.kind === 'media'
  const dirty = buffer?.source === 'human' && buffer.content !== buffer.saved
  const saving = selected !== undefined && savingPaths.has(selected)
  const fileError = buffer?.error
  const conflict = buffer?.conflict
  const selectedLower = selected?.toLocaleLowerCase()
  const markdown = selectedLower?.endsWith('.md') === true
  const jsonl = selectedLower?.endsWith('.jsonl') === true
  const structured = jsonl || selectedLower?.endsWith('.json') === true
  const previewable = markdown || jsonl
  const editorMode = useStore(memory => memory.editorMode)
  const setEditorMode = actions.setEditorMode
  const modeSelection = useRef(selected)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editorPositions = useRef(
    new Map<string, { readonly scrollTop: number; readonly selectionStart: number; readonly selectionEnd: number }>(),
  )
  const editorReady = buffer !== undefined && buffer.missing !== true

  useEffect(() => { buffersRef.current = buffers }, [buffers])

  const rememberEditorPosition = useCallback((): void => {
    const element = textareaRef.current
    if (element === null || selected === undefined || element.getAttribute('aria-label') !== selected) return
    editorPositions.current.set(selected, {
      scrollTop: element.scrollTop,
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
    })
  }, [selected])

  useLayoutEffect(() => {
    if (editorMode !== 'source' || selected === undefined || !editorReady) return
    const element = textareaRef.current
    const position = editorPositions.current.get(selected)
    if (element === null || position === undefined) return
    const end = Math.min(position.selectionEnd, element.value.length)
    element.setSelectionRange(Math.min(position.selectionStart, end), end)
    element.scrollTop = position.scrollTop
  }, [editorMode, editorReady, selected])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent): void => {
      if (!Object.values(buffersRef.current).some(value => value.source === 'human' && value.content !== value.saved)) return
      event.preventDefault()
    }
    globalThis.addEventListener('beforeunload', warn)
    return () => { globalThis.removeEventListener('beforeunload', warn) }
  }, [])

  const expandPath = useCallback((path: string): void => {
    const segments = path.split('/')
    const ancestors = [groupForPath(path, t)]
    for (let index = 1; index < segments.length - 1; index += 1) ancestors.push(segments.slice(0, index + 1).join('/'))
    setExpanded((current) => {
      const next = { ...current }
      for (const ancestor of ancestors) next[ancestor] = true
      return next
    })
  }, [t])

  const revealPath = useCallback((path: string): void => {
    rememberEditorPosition()
    const nextWorkbench = workbenchModeForPath(path) ?? 'drama'
    setWorkbench(nextWorkbench)
    setSelected(path)
    expandPath(path)
  }, [actions, expandPath, rememberEditorPosition])

  const openProductionDocument = useCallback((path: string): void => {
    setWorkbench('drama')
    setSelected(path)
    expandPath(path)
    globalThis.setTimeout(() => { setEditorMode('production') }, 0)
  }, [expandPath, setEditorMode, setSelected, setWorkbench])
  const drama = useDramaProduction({
    sessionId, workspace, selected, buffers, productionIntents, liveJobs, jobsReady, useStore, actions, openProductionDocument,
  })
  const editorModes = drama.available ? EDITOR_MODES : EDITOR_MODES.filter(mode => mode !== 'production')


  useEffect(() => {
    const params = navigation.params
    if (params === undefined || !('creativeFile' in params) || params.creativeFile.sessionId !== sessionId
      || workspace === undefined || !open || !consumeFileNavigation(tabId, navigation.revision)) return
    revealPath(params.creativeFile.path)
  }, [consumeFileNavigation, navigation, open, revealPath, sessionId, tabId, workspace])

  const followAgentPath = useCallback((path: string): void => {
    expandPath(path)
    const current = selected === undefined ? undefined : buffersRef.current[selected]
    const preserveFocusedDraft = path !== selected
      && current?.source === 'human'
      && current.content !== current.saved
      && surfaceRef.current?.ownerDocument.activeElement === textareaRef.current
    if (preserveFocusedDraft) return
    revealPath(path)
  }, [expandPath, revealPath, selected])

  useEffect(() => {
    if (activityPath !== undefined && activityPath === selected && !selectedMedia) setEditorMode('source')
  }, [activityPath, selected, selectedMedia])

  useEffect(() => {
    if (modeSelection.current === selected) return
    modeSelection.current = selected
    setEditorMode(selected !== undefined && activityPaths.has(selected) ? 'source' : selectedMedia || previewable ? 'preview' : 'source')
  }, [activityPaths, previewable, selected, selectedMedia])

  useEffect(() => {
    if (workspaceLoading) return
    if (activityPath !== undefined) return
    if (selected !== undefined && (
      (workspace?.files.some(file => file.path === selected) ?? false)
      || buffers[selected] !== undefined
    ) && workbenchModeForPath(selected) === workbench) return
    setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench))
  }, [activityPath, buffers, selected, workbench, workspace, workspaceLoading])

  useEffect(() => {
    if (workspace === undefined || workspaceLoading) return
    const paths = new Set([...workspace.files.map(file => file.path), ...activityPaths])
    setBuffers(current => reconcileBuffers(current, paths, workspace.truncated, t('editor.removedNotice')))
  }, [activityPaths, t, workspace, workspaceLoading])

  const readTargets = new Set(drama.available ? drama.documentPaths : [])
  if (selected !== undefined && !selectedMedia) readTargets.add(selected)
  const readKey = JSON.stringify((workspace?.files ?? []).flatMap(file =>
    file.kind === 'text' && readTargets.has(file.path) && !activityPaths.has(file.path)
      && (needsFileRead(buffers[file.path], file.version) || (drama.available && buffers[file.path]?.episodeRevision === undefined)) ? [[file.path, file.version]] : [],
  ))

  useEffect(() => {
    const requests = JSON.parse(readKey) as Array<[string, string]>
    if (requests.length === 0) return
    const controller = new AbortController()
    const episode = drama.available ? episodeDirectoryForPath(selected) : undefined
    if (episode !== undefined) {
      void fetch(endpoint('episode', sessionId, episode), { signal: controller.signal })
        .then(response => json<{ files: Array<FilePayload | { path: string; missing: true }>; revision: string; diagnostics: string[] }>(response))
        .then(payload => {
          if (controller.signal.aborted) return
          setBuffers(current => {
            const next = { ...current }
            for (const file of payload.files) {
              if ('missing' in file) continue
              next[file.path] = { ...receiveFile(current[file.path], file, t('editor.conflict.diskDraft', { path: file.path })), episodeRevision: payload.revision, episodeDiagnostics: payload.diagnostics }
            }
            return next
          })
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return
          setBuffers(current => Object.fromEntries(Object.entries(current).map(([path, buffer]) => [path, path.startsWith(`${episode}/`) ? { ...buffer, error: reason instanceof Error ? reason.message : String(reason), episodeRevision: undefined } : buffer])))
        })
    } else {
    void Promise.all(requests.map(async ([path]) => {
      try {
        const file = await json<FilePayload>(await fetch(endpoint('file', sessionId, path), { signal: controller.signal }))
        return { path, file }
      } catch (reason) {
        return { path, error: reason instanceof Error ? reason.message : String(reason) }
      }
    })).then((results) => {
      if (controller.signal.aborted) return
      setBuffers((current) => {
        const next = { ...current }
        for (const result of results) {
          const existing = current[result.path]
          if (result.file !== undefined) {
            next[result.path] = receiveFile(existing, result.file, t('editor.conflict.diskDraft', { path: result.path }))
          } else if (existing !== undefined) {
            next[result.path] = { ...existing, error: result.error }
          }
        }
        return next
      })
    })
    }
    return () => { controller.abort() }
  }, [readKey, sessionId, t, workspace?.files, drama.available, selected])

  useEffect(() => {
    if (normalizedActivities.length === 0) return
    for (const { path } of normalizedActivities) expandPath(path)
    if (activityPath !== undefined) followAgentPath(activityPath)
    setBuffers((current) => {
      let next = current
      for (const { activity: currentActivity, path } of normalizedActivities) {
        const existing = next[path]
        if (existing?.source === 'human' && existing.content !== existing.saved) {
          next = {
            ...next,
            [path]: {
              ...existing,
              conflict: { message: t('editor.conflict.agentLock', { path }) },
            },
          }
          continue
        }
        let basis = activityBases.current.get(currentActivity.callId)
        if (basis === undefined || basis.path !== path) {
          basis = { path, base: existing?.content ?? '' }
          activityBases.current.set(currentActivity.callId, basis)
        }
        const preview = previewMutation(currentActivity, basis.base)
        if (preview === undefined || (existing?.source === 'agent' && existing.content === preview)) continue
        next = {
          ...next,
          [path]: {
            content: preview,
            saved: existing?.saved ?? '',
            source: 'agent',
            version: existing?.version ?? '',
          },
        }
      }
      return next
    })
  }, [activityPath, expandPath, followAgentPath, normalizedActivities])

  useEffect(() => {
    const signals = new Set(mutatingCallIds(runningCalls))
    for (const { activity: currentActivity } of normalizedActivities) signals.add(currentActivity.callId.split(':', 1)[0] ?? currentActivity.callId)
    const settled = [...previousSignals.current].some(callId => !signals.has(callId))
    for (const callId of activityBases.current.keys()) {
      if (!signals.has(callId.split(':', 1)[0] ?? callId)) activityBases.current.delete(callId)
    }
    previousSignals.current = signals
    if (!settled) return
    reload()
  }, [normalizedActivities, reload, runningCalls])

  useEffect(() => {
    if (settledMutation === undefined || settledMutation === previousSettledMutation.current) return
    // The signal carries an absolute path, so creativeRelativePath cannot resolve it until the
    // workspace (and its cwd) has loaded. Consuming the signal first would burn it: the effect
    // re-runs when cwd arrives, but the guard above then short-circuits and the agent's file is
    // never selected. Wait for cwd instead of dropping the follow.
    if (workspace?.cwd === undefined) return
    previousSettledMutation.current = settledMutation
    const path = creativeRelativePath(settledMutation.slice(settledMutation.indexOf('\0') + 1), workspace.cwd)
    if (path !== undefined) followAgentPath(path)
    reload()
  }, [followAgentPath, reload, settledMutation, workspace?.cwd])

  useEffect(() => {
    if (selected === undefined) return
    for (const button of navRef.current?.querySelectorAll<HTMLButtonElement>('button[data-file-path]') ?? []) {
      if (button.dataset.filePath === selected) {
        button.scrollIntoView({ block: 'nearest' })
        break
      }
    }
  }, [selected])

  const savePath = useCallback(async (path: string) => {
    const submitted = buffersRef.current[path]
    if (submitted === undefined || submitted.missing === true || submitted.content === submitted.saved || !beginFileSave(path)) return
    setBuffers((current) => {
      const existing = current[path]
      return existing === undefined ? current : { ...current, [path]: { ...existing, error: undefined } }
    })
    try {
      const file = await json<FilePayload>(await fetch(endpoint('file', sessionId, path), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: submitted.content, baseVersion: submitted.version }),
      }))
      setBuffers((current) => {
        const latest = current[path]
        if (latest === undefined) return current
        const unchanged = latest.content === submitted.content
        return {
          ...current,
          [path]: {
            content: unchanged ? file.content : latest.content,
            saved: file.content,
            source: unchanged ? 'disk' : 'human',
            version: file.version,
          },
        }
      })
      reload()
    } catch (reason) {
      if (reason instanceof WorkspaceRequestError && reason.status === 412) {
        try {
          const theirs = await json<FilePayload>(await fetch(endpoint('file', sessionId, path)))
          setBuffers((current) => {
            const latest = current[path]
            if (latest === undefined) return current
            return {
              ...current,
              [path]: {
                ...latest,
                conflict: {
                  message: t('editor.conflict.choose', { path }),
                  theirs: theirs.content,
                  theirsVersion: theirs.version,
                },
              },
            }
          })
        } catch (refreshError) {
          setBuffers((current) => {
            const existing = current[path]
            return existing === undefined ? current : {
              ...current,
              [path]: { ...existing, error: refreshError instanceof Error ? refreshError.message : String(refreshError) },
            }
          })
        }
      } else {
        setBuffers((current) => {
          const existing = current[path]
          return existing === undefined ? current : {
            ...current,
            [path]: { ...existing, error: reason instanceof Error ? reason.message : String(reason) },
          }
        })
      }
    } finally {
      endFileSave(path)
    }
  }, [beginFileSave, endFileSave, reload, sessionId])

  useEffect(() => {
    if (!open) return
    const saveShortcut = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== 's') return
      event.preventDefault()
      if (selected !== undefined) void savePath(selected)
    }
    globalThis.addEventListener('keydown', saveShortcut)
    return () => { globalThis.removeEventListener('keydown', saveShortcut) }
  }, [open, savePath, selected])

  const groups = useMemo(() => {
    const value = new Map<string, WorkspaceFile[]>()
    const all = [...(workspace?.files ?? [])].filter(file => workbenchModeForPath(file.path) === workbench)
    if (activityPath !== undefined && !all.some(file => file.path === activityPath)) all.push({ path: activityPath, bytes: 0, version: '', kind: 'text' })
    all.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'))
    for (const file of all) {
      const directory = groupForPath(file.path, t)
      const files = value.get(directory) ?? []
      files.push(file)
      value.set(directory, files)
    }
    const order = dramaDomain.groupOrder
    return [...value.entries()].sort(([left], [right]) => {
      const leftIndex = order.indexOf(left)
      const rightIndex = order.indexOf(right)
      return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex)
        || left.localeCompare(right, 'zh-Hans-CN')
    })
  }, [activityPath, workbench, workspace])

  const selectWorkbench = (next: WorkbenchMode): void => {
    setWorkbench(next)
    const target = workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, next)
    if (target === undefined) setSelected(undefined)
    else revealPath(target)
  }
  const selectEditorMode = (next: WorkbenchMemory['editorMode']): void => {
    if (next === 'preview') rememberEditorPosition()
    setEditorMode(next)
  }
  const navigateProductionTarget = (target: DramaDocumentTarget): void => {
    const content = buffersRef.current[target.path]?.content ?? ''
    const before = content.slice(0, target.offset)
    const approximateScrollTop = Math.max(0, before.split(/\r?\n/u).length * 28 - 96)
    editorPositions.current.set(target.path, {
      scrollTop: approximateScrollTop,
      selectionStart: target.offset,
      selectionEnd: target.offset,
    })
    modeSelection.current = target.path
    revealPath(target.path)
    setEditorMode('source')
  }
  const selectedLabel = selected ?? t('workbench.selectPrompt', { mode: t(WORKBENCH_LABEL_KEYS[workbench]) })
  const selectedBasename = selected?.split('/').at(-1) ?? selectedLabel
  const selectedGroup = selected === undefined ? undefined : groupForPath(selected, t)
  const toggleGroup = (key: string, open: boolean): void => {
    setExpanded(current => ({ ...current, [key]: open }))
  }
  const resolveConflict = (keepLocal: boolean): void => {
    if (selected === undefined || conflict?.theirs === undefined || conflict.theirsVersion === undefined) return
    const theirs = conflict.theirs
    const theirsVersion = conflict.theirsVersion
    setBuffers((current) => {
      const existing = current[selected]
      if (existing === undefined) return current
      return {
        ...current,
        [selected]: keepLocal
          ? { ...existing, saved: theirs, version: theirsVersion, source: 'human', conflict: undefined }
          : { content: theirs, saved: theirs, source: 'disk', version: theirsVersion },
      }
    })
  }

  return <div ref={surfaceRef} className="creative-workspace" data-workbench={workbench} data-layout={contentLayout}>
      <aside className="creative-tree">
        <div className="creative-brand">
          <span className="creative-brand-cluster"><strong>✦ <span>{t('workbench.brand')}</span></strong><span className="creative-kind">{t(WORKBENCH_LABEL_KEYS[workbench])}</span></span>
          <span className="creative-brand-actions">
            <button type="button" onClick={reload} title={t('workbench.reload')} aria-label={t('workbench.reloadFiles')}>↻</button>
          </span>
        </div>
        {workspace !== undefined && <div className="creative-mode-tabs" role="tablist" aria-label={t('workbench.tablist')}>
          {WORKBENCH_MODES.map(mode => <button
            type="button"
            role="tab"
            key={mode}
            tabIndex={workbench === mode ? 0 : -1}
            aria-selected={workbench === mode}
            onKeyDown={(event) => { handleTabKey(event, WORKBENCH_MODES, workbench, selectWorkbench) }}
            onClick={() => { selectWorkbench(mode) }}
          >{t(WORKBENCH_LABEL_KEYS[mode])}</button>)}
        </div>}
        {sessionUnavailable ? <SessionUnavailableNotice t={t} /> : error !== undefined && <div className="creative-error">{error}</div>}
        {workspace?.projects.find(project => project.root === parseCreativePath(selected)?.projectRoot)?.metadataErrors.map(message => <div className="creative-warning" key={message}>{message}</div>)}
        {workspace?.truncated === true && <div className="creative-warning">{t('tree.truncated')}</div>}
        <nav ref={navRef} aria-label={t(dramaDomain.treeLabelKey)}>
          {groups.map(([directory, files]) => {
            const groupOpen = selectedGroup === directory || expanded[directory] === true
            return <details className="creative-file-group" key={directory} open={groupOpen} onToggle={(event) => { toggleGroup(directory, event.currentTarget.open) }}>
              <summary>{directory}<span>{files.length}</span></summary>
              <FileTreeNodes
                nodes={buildFileTree(files, directory)}
                depth={1}
                expanded={expanded}
                selected={selected}
                activityPath={activityPath}
                onToggle={toggleGroup}
                onSelect={revealPath}
              />
            </details>
          })}
        </nav>
      </aside>
      <main className="creative-editor">
        <header>
          <span className="creative-editor-path" title={selected}><span>{selectedLabel}</span><strong>{selectedBasename}</strong></span>
          <div className="creative-editor-actions">
            {(previewable || drama.available) && !selectedMedia && <div className="creative-editor-tabs" role="tablist" aria-label={drama.available ? t('editor.viewMode.drama') : markdown ? t('editor.viewMode.markdown') : t('editor.viewMode.jsonl')}>
              {editorModes.map(mode => <button
                type="button"
                role="tab"
                key={mode}
                tabIndex={editorMode === mode ? 0 : -1}
                aria-selected={editorMode === mode}
                onKeyDown={(event) => { handleTabKey(event, editorModes, editorMode, selectEditorMode) }}
                onClick={() => { selectEditorMode(mode) }}
              >{mode === 'preview' ? t('editor.mode.preview') : mode === 'source' ? t('editor.mode.source') : t('editor.mode.production')}</button>)}
            </div>}
            {(dirty || saving) && selected !== undefined && <button className="creative-save" type="button" disabled={saving || buffer?.missing === true} onClick={() => { void savePath(selected) }}>
              {saving ? t('editor.saving') : t('editor.save')}
            </button>}
          </div>
        </header>
        {activity !== undefined && activityPath !== undefined && activityPath === selected && <div className="creative-stream" data-stage={activity.stage} role="status" aria-live="polite">● {activity.stage === 'running' ? t('editor.stream.applying') : t('editor.stream.generating')}</div>}
        {conflict !== undefined && <div className="creative-conflict" role="alert">
          <span>{conflict.message}</span>
          {conflict.theirs !== undefined && conflict.theirsVersion !== undefined && selected !== undefined && <div>
            <button type="button" onClick={() => { resolveConflict(false) }}>{t('editor.conflict.loadDisk')}</button>
            <button type="button" onClick={() => { resolveConflict(true) }}>{t('editor.conflict.keepDraft')}</button>
          </div>}
        </div>}
        {fileError !== undefined && <div className="creative-error">{fileError}</div>}
        {selected === undefined
          ? <div className="creative-empty"><dramaDomain.Empty t={t} /></div>
          : selectedMedia
            ? <div className="creative-media-document">{selectedFile.mimeType?.startsWith('image/') === true
              ? <img src={endpoint('media', sessionId, selectedFile.path)} alt={selectedFile.path} />
              : selectedFile.mimeType?.startsWith('audio/') === true
                ? <audio src={endpoint('media', sessionId, selectedFile.path)} controls />
                : <video src={endpoint('media', sessionId, selectedFile.path)} controls preload="metadata" />}</div>
            : buffer === undefined
              ? <div className="creative-empty">{t('editor.loading', { path: selected })}</div>
              : buffer.missing === true
                ? <div className="creative-empty">{t('editor.removed.body')}<button type="button" onClick={() => {
                  setBuffers((current) => {
                    const { [selected]: _, ...next } = current
                    return next
                  })
                  setSelected(workspace === undefined ? undefined : preferredWorkbenchFile(workspace.files, workbench))
                }}>{t('editor.discardDraft')}</button></div>
                : editorMode === 'production' && drama.available && drama.board !== undefined
                  ? <DramaProductionView
                    {...drama.board}
                    t={t}
                    queue={productionQueue}
                    onNavigate={navigateProductionTarget}
                    onOpenMedia={(path) => { revealPath(path) }}
                    onBeginSubmission={beginProductionSubmission}
                    onDispatchPrompt={sendProductionPrompt}
                    onStopJob={stopProductionJob}
                    onRemoveQueued={removeQueuedProduction}
                    onRefresh={reload}
                  />
                  : previewable && editorMode === 'preview'
                    ? markdown
                      ? <MarkdownPreview content={buffer.content} label={selected} t={t} />
                      : <JsonlPreview content={buffer.content} label={selected} t={t} />
                    : <textarea
                      ref={textareaRef}
                      value={buffer.content}
                      data-format={structured ? 'structured' : 'prose'}
                      onBlur={rememberEditorPosition}
                      onScroll={rememberEditorPosition}
                      onSelect={rememberEditorPosition}
                      onChange={(event) => {
                        const content = event.target.value
                        setBuffers(current => ({
                          ...current,
                          [selected]: {
                            content,
                            saved: current[selected]?.saved ?? '',
                            source: 'human',
                            version: current[selected]?.version ?? '',
                            conflict: current[selected]?.conflict,
                          },
                        }))
                      }}
                      spellCheck={!structured}
                      aria-label={selected}
                    />}
      </main>
  </div>
}
