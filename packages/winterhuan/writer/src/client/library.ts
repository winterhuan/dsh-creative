import { isEditableWriterName, type WriterSection } from '../editable.ts'

export type { WriterSection }
export {
  classifyWriterPath,
  EDITABLE_EXTENSIONS,
  isEditableWriterName,
  isEditableWriterPath,
  writerExtension,
} from '../editable.ts'

/** One directory entry, as `workspaceFiles.list` reports it. */
export interface DirEntry {
  readonly name: string
  readonly type: 'file' | 'directory' | 'other'
  readonly size?: number
}

/** Workspace discovery view matching Dashboard tabs. */
export type WriterWorkspaceView = 'libraries' | 'projects'

/** One discovered root shown under a tab. */
export interface WriterWorkspaceRoot {
  readonly path: string
  readonly name: string
  readonly view: WriterWorkspaceView
}

/** Result of scanning the workspace for Dashboard-aligned roots. */
export interface WriterWorkspaceScan {
  readonly libraries: readonly WriterWorkspaceRoot[]
  readonly projects: readonly WriterWorkspaceRoot[]
  readonly scanErrors: readonly string[]
}

/** Lazy real-tree node under a root. */
export type WriterTreeNode =
  | {
    readonly kind: 'directory'
    readonly name: string
    readonly path: string
    readonly children: readonly WriterTreeNode[]
    readonly loaded: boolean
    readonly loading: boolean
    readonly shown: number
    readonly truncated: boolean
    readonly loadError?: string
  }
  | {
    readonly kind: 'file'
    readonly name: string
    readonly path: string
    readonly editable: boolean
    readonly size?: number
  }

/** Default page size aligned with Dashboard `DIRECTORY_PAGE_SIZE`. */
export const DIRECTORY_PAGE_SIZE = 200

/** Max file bytes treated as editable in the tree (Dashboard `MAX_FILE_BYTES`). */
export const MAX_EDITABLE_FILE_BYTES = 2 * 1024 * 1024

const LONG_PROJECT_DIRECTORY_MARKERS = new Set(['正文', '大纲', '设定', '追踪'])
const SHORT_PROJECT_BODY_FILE = '正文.md'
const SHORT_PROJECT_COMPANION_FILES = new Set(['小节大纲.md', '设定.md'])

/** Directories Dashboard hides from the tree and discovery walks. */
export const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.omc',
  '.omx',
  '.claude',
  '.codex',
  '.opencode',
  '.zcode',
  '.agents',
  'node_modules',
  'test-results',
  'playwright-report',
  '__pycache__',
])

/**
 * Natural (numeric) name order for folder and file labels.
 * @param left - one display name.
 * @param right - another display name.
 * @returns negative when left sorts before right.
 */
export function compareWriterNames(left: string, right: string): number {
  return left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

/**
 * Whether a directory name is hidden from discovery and listing.
 * @param name - basename.
 * @returns true when Dashboard would skip it.
 */
export function shouldIgnoreDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name) || (name.startsWith('.') && name !== '.story')
}

function joinRel(parent: string, name: string): string {
  return parent === '' || parent === '.' ? name : `${parent}/${name}`
}

function isUnderAnyPath(candidate: string, blockedPaths: readonly string[]): boolean {
  return blockedPaths.some((blocked) => {
    if (blocked === '' || blocked === '.') return false
    return candidate === blocked || candidate.startsWith(`${blocked}/`)
  })
}

function compareEntries(left: DirEntry, right: DirEntry): number {
  const leftDir = left.type === 'directory'
  const rightDir = right.type === 'directory'
  if (leftDir !== rightDir) return leftDir ? -1 : 1
  return compareWriterNames(left.name, right.name)
}

/**
 * Filter ignored directories / non file-dir entries and sort like Dashboard.
 * @param entries - raw listing.
 * @returns visible entries in tree order.
 */
export function visibleDirectoryEntries(entries: readonly DirEntry[]): DirEntry[] {
  return entries
    .filter((entry) => {
      if (entry.type === 'directory') return !shouldIgnoreDirectory(entry.name)
      return entry.type === 'file'
    })
    .sort(compareEntries)
}

