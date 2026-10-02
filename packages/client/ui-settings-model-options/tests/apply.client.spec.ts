/** Real slot registration and settings mirror synchronization through the plugin's Remote calls. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { TestRemote, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { apply, inject } from '../src/client/index.ts'
import { providerOptionsFace } from '../src/client/operations.ts'
import type { OutcomeToastFace } from '../src/client/OutcomeToast.tsx'

function view(revision = 0) {
  return { ns: 'llm-pi-ai', schema: { type: 'object' }, value: { providers: {} }, base: {}, user: {}, revision, applies: 'live', secrets: [] }
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  const describe = vi.fn(async () => ({ ok: true, value: { writable: true, hasDocument: true, namespaces: [view()] } }))
  const mutate = vi.fn(async () => ({ ok: true, value: view(1) }))
  new TestRemote(ctx, {
    settings: { describe, mutate },
    session: { modelCatalog: vi.fn(async () => ({ ok: true, value: { groups: [], failures: [] } })) },
  })
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: {
    'settings.models.provider-card': { kind: 'keyed', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, slots, describe, mutate }
}

describe('model options plugin', () => {
  it('registers both adapter families and an outcome overlay, and releases them on disposal', async () => {
    const b = await bench()
    try {
      const fiber = b.ctx.plugin({ inject, apply })
      await fiber.await()
      expect(b.slots.entries('settings.models.provider-card').map(entry => entry.options.key)).toEqual(['llm-pi-ai', 'llm-deepseek'])
      expect(b.slots.entries('shell.overlay')).toHaveLength(1)
      await fiber.dispose()
      expect(b.slots.entries('settings.models.provider-card')).toHaveLength(0)
      expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('folds accepted writes into the shared mirror and keeps the notice outside the card', async () => {
    const b = await bench()
    try {
      await b.ctx.plugin({ inject, apply }).await()
      await b.ctx.configForms.describe().ensure()
      const entry = b.slots.entries('settings.models.provider-card')[0]!
      const face = (entry.inject as () => ReturnType<typeof providerOptionsFace>)()
      expect(await face.save([{ op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'], value: 3 }], 0)).toEqual({ ok: true })
      expect(face.hooks.settings.getSnapshot().revision).toBe(1)
      const overlay = b.slots.entries('shell.overlay')[0]!
      const toast = (overlay.inject as () => OutcomeToastFace)()
      expect(toast.hooks.notice.getSnapshot()?.outcome).toEqual({ ok: true })
      toast.dismiss()
      expect(toast.hooks.notice.getSnapshot()).toBeNull()
    } finally { await b.ctx.fiber.dispose() }
  })

  it('reports a conflict and reloads the current namespace without retrying the write', async () => {
    const b = await bench()
    try {
      const report = vi.fn()
      const face = providerOptionsFace(b.ctx, 'llm-pi-ai', report)
      await b.ctx.configForms.describe().ensure()
      b.mutate.mockResolvedValueOnce({ ok: false, error: new RemoteError('settings/conflict', 'changed elsewhere', {}) } as never)
      b.describe.mockResolvedValueOnce({ ok: true, value: { writable: true, hasDocument: true, namespaces: [view(9)] } })
      const result = await face.save([], 0)
      expect(result).toMatchObject({ ok: false, conflict: true })
      expect(b.mutate).toHaveBeenCalledTimes(1)
      expect(face.hooks.settings.getSnapshot().revision).toBe(9)
      expect(report).toHaveBeenCalledWith(result)
    } finally { await b.ctx.fiber.dispose() }
  })

  it('reports a transport rejection as a failed save', async () => {
    const b = await bench()
    try {
      const report = vi.fn()
      const face = providerOptionsFace(b.ctx, 'llm-pi-ai', report)
      b.mutate.mockRejectedValueOnce(new Error('connection closed'))
      expect(await face.save([], 0)).toEqual({ ok: false, conflict: false, message: 'connection closed' })
      expect(report).toHaveBeenCalledTimes(1)
    } finally { await b.ctx.fiber.dispose() }
  })
})
