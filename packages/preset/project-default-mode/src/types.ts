/** One project's default agent preset, keyed by Workspace identity. */

/**
 * A single per-project default: the Workspace the rule applies to and the
 * agent preset a blank session created under it composes.
 *
 * The Workspace id is the durable registry identity, never the directory path:
 * path normalization rewrites paths, while the id stays stable across renames
 * and moves. A session created under that Workspace adopts {@link agentPreset}
 * unless it already composes it.
 */
export interface ProjectDefaultRule {
  /** Stable Workspace registry identity the rule applies to. */
  readonly workspaceId: string
  /** Agent preset a new blank session under the Workspace composes. */
  readonly agentPreset: string
}
