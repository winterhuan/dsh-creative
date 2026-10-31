import { classifyWriterPath, type WriterSection } from '../editable.ts'

export type { WriterSection }
export { classifyWriterPath, isEditableWriterPath } from '../editable.ts'

/** One directory entry, as `workspaceFiles.list` reports it. */
export interface DirEntry {
  readonly name: string
  readonly type: 'file' | 'directory' | 'other'
}

/** A markdown file the sidebar can open. */
export interface WriterFile {
  readonly path: string
  readonly name: string
  readonly section: WriterSection
}

/** Section / folder / file node for the workbench tree. */
export type WriterTreeNode =
  | {
    readonly kind: 'section'
    readonly section: WriterSection
    readonly name: string
    readonly children: readonly WriterTreeNode[]
  }
  | {
    readonly kind: 'directory'
    readonly name: string
    readonly path: string
    readonly children: readonly WriterTreeNode[]
  }
  | {
    readonly kind: 'file'
    readonly name: string
    readonly path: string
    readonly section: WriterSection
  }

/** Labels for the three section roots. */
export interface WriterTreeLabels {
  readonly setting: string
  readonly outline: string
  readonly chapters: string
}

/** Directories that are not books. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.agents', '.dsh', '拆文库', '对标'])

/** How deep to walk under 设定 / 大纲 / 细纲 / 正文. */
const BOOK_WALK_DEPTH = 5

const SECTION_ORDER: readonly WriterSection[] = ['setting', 'outline', 'chapter']

/**
 * Natural (numeric) name order for chapter and folder labels.
 * @param left - one display name.
 * @param right - another display name.
 * @returns negative when left sorts before right.
 */
export function compareWriterNames(left: string, right: string): number {
  return left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
}

/**
 * Whether a directory listing looks like an oh-story book.
 * @param entries - direct children.
 * @returns true when setting, outline, or prose markers are present.
 */
export function isBookEntries(entries: readonly DirEntry[]): boolean {
  return entries.some(entry => entry.name === '设定' || entry.name === '设定.md' || entry.name === '正文' || entry.name === '正文.md' || entry.name === '大纲' || entry.name === '大纲.md' || entry.name === '小节大纲.md')
}