/**
 * One page of a directory listing for lazy tree UI.
 * @param entries - already filtered and sorted children.
 * @param offset - zero-based start index.
 * @param pageSize - page length (default 200).
 * @returns the page slice and the next offset, or null when exhausted.
 */
export function pageDirectoryEntries(
  entries: readonly DirEntry[],
  offset: number,
  pageSize: number = DIRECTORY_PAGE_SIZE,
): { readonly entries: readonly DirEntry[], readonly nextOffset: number | null } {
  const start = Math.max(0, offset)
  const page = entries.slice(start, start + pageSize)
  const next = start + page.length
  return {
    entries: page,
    nextOffset: next < entries.length ? next : null,
  }
}

/**
 * Map a directory entry into a tree node under its parent path.
 * @param parentPath - workspace-relative parent (empty for workspace root).
 * @param entry - one child.
 * @returns directory shell or file node.
 */
export function entryToTreeNode(parentPath: string, entry: DirEntry): WriterTreeNode {
  const path = joinRel(parentPath === '.' ? '' : parentPath, entry.name)
  if (entry.type === 'directory') {
    return {
      kind: 'directory',
      name: entry.name,
      path,
      children: [],
      loaded: false,
      loading: false,
      shown: 0,
      truncated: false,
    }
  }
  const editable = isEditableWriterName(entry.name)
    && (entry.size === undefined || entry.size <= MAX_EDITABLE_FILE_BYTES)
  return entry.size === undefined
    ? { kind: 'file', name: entry.name, path, editable }
    : { kind: 'file', name: entry.name, path, editable, size: entry.size }
}

/**
 * Build children for one loaded directory page (or first page).
 * @param parentPath - directory path.
 * @param entries - filtered sorted children.
 * @param shown - how many to expose (page size).
 * @param truncated - whether `workspaceFiles.list` dropped entries.
 * @returns directory node fields for children / shown / truncated.
 */
export function buildLoadedChildren(
  parentPath: string,
  entries: readonly DirEntry[],
  shown: number,
  truncated: boolean,
): { readonly children: readonly WriterTreeNode[], readonly shown: number, readonly truncated: boolean } {
  const visible = visibleDirectoryEntries(entries)
  const count = Math.min(Math.max(shown, 0), visible.length)
  return {
    children: visible.slice(0, count).map(entry => entryToTreeNode(parentPath, entry)),
    shown: count,
    truncated,
  }
}

/**
 * Roots under `拆文库/{书}/` and legacy `拆文库-{书}/`.
 * @param readDir - list one workspace-relative directory (`''` for root).
 * @returns library roots and soft scan errors.
 */
export async function listLibraryRoots(
  readDir: (path: string) => Promise<readonly DirEntry[]>,
): Promise<{ readonly roots: WriterWorkspaceRoot[], readonly scanErrors: string[] }> {
  const roots: WriterWorkspaceRoot[] = []
  const scanErrors: string[] = []

  try {
    const standard = await readDir('拆文库')
    for (const entry of standard) {
      if (entry.type !== 'directory' || shouldIgnoreDirectory(entry.name)) continue
      const path = `拆文库/${entry.name}`
      roots.push({ path, name: entry.name, view: 'libraries' })
    }
  } catch {
    // Missing 拆文库 is normal; unreadable is recorded only when the dir exists but fails —
    // callers that can distinguish may pass errors separately. Treat throw as absent/unreadable soft skip.
  }

  let rootEntries: readonly DirEntry[]
  try {
    rootEntries = await readDir('')
  } catch (error) {
    scanErrors.push(error instanceof Error ? error.message : 'workspace_unreadable')
    return { roots, scanErrors }
  }

  for (const entry of rootEntries) {
    if (entry.type !== 'directory' || !entry.name.startsWith('拆文库-') || shouldIgnoreDirectory(entry.name)) continue
    roots.push({ path: entry.name, name: entry.name, view: 'libraries' })
  }

  roots.sort((left, right) => compareWriterNames(left.path, right.path))
  return { roots, scanErrors }
}

