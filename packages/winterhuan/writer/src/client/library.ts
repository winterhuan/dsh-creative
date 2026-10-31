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

/** Directories that are not books. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.agents', '.dsh', '拆文库', '对标'])

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
 * @returns files in path order.
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
  for (const dir of ['设定', '大纲', '细纲', '正文']) await walk(readDir, joinRel(book, dir), files, 1)
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
