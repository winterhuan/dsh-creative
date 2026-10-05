/** Pure project discovery shared by the workspace API, writing guards, and Client. */

/** Supported creative domains. */
export type CreativeDomain = 'story' | 'analysis'

/** Story directories inside one named child of the workspace. */
export const STORY_DIRECTORIES = ['正文', '大纲', '设定', '追踪', '对标', '参考资料'] as const
/** Standalone documents at a project root. */
export const PROJECT_FILES: readonly string[] = ['正文.md', '设定.md', '小节大纲.md']
/** Shared analysis lives outside book directories. */
export const STORY_LIBRARY_DIRECTORY = '拆文库'

const storyDirectories = new Set<string>(STORY_DIRECTORIES)
const projectFiles = new Set<string>(PROJECT_FILES)

/** A normalized workspace path with its owning project and document role. */
export interface CreativeProjectPath {
  readonly path: string
  /** Workspace-relative owner; shared analysis has no book and uses the empty string. */
  readonly projectRoot: string
  readonly relativePath: string
  readonly domain: CreativeDomain
  readonly role: 'body' | 'outline' | 'tracking' | 'document'
}

function pathText(raw: string): string | undefined {
  const path = raw.replaceAll('\\', '/')
  if (!path.startsWith('file:')) return path
  try {
    const url = new URL(path)
    if (url.search !== '' || url.hash !== '') return undefined
    const pathname = decodeURIComponent(url.pathname)
    return url.hostname !== '' && url.hostname !== 'localhost'
      ? `//${url.hostname}${pathname}`
      : pathname.replace(/^\/([a-z]:\/)/iu, '$1')
  } catch {
    return undefined
  }
}

/**
 * Normalize a relative path or a path inside the supplied workspace, without filesystem access.
 * @param raw - native path or URI from a tool, file opener, or workspace request.
 * @param cwd - workspace root required for absolute paths and URIs.
 * @returns a relative path, or undefined for invalid paths and workspace escapes.
 */
export function workspaceRelativePath(raw: string | undefined, cwd?: string): string | undefined {
  if (raw === undefined || raw === '' || raw.includes('\0')) return undefined
  const candidate = pathText(raw)
  const root = cwd === undefined ? undefined : pathText(cwd)?.replace(/\/+$/u, '')
  if (candidate === undefined) return undefined
  const absolute = candidate.startsWith('/') || /^[a-z][a-z\d+.-]*:/iu.test(candidate)
  let relative = candidate
  if (absolute) {
    if (root === undefined) return undefined
    const windows = /^[a-z]:\//iu.test(root) || root.startsWith('//')
    const inside = windows ? candidate.toLowerCase().startsWith(`${root.toLowerCase()}/`) : candidate.startsWith(`${root}/`)
    if (!inside) return undefined
    relative = candidate.slice(root.length + 1)
  }
  const segments: string[] = []
  for (const segment of relative.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return undefined
      segments.pop()
    } else {
      if (segment.startsWith('.')) return undefined
      segments.push(segment)
    }
  }
  return segments.length === 0 ? undefined : segments.join('/')
}

function domainForLeaf(leaf: string, single: boolean): CreativeDomain | undefined {
  if (storyDirectories.has(leaf)) return 'story'
  if (single && projectFiles.has(leaf)) return 'story'
  return undefined
}

/**
 * Resolve named workspace-child novels and the separate shared analysis library.
 * @param raw - file or directory path, optionally absolute or a URI.
 * @param cwd - workspace root used to scope absolute paths.
 * @returns project identity and role, or undefined outside the supported layouts.
 */
export function parseCreativePath(raw: string | undefined, cwd?: string): CreativeProjectPath | undefined {
  const path = workspaceRelativePath(raw, cwd)
  if (path === undefined) return undefined
  const segments = path.split('/')
  const [first = ''] = segments
  if (first === STORY_LIBRARY_DIRECTORY) {
    return { path, projectRoot: '', relativePath: path, domain: 'analysis', role: 'document' }
  }
  let prefix = 0
  let leaf = first
  let domain = domainForLeaf(first, segments.length === 1)
  if (domain === 'story') return undefined
  if (domain === undefined) {
    prefix = 1
    leaf = segments[prefix] ?? ''
    domain = domainForLeaf(leaf, segments.length === prefix + 1)
  }
  if (domain === undefined) return undefined
  const projectRoot = segments.slice(0, prefix).join('/')
  const body = segments.slice(prefix)
  const relativePath = body.join('/')
  const role = leaf === '正文' || leaf === '正文.md' ? 'body'
    : leaf === '大纲' || leaf === '小节大纲.md' ? 'outline'
      : leaf === '追踪' ? 'tracking'
        : 'document'
  return { path, projectRoot, relativePath, domain, role }
}

/**
 * Limit workbench files to named child novels and the workspace's shared analysis library.
 * @param path - parsed creative path, including layouts supported by the writing tools.
 * @returns whether the story editor supports this project's depth and domain.
 */
export function isStoryWorkbenchPath(path: CreativeProjectPath | undefined): path is CreativeProjectPath {
  return path?.domain === 'analysis' || path?.domain === 'story' && path.projectRoot !== '' && !path.projectRoot.includes('/')
}

/**
 * Join a known project root to one project-relative path.
 * @param root - workspace-relative root, empty for a workspace project.
 * @param relativePath - path inside the project.
 * @returns the full workspace-relative path.
 */
export function projectPath(root: string, relativePath: string): string {
  return root === '' ? relativePath : `${root}/${relativePath}`
}

/**
 * Apply the text-extension policy for a parsed creative path.
 * @param path - recognized project path.
 * @returns whether the workbench can edit this file as text.
 */
export function isCreativeTextPath(path: CreativeProjectPath): boolean {
  return /\.(?:md|txt|json|jsonl)$/iu.test(path.path)
}
