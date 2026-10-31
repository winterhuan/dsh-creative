/** Dual-tab workspace tree and the prose editor. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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
import { listWorkspace, readWorkspaceText, remoteMessage } from './read.ts'
import { saveWriterFile, type WriterSave } from './save.ts'

type Copy = (key: keyof typeof zh) => string

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
    const indent = { '--writer-indent': `${String(depth * 12)}px` } as CSSProperties
    const childIndent = { '--writer-indent': `${String((depth + 1) * 12)}px` } as CSSProperties
    if (node.kind === 'file') {
      return <li key={node.path}>
        <button
          type="button"
          className={node.editable ? 'writer-tree-file' : 'writer-tree-file writer-tree-file-disabled'}
          style={indent}
          title={node.editable ? node.path : t('notEditable').replace('{path}', node.path)}
          aria-current={node.path === selected ? 'true' : undefined}
          disabled={!node.editable}
          onClick={() => { if (node.editable) onSelect(node.path) }}
        >{node.name}</button>
      </li>
    }

    const key = node.path
    const open = key in expanded ? expanded[key] === true : defaultWriterTreeExpanded(key, selected)
    const listing = listings[key]
    const total = listing === undefined ? node.children.length : visibleDirectoryEntries(listing.entries).length
    const hasMore = listing !== undefined && node.shown < total
    const apiTruncated = (listing?.truncated ?? node.truncated) && node.shown >= total && total > 0

    return <li key={key === '' ? 'workspace-root' : key} className="writer-tree-folder">
      <button
        type="button"
        className="writer-tree-toggle"
        style={indent}
        aria-expanded={open}
        onClick={() => { onToggle(key, !open) }}
      >
        <span aria-hidden="true" className="writer-tree-chevron">{open ? '▼' : '▶'}</span>
        <span>{node.name === '' || node.name === '.' ? t('workspaceBook') : node.name}</span>
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
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [scanErrors, setScanErrors] = useState<readonly string[]>([])

  const preferredView: WriterWorkspaceView = libraries.length > 0 ? 'libraries' : 'projects'
  const view: WriterWorkspaceView = (
    (viewPick === 'libraries' && libraries.length > 0)
    || (viewPick === 'projects' && projects.length > 0)
  ) ? viewPick : preferredView
  const roots = view === 'libraries' ? libraries : projects

  const patchDirectory = (path: string, update: (node: DirectoryNode) => DirectoryNode): void => {
    setLibraries(nodes => updateDirectoryNode(nodes, path, update))
    setProjects(nodes => updateDirectoryNode(nodes, path, update))
  }

  useEffect(() => {
    if (!visible) return undefined
    const controller = new AbortController()
    const signal = controller.signal
    setNotice(undefined)
    void (async () => {
      try {
        const scan = await scanWriterWorkspace(relative => readDir(remote, sessionId, cwd, relative, signal).then(page => page.entries))
        if (signal.aborted) return
        setLibraries(scan.libraries.map(rootToDirectoryNode))
        setProjects(scan.projects.map(rootToDirectoryNode))
        setScanErrors(scan.scanErrors)
        setListings({})
        setExpanded({})
      } catch (error) {
        if (!signal.aborted) setNotice(error instanceof Error && error.message !== 'load' ? error.message : t('loadError'))
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

  useEffect(() => {
    if (!visible || active === undefined) return undefined
    const controller = new AbortController()
    const path = joinCwd(cwd, active)
    setConflict(false)
    setNotice(undefined)
    void readWorkspaceText(remote, sessionId, path, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (!result.ok) {
        setNotice(remoteMessage(result.error, t('loadError')))
        return
      }
      setDraft(result.value.text)
      setSaved(result.value.text)
      setVersion(result.value.version)
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
    setBusy(true)
    void saveWriterFile(sessionId, path, submitted, baseVersion, new AbortController().signal).then(async (response) => {
      const payload = await response.json() as WriterSave & { error?: string }
      if (response.status === 412) {
        setConflict(true)
        setNotice(payload.error ?? t('conflict'))
        return
      }
      if (!response.ok) {
        setNotice(payload.error ?? t('saveError'))
        return
      }
      setSaved(submitted)
      setVersion(payload.version)
      setNotice(t('saved'))
      setConflict(false)
    }).catch(() => {
      setNotice(t('saveError'))
    }).finally(() => { setBusy(false) })
  }

  return <div className="writer-desk" data-workbench="writer">
    <header className="writer-heading">
      <span>{t('title')}</span>
      <nav className="writer-tabs" aria-label={t('workspaceTabs')} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'libraries'}
          aria-pressed={view === 'libraries'}
          onClick={() => { setViewPick('libraries') }}
        >{t('libraries')}<b className="writer-badge">{libraries.length}</b></button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'projects'}
          aria-pressed={view === 'projects'}
          onClick={() => { setViewPick('projects') }}
        >{t('projects')}<b className="writer-badge">{projects.length}</b></button>
      </nav>
      <button type="button" className="writer-reload" onClick={() => { setReloadKey(value => value + 1); setActive(undefined) }}>{t('reload')}</button>
    </header>
    <aside className="writer-list">
      {roots.length === 0 ? <p className="writer-empty">{view === 'libraries' ? t('emptyLibraries') : t('emptyProjects')}</p> : <nav aria-label={t('tree')}>
        <ul className="writer-tree">{TreeNodes({
          nodes: roots,
          depth: 0,
          expanded,
          selected: active,
          listings,
          onToggle,
          onSelect: path => { setActive(path) },
          onLoadMore,
          onRetry: path => { loadDirectory(path, true) },
          t,
        })}</ul>
      </nav>}
      {scanErrors.length > 0 && <p className="writer-muted">{t('scanPartial')}</p>}
    </aside>
    <main className="writer-editor">
      {active === undefined && notice === undefined && <p className="writer-empty">{t('emptyHelp')}</p>}
      {notice !== undefined && <p role="alert" className="writer-alert">{notice}{conflict && <button type="button" onClick={() => { setReloadKey(value => value + 1) }}>{t('reloadDisk')}</button>}</p>}
      {active !== undefined && <>
        <header>
          <span className="writer-path" title={active}>{active}</span>
          <button type="button" disabled={busy || conflict || version === undefined || draft === saved} onClick={save}>{t('save')}</button>
        </header>
        <textarea aria-label={active} value={draft} onChange={event => { setDraft(event.target.value); setNotice(undefined) }} />
      </>}
    </main>
  </div>
}
