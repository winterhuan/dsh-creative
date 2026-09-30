import { isCreativeTextPath, parseCreativePath } from '../project-path.ts'
import type { FileMutationActivity } from './activity.ts'
export { jsonStringPrefix, runningRootCalls, fileMutations, mutatingCallIds, latestSettledMutation, streamingAssistant, type FileMutationActivity, type MutationToolName } from './activity.ts'

/** The short-drama workbench pane. */
export type WorkbenchMode = 'drama'
/** Locale keys of the combined workbench modes. */
export const WORKBENCH_LABEL_KEYS = { story: 'workbench.story', drama: 'workbench.drama', game: 'workbench.game', video: 'workbench.video' } as const
/** Minimal file identity used by workbench routing. */
export interface WorkspaceFilePath { readonly path: string }

/**
 * Convert a DSH tool path to the creative-relative path accepted by the narrow route.
 * @param path - the absolute or workspace-relative path a tool call carries.
 * @param cwd - the session working directory that scopes absolute paths.
 * @returns the normalized creative-relative path, or `undefined` outside the
 * creative roots or editable extensions.
 */
export function creativeRelativePath(path: string | undefined, cwd: string | undefined): string | undefined {
  const parsed = parseCreativePath(path, cwd)
  return parsed?.domain === 'drama' && isCreativeTextPath(parsed) ? parsed.path : undefined
}

/**
 * The workbench pane that owns one workspace path.
 * @param path - workspace-relative path.
 * @returns the owning pane, or `undefined` for non-creative paths.
 */
export function workbenchModeForPath(path: string | undefined): WorkbenchMode | undefined {
  return parseCreativePath(path)?.domain === 'drama' ? 'drama' : undefined
}

/**
 * Choose the first useful document when a creative workbench opens;
 * stories prefer prose, then outlines, in chapter directories or standalone files.
 * @param files - workspace files to choose from.
 * @param mode - the pane being opened.
 * @returns the highest-preference matching path, or the first match as fallback.
 */
export function preferredWorkbenchFile(
  files: readonly WorkspaceFilePath[],
  mode: WorkbenchMode,
): string | undefined {
  const matching = files.flatMap((file) => {
    const parsed = parseCreativePath(file.path)
    return parsed?.domain === mode ? [{ ...parsed, path: file.path }] : []
  })
  const preferences = [
    /^剧集\/EP0*1\/剧本\.md$/u,
    /^剧集\/.*\/剧本\.md$/u,
    /^项目开发\/creative-brief\.md$/u,
    /^输入\/.*\.md$/u,
    /\.md$/u,
    /^short-drama\.json$/u,
  ]
  for (const pattern of preferences) {
    const match = matching.find(file => pattern.test(file.relativePath))
    if (match !== undefined) return match.path
  }
  return matching[0]?.path
}

/**
 * Project one streamed mutation over its immediate predecessor.
 * @param activity - the mutation to apply.
 * @param base - the editor buffer content before the mutation.
 * @returns the projected content, or `undefined` when the mutation cannot be
 * applied to this base.
 */
export function previewMutation(activity: FileMutationActivity, base: string): string | undefined {
  if (activity.operation === 'replace-file') return activity.newText
  if (activity.operation === 'replace-text') {
    if (activity.oldText === undefined || activity.newText === undefined || activity.oldText === '') return undefined
    if (activity.replaceAll) return base.includes(activity.oldText) ? base.split(activity.oldText).join(activity.newText) : undefined
    const at = base.indexOf(activity.oldText)
    return at < 0 ? undefined : `${base.slice(0, at)}${activity.newText}${base.slice(at + activity.oldText.length)}`
  }
  if (activity.operation === 'insert-text') {
    if (activity.newText === undefined) return undefined
    const rawLine = /"insert_line"\s*:\s*(\d+)/u.exec(activity.argsRaw)?.[1]
    if (rawLine === undefined) return undefined
    const line = Number.parseInt(rawLine, 10)
    const parts = base.split('\n')
    const at = Math.max(0, Math.min(parts.length, line))
    parts.splice(at, 0, activity.newText)
    return parts.join('\n')
  }
  return undefined
}
