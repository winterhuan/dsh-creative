/**
 * Which preset should gate the workspace skill copy.
 * Prefer an event hint and the live composed preset over the frozen session header.
 */
export function resolveWriterSyncPreset(input: {
  readonly eventPreset?: string
  readonly composedPreset?: string
  readonly headerPreset?: string
}): string | undefined {
  if (input.eventPreset !== undefined) return input.eventPreset
  if (input.composedPreset !== undefined) return input.composedPreset
  return input.headerPreset
}
