// @vitest-environment jsdom
/** Mode changes affect discovery without owning or clearing Session editor state. */
import { Context } from '@deepseek-ai/cordis'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { describe, expect, it } from 'vitest'
import { registerModeTab as drama } from '../packages/creative/short-drama/src/client/mode.ts'
import { registerModeTab as game } from '../packages/creative/novel-to-game/src/client/mode.ts'
import { registerModeTab as video } from '../packages/creative/video-recap/src/client/mode.ts'
import { registerModeTab as student } from '../packages/education/student/src/client/mode.ts'

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

describe.each([['short-drama', drama], ['novel-to-game', game], ['video-recap', video], ['student', student]] as const)('%s mode discovery', (mode, registerTab) => {
  it('follows both Session selection and blank-session preset updates, and releases observers', () => {
    const current = source<{ key: string | undefined }>({ key: undefined })
    const list = source({ byId: { novel: { projectionValues: { agentPreset: mode } }, ordinary: { projectionValues: { agentPreset: 'standard' } } } })
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
    const release = registerTab(context, { id: 'story', kind: 'story', title: () => 'Novel', guide: [{ id: 'story', order: 1, title: () => 'Novel' }] })
    expect(active?.guide).toHaveLength(0)
    current.set({ key: 'novel' })
    expect(active?.guide).toHaveLength(1)
    const before = registrations
    list.set({ ...list.getSnapshot() })
    expect(registrations).toBe(before)
    current.set({ key: 'ordinary' })
    expect(active?.guide).toHaveLength(0)
    list.set({ byId: { ...list.getSnapshot().byId, ordinary: { projectionValues: { agentPreset: mode } } } })
    expect(active?.guide).toHaveLength(1)
    current.set({ key: 'missing' })
    expect(active?.guide).toHaveLength(0)
    current.set({ key: 'novel' })
    expect(active?.guide).toHaveLength(1)
    release()
    expect(active).toBeUndefined()
    expect(current.listeners.size + list.listeners.size).toBe(0)
  })

})
