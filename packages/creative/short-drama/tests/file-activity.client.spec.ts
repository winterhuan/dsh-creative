import type { ChatConversationViewNode, ChatNodeStore, ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type {
  ConversationLocationDataStore,
  ConversationStepDataMap,
  ConversationTimelineSnapshot,
  ConversationTurnDataMap,
  RunningToolCall,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { describe, expect, it } from 'vitest'
import {
  creativeRelativePath,
  fileMutations,
  jsonStringPrefix,
  latestSettledMutation,
  mutatingCallIds,
  preferredWorkbenchFile,
  previewMutation,
  runningRootCalls,
  streamingAssistant,
} from '../src/client/file-activity.js'

/**
 * Build a fixed Location data store for a timeline fixture.
 * @param values - business values keyed by their declaration-merged key.
 * @returns a store whose sources never change.
 */
function locationData<DataMap extends object>(
  values: { readonly [Key in keyof DataMap & string]?: Readonly<DataMap[Key]> },
): ConversationLocationDataStore<DataMap> {
  return {
    get: key => values[key],
    source: key => ({ getSnapshot: () => values[key], subscribe: () => () => {} }),
  }
}

describe('official DSH file activity', () => {
  it('reads a tool-only Assistant from official Step location data', () => {
    const assistant = {
      status: 'running' as const,
      turn: 2,
      step: 1,
      time: 1,
      blocks: [{ kind: 'tool-call' as const, callId: 'write-hidden', name: 'write', argsRaw: '{}' }],
    }
    const timeline: ConversationTimelineSnapshot = {
      turnOrder: [2],
      turns: new Map([[2, {
        turn: 2,
        status: 'open',
        start: undefined,
        end: undefined,
        data: locationData<ConversationTurnDataMap>({}),
        steps: [{
          turn: 2,
          step: 1,
          status: 'open',
          start: undefined,
          end: undefined,
          data: locationData<ConversationStepDataMap>({ 'assistant-step': assistant }),
        }],
      }]]),
    }

    expect(streamingAssistant(timeline)).toBe(assistant)
  })

  it('decodes a still-streaming JSON string prefix', () => {
    expect(jsonStringPrefix('{"file_path":"正文/第011章.md","content":"雨声\\n越来', 'content'))
      .toEqual({ value: '雨声\n越来', complete: false })
    expect(jsonStringPrefix('{"content":"雨声\\n越来。"}', 'content'))
      .toEqual({ value: '雨声\n越来。', complete: true })
  })

  it('projects a streaming write call before tool execution starts', () => {
    const activity = fileMutations([], {
      turn: 1,
      step: 1,
      blocks: [{
        kind: 'tool-call',
        callId: 'write-1',
        name: 'write',
        argsRaw: '{"file_path":"正文/第011章.md","content":"第一行\\n第二',
      }],
    }).at(-1)
    expect(activity).toMatchObject({
      callId: 'write-1',
      stage: 'streaming',
      path: '正文/第011章.md',
      operation: 'replace-file',
      newText: '第一行\n第二',
    })
    expect(previewMutation(activity!, '旧正文')).toBe('第一行\n第二')
  })

  it('uses the executing DSH call and previews targeted edits', () => {
    const running = [{
      phase: 'start' as const,
      callId: 'edit-1',
      name: 'edit',
      argsRaw: '{"file_path":"正文/第002章.md","old_string":"旧句","new_string":"新句正在生成',
      turn: 1,
      step: 1,
      time: 1,
      subCalls: [],
    }] as RunningToolCall[]
    const activity = fileMutations(running).at(-1)
    expect(activity).toMatchObject({ stage: 'running', oldText: '旧句', newText: '新句正在生成' })
    expect(previewMutation(activity!, '开头。旧句。结尾。')).toBe('开头。新句正在生成。结尾。')
  })

  it('walks nested calls and preserves concurrent mutations', () => {
    const child = (callId: string, path: string): RunningToolCall => ({
      phase: 'start' as const,
      callId,
      name: 'write',
      argsRaw: JSON.stringify({ file_path: path, content: callId }),
      turn: 1,
      step: 1,
      time: 1,
      subCalls: [],
    })
    const running: RunningToolCall[] = [{
      phase: 'start' as const,
      callId: 'code-1',
      name: 'run_code',
      argsRaw: '{}',
      turn: 1,
      step: 1,
      time: 1,
      subCalls: [child('write-a', '正文/A.md'), child('write-b', '正文/B.md')],
    }]
    expect(fileMutations(running).map(value => value.path)).toEqual(['正文/A.md', '正文/B.md'])
    expect([...mutatingCallIds(running)]).toEqual(['code-1', 'write-a', 'write-b'])
  })

  /**
   * Build one formal Chat row: kind and data are merge-extensible, so the row
   * face is assembled as the node store publishes it.
   * @param row - key, visibility, anchor sequence, and payload.
   * @returns the row in the shape {@link runningRootCalls} consumes.
   */
  function row(row: {
    readonly key: string
    readonly kind: string
    readonly visibility?: 'visible' | 'hidden'
    readonly anchorSeq: number
    readonly root: unknown
  }): ChatConversationViewNode {
    return {
      key: row.key,
      kind: row.kind,
      visibility: row.visibility ?? 'visible',
      anchorSeq: row.anchorSeq,
      data: { root: row.root },
    } as ChatConversationViewNode
  }

  function runningRoot(name: string, callId: string, subCalls: readonly RunningToolCall[] = []): RunningToolCall {
    return { phase: 'start' as const, callId, name, argsRaw: '{}', turn: 1, step: 1, time: 1, subCalls }
  }

  it('derives active root tool calls from formal Chat nodes, never from a legacy slice', () => {
    const write = runningRoot('write', 'write-1')
    const ptc = runningRoot('run_code', 'code-1', [runningRoot('write', 'code-1:write')])
    const settled = { ...runningRoot('write', 'write-settled'), kind: 'tool-result' as const, seq: 9, time: 9, content: [], call: null, callTime: null, isError: false }
    const nodes = [
      row({ key: 'assistant', kind: 'assistant-step', anchorSeq: 1, root: {} }),
      row({ key: 'tool:code-1', kind: 'tool-call', anchorSeq: 5, root: ptc }),
      row({ key: 'tool:write-1', kind: 'tool-call', anchorSeq: 2, root: write }),
      row({ key: 'tool:settled', kind: 'tool-call', anchorSeq: 3, root: settled }),
      row({ key: 'tool:hidden', kind: 'tool-call', visibility: 'hidden', anchorSeq: 4, root: runningRoot('write', 'write-hidden') }),
      row({ key: 'tool:nonmutating', kind: 'tool-call', anchorSeq: 6, root: runningRoot('read', 'read-1') }),
    ]
    // Only visible running roots survive, in Chat anchor order.
    expect(runningRootCalls(nodes).map(call => call.callId)).toEqual(['write-1', 'code-1', 'read-1'])
    // Nested PTC children stay reachable through their root.
    expect(runningRootCalls(nodes).find(call => call.callId === 'code-1')?.subCalls.map(child => child.callId))
      .toEqual(['code-1:write'])
  })

  it('projects root, nested, and fast-settled mutations through the node store alone', () => {
    const live = row({
      key: 'tool:write-live',
      kind: 'tool-call',
      anchorSeq: 2,
      root: runningRoot('write', 'write-live'),
    })
    expect(mutatingCallIds(runningRootCalls([live]))).toEqual(new Set(['write-live']))
    const chatRoot = {
      kind: 'tool-result',
      seq: 12,
      time: 12,
      callId: 'write-fast',
      content: [],
      isError: false,
      call: { name: 'write', argsRaw: '{"file_path":"正文/快.md","content":"完成"}' },
      callTime: 11,
      subCalls: [],
    }
    // A Settled call leaves the running-root derivation entirely, so the durable
    // signal owns it rather than the mutation tools it no longer offers.
    expect(runningRootCalls([live, row({ key: 'tool:none', kind: 'tool-call', anchorSeq: 4, root: chatRoot })])
      .map(call => call.callId)).toEqual(['write-live'])
  })

  it('uses the latest durable DSH call when a fast call leaves the live window', () => {
    const node = row({
      key: 'tool:write-1',
      kind: 'tool-call',
      anchorSeq: 1,
      root: {
        kind: 'tool-result',
        callId: 'write-1',
        isError: false,
        call: { name: 'write', argsRaw: '{"file_path":"正文/新章.md","content":"完成"}' },
        subCalls: [],
      },
    })
    const chatNodes: Pick<ChatSnapshot, 'order'> & { readonly nodes: Pick<ChatNodeStore, 'get'> } = {
      order: [node.key],
      nodes: { get: (key: string) => key === node.key ? node : undefined },
    }
    const chat = chatNodes as ChatSnapshot
    expect(latestSettledMutation(chat)).toBe('write-1\0正文/新章.md')
  })

  it('supports replace-all and deletion', () => {
    const replaceAll = fileMutations([{
      phase: 'start' as const,
      callId: 'edit-all',
      name: 'edit',
      argsRaw: '{"file_path":"正文/A.md","old_string":"旧","new_string":"新","replace_all":true}',
      turn: 1,
      step: 1,
      time: 1,
      subCalls: [],
    }]).at(-1)
    expect(previewMutation(replaceAll!, '旧/旧')).toBe('新/新')

    const deletion = fileMutations([{
      phase: 'start' as const,
      callId: 'delete-text',
      name: 'str_replace_editor',
      argsRaw: '{"command":"str_replace","path":"正文/A.md","old_str":"删掉"}',
      turn: 1,
      step: 1,
      time: 1,
      subCalls: [],
    }]).at(-1)
    expect(previewMutation(deletion!, '保留删掉结尾')).toBe('保留结尾')
  })

  it('prefers the current creator-first screenplay', () => {
    expect(preferredWorkbenchFile([
      { path: '项目开发/creative-brief.md' },
      { path: '剧集/EP001/剧本.md' },
    ], 'drama')).toBe('剧集/EP001/剧本.md')
  })
})

describe('agent path resolution before the workspace loads', () => {
  it('cannot resolve an absolute mutation path without a cwd', () => {
    // Why the settled-mutation effect waits for workspace.cwd instead of consuming the signal:
    // the mutation carries an absolute path, so resolving it early yields undefined and the
    // follow-the-agent selection would be dropped permanently.
    expect(creativeRelativePath('/home/runner/work/story/设定集/角色/a.md', undefined)).toBeUndefined()
    expect(creativeRelativePath('/home/runner/work/story/设定集/角色/a.md', '/home/runner/work/story')).toBe('设定集/角色/a.md')
  })
})
