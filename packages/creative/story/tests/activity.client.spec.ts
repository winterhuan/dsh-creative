import { EMPTY_CHAT_SNAPSHOT, type ChatConversationViewNode, type ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { describe, expect, it } from 'vitest'
import { latestSettledMutation } from '../src/client/activity.ts'

function settled(callId: string, name: string, args: Record<string, unknown>, isError = false): ToolCallBlock {
  return { kind: 'tool-result', seq: 1, time: 1, callTime: 0, content: [], callId, isError, call: { name, argsRaw: JSON.stringify(args) }, subCalls: [] }
}

function snapshot(...roots: ToolCallBlock[]): ChatSnapshot {
  const rows: ChatConversationViewNode[] = roots.map((root, anchorSeq) => ({
    key: root.callId, id: root.callId, kind: 'tool-call', target: 'chat', visibility: 'visible',
    anchorSeq, location: { kind: 'session' }, data: { root },
  }))
  return { ...EMPTY_CHAT_SNAPSHOT, order: rows.map(row => row.key), nodes: { ...EMPTY_CHAT_SNAPSHOT.nodes, get: key => rows.find(row => row.key === key) } }
}

describe('story file refresh signals', () => {
  it.each([
    "node '/installed plugin/lib/cli.js' 'chapter' 'commit' --workspace /workspace --book 书",
    'dsh-story chapter accept-current-length --workspace /workspace --book 书',
    'dsh-story project init --workspace /workspace --book 新书 --kind short',
    'dsh-story analysis write-cards --workspace /workspace --title 来源',
    'dsh-story text normalize --file 正文.md --apply',
  ])('refreshes after a packaged CLI mutation: %s', command => {
    expect(latestSettledMutation(snapshot(settled('cli', 'bash', { command })))).toBe('cli\0追踪/_tracking-state.json')
    expect(latestSettledMutation(snapshot(settled('failed', 'bash', { command }, true)))).toBeUndefined()
  })
  it.each(['project status', 'project query', 'chapter snapshot', 'chapter check', 'analysis inspect', 'text normalize'])('keeps CLI reads out of refresh signals: %s', command => {
    expect(latestSettledMutation(snapshot(settled('read', 'bash', { command: `node /plugin/lib/cli.js ${command}` })))).toBeUndefined()
  })
  it('refreshes after a chapter transaction, while read-only queries leave the signal unchanged', () => {
    expect(latestSettledMutation(snapshot(settled('commit', 'bash', { command: "python 'storyctl.py' 'chapter' 'commit' --project /book" })))).toBe('commit\0追踪/_tracking-state.json')
    expect(latestSettledMutation(snapshot(settled('query', 'bash', { command: 'python storyctl.py project query --kind foreshadow' })))).toBeUndefined()
    expect(latestSettledMutation(snapshot(settled('failed', 'bash', { command: 'python tracking_commit.py commit' }, true)))).toBeUndefined()
  })
  it.each([
    ['write', { file_path: '正文/新章.md', content: '完成' }],
    ['edit', { file_path: '正文/新章.md', old_string: '旧', new_string: '新' }],
    ['str_replace_editor', { command: 'create', path: '正文/新章.md', file_text: '完成' }],
    ['str_replace_editor', { command: 'str_replace', path: '正文/新章.md', old_str: '旧', new_str: '' }],
    ['str_replace_editor', { command: 'insert', path: '正文/新章.md', new_str: '新' }],
  ])('refreshes a settled %s mutation that skipped the live render window', (name, args) => {
    expect(latestSettledMutation(snapshot(settled('changed', name, args)))).toBe('changed\0正文/新章.md')
  })

  it('keeps the latest successful write when newer calls only read or fail', () => {
    expect(latestSettledMutation(snapshot(
      settled('older', 'write', { file_path: '正文/旧章.md' }),
      settled('changed', 'write', { file_path: '正文/新章.md' }),
      settled('read', 'str_replace_editor', { command: 'view', path: '正文/预览.md' }),
      settled('failed', 'write', { file_path: '正文/失败.md' }, true),
    ))).toBe('changed\0正文/新章.md')
  })

  it('finds settled mutations inside a running Code Mode call', () => {
    const root: ToolCallBlock = { callId: 'code', phase: 'start', name: 'run_code', turn: 1, step: 1, time: 1, argsRaw: '{}', subCalls: [
      settled('first', 'write', { file_path: '正文/第一章.md' }),
      settled('second', 'edit', { file_path: '正文/第二章.md' }),
    ] }
    expect(latestSettledMutation(snapshot(root))).toBe('second\0正文/第二章.md')
  })
})
