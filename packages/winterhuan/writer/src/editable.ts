/** Workspace-relative paths the writing sidebar may save. */

/** File extensions Dashboard and the sidebar treat as editable. */
export const EDITABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml'])

export type WriterSection = 'setting' | 'outline' | 'chapter'

/**
 * Lowercase extension of a basename, including the leading dot.
 * @param name - file basename or relative path.
 * @returns extension such as `.md`, or `''` when none.
 */
export function writerExtension(name: string): string {
  const base = name.includes('/') ? (name.split('/').pop() ?? name) : name
  const index = base.lastIndexOf('.')
  return index >= 0 ? base.slice(index).toLowerCase() : ''
}

/**
 * Whether a basename uses an editable extension.
 * @param name - file basename or relative path.
 * @returns true for md / txt / json / yaml / yml / toml.
 */
export function isEditableWriterName(name: string): boolean {
  return EDITABLE_EXTENSIONS.has(writerExtension(name))
}

/**
 * Classify one workspace-relative markdown path into a book section.
 * Kept for callers that still want 设定 / 大纲 / 正文 grouping; the save gate is extension-based.
 * @param relativePath - path relative to the session workspace, `/` separated.
 * @returns the sidebar section, or undefined when the path is not part of the book markers.
 */
export function classifyWriterPath(relativePath: string): WriterSection | undefined {
  if (!safeRelative(relativePath) || !relativePath.endsWith('.md')) return undefined
  const parts = relativePath.split('/')
  const file = parts[parts.length - 1] ?? ''
  const dirs = parts.slice(0, -1)
  if (file === '小节大纲.md' || file === '大纲.md' || file === '细纲.md' || file === '总纲.md' || file === '卷纲.md' || dirs.includes('大纲') || dirs.includes('细纲')) return 'outline'
  if (file === '设定.md' || dirs.includes('设定')) return 'setting'
  if (file === '正文.md' || dirs.includes('正文')) return 'chapter'
  return undefined
}

/**
 * Accept only a relative path the sidebar is allowed to write.
 * @param path - candidate workspace-relative path.
 * @returns whether a save may target it.
 */
export function isEditableWriterPath(path: string): boolean {
  return safeRelative(path) && isEditableWriterName(path)
}

/**
 * Reject absolute paths, backslashes, and parent segments.
 * @param path - candidate path.
 * @returns whether every segment stays inside the workspace.
 */
export function safeRelative(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}
