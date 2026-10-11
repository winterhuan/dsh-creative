// @vitest-environment jsdom
/** Controller folds: rule resolution, rule replacement, roster load, staging, and the settings write. */

import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  ProjectDefaultController, ruleForWorkspace, withRule,
} from '../src/client/controller.ts'
import type { ProjectDefaultRule } from '../src/types.ts'

afterEach(cleanup)

const SESSION = 'session-one' as SessionId
const WORKSPACE = {
  workspaceId: 'ws-novel',
  path: '/projects/novel',
  title: 'Novel',
  sessionIds: [SESSION],
  createdAt: '',
  updatedAt: '',
}

/** A client context double with the workspace snapshot, roster remote, and settings form. */
function bench(options: {
  workspaces?: readonly (typeof WORKSPACE)[]
  presets?: { ok: boolean; value?: { presets: readonly { id: string; isDefault: boolean; name?: string }[] }; error?: { message: string } }
  rules?: ProjectDefaultRule[]
  accept?: boolean
  /** Initial settings-form status; `loading` carries no section until `settle` runs. */
  status?: 'loading' | 'ready' | 'unavailable'
} = {}) {
  const writes: { field: string; value: unknown }[] = []
  let rules = options.rules ?? []
  let status = options.status ?? 'ready'
  const listeners = new Set<() => void>()
  const form = {
    getSnapshot: () => (status === 'ready'
      ? { value: { rules }, revision: 3, status, mode: 'host', writable: true, base: {}, user: {} }
      : { value: undefined, revision: undefined, status, mode: 'host', writable: status !== 'unavailable', base: undefined, user: undefined }),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: vi.fn(async (field: string, value: unknown) => {
      writes.push({ field, value })
      if (options.accept === false) return false
      rules = value as ProjectDefaultRule[]
      return true
    }),
  }
  /** Move the form to its next status and notify subscribers, like the mirror's first accepted section. */
  const settle = (next: 'ready' | 'unavailable' = 'ready'): void => {
    status = next
    for (const listener of listeners) listener()
  }
  const roster = options.presets ?? {
    ok: true,
    value: {
      presets: [
        { id: 'standard', isDefault: true },
        { id: 'story', isDefault: false, name: '小说创作' },
      ],
    },
  }
  const listPresets = vi.fn(async (): Promise<unknown> => roster)
  const ctx = {
    workspaces: { list: { getSnapshot: () => ({ items: options.workspaces ?? [WORKSPACE] }) } },
    remote: { agentPresets: { list: listPresets } },
    configForms: { get: () => form },
  } as never
  const controller = new ProjectDefaultController(ctx)
  return { controller, form, writes, listPresets, settle, listeners, snapshot: () => controller.store.getSnapshot() }
}

describe('rule folds', () => {
  it('resolves the last matching rule and none without a match', () => {
    const rules: ProjectDefaultRule[] = [
      { workspaceId: 'a', agentPreset: 'one' },
      { workspaceId: 'a', agentPreset: 'two' },
      { workspaceId: 'b', agentPreset: 'three' },
    ]
    expect(ruleForWorkspace(rules, 'a')).toBe('two')
    expect(ruleForWorkspace(rules, 'b')).toBe('three')
    expect(ruleForWorkspace(rules, 'c')).toBeUndefined()
  })

  it('replaces one rule in place, preserves the others, and removes on follow-global', () => {
    const rules: ProjectDefaultRule[] = [
      { workspaceId: 'a', agentPreset: 'one' },
      { workspaceId: 'b', agentPreset: 'two' },
    ]
    expect(withRule(rules, 'a', 'story')).toEqual([
      { workspaceId: 'b', agentPreset: 'two' },
      { workspaceId: 'a', agentPreset: 'story' },
    ])
    expect(withRule(rules, 'a', undefined)).toEqual([{ workspaceId: 'b', agentPreset: 'two' }])
    expect(withRule(rules, 'c', 'story')).toEqual([...rules, { workspaceId: 'c', agentPreset: 'story' }])
  })
})

