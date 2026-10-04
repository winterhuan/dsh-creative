/** The story settings controller writes the Zhuque key through credentials, not the settings section. */

import { describe, expect, it, vi } from 'vitest'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { STORY_SETTINGS_NS, StorySettingsCardController, type StorySettings } from '../src/client/story-settings-controller.ts'

/** Make the stub behave like a Host that accepts every write. */
function acceptWrites(host: StubConfigForm<StorySettings>): void {
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

describe('StorySettingsCardController', () => {
  it('names the story namespace', () => {
    expect(STORY_SETTINGS_NS).toBe('story')
  })

  it('writes a staged key through the credentials domain', async () => {
    const host = stubConfigForm<StorySettings>()
    acceptWrites(host)
    const describe = vi.fn(() => Promise.resolve({
      ok: true as const,
      value: { MAKERS_API_KEY: { configured: true, writable: true } },
    }))
    const set = vi.fn(() => Promise.resolve({ ok: true as const, value: undefined }))
    const controller = new StorySettingsCardController(host.scope, { remote: { credentials: { describe, set } } } as never)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()
    face.edit('makersApiKey', ' makers-secret ')
    expect(face.hooks.storySettingsCard.getSnapshot().dirty).toBe(true)
    expect(set).not.toHaveBeenCalled()
    face.save()
    await vi.waitFor(() => { expect(set).toHaveBeenCalledWith('MAKERS_API_KEY', 'makers-secret') })
    expect(host.mutate).not.toHaveBeenCalled()
  })

  it('keeps the stored key when the draft is left blank', () => {
    const host = stubConfigForm<StorySettings>()
    const set = vi.fn()
    const controller = new StorySettingsCardController(host.scope, {
      remote: { credentials: { describe: vi.fn(() => Promise.resolve({ ok: true, value: {} })), set } },
    } as never)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()
    face.edit('makersApiKey', '   ')
    expect(face.hooks.storySettingsCard.getSnapshot().dirty).toBe(false)
    face.save()
    expect(set).not.toHaveBeenCalled()
  })
})
