// Copied from deepseek-harness dsh-v0.1.7-rc.2; re-sync when the DSH dependency version changes.
/** Build-time values that bundlers replace before client code reaches a browser. */
declare const process: {
  readonly env: {
    readonly NODE_ENV?: string
    readonly [name: `DSH_CLIENT_${string}`]: string | undefined
  }
}
