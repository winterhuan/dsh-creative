/**
 * Which preset should gate the workspace skill copy.
 * Prefer an event hint and the live composed preset over the frozen session header.
 * @param input - event, live composition, and header preset candidates.
 * @returns first available preset, or undefined when none was supplied.
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
