/** Real slot registration and settings-namespace gating through the plugin's Remote calls. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject, PROJECT_DEFAULT_MODE_NS } from '../src/client/index.ts'
import type { ProjectDefaultDialogInjected, ProjectDefaultMenuInjected } from '../src/client/ProjectDefault.tsx'

/** One describe-mirror row for the plugin's settings namespace. */
function view(rules: readonly { workspaceId: string; agentPreset: string }[] = [], revision = 0) {
  return {
    ns: PROJECT_DEFAULT_MODE_NS,
    schema: { type: 'object' },
    value: { rules }, base: {}, user: {}, revision, applies: 'live', secrets: [],
  }
}

async function bench(options: { served?: boolean; rules?: readonly { workspaceId: string; agentPreset: string }[] } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const served = options.served !== false
  const describe = vi.fn(async () => ({
    ok: true,
    value: { writable: true, hasDocument: true, namespaces: served ? [view(options.rules ?? [])] : [] },
  }))
  const mutate = vi.fn(async () => ({ ok: true, value: view(options.rules ?? [], 1) }))
  new TestRemote(ctx, {
    settings: { describe, mutate },
    agentPresets: {
      list: vi.fn(async () => ({ ok: true, value: { presets: [{ id: 'standard', isDefault: true }] } })),
    },
  })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  ctx.provide('workspaces', {
    list: {
      getSnapshot: () => ({
        items: [{ workspaceId: 'ws-novel', path: '/projects/novel', title: 'Novel', sessionIds: ['session-one' as SessionId], createdAt: '', updatedAt: '' }],
        archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
      }),
      subscribe: () => () => {},
    },
  } as never)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'sidebar.workspaces.session.menu.item': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, slots, describe, mutate }
}

describe('project default mode plugin', () => {
  it('registers the menu row and dialog while the namespace is served, and releases both on disposal', async () => {
    const b = await bench()
    try {
      const fiber = b.ctx.plugin({ inject, apply })
      await fiber.await()
      await b.ctx.configForms.describe().ensure()
      const menu = b.slots.entries('sidebar.workspaces.session.menu.item')
      expect(menu.map(entry => entry.options.id)).toEqual(['project-default-mode'])
      expect(menu[0]!.options.order).toBe(500)
      expect(b.slots.entries('shell.overlay').map(entry => entry.options.id)).toEqual(['project-default-mode'])
      await fiber.dispose()
      expect(b.slots.entries('sidebar.workspaces.session.menu.item')).toHaveLength(0)
      expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('shows no surface when the Host does not serve the namespace', async () => {
    const b = await bench({ served: false })
    try {
      await b.ctx.plugin({ inject, apply }).await()
      await b.ctx.configForms.describe().ensure()
      expect(b.slots.entries('sidebar.workspaces.session.menu.item')).toHaveLength(0)
      expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('opens the dialog from the menu inject face and loads the roster into the shared state', async () => {
    const b = await bench()
    try {
      await b.ctx.plugin({ inject, apply }).await()
      await b.ctx.configForms.describe().ensure()
      const menuFace = (b.slots.entries('sidebar.workspaces.session.menu.item')[0]!
        .inject as () => ProjectDefaultMenuInjected)()
      const dialogFace = (b.slots.entries('shell.overlay')[0]!
        .inject as () => ProjectDefaultDialogInjected)()
      expect(dialogFace.hooks.projectDefault.getSnapshot().open).toBe(false)
      menuFace.open('session-one' as SessionId)
      await vi.waitFor(() => {
        expect(dialogFace.hooks.projectDefault.getSnapshot().status).toBe('ready')
      })
      const state = dialogFace.hooks.projectDefault.getSnapshot()
      expect(state.open).toBe(true)
      expect(state.workspace?.workspaceId).toBe('ws-novel')
      expect(state.options).toEqual([{ preset: 'standard', label: 'standard', isGlobalDefault: true }])
      dialogFace.close()
      expect(dialogFace.hooks.projectDefault.getSnapshot().open).toBe(false)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('writes the staged rule through the settings namespace and keeps foreign rules', async () => {
    const b = await bench({ rules: [{ workspaceId: 'ws-other', agentPreset: 'cordis' }] })
    try {
      await b.ctx.plugin({ inject, apply }).await()
      await b.ctx.configForms.describe().ensure()
      const menuFace = (b.slots.entries('sidebar.workspaces.session.menu.item')[0]!
        .inject as () => ProjectDefaultMenuInjected)()
      const dialogFace = (b.slots.entries('shell.overlay')[0]!
        .inject as () => ProjectDefaultDialogInjected)()
      menuFace.open('session-one' as SessionId)
      await vi.waitFor(() => {
        expect(dialogFace.hooks.projectDefault.getSnapshot().status).toBe('ready')
      })
      dialogFace.select('standard')
      expect(await dialogFace.save()).toBe(true)
      expect(b.mutate).toHaveBeenCalledOnce()
      const [ns, ops] = b.mutate.mock.calls[0]!
      expect(ns).toBe(PROJECT_DEFAULT_MODE_NS)
      expect(ops).toEqual([{ op: 'set', path: ['rules'], value: [
        { workspaceId: 'ws-other', agentPreset: 'cordis' },
        { workspaceId: 'ws-novel', agentPreset: 'standard' },
      ] }])
      // A successful save closes the dialog.
      expect(dialogFace.hooks.projectDefault.getSnapshot().open).toBe(false)
    } finally { await b.ctx.fiber.dispose() }
  })
})
