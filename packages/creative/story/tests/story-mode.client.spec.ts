// @vitest-environment jsdom
/** Mode changes affect discovery without owning or clearing Session editor state. */
import { Context } from '@deepseek-ai/cordis'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { describe, expect, it, onTestFinished } from 'vitest'
import { registerStoryTab } from '../src/client/story-mode.ts'
import { registerFileRedirect } from '../src/client/file-redirect.tsx'

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (next: T) => { value = next; for (const listener of listeners) listener() },
    listeners,
  }
}

describe('novel mode discovery', () => {
  it('follows both Session selection and blank-session preset updates, and releases observers', () => {
    const current = source<{ key: string | undefined }>({ key: undefined })
    const list = source({ byId: { novel: { projectionValues: { agentPreset: 'story' } }, ordinary: { projectionValues: { agentPreset: 'standard' } } } })
    let active: SidebarRightTabDefinition | undefined
    let registrations = 0
    const context = {
      uiSession: { adapter: { current } }, sessions: { list },
      sidebarRightTabs: { register: (definition: SidebarRightTabDefinition) => {
        expect(active).toBeUndefined()
        registrations++
        active = definition
        return () => { active = undefined }
      } },
    } as Context
    const release = registerStoryTab(context, { id: 'story', kind: 'story', title: () => 'Novel', guide: [{ id: 'story', order: 1, title: () => 'Novel' }] })
    expect(active?.guide).toHaveLength(0)
    current.set({ key: 'novel' })
    expect(active?.guide).toHaveLength(1)
    const before = registrations
    list.set({ ...list.getSnapshot() })
    expect(registrations).toBe(before)
    current.set({ key: 'ordinary' })
    expect(active?.guide).toHaveLength(0)
    list.set({ byId: { ...list.getSnapshot().byId, ordinary: { projectionValues: { agentPreset: 'story' } } } })
    expect(active?.guide).toHaveLength(1)
    current.set({ key: 'missing' })
    expect(active?.guide).toHaveLength(0)
    current.set({ key: 'novel' })
    expect(active?.guide).toHaveLength(1)
    release()
    expect(active).toBeUndefined()
    expect(current.listeners.size + list.listeners.size).toBe(0)
  })

  it('claims files by their owning Session mode, including late mode changes', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const list = source({ byId: { novel: { cwd: '/ws', projectionValues: { agentPreset: 'story' } }, ordinary: { cwd: '/ws', projectionValues: { agentPreset: 'standard' } } } })
    let active: SidebarRightTabDefinition | undefined
    Object.assign(ctx, { sessions: { list }, sidebarRightTabs: { register: (definition: SidebarRightTabDefinition) => { active = definition; return () => {} } }, slots: { inject: () => () => {} } })
    registerFileRedirect(ctx, 'story')
    const path = (id: string) => `dsh-resource://file/session/${id}/book/正文/chapter.md`
    expect(active?.canOpen?.(path('novel'))).toBe(true)
    expect(active?.canOpen?.(path('ordinary'))).toBe(false)
    expect(active?.canOpen?.(path('unknown'))).toBe(false)
    list.set({ byId: { ...list.getSnapshot().byId, ordinary: { cwd: '/ws', projectionValues: { agentPreset: 'story' } } } })
    expect(active?.canOpen?.(path('ordinary'))).toBe(true)
  })
})