/**
 * Writing projects deep ≤3 with long/short markers, skipping library paths.
 * @param readDir - list one workspace-relative directory.
 * @param libraryPaths - relative paths of library roots to skip.
 * @param currentPath - path being inspected.
 * @param depth - depth from workspace root.
 * @param projects - accumulator.
 * @param scanErrors - soft errors.
 * @returns project roots.
 */
export async function findProjectRoots(
  readDir: (path: string) => Promise<readonly DirEntry[]>,
  libraryPaths: readonly string[],
  currentPath = '',
  depth = 0,
  projects: WriterWorkspaceRoot[] = [],
  scanErrors: string[] = [],
): Promise<WriterWorkspaceRoot[]> {
  if (depth > 3 || isUnderAnyPath(currentPath, libraryPaths)) return projects

  let entries: readonly DirEntry[]
  try {
    entries = await readDir(currentPath)
  } catch (error) {
    scanErrors.push(error instanceof Error ? error.message : `unreadable:${currentPath || '.'}`)
    return projects
  }

  const childDirectoryNames = new Set(
    entries.filter(entry => entry.type === 'directory').map(entry => entry.name),
  )
  const childFileNames = new Set(
    entries.filter(entry => entry.type === 'file').map(entry => entry.name),
  )
  const isLongProject = [...LONG_PROJECT_DIRECTORY_MARKERS].some(marker => childDirectoryNames.has(marker))
  const isShortProject = childFileNames.has(SHORT_PROJECT_BODY_FILE)
    && [...SHORT_PROJECT_COMPANION_FILES].some(marker => childFileNames.has(marker))
  if (isLongProject || isShortProject) {
    const path = currentPath
    const name = path === '' ? '.' : (path.split('/').pop() ?? path)
    projects.push({ path: path === '' ? '.' : path, name: name === '.' ? '.' : name, view: 'projects' })
    return projects
  }

  for (const entry of entries) {
    if (entry.type !== 'directory' || shouldIgnoreDirectory(entry.name)) continue
    await findProjectRoots(
      readDir,
      libraryPaths,
      joinRel(currentPath, entry.name),
      depth + 1,
      projects,
      scanErrors,
    )
  }
  return projects
}

/**
 * Scan workspace roots the way Dashboard `scanWorkspace` does.
 * @param readDir - list one workspace-relative directory.
 * @returns libraries, projects, and soft scan errors.
 */
export async function scanWriterWorkspace(
  readDir: (path: string) => Promise<readonly DirEntry[]>,
): Promise<WriterWorkspaceScan> {
  const { roots: libraries, scanErrors } = await listLibraryRoots(readDir)
  const libraryPaths = libraries.map(root => root.path)
  const projects = await findProjectRoots(readDir, libraryPaths, '', 0, [], scanErrors)
  projects.sort((left, right) => compareWriterNames(left.path, right.path))
  return { libraries, projects, scanErrors }
}

/**
 * Unloaded directory shell for a discovered root.
 * @param root - library or project root.
 * @returns directory node ready for lazy expand.
 */
export function rootToDirectoryNode(root: WriterWorkspaceRoot): Extract<WriterTreeNode, { kind: 'directory' }> {
  return {
    kind: 'directory',
    name: root.name === '.' ? root.path : root.name,
    path: root.path === '.' ? '' : root.path,
    children: [],
    loaded: false,
    loading: false,
    shown: 0,
    truncated: false,
  }
}

/**
 * Whether a folder should start expanded when the user has not toggled it yet.
 * Depth-0 roots default open (Dashboard first layer); deeper folders open when they
 * contain the selection. Explicit session toggles still win over this default.
 * @param path - directory path.
 * @param selected - active file path, if any.
 * @param depth - tree depth (0 = tab roots).
 * @returns default open state.
 */
export function defaultWriterTreeExpanded(path: string, selected: string | undefined, depth = 0): boolean {
  if (depth === 0) return true
  if (selected === undefined) return false
  return selected === path || selected.startsWith(`${path}/`)
}
