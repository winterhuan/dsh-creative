/** Which skill root the writing preset activates. The two rows are mutually exclusive. */
export type SkillMount = 'workspace' | 'bundled'

/**
 * Resolve the mount the preset rows read.
 * A missing host value falls through to the process environment, then bundled.
 * @param hostMount - `writerHost.skillMount` when the service is visible.
 * @param envMount - `DSH_WRITER_SKILL_MOUNT` when the service is not visible yet.
 * @returns the mount that may copy skills or set `bundledSkillDir`.
 */
export function writerSkillMount(hostMount: string | undefined, envMount: string | undefined): SkillMount {
  const raw = hostMount ?? envMount ?? 'bundled'
  return raw === 'workspace' ? 'workspace' : 'bundled'
}

/**
 * Whether one skill-filesystem preset row stays disabled.
 * Workspace enables the default-root row. Bundled enables only the row that sets `bundledSkillDir`.
 * @param mount - active mount.
 * @param row - which preset row is being considered.
 * @returns true when that row must not load.
 */
export function skillFilesystemRowDisabled(mount: SkillMount, row: 'workspace' | 'bundled'): boolean {
  return row === 'workspace' ? mount === 'bundled' : mount !== 'bundled'
}