function joinRel(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * Books at the workspace root and one level down.
 * @param readDir - list one workspace-relative directory.
 * @returns book prefixes; an empty string means the workspace root is the book.
 */
export async function findBooks(readDir: (path: string) => Promise<readonly DirEntry[]>): Promise<string[]> {
  const root = await readDir('')
  const books: string[] = []
  if (isBookEntries(root)) books.push('')
  for (const entry of root) {
    if (entry.type !== 'directory' || entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    if (isBookEntries(await readDir(entry.name))) books.push(entry.name)
  }
  return books
}

async function walk(readDir: (path: string) => Promise<readonly DirEntry[]>, directory: string, files: WriterFile[], depth: number): Promise<void> {
  let entries: readonly DirEntry[]
  try {
    entries = await readDir(directory)
  } catch {
    return
  }
  for (const entry of entries) {
    if (files.length >= 200) return
    const path = joinRel(directory, entry.name)
    if (entry.type === 'file') {
      const section = classifyWriterPath(path)
      if (section !== undefined) files.push({ path, name: entry.name, section })
    } else if (entry.type === 'directory' && depth > 0 && !entry.name.startsWith('.')) {
      await walk(readDir, path, files, depth - 1)
    }
  }
}

/**
 * Setting, outline, and chapter files under one book.
 * @param readDir - list one workspace-relative directory.
 * @param book - book prefix, or empty for the workspace root.
 * @returns files in discovery order (tree builders re-sort siblings).
 */
export async function collectBookFiles(readDir: (path: string) => Promise<readonly DirEntry[]>, book: string): Promise<WriterFile[]> {
  const files: WriterFile[] = []
  const top = await readDir(book)
  for (const entry of top) {
    if (entry.type !== 'file') continue
    const path = joinRel(book, entry.name)
    const section = classifyWriterPath(path)
    if (section !== undefined) files.push({ path, name: entry.name, section })
  }
  for (const dir of ['设定', '大纲', '细纲', '正文']) await walk(readDir, joinRel(book, dir), files, BOOK_WALK_DEPTH)
  const seen = new Set<string>()
  return files.filter((file) => {
    if (seen.has(file.path)) return false
    seen.add(file.path)
    return true
  })
}

/**
 * Label for the book picker.
 * @param book - book prefix.
 * @param workspaceLabel - copy used when the workspace root is the book.
 * @returns a short label.
 */
export function bookLabel(book: string, workspaceLabel: string): string {
  return book === '' ? workspaceLabel : book
}

/**
 * Path of a file relative to its section root folders (设定 / 大纲|细纲 / 正文).
 * Top-level book files (大纲.md, 设定.md, …) stay as their basename.
 * @param path - workspace-relative file path.
 * @param book - book prefix.
 * @param section - classified section.
 * @returns slash-separated path used to nest the tree under that section.
 */
export function relativeWithinSection(path: string, book: string, section: WriterSection): string {
  const root = book === '' ? '' : `${book}/`
  const prefixes =
    section === 'setting' ? [`${root}设定/`]
      : section === 'chapter' ? [`${root}正文/`]
        : [`${root}大纲/`, `${root}细纲/`]
  for (const prefix of prefixes) {
    if (path.startsWith(prefix)) return path.slice(prefix.length)
  }
  if (root !== '' && path.startsWith(root)) return path.slice(root.length)
  return path
}

interface MutableDir {
  readonly name: string
  readonly path: string
  readonly directories: Map<string, MutableDir>
  readonly files: Extract<WriterTreeNode, { kind: 'file' }>[]
}

function mutableDir(name: string, path: string): MutableDir {
  return { name, path, directories: new Map(), files: [] }
}

function compareNodes(left: WriterTreeNode, right: WriterTreeNode): number {
  if (left.kind !== right.kind) {
    if (left.kind === 'directory') return -1
    if (right.kind === 'directory') return 1
  }
  return compareWriterNames(left.name, right.name)
}

function freezeDir(value: MutableDir): readonly WriterTreeNode[] {
  const directories: WriterTreeNode[] = [...value.directories.values()].map(child => ({
    kind: 'directory' as const,
    name: child.name,
    path: child.path,
    children: freezeDir(child),
  }))
  const files: WriterTreeNode[] = [...value.files]
  return [...directories, ...files].sort(compareNodes)
}

function nestSectionFiles(files: readonly WriterFile[], book: string, section: WriterSection): readonly WriterTreeNode[] {
  const root = mutableDir(section, `section:${section}`)
  for (const file of files) {
    const relative = relativeWithinSection(file.path, book, section)
    const segments = relative.split('/').filter(segment => segment !== '')
    const name = segments.pop()
    if (name === undefined) continue
    let parent = root
    const prefixParts: string[] = []
    for (const segment of segments) {
      prefixParts.push(segment)
      const dirPath = `${section}:${prefixParts.join('/')}`
      const child = parent.directories.get(segment) ?? mutableDir(segment, dirPath)
      parent.directories.set(segment, child)
      parent = child
    }
    parent.files.push({ kind: 'file', name, path: file.path, section })
  }
  return freezeDir(root)
}

/**
 * Group editable files into section roots with nested folders, naturally sorted.
 * Empty sections are omitted.
 * @param files - files from `collectBookFiles`.
 * @param book - book prefix used to strip section roots.
 * @param labels - display names for 设定 / 大纲 / 章节.
 * @returns section nodes in fixed order.
 */
export function buildWriterTree(
  files: readonly WriterFile[],
  book: string,
  labels: WriterTreeLabels,
): readonly WriterTreeNode[] {
  const bySection = new Map<WriterSection, WriterFile[]>()
  for (const section of SECTION_ORDER) bySection.set(section, [])
  for (const file of files) {
    bySection.get(file.section)?.push(file)
  }
  const labelFor = (section: WriterSection): string =>
    section === 'setting' ? labels.setting : section === 'outline' ? labels.outline : labels.chapters
  const nodes: WriterTreeNode[] = []
  for (const section of SECTION_ORDER) {
    const group = bySection.get(section) ?? []
    if (group.length === 0) continue
    nodes.push({
      kind: 'section',
      section,
      name: labelFor(section),
      children: nestSectionFiles(group, book, section),
    })
  }
  return nodes
}

/**
 * Stable key for expand/collapse state.
 * @param node - section or directory node.
 * @returns a key unique within one book tree.
 */
export function writerTreeExpandKey(node: Extract<WriterTreeNode, { kind: 'section' | 'directory' }>): string {
  return node.kind === 'section' ? `section:${node.section}` : node.path
}

/**
 * Whether a folder should start expanded when the user has not toggled it yet.
 * Sections default open; directories open when they contain the selection.
 * @param key - expand key.
 * @param selected - active file path, if any.
 * @returns default open state.
 */
export function defaultWriterTreeExpanded(key: string, selected: string | undefined): boolean {
  if (key.startsWith('section:')) return true
  if (selected === undefined) return false
  // directory keys look like `chapter:第一卷` or `setting:角色/甲组`
  const marker = key.indexOf(':')
  if (marker <= 0) return false
  const relative = key.slice(marker + 1)
  if (relative === '') return false
  return selected.includes(`/${relative}/`) || selected.endsWith(`/${relative}`)
}
