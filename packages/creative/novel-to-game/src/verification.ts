import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto'

const signingKey = randomBytes(32).toString('hex')
const checkNames = ['launch', 'render', 'input', 'coreLoop', 'outcome', 'restart'] as const

/**
 * Environment used only by the pinned game QA driver.
 * @param workspace - the calling Session's absolute workspace.
 * @param sessionId - the calling Session identifier.
 * @returns private attestation credentials and the preview context.
 */
export function gameQaEnvironment(workspace: string, sessionId: string): Record<string, string> {
  return { DSH_GAME_QA_KEY: signingKey, DSH_GAME_QA_WORKSPACE: workspace, DSH_GAME_QA_SESSION: sessionId }
}

/**
 * Authenticate the runner's exact record and recheck its build and evidence bytes.
 * @param value - untrusted workspace JSON.
 * @param read - contained workspace reader; rejects missing or unsafe paths.
 * @param expectedBuildPaths - current build inventory, including the QA plan when provided.
 * @returns whether the signed record still describes these bytes.
 */
export async function validateGameEvidence(value: unknown, read: (path: string) => Promise<Uint8Array>, expectedBuildPaths?: readonly string[]): Promise<boolean> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const { attestation, ...record } = value as Record<string, unknown>
    if (typeof attestation !== 'object' || attestation === null) return false
    const seal = attestation as Record<string, unknown>
    if (typeof seal.payload !== 'string' || typeof seal.signature !== 'string' || !/^[a-f0-9]{64}$/u.test(seal.signature)) return false
    if (JSON.stringify(record) !== seal.payload) return false
    const expected = createHmac('sha256', signingKey).update(seal.payload).digest()
    if (!timingSafeEqual(expected, Buffer.from(seal.signature, 'hex'))) return false
    if (record.driver !== 'chrome-cdp-v1' || !Array.isArray(record.evidence) || !record.evidence.length || !Array.isArray(record.buildFiles) || !record.buildFiles.length) return false
    if (expectedBuildPaths !== undefined) {
      const recorded = record.buildFiles.map(item => typeof item === 'object' && item !== null ? item.path : undefined)
      if (recorded.some(path => typeof path !== 'string') || JSON.stringify(recorded.sort()) !== JSON.stringify([...expectedBuildPaths].sort())) return false
    }
    const checks = record.checks as Record<string, unknown> | undefined
    const run = record.completeRun as Record<string, unknown> | undefined
    if (checks === undefined || Object.keys(checks).length !== 6 || !checkNames.every(name => checks[name] === 'PASS' || checks[name] === 'FAIL')) return false
    const pass = checkNames.every(name => checks[name] === 'PASS')
    if (record.status !== (pass ? 'PASS' : 'FAIL') || run?.exitCode !== (pass ? 0 : 1) || !Array.isArray(run.command) || !run.command.length) return false
    if (!run.command.every(item => typeof item === 'string' && item.trim() !== '')) return false
    if (typeof record.suites !== 'object' || record.suites === null) return false
    const suites = record.suites as Record<string, unknown>
    for (const name of checkNames) {
      const item = suites[name]
      if (typeof item !== 'object' || item === null) return false
      const suite = item as Record<string, unknown>
      if (JSON.stringify(suite.command) !== JSON.stringify(run.command) || suite.exitCode !== (checks[name] === 'PASS' ? 0 : 1) || !Array.isArray(suite.evidence) || !suite.evidence.length) return false
      if (!suite.evidence.every(path => record.evidence instanceof Array && record.evidence.some(item => typeof item === 'object' && item !== null && item.path === path))) return false
    }
    for (const item of [...record.evidence, ...record.buildFiles]) {
      if (typeof item !== 'object' || item === null) return false
      const file = item as Record<string, unknown>
      if (typeof file.path !== 'string' || typeof file.sha256 !== 'string' || file.path.startsWith('/') || file.path.split(/[\\/]/u).includes('..')) return false
      if (createHash('sha256').update(await read(file.path)).digest('hex') !== file.sha256) return false
    }
    return true
  } catch { return false }
}

/** Whether a workspace game's QA evidence describes the preview this process is showing. */
export type GameVerificationBinding = 'CURRENT' | 'STALE' | 'UNBOUND'

/** One freshness observation for a game project's QA record. */
export interface GameVerificationFreshness {
  readonly binding: GameVerificationBinding
  readonly verifiedPreviewVersion?: string | undefined
}

interface Observation {
  readonly verificationRevision: string | undefined
  readonly previewVersion: string
  readonly bound: boolean
}

/**
 * Retain freshness observations for legacy or invalid records. This tracker
 * never authenticates a result; accepted browser evidence is checked separately.
 */
export class WorkspaceVerificationTracker {
  readonly #observations = new Map<string, Observation>()

  /**
   * Record one observation and report the QA record's freshness for it.
   * @param key - observation identity, `sessionId\0gameRoot`.
   * @param verificationRevision - the QA file's current revision, `undefined` when absent.
   * @param previewVersion - the preview build version shown for the game right now.
   * @returns the freshness binding plus the preview version the QA record was bound to, when known.
   */
  observe(key: string, verificationRevision: string | undefined, previewVersion: string): GameVerificationFreshness {
    const previous = this.#observations.get(key)
    if (previous === undefined) {
      this.#remember(key, { verificationRevision, previewVersion, bound: false })
      return { binding: 'UNBOUND' }
    }
    if (verificationRevision !== previous.verificationRevision) {
      const bound = verificationRevision !== undefined
      this.#remember(key, { verificationRevision, previewVersion, bound })
      return bound ? { binding: 'CURRENT', verifiedPreviewVersion: previewVersion } : { binding: 'UNBOUND' }
    }
    if (!previous.bound) return { binding: 'UNBOUND' }
    return previewVersion === previous.previewVersion
      ? { binding: 'CURRENT', verifiedPreviewVersion: previous.previewVersion }
      : { binding: 'STALE', verifiedPreviewVersion: previous.previewVersion }
  }

  #remember(key: string, observation: Observation): void {
    this.#observations.set(key, observation)
    if (this.#observations.size <= 500) return
    const oldest = this.#observations.keys().next()
    if (!oldest.done) this.#observations.delete(oldest.value)
  }
}
