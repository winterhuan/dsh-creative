import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { parseCreativePath, workspaceRelativePath } from '../project-path.ts'

function mutationPath(name: string, raw: string): string | undefined {
  if (name !== 'write' && name !== 'edit' && name !== 'str_replace_editor' && name !== 'bash') return undefined
  try {
    const args: unknown = JSON.parse(raw)
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
    const record = args as Record<string, unknown>
    if (name === 'bash') {
      const command = record.command
      // This only invalidates the listing; native bash retains ownership of execution and paths.
      return typeof command === 'string' && (
        command.includes('storyctl.py') && /\bchapter\b/u.test(command) && /\b(commit|accept-current-length)\b/u.test(command)
        || command.includes('tracking_commit.py') && /\b(init|commit)\b/u.test(command)
        || /(?:\bdsh-story\b|[/\\]lib[/\\]cli\.js)/u.test(command) && (
          /\bchapter[\s'"]+(?:commit|accept-current-length)\b/u.test(command)
          || /\bproject[\s'"]+init\b/u.test(command)
          || /\banalysis[\s'"]+write-cards\b/u.test(command)
          || /\btext[\s'"]+normalize\b/u.test(command) && /--apply\b/u.test(command)
          || /\bbook[\s'"]+audit\b/u.test(command) && /--write\b/u.test(command)
        )
      ) ? (/\bbook[\s'"]+audit\b/u.test(command) ? '草稿/体检.md' : '追踪/_tracking-state.json') : undefined
    }
    if (name === 'str_replace_editor' && record.command === 'view') return undefined
    const path = name === 'str_replace_editor' ? record.path : record.file_path
    return typeof path === 'string' ? path : undefined
  } catch { return undefined }
}

/**
 * Decide whether one settled mutation can change the workbench listing. Files the listing never
 * shows are skipped; paths it cannot classify (unscoped absolute paths, dot segments) keep the refresh.
 * @param name - the settled tool; recognized CLI commands already name the tracking file.
 * @param path - the mutated path as the tool received it.
 * @param cwd - the Session working directory that scopes absolute paths.
 * @returns whether the mutation is a listing refresh signal.
 */
function changesListing(name: string, path: string, cwd: string | undefined): boolean {
  if (name === 'bash') return true
  const relative = workspaceRelativePath(path, cwd)
  return relative === undefined || parseCreativePath(relative) !== undefined
}

function settledMutationSignals(block: ToolCallBlock, cwd: string | undefined): string[] {
  const nested = block.subCalls.flatMap(child => settledMutationSignals(child, cwd))
  if (!('kind' in block) || block.isError) return nested
  if (block.call === null) return nested
  const path = mutationPath(block.call.name, block.call.argsRaw)
  if (path === undefined || !changesListing(block.call.name, path, cwd)) return nested
  return [`${block.callId}\0${path}`, ...nested]
}

/**
 * Latest successful mutation in the durable Chat tree that can change the workbench listing, including nested calls.
 * @param chat - the full chat snapshot in dispatch order.
 * @param cwd - the Session working directory that scopes absolute paths; unscoped absolute paths keep the refresh.
 * @returns the `callId\0path` signal of the newest settled mutation, or `undefined`.
 */
export function latestSettledMutation(chat: ChatSnapshot, cwd?: string): string | undefined {
  for (const key of chat.order.toReversed()) {
    const node = chat.nodes.get(key)
    if (node?.kind !== 'tool-call') continue
    const root = (node.data as { readonly root?: ToolCallBlock }).root
    const signal = root === undefined ? undefined : settledMutationSignals(root, cwd).at(-1)
    if (signal !== undefined) return signal
  }
  return undefined
}
