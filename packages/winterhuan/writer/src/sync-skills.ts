import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

/** Outcome of one copy into `.agents/skills`. */
export interface SyncResult {
  /** Project root that owns `.agents/skills`. */
  readonly root: string
  /** Destination skill root. */
  readonly destination: string
  /** Skill directory names written by this call. */
  readonly copied: readonly string[]
  /** Skill directory names left untouched because they already existed. */
  readonly skipped: readonly string[]
}

/**
 * Nearest ancestor containing `.git`, or the workspace directory itself.
 * Matches skill-filesystem's project root so the copy lands where discovery looks.
 * @param workspaceDir - session working directory.
 * @returns the project root.
 */
export async function projectRootFor(workspaceDir: string): Promise<string> {
  let current = resolve(workspaceDir)
  const start = current
  for (;;) {
    try {
      await stat(join(current, '.git'))
      return current
    } catch {
      const parent = resolve(current, '..')
      if (parent === current) return start
      current = parent
    }
  }
}

/**
 * Copy packaged skill directories into `<project>/.agents/skills/<name>`.
 * An existing destination is left in place unless `force` is set.
 * @param options - source tree, workspace directory, and whether to replace existing skills.
 * @returns which skill names were copied or skipped.
 */
export async function syncWriterSkills(options: {
  readonly sourceDir: string
  readonly workspaceDir: string
  readonly force: boolean
}): Promise<SyncResult> {
  const root = await projectRootFor(options.workspaceDir)
  const destination = join(root, '.agents', 'skills')
  await mkdir(destination, { recursive: true })
  const copied: string[] = []
  const skipped: string[] = []
  const entries = await readdir(options.sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const source = join(options.sourceDir, entry.name)
    try {
      const skill = await stat(join(source, 'SKILL.md'))
      if (!skill.isFile()) continue
    } catch {
      continue
    }
    const target = join(destination, entry.name)
    if (target !== destination && !target.startsWith(destination + sep)) continue
    let exists = false
    try {
      exists = (await stat(target)).isDirectory()
    } catch {
      exists = false
    }
    if (exists && !options.force) {
      skipped.push(entry.name)
      continue
    }
    if (exists) await rm(target, { recursive: true, force: true })
    await cp(source, target, { recursive: true })
    copied.push(entry.name)
  }
  copied.sort()
  skipped.sort()
  return { root, destination, copied, skipped }
}
