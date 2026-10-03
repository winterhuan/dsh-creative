import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'

function mutationPath(name: string, raw: string): string | undefined {
  if (name !== 'write' && name !== 'edit' && name !== 'str_replace_editor') return undefined
  try {
    const args: unknown = JSON.parse(raw)
    if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
    const record = args as Record<string, unknown>
    if (name === 'str_replace_editor' && record.command === 'view') return undefined
    const path = name === 'str_replace_editor' ? record.path : record.file_path
    return typeof path === 'string' ? path : undefined
  } catch { return undefined }
}

function settledMutationSignals(block: ToolCallBlock): string[] {
  const nested = block.subCalls.flatMap(settledMutationSignals)
  if (!('kind' in block) || block.isError) return nested
  if (block.call === null) return nested
  const path = mutationPath(block.call.name, block.call.argsRaw)
  return path === undefined ? nested : [`${block.callId}\0${path}`, ...nested]
}

/**
 * Latest successful file mutation in the durable Chat tree, including nested calls.
 * @param chat - the full chat snapshot in dispatch order.
 * @returns the `callId\0path` signal of the newest settled mutation, or `undefined`.
 */
export function latestSettledMutation(chat: ChatSnapshot): string | undefined {
  for (const key of chat.order.toReversed()) {
    const node = chat.nodes.get(key)
    if (node?.kind !== 'tool-call') continue
    const root = (node.data as { readonly root?: ToolCallBlock }).root
    const signal = root === undefined ? undefined : settledMutationSignals(root).at(-1)
    if (signal !== undefined) return signal
  }
  return undefined
}
