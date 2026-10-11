/**
 * Append one cross-domain adaptation edge to the workspace lineage ledger.
 *
 * Port of `tests/reference/record_lineage.py`. The ledger lives at the workspace root
 * as `改编谱系.jsonl`, one JSON object per line, append-only: the adapting
 * agent records one edge at intake with a fingerprint of the source as it was
 * read, and a later review recomputes the fingerprint instead of trusting
 * prose. Fingerprints cover files (sha256 of bytes) and directories (sha256 of
 * the sorted `relative-path:sha256` listing); symlinked entries fail instead
 * of being silently omitted.
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pythonJson } from './json.ts'

/** Domains an edge may connect. */
export const LINEAGE_DOMAINS = ['novel', 'drama', 'game', 'video', 'media'] as const
const SCHEMA_VERSION = 1
/** The ledger file name at the workspace root. */
export const LEDGER_NAME = '改编谱系.jsonl'
const MAX_HASH_BYTES = 256 * 1024 * 1024

/** Expected lineage failure. */
export class LineageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LineageError'
  }
}

/** One recorded edge. */
export interface LineageEdge {
  readonly schema_version: number
  readonly at: string
  readonly from: { readonly domain: string; readonly path: string; readonly sha256: string }
  readonly to: { readonly domain: string; readonly path: string }
  readonly decisions: readonly string[]
  readonly by: string
}

/** UTC timestamp like Python's `isoformat()` with microseconds and a `Z` suffix. */
function utcNow(): string {
  const iso = new Date().toISOString()
  return `${iso.slice(0, 23)}000Z`
}

/** Resolve symlinks as far as the path exists, like Python's non-strict `Path.resolve()`. */
function looseRealpath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    const parent = dirname(path)
    return parent === path ? path : join(looseRealpath(parent), basename(path))
  }
}

function relativeToRoot(workspaceRoot: string, raw: string, mustExist: boolean): string {
  const resolved = looseRealpath(isAbsolute(raw) ? raw : join(workspaceRoot, raw))
  const root = looseRealpath(workspaceRoot)
  if (!(resolved === root || resolved.startsWith(root + sep))) throw new LineageError(`lineage path escapes the workspace: ${raw}`)
  if (mustExist && !existsSync(resolved)) throw new LineageError(`lineage source does not exist: ${raw}`)
  return resolved
}

/** Python sorts `Path` objects component-wise, which differs from plain string order around `/`. */
function compareParts(left: string, right: string): number {
  const a = left.split(sep)
  const b = right.split(sep)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const x = a[index] ?? ''
    const y = b[index] ?? ''
    if (x !== y) return x < y ? -1 : 1
  }
  return a.length - b.length
}

function descendants(directory: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(directory)) {
    const path = join(directory, name)
    found.push(path)
    if (!lstatSync(path).isSymbolicLink() && statSync(path).isDirectory()) found.push(...descendants(path))
  }
  return found
}

/**
 * Hash one workspace file or directory for an edge source.
 * @param path - the source path.
 * @returns the hex digest.
 * @throws LineageError for a missing, symlinked, unreadable or oversized source.
 */
export function fingerprint(path: string): string {
  const info = lstatSync(path, { throwIfNoEntry: false })
  if (info === undefined || info.isSymbolicLink()) throw new LineageError(`lineage source is missing: ${path}`)
  if (info.isFile()) {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex')
    } catch {
      throw new LineageError(`lineage source is unreadable: ${path}`)
    }
  }
  if (!info.isDirectory()) throw new LineageError(`lineage source is not a file or directory: ${path}`)
  const entries: string[] = []
  let total = 0
  for (const child of descendants(path).sort(compareParts)) {
    if (lstatSync(child).isSymbolicLink()) throw new LineageError(`lineage source contains a symlink: ${child}`)
    if (!statSync(child).isFile()) continue
    let content: Buffer
    try {
      content = readFileSync(child)
    } catch {
      throw new LineageError(`lineage source is unreadable: ${child}`)
    }
    total += content.byteLength
    if (total > MAX_HASH_BYTES) throw new LineageError(`lineage source exceeds the hash budget: ${path}`)
    entries.push(`${relative(path, child).split(sep).join('/')}:${createHash('sha256').update(content).digest('hex')}`)
  }
  return createHash('sha256').update(`${entries.join('\n')}\n`, 'utf8').digest('hex')
}

/** Options of {@link recordEdge}. */
export interface EdgeOptions {
  readonly fromDomain: string
  readonly fromPath: string
  readonly toDomain: string
  readonly toPath: string
  readonly decisions?: readonly string[]
  readonly by?: string
}

/**
 * Append one adaptation edge and return it.
 * @param workspaceRoot - the workspace holding the ledger.
 * @param options - the edge; the source must exist, the target is a workspace-relative address that may not exist yet.
 * @returns the recorded edge.
 * @throws LineageError for an invalid domain, path, decision or author.
 */
export function recordEdge(workspaceRoot: string, options: EdgeOptions): LineageEdge {
  if (statSync(workspaceRoot, { throwIfNoEntry: false })?.isDirectory() !== true) throw new LineageError(`workspace root is not a directory: ${workspaceRoot}`)
  const domains: readonly string[] = LINEAGE_DOMAINS
  if (!domains.includes(options.fromDomain)) throw new LineageError(`lineage source domain must be one of ${LINEAGE_DOMAINS.join(', ')}`)
  if (!domains.includes(options.toDomain)) throw new LineageError(`lineage target domain must be one of ${LINEAGE_DOMAINS.join(', ')}`)
  const decisions = options.decisions ?? []
  for (const decision of decisions) {
    if (typeof decision !== 'string' || decision.trim() === '') throw new LineageError('lineage decisions must be non-empty strings')
  }
  const by = options.by ?? 'agent'
  if (typeof by !== 'string' || by.trim() === '') throw new LineageError('lineage author must be a non-empty string')
  const root = looseRealpath(resolve(workspaceRoot))
  const source = relativeToRoot(root, options.fromPath, true)
  const targetRaw = options.toPath.replaceAll('\\', '/')
  if (targetRaw === '' || targetRaw === '.' || targetRaw === './' || targetRaw.startsWith('/') || targetRaw.split('/').includes('..')) {
    throw new LineageError(`lineage target must be a workspace-relative path: ${options.toPath}`)
  }
  const entry: LineageEdge = {
    schema_version: SCHEMA_VERSION,
    at: utcNow(),
    from: { domain: options.fromDomain, path: relative(root, source).split(sep).join('/'), sha256: fingerprint(source) },
    to: { domain: options.toDomain, path: targetRaw },
    decisions: [...decisions],
    by: by.trim(),
  }
  appendFileSync(join(root, LEDGER_NAME), `${pythonJson(entry, 'default', false)}\n`, 'utf8')
  return entry
}
