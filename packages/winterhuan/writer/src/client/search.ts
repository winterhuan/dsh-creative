/** Filename search scoped to the active Dashboard tab (client-side walk). */
import { isEditableWriterName } from '../editable.ts'
import {
  compareWriterNames,
  MAX_EDITABLE_FILE_BYTES,
  shouldIgnoreDirectory,
  visibleDirectoryEntries,
  type DirEntry,
} from './library.ts'

/** Align with Dashboard `MAX_SEARCH_RESULTS`. */
export const MAX_SEARCH_RESULTS = 100
/** Align with Dashboard `MAX_SEARCH_NODES`. */
export const MAX_SEARCH_NODES = 5000
/** Align with Dashboard `MAX_SEARCH_DEPTH`. */
export const MAX_SEARCH_DEPTH = 20
/** Align with Dashboard search debounce. */
export const SEARCH_DEBOUNCE_MS = 180
/** Align with Dashboard query length cap. */
export const MAX_SEARCH_QUERY_LENGTH = 100

/** One filename hit under the active tab. */
export interface WriterSearchHit {
  readonly name: string
  readonly path: string
  readonly editable: boolean
  readonly size?: number
}

/** Why a search stopped early. */
export interface WriterSearchTruncation {
  readonly byResults: boolean
  readonly byNodes: boolean
  readonly byDepth: boolean
  readonly byReadError: boolean
}

/** Limits echoed for truncation copy. */
export interface WriterSearchLimits {
  readonly maxResults: number
  readonly maxNodes: number
  readonly maxDepth: number
}

/** Result of a scoped filename walk. */
export interface WriterSearchResult {
  readonly query: string
  readonly results: readonly WriterSearchHit[]
  readonly truncated: boolean
  readonly truncation: WriterSearchTruncation
  readonly scanErrors: readonly string[]
  readonly limits: WriterSearchLimits
}

export type WriterSearchListDir = (path: string) => Promise<{
  readonly entries: readonly DirEntry[]
  readonly truncated: boolean
}>

