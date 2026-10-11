/**
 * One deterministic prose-check finding, shared by the ported TypeScript checkers.
 *
 * The finding mirrors the JSON the bundled `check-*.js` scripts report: the CLI
 * layer adds the `file` field, so core modules never carry file identity.
 */
export interface CheckFinding {
  /** 1-based source line. */
  readonly line: number
  /** 1-based column within the line. */
  readonly column: number
  /** Stable finding kind, e.g. `em-dash`, `verbatim-repeat` or `meta-leak`. */
  readonly type: string
  /** Whether the finding blocks formal delivery or only advises revision. */
  readonly severity: 'blocking' | 'advisory'
  /** Human-readable repair guidance. */
  readonly message: string
  /** Short source excerpt around the finding. */
  readonly excerpt: string
}