describe('project default controller', () => {
  it('opens on the workspace rule and the roster, with the global default marked', async () => {
    const b = bench({ rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }] })
    await b.controller.open(SESSION)
    const state = b.snapshot()
    expect(state.open).toBe(true)
    expect(state.status).toBe('ready')
    expect(state.workspace?.title).toBe('Novel')
    expect(state.current).toBe('story')
    expect(state.selected).toBe('story')
    expect(state.options).toEqual([
      { preset: 'standard', label: 'standard', isGlobalDefault: true },
      { preset: 'story', label: '小说创作', isGlobalDefault: false },
    ])
  })

  it('opens without a rule as follow-global', async () => {
    const b = bench()
    await b.controller.open(SESSION)
    const state = b.snapshot()
    expect(state.current).toBeUndefined()
    expect(state.selected).toBeUndefined()
  })

  it('stays usable but unsavable for a session outside every workspace', async () => {
    const b = bench()
    await b.controller.open('session-other' as SessionId)
    const state = b.snapshot()
    expect(state.status).toBe('ready')
    expect(state.workspace).toBeNull()
    expect(await b.controller.save()).toBe(false)
    expect(b.writes).toEqual([])
  })

  it('reports a roster refusal as an error state', async () => {
    const b = bench({ presets: { ok: false, error: { message: 'roster offline' } } })
    await b.controller.open(SESSION)
    const state = b.snapshot()
    expect(state.status).toBe('error')
    expect(state.error).toBe('roster offline')
    expect(state.workspace?.title).toBe('Novel')
  })

  it('saves the staged preset through the settings form and closes', async () => {
    const b = bench({ rules: [{ workspaceId: 'ws-other', agentPreset: 'cordis' }] })
    await b.controller.open(SESSION)
    b.controller.select('story')
    expect(b.snapshot().selected).toBe('story')
    expect(await b.controller.save()).toBe(true)
    expect(b.writes).toEqual([{
      field: 'rules',
      value: [
        { workspaceId: 'ws-other', agentPreset: 'cordis' },
        { workspaceId: 'ws-novel', agentPreset: 'story' },
      ],
    }])
    expect(b.snapshot().open).toBe(false)
  })

  it('saves follow-global by dropping only this workspace rule', async () => {
    const b = bench({
      rules: [
        { workspaceId: 'ws-novel', agentPreset: 'story' },
        { workspaceId: 'ws-other', agentPreset: 'cordis' },
      ],
    })
    await b.controller.open(SESSION)
    b.controller.select(undefined)
    expect(await b.controller.save()).toBe(true)
    expect(b.writes).toEqual([{ field: 'rules', value: [{ workspaceId: 'ws-other', agentPreset: 'cordis' }] }])
  })

  it('keeps the dialog open and reports a refused write', async () => {
    const b = bench({ accept: false })
    await b.controller.open(SESSION)
    b.controller.select('story')
    expect(await b.controller.save()).toBe(false)
    const state = b.snapshot()
    expect(state.open).toBe(true)
    expect(state.saving).toBe(false)
    expect(state.error).not.toBeNull()
  })

  it('supersedes an in-flight open when another session opens', async () => {
    const other = { ...WORKSPACE, workspaceId: 'ws-other', title: 'Other', sessionIds: ['session-two' as SessionId] }
    const b = bench({ workspaces: [WORKSPACE, other] })
    let release!: (value: unknown) => void
    const slow = new Promise(resolve => { release = resolve })
    b.listPresets.mockImplementationOnce(async () => await slow as never)
    const first = b.controller.open(SESSION)
    // The first open reaches its roster read (after the form wait) before the newer open starts.
    await vi.waitFor(() => { expect(b.listPresets).toHaveBeenCalledTimes(1) })
    await b.controller.open('session-two' as SessionId)
    release({ ok: true, value: { presets: [] } })
    await first
    // The stale reply lands after a newer open and must not overwrite it.
    expect(b.snapshot().workspace?.title).toBe('Other')
    expect(b.snapshot().status).toBe('ready')
  })

  it('drops staged state when the dialog closes', async () => {
    const b = bench()
    await b.controller.open(SESSION)
    b.controller.select('story')
    b.controller.close()
    const state = b.snapshot()
    expect(state.open).toBe(false)
    expect(state.selected).toBeUndefined()
    expect(state.workspace).toBeNull()
  })

  it('waits for the settings form before marking the project rule, then loads the roster', async () => {
    const b = bench({ status: 'loading', rules: [{ workspaceId: 'ws-novel', agentPreset: 'story' }] })
    const opening = b.controller.open(SESSION)
    expect(b.snapshot()).toMatchObject({ open: true, status: 'loading', current: undefined, selected: undefined })
    expect(b.snapshot().workspace?.title).toBe('Novel')
    expect(b.listPresets).not.toHaveBeenCalled()
    b.settle()
    await opening
    expect(b.snapshot()).toMatchObject({ status: 'ready', current: 'story', selected: 'story' })
    expect(b.listeners.size).toBe(0)
  })

  it('releases a pending form wait when the dialog closes first', async () => {
    const b = bench({ status: 'loading' })
    const opening = b.controller.open(SESSION)
    b.controller.close()
    await opening
    expect(b.listeners.size).toBe(0)
    expect(b.listPresets).not.toHaveBeenCalled()
    expect(b.snapshot().open).toBe(false)
  })

  it('refuses to write while the form has no accepted section, so other projects keep their rules', async () => {
    const b = bench({ rules: [{ workspaceId: 'ws-other', agentPreset: 'cordis' }] })
    await b.controller.open(SESSION)
    b.controller.select('story')
    b.settle('unavailable')
    expect(await b.controller.save()).toBe(false)
    expect(b.writes).toEqual([])
    expect(b.snapshot()).toMatchObject({ open: true, saving: false })
    expect(b.snapshot().error).not.toBeNull()
  })
})
