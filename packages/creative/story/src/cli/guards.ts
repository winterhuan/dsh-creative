/**
 * Path and scope guards for `dsh-story`.
 *
 * Runners receive paths that have already passed these checks. A guard
 * failure is a `CliError` and does not write.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RESERVED_BOOKS = new Set(['长篇', '短篇', '拆文库', '正文', '大纲', '设定', '追踪', '对标', '参考资料'])

/** An argument or guard failure reported as a `story-cli-error/v1` document. */
export class CliError extends Error {
  constructor(message: string, readonly code = 'INVALID_ARGUMENT', readonly exitCode = 2) {
    super(message)
    this.name = 'CliError'
  }
}

/** Resolve symlinks as far as the path exists, like Python's non-strict `Path.resolve()`. */
export function looseRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(looseRealpath(parent), basename(path))
  }
}

export function within(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep)
}

export function workspacePath(raw: string): string {
  const path = looseRealpath(resolve(raw))
  if (statSync(path, { throwIfNoEntry: false })?.isDirectory() !== true) throw new CliError(`workspace directory does not exist: ${raw}`)
  return path
}

export function filePath(raw: string, project: string | undefined, output = false): string {
  const base = project === undefined ? undefined : looseRealpath(project)
  const path = looseRealpath(base !== undefined && !isAbsolute(raw) ? join(base, raw) : resolve(raw))
  if (base !== undefined && !within(base, path)) throw new CliError(`file leaves selected book: ${raw}`)
  if (!output && statSync(path, { throwIfNoEntry: false })?.isFile() !== true) throw new CliError(`file does not exist: ${path}`)
  return path
}

export function bookPath(workspace: string, name: string, create = false): string {
  if (name === '' || name !== name.trim() || name.startsWith('.') || RESERVED_BOOKS.has(name) || /[/\\:\0]/.test(name)) {
    throw new CliError('--book must be one work name, not a path, category, or shared library')
  }
  const path = join(workspace, name)
  const resolved = looseRealpath(path)
  if (resolved !== path || dirname(resolved) !== workspace) throw new CliError('book must be a real direct child of the selected workspace')
  const info = statSync(path, { throwIfNoEntry: false })
  if (info !== undefined && !info.isDirectory()) throw new CliError(`book is not a directory: ${path}`)
  if (info === undefined && !create) throw new CliError(`book directory does not exist: ${path}`)
  // These are the roots used by the internal chapter and tracking operations.
  for (const child of ['正文', '大纲', '设定', '追踪']) {
    if (!within(path, looseRealpath(join(path, child)))) throw new CliError(`book resource leaves the selected work: ${child}`)
  }
  filePath(join(path, '设定/写作检查.json'), path, true)
  return path
}

export function readObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(filePath(path, undefined), 'utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new CliError('input JSON must be an object')
  return value as Record<string, unknown>
}

/** Protect generated views and existing transaction files from symlink escapes. */
export function containedTree(root: string, directory: string): void {
  const base = looseRealpath(root)
  const check = (path: string): void => {
    if (!within(base, looseRealpath(path))) throw new CliError(`resource leaves selected scope: ${path}`)
  }
  check(directory)
  if (statSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) return
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      check(path)
      if (statSync(path, { throwIfNoEntry: false })?.isDirectory() === true) walk(path)
    }
  }
  walk(directory)
}

export function reportParts(relative: string, extension = '.md'): string[] {
  if (relative === '' || relative.includes('\0') || isAbsolute(relative)) throw new CliError(`report path must stay inside the book: ${relative}`)
  const parts = relative.replaceAll('\\', '/').split('/')
  if (parts.some(part => part === '' || part === '.' || part === '..')) throw new CliError(`report path must stay inside the book: ${relative}`)
  if (!parts[parts.length - 1]?.endsWith(extension) || parts[0] === '追踪') {
    throw new CliError(`report path must be a ${extension} file inside the book and outside 追踪: ${relative}`)
  }
  return parts
}

export function pathInfo(path: string, relative: string) {
  try {
    return lstatSync(path, { throwIfNoEntry: false })
  } catch {
    throw new CliError(`report path is not a directory: ${relative}`)
  }
}

/** Reject a report path that leaves the book, uses a symlink, or is not Markdown. Does not create directories. */
export function assertReportPath(book: string, relative: string, extension = '.md'): void {
  const root = looseRealpath(book)
  let current = root
  for (const part of reportParts(relative, extension)) {
    const next = join(current, part)
    const info = pathInfo(next, relative)
    if (info?.isSymbolicLink() === true) throw new CliError(`report path contains a symlink: ${relative}`)
    if (info === undefined) return
    if (!within(root, looseRealpath(next))) throw new CliError(`report path leaves the book: ${relative}`)
    current = next
  }
  const leaf = pathInfo(current, relative)
  if (leaf?.isSymbolicLink() === true) throw new CliError(`report path contains a symlink: ${relative}`)
  if (leaf?.isFile() !== true) throw new CliError(`report path is not a file: ${relative}`)
}

/** Create missing parent directories and return the file to write. Rechecks symlinks. */
export function prepareReportFile(book: string, relative: string, extension = '.md'): string {
  const root = looseRealpath(book)
  const parts = reportParts(relative, extension)
  let current = root
  for (let index = 0; index < parts.length; index += 1) {
    const next = join(current, parts[index] ?? '')
    const info = pathInfo(next, relative)
    if (info?.isSymbolicLink() === true) throw new CliError(`report path contains a symlink: ${relative}`)
    const last = index === parts.length - 1
    if (!last) {
      if (info === undefined) mkdirSync(next)
      else if (!info.isDirectory()) throw new CliError(`report path is not a directory: ${relative}`)
    } else if (info !== undefined && !info.isFile()) throw new CliError(`report path is not a file: ${relative}`)
    const real = last && info === undefined ? looseRealpath(current) : looseRealpath(next)
    if (!within(root, real)) throw new CliError(`report path leaves the book: ${relative}`)
    current = next
  }
  return current
}

/** Locate the package root (holding `knowledge/`) from either the source tree or the built `lib/`. */
export function packageRoot(): string {
  let directory = dirname(fileURLToPath(import.meta.url))
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join(directory, 'package.json')) && existsSync(join(directory, 'knowledge'))) return directory
    directory = dirname(directory)
  }
  throw new CliError('dsh-story package root is missing its knowledge directory', 'TOOL_UNAVAILABLE', 3)
}

export function text(values: Record<string, unknown>, name: string): string {
  const value = values[name]
  return typeof value === 'string' ? value : ''
}

export function integer(values: Record<string, unknown>, name: string): number | undefined {
  const value = values[name]
  return typeof value === 'number' ? value : undefined
}

export function chapterSpan(raw: string): [number, number] {
  const matched = /^(\d+)-(\d+)$/u.exec(raw.trim())
  if (matched?.[1] === undefined || matched[2] === undefined) throw new CliError('--chapters must be FROM-TO')
  const from = Number(matched[1])
  const to = Number(matched[2])
  if (from < 1 || to < from) throw new CliError('--chapters must be a positive range')
  return [from, to]
}
export function sectionNames(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const names = value.split(/[、,，]/u).map(item => item.trim()).filter(item => item !== '')
  if (names.length === 0) throw new CliError('--sections needs at least one heading')
  return names
}
