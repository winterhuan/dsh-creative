/** Dual-tab workspace tree, filename search, and the prose editor shell. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { writerExtension } from '../editable.ts'
import {
  breadcrumbSegments,
  countLoadedFiles,
  editorByteSize,
  fileExtensionLabel,
  formatBytes,
  loadedFilesLabel,
} from './editor-shell.ts'
import { applyEol, detectEol, eolLabel, normalizeEol, type WriterEol } from './eol.ts'
import { WriterLineNumbers } from './LineNumbers.tsx'
import {
  buildLoadedChildren,
  defaultWriterTreeExpanded,
  DIRECTORY_PAGE_SIZE,
  rootToDirectoryNode,
  scanWriterWorkspace,
  visibleDirectoryEntries,
  type DirEntry,
  type WriterTreeNode,
  type WriterWorkspaceView,
} from './library.ts'
import type { zh } from './locales.ts'
import { markdownToSafeHtml } from './markdown.ts'
import { listWorkspace, readWorkspaceText, remoteMessage } from './read.ts'
import { saveWriterFile, type WriterSave } from './save.ts'
import {
  MAX_SEARCH_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  searchWriterFilenames,
  writerSearchTruncationMessage,
  type WriterSearchHit,
  type WriterSearchResult,
} from './search.ts'
import {
  WRITER_RAIL_MAX_WIDTH,
  WRITER_RAIL_MIN_WIDTH,
  clampRailWidth,
  readRailChrome,
  setRailCollapsed,
  setRailWidth,
  writeRailChrome,
  type WriterRailChrome,
} from './rail-chrome.ts'
import {
  workspaceShortName,
  writerScanHealth,
  type WriterScanHealth,
} from './workspace-status.ts'

type Copy = (key: keyof typeof zh) => string
type EditorMode = 'edit' | 'preview'

interface DeskProps {
  readonly sessionId: SessionId
  readonly cwd: string
  readonly remote: ClientRemote
  readonly t: Copy
  readonly visible: boolean
}

interface ListingCache {
  readonly entries: readonly DirEntry[]
  readonly truncated: boolean
}

type DirectoryNode = Extract<WriterTreeNode, { kind: 'directory' }>

function joinCwd(cwd: string, relative: string): string {
  const root = cwd.replace(/[/\\]+$/u, '')
  if (relative === '' || relative === '.') return root
  return `${root}/${relative}`
}

async function readDir(
  remote: ClientRemote,
  sessionId: SessionId,
  cwd: string,
  relative: string,
  signal: AbortSignal,
): Promise<{ entries: readonly DirEntry[], truncated: boolean }> {
  const path = joinCwd(cwd, relative)
  const result = await listWorkspace(remote, sessionId, path, signal)
  if (!result.ok) throw new Error(remoteMessage(result.error, 'load'))
  return {
    entries: result.value.entries,
    truncated: result.value.truncated,
  }
}

function updateDirectoryNode(
  nodes: readonly WriterTreeNode[],
  path: string,
  update: (node: DirectoryNode) => DirectoryNode,
): readonly WriterTreeNode[] {
  return nodes.map((node) => {
    if (node.kind !== 'directory') return node
    if (node.path === path) return update(node)
    const isAncestor = node.path === '' ? path !== '' : path.startsWith(`${node.path}/`)
    if (!isAncestor) return node
    return { ...node, children: updateDirectoryNode(node.children, path, update) }
  })
}

function fileStemAndExt(name: string): { stem: string, ext: string } {
  const ext = writerExtension(name)
  if (ext === '') return { stem: name, ext: '' }
  return { stem: name.slice(0, -ext.length), ext: ext.slice(1) }
}

function countCharacters(content: string): number {
  return [...content.replace(/\s/gu, '')].length
}

function cursorLineCol(content: string, caret: number): { line: number, col: number } {
  const before = content.slice(0, Math.max(0, Math.min(caret, content.length)))
  const lines = before.split('\n')
  const last = lines[lines.length - 1] ?? ''
  return { line: lines.length, col: [...last].length + 1 }
}

function isChatComposerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-workbench="writer"]') !== null) return false
  const tag = target.tagName
  if (tag !== 'TEXTAREA' && tag !== 'INPUT' && !target.isContentEditable) return false
  return true
}

function healthCopy(health: WriterScanHealth, t: Copy): string {
  if (health === 'loading') return t('healthLoading')
  if (health === 'partial') return t('healthPartial')
  if (health === 'failed') return t('healthFailed')
  return t('healthOk')
}

function TreeNodes({
  nodes,
  depth,
  expanded,
  selected,
  listings,
  onToggle,
  onSelect,
  onLoadMore,
  onRetry,
  t,
}: {
  readonly nodes: readonly WriterTreeNode[]
  readonly depth: number
  readonly expanded: Readonly<Record<string, boolean>>
  readonly selected: string | undefined
  readonly listings: Readonly<Record<string, ListingCache>>
  readonly onToggle: (path: string, open: boolean) => void
  readonly onSelect: (path: string) => void
  readonly onLoadMore: (path: string) => void
  readonly onRetry: (path: string) => void
  readonly t: Copy
}): ReactNode {
  return nodes.map((node) => {
    const indent = { '--writer-indent': `${String(depth * 14)}px` } as CSSProperties
    const childIndent = { '--writer-indent': `${String((depth + 1) * 14)}px` } as CSSProperties
    if (node.kind === 'file') {
      const { stem, ext } = fileStemAndExt(node.name)
      return <li key={node.path}>
        <button
          type="button"
          className={node.editable ? 'writer-tree-file' : 'writer-tree-file writer-tree-file-disabled'}
          style={indent}
          title={node.editable ? node.path : t('notEditable').replace('{path}', node.path)}
          aria-label={node.name}
          aria-current={node.path === selected ? 'true' : undefined}
          disabled={!node.editable}
          onClick={() => { if (node.editable) onSelect(node.path) }}
        >
          <span aria-hidden="true" className="writer-tree-kind">📄</span>
          <span className="writer-tree-label" aria-hidden="true">{stem || node.name}</span>
          {ext !== '' && <span className="writer-tree-ext" aria-hidden="true">{ext}</span>}
        </button>
      </li>
    }

    const key = node.path
    const open = key in expanded ? expanded[key] === true : defaultWriterTreeExpanded(key, selected, depth)
    const listing = listings[key]
    const total = listing === undefined ? node.children.length : visibleDirectoryEntries(listing.entries).length
    const hasMore = listing !== undefined && node.shown < total
    const apiTruncated = (listing?.truncated ?? node.truncated) && node.shown >= total && total > 0
    const folderName = node.name === '' || node.name === '.' ? t('workspaceBook') : node.name

    return <li key={key === '' ? 'workspace-root' : key} className="writer-tree-folder">
      <button
        type="button"
        className="writer-tree-toggle"
        style={indent}
        aria-expanded={open}
        aria-label={folderName}
        onClick={() => { onToggle(key, !open) }}
      >
        <span aria-hidden="true" className="writer-tree-chevron">{open ? '▼' : '▶'}</span>
        <span aria-hidden="true" className="writer-tree-kind">📁</span>
        <span className="writer-tree-label">{folderName}</span>
      </button>
      {open && <ul>
        {node.loading && <li className="writer-tree-status" style={childIndent}>{t('loading')}</li>}
        {node.loadError !== undefined && !node.loading && <li>
          <button type="button" className="writer-tree-status-action" style={childIndent} onClick={() => { onRetry(node.path) }}>{t('loadDirError')}</button>
        </li>}
        {node.loaded && !node.loading && node.children.length === 0 && node.loadError === undefined && (
          <li className="writer-tree-status" style={childIndent}>{t('emptyDir')}</li>
        )}
        {TreeNodes({
          nodes: node.children,
          depth: depth + 1,
          expanded,
          selected,
          listings,
          onToggle,
          onSelect,
          onLoadMore,
          onRetry,
          t,
        })}
        {hasMore && !node.loading && <li>
          <button type="button" className="writer-tree-status-action" style={childIndent} onClick={() => { onLoadMore(node.path) }}>{t('loadMore')}</button>
        </li>}
        {apiTruncated && <li className="writer-tree-status" style={childIndent}>{t('truncated')}</li>}
      </ul>}
    </li>
  })
}

function SearchHits({
  hits,
  selected,
  onSelect,
  t,
}: {
  readonly hits: readonly WriterSearchHit[]
  readonly selected: string | undefined
  readonly onSelect: (path: string) => void
  readonly t: Copy
}): ReactNode {
  return <ul className="writer-tree writer-search-hits">
    {hits.map((hit) => {
      const { stem, ext } = fileStemAndExt(hit.name)
      return <li key={hit.path}>
        <button
          type="button"
          className={hit.editable ? 'writer-tree-file' : 'writer-tree-file writer-tree-file-disabled'}
          title={hit.editable ? hit.path : t('notEditable').replace('{path}', hit.path)}
          aria-label={hit.name}
          aria-current={hit.path === selected ? 'true' : undefined}
          disabled={!hit.editable}
          onClick={() => { if (hit.editable) onSelect(hit.path) }}
        >
          <span aria-hidden="true" className="writer-tree-kind">📄</span>
          <span className="writer-tree-label" aria-hidden="true">{stem || hit.name}</span>
          {ext !== '' && <span className="writer-tree-ext" aria-hidden="true">{ext}</span>}
        </button>
        <p className="writer-search-path" title={hit.path}>{hit.path}</p>
      </li>
    })}
  </ul>
}

/**
 * The writing sidebar body for one session.
 * @param props - session, workspace root, remote, and copy.
 * @returns the desk.
 */