function basename(path: string): string {
  if (path === '' || path === '.') return path
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

function joinRel(parent: string, name: string): string {
  return parent === '' || parent === '.' ? name : `${parent}/${name}`
}

/**
 * Walk tab roots and collect files whose basename contains the query (zh-CN case fold).
 * @param roots - workspace-relative root paths for the active tab.
 * @param queryValue - raw search box text.
 * @param listDir - list one directory (same shape as desk `readDir`).
 * @param signal - optional abort.
 * @returns hits, truncation flags, and soft errors.
 */
export async function searchWriterFilenames(
  roots: readonly string[],
  queryValue: string,
  listDir: WriterSearchListDir,
  signal?: AbortSignal,
): Promise<WriterSearchResult> {
  const query = queryValue.trim()
  const limits: WriterSearchLimits = {
    maxResults: MAX_SEARCH_RESULTS,
    maxNodes: MAX_SEARCH_NODES,
    maxDepth: MAX_SEARCH_DEPTH,
  }
  const emptyTruncation: WriterSearchTruncation = {
    byResults: false,
    byNodes: false,
    byDepth: false,
    byReadError: false,
  }
  if (query === '' || query.length > MAX_SEARCH_QUERY_LENGTH) {
    return {
      query,
      results: [],
      truncated: false,
      truncation: emptyTruncation,
      scanErrors: [],
      limits,
    }
  }

  const normalizedQuery = query.toLocaleLowerCase('zh-CN')
  const results: WriterSearchHit[] = []
  const scanErrors: string[] = []
  let nodes = 0
  let truncatedByResults = false
  let truncatedByNodes = false
  let truncatedByDepth = false

  const visit = async (relativePath: string, depth: number): Promise<void> => {
    if (signal?.aborted) return
    if (results.length >= MAX_SEARCH_RESULTS) {
      truncatedByResults = true
      return
    }
    if (nodes >= MAX_SEARCH_NODES) {
      truncatedByNodes = true
      return
    }
    if (depth > MAX_SEARCH_DEPTH) {
      truncatedByDepth = true
      return
    }
    nodes += 1

    let page: { entries: readonly DirEntry[], truncated: boolean }
    try {
      page = await listDir(relativePath)
    } catch (error) {
      scanErrors.push(error instanceof Error ? error.message : `unreadable:${relativePath || '.'}`)
      return
    }
    if (signal?.aborted) return

    // Treat a successful list as a directory visit: match files among children.
    for (const entry of visibleDirectoryEntries(page.entries)) {
      if (results.length >= MAX_SEARCH_RESULTS) {
        truncatedByResults = true
        break
      }
      if (nodes >= MAX_SEARCH_NODES) {
        truncatedByNodes = true
        break
      }
      const childPath = joinRel(relativePath === '.' ? '' : relativePath, entry.name)
      if (entry.type === 'file') {
        if (depth + 1 > MAX_SEARCH_DEPTH) {
          truncatedByDepth = true
          continue
        }
        nodes += 1
        if (entry.name.toLocaleLowerCase('zh-CN').includes(normalizedQuery)) {
          const editable = isEditableWriterName(entry.name)
            && (entry.size === undefined || entry.size <= MAX_EDITABLE_FILE_BYTES)
          results.push(entry.size === undefined
            ? { name: entry.name, path: childPath, editable }
            : { name: entry.name, path: childPath, editable, size: entry.size })
        }
        continue
      }
      if (entry.type === 'directory') {
        if (shouldIgnoreDirectory(entry.name)) continue
        await visit(childPath, depth + 1)
      }
    }
    if (page.truncated) truncatedByNodes = true
  }

  for (const root of roots) {
    if (truncatedByResults || truncatedByNodes) break
    if (signal?.aborted) break
    const start = root === '.' ? '' : root
    // Root directory itself counts as depth 0; list its children via visit.
    // Match files under the root, and also the root path if it were a file (roots are dirs).
    await visit(start, 0)
  }

  results.sort((left, right) => {
    const byName = compareWriterNames(left.name, right.name)
    return byName !== 0 ? byName : compareWriterNames(left.path, right.path)
  })

  const truncation: WriterSearchTruncation = {
    byResults: truncatedByResults,
    byNodes: truncatedByNodes,
    byDepth: truncatedByDepth,
    byReadError: scanErrors.length > 0,
  }
  const truncated = truncation.byResults || truncation.byNodes || truncation.byDepth || truncation.byReadError
  return { query, results, truncated, truncation, scanErrors, limits }
}

/**
 * Build human truncation hints (Dashboard copy shape).
 * @param truncation - flags from a search.
 * @param limits - numeric caps.
 * @param scanErrors - soft list failures.
 * @param format - number formatter.
 * @returns joined messages, or empty when nothing truncated.
 */
export function writerSearchTruncationMessage(
  truncation: WriterSearchTruncation,
  limits: WriterSearchLimits,
  scanErrors: readonly string[],
  format: (value: number) => string = value => value.toLocaleString('zh-CN'),
): string {
  const messages: string[] = []
  if (truncation.byResults) {
    messages.push(`匹配结果超过 ${format(limits.maxResults)} 条，仅显示最先找到的部分，请输入更精确的文件名`)
  }
  if (truncation.byNodes) {
    messages.push(`搜索达到 ${format(limits.maxNodes)} 个节点的扫描上限，后续目录尚未检查，请直接展开目标目录查找`)
  }
  if (truncation.byDepth) {
    messages.push(`部分目录超过 ${format(limits.maxDepth)} 层，更深处未搜索；其他项目已继续搜索`)
  }
  if (truncation.byReadError) {
    const shown = scanErrors.slice(0, 3).join('、') || '部分目录'
    const more = scanErrors.length > 3 ? `等 ${format(scanErrors.length)} 处` : ''
    messages.push(`${shown}${more}无法读取，搜索结果可能不完整`)
  }
  return messages.join('；')
}

export { basename as searchHitBasename }
