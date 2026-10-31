import { describe, expect, it } from 'vitest'
import { receiveFile, reconcileBuffers } from '../src/client/editor-buffer.ts'

const draft = { content: 'draft', saved: 'disk', source: 'human' as const, version: 'first' }
const file = { path: '正文/第001章.md', content: 'disk', bytes: 4, version: 'first' }

describe('Creative editor buffers', () => {
  it('retains every dirty draft across consecutive file removals', () => {
    const buffers = { first: draft, second: draft }
    const first = reconcileBuffers(buffers, new Set(['second']), false, 'removed')
    const second = reconcileBuffers(first, new Set(), false, 'removed')
    expect(second).toEqual({
      first: { ...draft, missing: true, error: 'removed' },
      second: { ...draft, missing: true, error: 'removed' },
    })
    expect(reconcileBuffers(second, new Set(), false, 'removed')).toBe(second)
  })

  it('drops clean deleted buffers without needing a dirty deletion', () => {
    expect(reconcileBuffers({ first: { ...draft, content: draft.saved } }, new Set(), false, 'removed')).toEqual({})
  })

  it('does not infer deletion from a truncated directory listing', () => {
    const buffers = { first: draft, second: { ...draft, content: draft.saved } }
    expect(reconcileBuffers(buffers, new Set(), true, 'removed')).toBe(buffers)
    expect(reconcileBuffers(buffers, new Set(Object.keys(buffers)), false, 'removed')).toBe(buffers)
  })

  it.each(['first', 'second'])('restores a reappearing file at disk version %s without replacing its draft', (version) => {
    const buffer = receiveFile({ ...draft, missing: true, error: 'removed' }, { ...file, version }, 'conflict')
    expect(buffer).toMatchObject({ content: 'draft', saved: 'disk', version: 'first', missing: false })
    expect(buffer.error).toBeUndefined()
    expect(buffer.conflict).toEqual(version === 'first' ? undefined : { message: 'conflict', theirs: 'disk', theirsVersion: 'second' })
  })

  it('refreshes a clean buffer from the new disk revision', () => {
    expect(receiveFile({ ...draft, content: draft.saved }, { ...file, content: 'new disk', version: 'second' }, 'conflict'))
      .toEqual({ content: 'new disk', saved: 'new disk', source: 'disk', version: 'second' })
  })
})
