/** Editor-shell helpers aligned with Dashboard document chrome. */
import type { WriterTreeNode } from './library.ts'
import { writerExtension } from '../editable.ts'
import { applyEol, type WriterEol } from './eol.ts'

/**
 * Format a byte length the way Dashboard `formatBytes` does.
 * @param bytes - non-negative size.
 * @returns a short human label.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

/**
 * UTF-8 size of editor text as it would be written with the file EOL.
 * @param content - LF editor text.
 * @param eol - style restored on save.
 * @returns byte length.
 */
export function editorByteSize(content: string, eol: WriterEol): number {
  return new TextEncoder().encode(applyEol(content, eol)).length
}

/**
 * Uppercase extension label for the status bar (no leading dot).
 * @param name - file basename or relative path.
 * @returns e.g. `MD`, or empty when unknown.
 */
export function fileExtensionLabel(name: string): string {
  const ext = writerExtension(name)
  return ext === '' ? '' : ext.slice(1).toUpperCase()
}

/**
 * Split a relative workspace path into breadcrumb segments.
 * @param path - POSIX-style relative path.
 * @returns non-empty parts; empty path yields `[]`.
 */
export function breadcrumbSegments(path: string): readonly string[] {
  return path.split('/').filter(part => part !== '')
}

/**
 * Count file nodes already present in lazy trees (Dashboard `loadedFileCount`).
 * @param nodes - library and/or project roots.
 * @returns unique-path-safe count of loaded file rows.
 */
export function countLoadedFiles(nodes: readonly WriterTreeNode[]): number {
  const paths = new Set<string>()
  const visit = (list: readonly WriterTreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'file') {
        paths.add(node.path)
        continue
      }
      visit(node.children)
    }
  }
  visit(nodes)
  return paths.size
}

/**
 * Masthead 文稿 label: `按需` until something is expanded, else `N+`.
 * @param count - {@link countLoadedFiles} result.
 * @param onDemand - copy for zero.
 * @param loaded - copy with `{n}` for a positive count.
 * @returns display text.
 */
export function loadedFilesLabel(count: number, onDemand: string, loaded: string): string {
  if (count <= 0) return onDemand
  return loaded.replace('{n}', String(count))
}
