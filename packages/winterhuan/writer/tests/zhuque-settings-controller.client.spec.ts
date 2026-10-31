/** The Writer Zhuque settings controller writes the key through credentials, not the settings section. */

import { describe, expect, it, vi } from 'vitest'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { WRITER_SETTINGS_NS, WriterZhuqueCardController, type WriterZhuqueSettings } from '../src/client/zhuque-settings-controller.ts'

/** Make the stub behave like a Host that accepts every write. */
function acceptWrites(host: StubConfigForm<WriterZhuqueSettings>): void {
  host.mutate.mockImplementation((ops: readonly SettingsPathOpView[]) => {
    const value = { ...host.scope.getSnapshot().value as object }
    const user = { ...host.scope.getSnapshot().user as object }
    for (const op of ops) {
      const field = op.path[0]!
      if (op.op === 'set') {
        value[field] = op.value
        user[field] = op.value
      }
    }
    host.publish({ value, user })
    return Promise.resolve(true)
  })
}

describe('WriterZhuqueCardController', () => {
  it('names the writer namespace', () => {
    expect(WRITER_SETTINGS_NS).toBe('writer')
  })

  it('writes a staged key through the credentials domain', async () => {
    const host = stubConfigForm<WriterZhuqueSettings>()
    acceptWrites(host)
    const describe = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { MAKERS_API_KEY: { configured: true, writable: true } },
    }))
    const set = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
    const controller = new WriterZhuqueCardController(host.scope, { remote: { credentials: { describe, set } } } as never)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()
    face.edit('makersApiKey', ' makers-secret ')
    expect(face.hooks.writerZhuqueCard.getSnapshot().dirty).toBe(true)
    expect(set).not.toHaveBeenCalled()
    face.save()
    await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('MAKERS_API_KEY', 'makers-secret') })
    expect(host.mutate).not.toHaveBeenCalled()
  })

  it('keeps the stored key when the draft is left blank', () => {
    const host = stubConfigForm<WriterZhuqueSettings>()
    const set = vi.fn()
    const controller = new WriterZhuqueCardController(host.scope, {
      remote: { credentials: { describe: vi.fn(() => Promise.resolve({ ok: true, value: {} })), set } },
    } as never)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()
    face.edit('makersApiKey', '   ')
    expect(face.hooks.writerZhuqueCard.getSnapshot().dirty).toBe(false)
    face.save()
    expect(set).not.toHaveBeenCalled()
  })

  it('retains the draft when replacing an existing key fails', async () => {
    const host = stubConfigForm<WriterZhuqueSettings>()
    const controller = new WriterZhuqueCardController(host.scope, {
      remote: { credentials: {
        describe: vi.fn(async () => ({ ok: true, value: { MAKERS_API_KEY: { configured: true, writable: true } } })),
        set: vi.fn(async () => ({ ok: false, error: 'write failed' })),
      } },
    } as never)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()
    await vi.waitFor(() => { expect(face.hooks.writerZhuqueCard.getSnapshot().key.configured).toBe(true) })
    face.edit('makersApiKey', 'replacement')
    face.save()
    await vi.waitFor(() => { expect(face.hooks.writerZhuqueCard.getSnapshot().failed).toBe(true) })
    expect(face.hooks.writerZhuqueCard.getSnapshot().key.draft.text).toBe('replacement')
    expect(await face.saveKeys('replacement')).toBe(false)
    controller.dispose()
  })

  it('addresses a custom makersApiKeyEnv reference', async () => {
    const host = stubConfigForm<WriterZhuqueSettings>()
    const set = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
    const describe = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { CUSTOM_MAKERS: { configured: true, writable: true } },
    }))
    const controller = new WriterZhuqueCardController(host.scope, { remote: { credentials: { describe, set } } } as never)
    host.publish({ status: 'ready', writable: true, value: { makersApiKeyEnv: 'CUSTOM_MAKERS' }, user: {} })
    const face = controller.inject()
    face.edit('makersApiKey', 'secret')
    face.save()
    await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('CUSTOM_MAKERS', 'secret') })
    controller.dispose()
  })
})