export function WriterDesk({ sessionId, cwd, remote, t, visible }: DeskProps) {
  const [viewPick, setViewPick] = useState<WriterWorkspaceView | undefined>(undefined)
  const [libraries, setLibraries] = useState<readonly WriterTreeNode[]>([])
  const [projects, setProjects] = useState<readonly WriterTreeNode[]>([])
  const [listings, setListings] = useState<Record<string, ListingCache>>({})
  const [active, setActive] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState('')
  const [version, setVersion] = useState<string | undefined>(undefined)
  const [eol, setEol] = useState<WriterEol>('\n')
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [scanErrors, setScanErrors] = useState<readonly string[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanHardFailed, setScanHardFailed] = useState(false)
  const [filter, setFilter] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<WriterSearchResult | undefined>(undefined)
  const [mode, setMode] = useState<EditorMode>('edit')
  const [caret, setCaret] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const saveRef = useRef<() => void>(() => {})
  const searchSeq = useRef(0)
  const [railChrome, setRailChrome] = useState<WriterRailChrome>(() => readRailChrome())
  const railDrag = useRef<{ pointerId: number, startX: number, startWidth: number } | undefined>(undefined)

  // Prefer libraries when any exist; otherwise projects (both empty → projects).
  // Honor an explicit tab pick even when that side's count is 0 so empty states stay switchable.
  const preferredView: WriterWorkspaceView = libraries.length > 0 ? 'libraries' : 'projects'
  const view: WriterWorkspaceView = viewPick ?? preferredView
  const roots = view === 'libraries' ? libraries : projects
  const rootPathsKey = roots.map(node => node.path).join('\0')
  const dirty = draft !== saved
  const query = filter.trim()
  const showSearch = query !== ''

  const patchDirectory = (path: string, update: (node: DirectoryNode) => DirectoryNode): void => {
    setLibraries(nodes => updateDirectoryNode(nodes, path, update))
    setProjects(nodes => updateDirectoryNode(nodes, path, update))
  }

  useEffect(() => {
    if (!visible) return undefined
    const controller = new AbortController()
    const signal = controller.signal
    setNotice(undefined)
    setScanning(true)
    setScanHardFailed(false)
    void (async () => {
      try {
        const scan = await scanWriterWorkspace(relative => readDir(remote, sessionId, cwd, relative, signal).then(page => page.entries))
        if (signal.aborted) return
        setLibraries(scan.libraries.map(rootToDirectoryNode))
        setProjects(scan.projects.map(rootToDirectoryNode))
        setScanErrors(scan.scanErrors)
        setScanHardFailed(false)
        setListings({})
        setExpanded({})
      } catch (error) {
        if (signal.aborted) return
        setLibraries([])
        setProjects([])
        setScanErrors([])
        setScanHardFailed(true)
        setNotice(error instanceof Error && error.message !== 'load' ? error.message : t('loadError'))
      } finally {
        if (!signal.aborted) setScanning(false)
      }
    })()
    return () => { controller.abort() }
  }, [visible, sessionId, cwd, remote, reloadKey, t])

  const loadDirectory = (path: string, force = false): void => {
    const cached = force ? undefined : listings[path]
    if (cached !== undefined) {
      patchDirectory(path, (node) => {
        const built = buildLoadedChildren(path, cached.entries, Math.max(node.shown, DIRECTORY_PAGE_SIZE), cached.truncated)
        const { loadError: _drop, ...rest } = node
        return { ...rest, ...built, loaded: true, loading: false }
      })
      return
    }
    if (force) {
      setListings((current) => {
        const next = { ...current }
        delete next[path]
        return next
      })
    }
    patchDirectory(path, (node) => {
      const { loadError: _drop, ...rest } = node
      return { ...rest, loading: true }
    })
    void readDir(remote, sessionId, cwd, path, new AbortController().signal).then((page) => {
      setListings(current => ({ ...current, [path]: { entries: page.entries, truncated: page.truncated } }))
      patchDirectory(path, (node) => {
        const built = buildLoadedChildren(path, page.entries, DIRECTORY_PAGE_SIZE, page.truncated)
        const { loadError: _drop, ...rest } = node
        return { ...rest, ...built, loaded: true, loading: false }
      })
    }).catch((error: unknown) => {
      patchDirectory(path, node => ({
        ...node,
        loading: false,
        loadError: error instanceof Error ? error.message : t('loadError'),
      }))
    })
  }

  // Dashboard: first-layer roots open by default and lazy-load; respect explicit collapse.
  useEffect(() => {
    if (!visible || showSearch) return
    for (const root of roots) {
      if (root.kind !== 'directory') continue
      const key = root.path
      const open = key in expanded ? expanded[key] === true : defaultWriterTreeExpanded(key, active, 0)
      if (!open || root.loaded || root.loading || root.loadError !== undefined) continue
      loadDirectory(key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional narrow deps for root lazy-open
  }, [visible, roots, expanded, active, listings, showSearch])

  const onToggle = (path: string, open: boolean): void => {
    setExpanded(current => ({ ...current, [path]: open }))
    if (open) loadDirectory(path)
  }

  const onLoadMore = (path: string): void => {
    const cached = listings[path]
    if (cached === undefined) return
    patchDirectory(path, (node) => {
      const built = buildLoadedChildren(path, cached.entries, node.shown + DIRECTORY_PAGE_SIZE, cached.truncated)
      return { ...node, ...built, loaded: true, loading: false }
    })
  }

  const confirmDiscard = (): boolean => !dirty || window.confirm(t('confirmDiscard'))

  const selectFile = (path: string): void => {
    if (path === active) return
    if (!confirmDiscard()) return
    setActive(path)
  }

  const rescan = (): void => {
    if (!confirmDiscard()) return
    setActive(undefined)
    setDraft('')
    setSaved('')
    setVersion(undefined)
    setEol('\n')
    setReloadKey(value => value + 1)
  }

  useEffect(() => {
    if (!visible || active === undefined) return undefined
    const controller = new AbortController()
    const path = joinCwd(cwd, active)
    setConflict(false)
    setConflictOpen(false)
    setNotice(undefined)
    void readWorkspaceText(remote, sessionId, path, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (!result.ok) {
        setNotice(remoteMessage(result.error, t('loadError')))
        return
      }
      const detected = detectEol(result.value.text)
      const text = normalizeEol(result.value.text)
      setEol(detected)
      setDraft(text)
      setSaved(text)
      setVersion(result.value.version)
      setCaret(0)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : t('loadError'))
    })
    return () => { controller.abort() }
  }, [visible, active, sessionId, cwd, remote, reloadKey, t])

  const save = (): void => {
    if (active === undefined || version === undefined || conflict || draft === saved || busy) return
    const path = active
    const baseVersion = version
    const submitted = draft
    const payloadContent = applyEol(submitted, eol)
    setBusy(true)
    void saveWriterFile(sessionId, path, payloadContent, baseVersion, new AbortController().signal).then(async (response) => {
      const payload = await response.json() as WriterSave & { error?: string }
      if (response.status === 412) {
        setConflict(true)
        setConflictOpen(true)
        setNotice(undefined)
        return
      }
      if (!response.ok) {
        setNotice(payload.error ?? t('saveError'))
        return
      }
      // Keep dirty if the author typed more while the request was in flight.
      setSaved(submitted)
      setVersion(payload.version)
      setNotice(t('saved'))
      setConflict(false)
    }).catch(() => {
      setNotice(t('saveError'))
    }).finally(() => { setBusy(false) })
  }
  saveRef.current = save

  // Debounced filename search for the active tab.
  useEffect(() => {
    if (!visible) return undefined
    const trimmed = filter.trim()
    if (trimmed === '') {
      searchSeq.current += 1
      setSearching(false)
      setSearchResult(undefined)
      return undefined
    }
    if (trimmed.length > MAX_SEARCH_QUERY_LENGTH) {
      searchSeq.current += 1
      setSearching(false)
      setSearchResult(undefined)
      setNotice(t('searchQueryTooLong'))
      return undefined
    }
    setSearching(true)
    const sequence = ++searchSeq.current
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const rootPaths = rootPathsKey === ''
        ? []
        : rootPathsKey.split('\0').map(path => (path === '' ? '.' : path))
      void searchWriterFilenames(
        rootPaths,
        trimmed,
        relative => readDir(remote, sessionId, cwd, relative === '.' ? '' : relative, controller.signal),
        controller.signal,
      ).then((result) => {
        if (sequence !== searchSeq.current || controller.signal.aborted) return
        setSearchResult(result)
        setSearching(false)
      }).catch((error: unknown) => {
        if (sequence !== searchSeq.current || controller.signal.aborted) return
        setSearching(false)
        setSearchResult(undefined)
        setNotice(error instanceof Error ? error.message : t('loadError'))
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [visible, filter, view, rootPathsKey, remote, sessionId, cwd, t])

  useEffect(() => {
    if (!visible) return undefined
    const onKey = (event: KeyboardEvent): void => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      const key = event.key.toLocaleLowerCase()
      if (key === 's') {
        event.preventDefault()
        saveRef.current()
        return
      }
      if (key === 'k') {
        if (isChatComposerTarget(event.target)) return
        event.preventDefault()
        const input = searchRef.current
        if (input === null) return
        input.focus()
        input.select()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [visible])

  const dirtyState = busy ? 'saving' : dirty ? 'dirty' : 'saved'
  const dirtyText = busy ? t('dirtySaving') : dirty ? t('dirtyPending') : t('dirtySaved')
  const { line, col } = cursorLineCol(draft, caret)
  const truncationText = searchResult === undefined
    ? ''
    : writerSearchTruncationMessage(searchResult.truncation, searchResult.limits, searchResult.scanErrors)
  const shortName = workspaceShortName(cwd)
  const health = writerScanHealth({
    scanning,
    hardFailed: scanHardFailed,
    libraryCount: libraries.length,
    projectCount: projects.length,
    scanErrors,
  })
  const healthText = healthCopy(health, t)
  const loadedFileCount = countLoadedFiles(libraries) + countLoadedFiles(projects)
  const filesText = loadedFilesLabel(loadedFileCount, t('filesOnDemand'), t('filesLoaded'))
  const countsText = t('countsSummary')
    .replace('{libraries}', String(libraries.length))
    .replace('{projects}', String(projects.length))
    .replace('{files}', filesText)
  const crumbs = active === undefined ? [] : breadcrumbSegments(active)
  const byteLabel = formatBytes(editorByteSize(draft, eol))
  const extLabel = active === undefined ? '' : fileExtensionLabel(active)
  const encodingText = t('statusEncoding').replace('{eol}', eolLabel(eol))
  const tabPanelId = 'writer-workspace-panel'
  const librariesTabId = 'writer-tab-libraries'
  const projectsTabId = 'writer-tab-projects'
  const railId = 'writer-rail'
  const railCollapsed = railChrome.collapsed
  const railWidth = railChrome.width

  const persistRail = (next: WriterRailChrome): void => {
    setRailChrome(next)
    writeRailChrome(next)
  }

  const toggleRail = (): void => {
    persistRail(setRailCollapsed(railChrome))
  }

  const onRailResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || railCollapsed) return
    event.preventDefault()
    railDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: railWidth,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onRailResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = railDrag.current
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    const delta = event.clientX - drag.startX
    const nextWidth = clampRailWidth(drag.startWidth + delta)
    setRailChrome(current => setRailWidth(current, nextWidth))
  }

  const endRailResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = railDrag.current
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    railDrag.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setRailChrome((current) => {
      writeRailChrome(current)
      return current
    })
  }

  const onRailResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (railCollapsed) return
    const step = event.shiftKey ? 32 : 16
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      persistRail(setRailWidth(railChrome, railWidth - step))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      persistRail(setRailWidth(railChrome, railWidth + step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      persistRail(setRailWidth(railChrome, WRITER_RAIL_MIN_WIDTH))
    } else if (event.key === 'End') {
      event.preventDefault()
      persistRail(setRailWidth(railChrome, WRITER_RAIL_MAX_WIDTH))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleRail()
    }
  }

  const deskStyle = {
    ['--writer-rail-width' as string]: `${String(railWidth)}px`,
  } as CSSProperties

  return <div
    className="writer-desk"
    data-workbench="writer"
    data-rail-collapsed={railCollapsed ? 'true' : undefined}
    style={deskStyle}
  >
    <aside id={railId} className="writer-rail" aria-label={t('tree')} hidden={railCollapsed || undefined}>
      <nav className="writer-tabs" aria-label={t('workspaceTabs')} role="tablist">
        <button
          type="button"
          id={librariesTabId}
          role="tab"
          className="writer-tab"
          aria-selected={view === 'libraries'}
          aria-controls={tabPanelId}
          onClick={() => { setViewPick('libraries') }}
        >
          <span>{t('libraries')}</span>
          <b className="writer-badge">{libraries.length}</b>
        </button>
        <button
          type="button"
          id={projectsTabId}
          role="tab"
          className="writer-tab"
          aria-selected={view === 'projects'}
          aria-controls={tabPanelId}
          onClick={() => { setViewPick('projects') }}
        >
          <span>{t('projects')}</span>
          <b className="writer-badge">{projects.length}</b>
        </button>
      </nav>
      <div className="writer-search-slot" role="search">
        <input
          ref={searchRef}
          type="search"
          value={filter}
          placeholder={t('search')}
          aria-label={t('searchLabel')}
          onChange={event => { setFilter(event.target.value); setNotice(undefined) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setFilter('')
              setSearchResult(undefined)
              setSearching(false)
            }
          }}
        />
      </div>
      <div
        className="writer-tree-panel"
        id={tabPanelId}
        role="tabpanel"
        aria-labelledby={view === 'libraries' ? librariesTabId : projectsTabId}
        aria-busy={scanning || undefined}
      >
        {health === 'failed' && !showSearch && <div className="writer-scan-banner" role="alert">
          <p>{t('scanFailed')}</p>
          <button type="button" onClick={rescan}>{t('retryScan')}</button>
        </div>}
        {health === 'partial' && !showSearch && <div className="writer-scan-banner writer-scan-banner-warn" role="status">
          <p>{t('scanPartial')}</p>
          <button type="button" onClick={rescan}>{t('retryScan')}</button>
        </div>}
        {scanning && !showSearch ? <p className="writer-empty">{t('healthLoading')}</p>
          : showSearch ? (
          searching ? <p className="writer-empty">{t('searching').replace('{query}', query)}</p>
            : searchResult !== undefined && searchResult.results.length === 0 ? <>
              <p className="writer-empty">{(searchResult.truncated ? t('searchIncomplete') : t('searchEmpty')).replace('{query}', query)}</p>
              {truncationText !== '' && <p className="writer-muted" role="status">{truncationText}</p>}
            </>
              : searchResult !== undefined ? <>
                <SearchHits hits={searchResult.results} selected={active} onSelect={selectFile} t={t} />
                {truncationText !== '' && <p className="writer-muted" role="status">{truncationText}</p>}
              </>
                : null
        ) : health === 'failed' ? null
          : roots.length === 0 ? <p className="writer-empty">{view === 'libraries' ? t('emptyLibraries') : t('emptyProjects')}</p> : <nav aria-label={t('tree')}>
          <ul className="writer-tree">{TreeNodes({
            nodes: roots,
            depth: 0,
            expanded,
            selected: active,
            listings,
            onToggle,
            onSelect: selectFile,
            onLoadMore,
            onRetry: path => { loadDirectory(path, true) },
            t,
          })}</ul>
        </nav>}
      </div>
      <footer className="writer-rail-note">
        <span className="writer-rail-dot" data-health={health} aria-hidden="true" />
        <p title={`${cwd} · ${t('localWorkspace')}`}>{shortName} · {healthText} · {t('localWorkspace')}</p>
      </footer>
    </aside>
    <div
      className="writer-rail-resize"
      role="separator"
      tabIndex={railCollapsed ? -1 : 0}
      aria-orientation="vertical"
      aria-label={t('resizeRail')}
      aria-valuemin={WRITER_RAIL_MIN_WIDTH}
      aria-valuemax={WRITER_RAIL_MAX_WIDTH}
      aria-valuenow={railWidth}
      aria-controls={railId}
      hidden={railCollapsed || undefined}
      onPointerDown={onRailResizePointerDown}
      onPointerMove={onRailResizePointerMove}
      onPointerUp={endRailResize}
      onPointerCancel={endRailResize}
      onDoubleClick={(event) => {
        event.preventDefault()
        toggleRail()
      }}
      onKeyDown={onRailResizeKeyDown}
    />
    <section className="writer-stage">
      <header className="writer-stage-heading">
        <button
          type="button"
          className="writer-rail-toggle"
          aria-expanded={!railCollapsed}
          aria-controls={railId}
          aria-label={railCollapsed ? t('expandRail') : t('collapseRail')}
          title={railCollapsed ? t('expandRail') : t('collapseRail')}
          onClick={toggleRail}
        >{railCollapsed ? '›' : '‹'}</button>
        <div className="writer-masthead" aria-label={t('masthead')}>
          <span className="writer-workspace" title={cwd}>{shortName}</span>
          <span className="writer-counts" title={t('filesCountHint')}>{countsText}</span>
          <span className="writer-local" title={t('localWorkspace')}>{t('localWorkspace')}</span>
          <span className="writer-health" data-health={health} role="status">{healthText}</span>
        </div>
        <button type="button" className="writer-reload" onClick={rescan}>{t('reload')}</button>
      </header>
      <main className="writer-editor">
        {active === undefined && notice === undefined && <p className="writer-empty">{t('emptyHelp')}</p>}
        {notice !== undefined && <p role="alert" className="writer-alert">{notice}</p>}
        {conflictOpen && <Modal
          open
          onClose={() => { setConflictOpen(false) }}
          title={t('conflictTitle')}
          description={t('conflictBody')}
          closeLabel={t('conflictClose')}
          footer={(
            <>
              <button type="button" onClick={() => { setConflictOpen(false) }}>{t('conflictKeep')}</button>
              <button
                type="button"
                className="writer-conflict-reload"
                onClick={() => {
                  setConflictOpen(false)
                  setConflict(false)
                  setReloadKey(value => value + 1)
                }}
              >{t('conflictReload')}</button>
            </>
          )}
        />}
        {active !== undefined && <>
          <header className="writer-editor-toolbar">
            <div className="writer-document-identity">
              <nav className="writer-breadcrumbs" aria-label={t('breadcrumbs')}>
                {crumbs.map((part, index) => (
                  <span key={`${String(index)}-${part}`}>
                    {index > 0 && <i aria-hidden="true"> / </i>}
                    <span>{part}</span>
                  </span>
                ))}
              </nav>
              <span className="writer-path" title={active}>{crumbs[crumbs.length - 1] ?? active}</span>
            </div>
            <span className="writer-dirty" data-state={dirtyState}>{dirtyText}</span>
            <button
              type="button"
              className="writer-line-numbers-toggle"
              title={t('toggleLineNumbers')}
              aria-label={t('toggleLineNumbers')}
              aria-pressed={showLineNumbers}
              onClick={() => { setShowLineNumbers(value => !value) }}
            >#</button>
            <div className="writer-mode-switch" role="group" aria-label={t('editor')}>
              <button type="button" aria-pressed={mode === 'edit'} onClick={() => { setMode('edit') }}>{t('modeEdit')}</button>
              <button type="button" aria-pressed={mode === 'preview'} onClick={() => { setMode('preview') }}>{t('modePreview')}</button>
            </div>
            <button type="button" disabled={busy || conflict || version === undefined || draft === saved} onClick={save}>{t('save')}</button>
          </header>
          {mode === 'edit' ? (
            <div className={showLineNumbers ? 'writer-editor-body show-line-numbers' : 'writer-editor-body'}>
              <WriterLineNumbers
                text={draft}
                caret={caret}
                show={showLineNumbers}
                textareaRef={editorRef}
              />
              <textarea
                ref={editorRef}
                aria-label={active}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setCaret(event.target.selectionStart)
                  setNotice(undefined)
                }}
                onSelect={event => { setCaret(event.currentTarget.selectionStart) }}
                onKeyUp={event => { setCaret(event.currentTarget.selectionStart) }}
                onClick={event => { setCaret(event.currentTarget.selectionStart) }}
              />
            </div>
          ) : (
            <article
              className="writer-preview"
              aria-label={`${active} ${t('modePreview')}`}
              dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(draft) }}
            />
          )}
          <footer className="writer-status">
            <span>{t('statusCursor').replace('{line}', String(line)).replace('{col}', String(col))}</span>
            <span aria-hidden="true">·</span>
            <span className="writer-document-meta">{byteLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{t('statusChars').replace('{n}', String(countCharacters(draft)))}</span>
            {extLabel !== '' && <>
              <span aria-hidden="true">·</span>
              <span>{extLabel}</span>
            </>}
            <span aria-hidden="true">·</span>
            <span>{encodingText}</span>
          </footer>
        </>}
      </main>
    </section>
  </div>
}
