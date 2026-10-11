// @vitest-environment jsdom
/** Menu item and dialog presentation: opening, staging, badges, and the closed/empty/error states. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ProjectDefaultDialog, ProjectDefaultMenuItem } from '../src/client/ProjectDefault.tsx'
import type { ProjectDefaultDialogProps, ProjectDefaultMenuProps } from '../src/client/ProjectDefault.tsx'
import type { ProjectDefaultState } from '../src/client/controller.ts'
import { en, zh, type ProjectDefaultModeKey } from '../src/client/locales.ts'

afterEach(cleanup)

const SESSION = 'session-one' as SessionId

function translate(locale: 'zh' | 'en' = 'zh') {
  return (key: ProjectDefaultModeKey, params?: Record<string, unknown>): string =>
    Object.entries(params ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      (locale === 'zh' ? zh : en)[key],
    )
}

function stateOf(patch: Partial<ProjectDefaultState>): ProjectDefaultState {
  return {
    open: true, status: 'ready', error: null, saving: false, workspace: null,
    options: [], selected: undefined, current: undefined, ...patch,
  }
}

/**
 * Bind a store into the component the way the renderer binds a `HostObservable`
 * inject hook, so a staged pick re-renders and the checked radio tracks state.
 */
function bindStore(store: SnapshotStore<ProjectDefaultState>) {
  return function useProjectDefault<T>(selector: (state: ProjectDefaultState) => T): T {
    return useSyncExternalStore(store.subscribe, () => selector(store.getSnapshot()))
  }
}

function renderMenu() {
  const open = vi.fn()
  const setMenuOpen = vi.fn()
  const props = {
    sessionId: SESSION,
    displayTitle: 'Session',
    useMenuOpenState: () => [true, setMenuOpen] as const,
    open,
    t: translate(),
  } as never
  render(<ProjectDefaultMenuItem {...props} />)
  return { open, setMenuOpen }
}

function renderDialog(state: ProjectDefaultState, overrides: Partial<{
  select: (preset: string | undefined) => void
  save: () => Promise<boolean>
  close: () => void
}> = {}) {
  const store = createSnapshotStore(state)
  const select = vi.fn(overrides.select ?? ((preset: string | undefined) => {
    store.set({ ...store.getSnapshot(), selected: preset })
  }))
  const save = vi.fn(overrides.save ?? (async () => true))
  const close = vi.fn(overrides.close ?? (() => { store.set({ ...store.getSnapshot(), open: false }) }))
  const props = {
    useProjectDefault: bindStore(store),
    select,
    save,
    close,
    t: translate(),
  } as never
  const view = render(<ProjectDefaultDialog {...props} />)
  return { store, select, save, close, ...view }
}

const WORKSPACE = { workspaceId: 'ws', path: '/p', title: '小说工程', sessionIds: [], createdAt: '', updatedAt: '' }
const OPTIONS = [
  { preset: 'standard', label: 'standard', isGlobalDefault: true },
  { preset: 'story', label: '小说创作', isGlobalDefault: false },
]

describe('project default menu item', () => {
  it.each(['zh', 'en'] as const)('renders the localized row and raises the open request', locale => {
    const t = translate(locale)
    const open = vi.fn()
    const setMenuOpen = vi.fn()
    render(<ProjectDefaultMenuItem {...{
      sessionId: SESSION,
      displayTitle: 'Session',
      useMenuOpenState: () => [true, setMenuOpen] as const,
      open,
      t,
    } as never} />)
    const row = screen.getByRole('menuitem', { name: t('menu') })
    fireEvent.click(row)
    expect(setMenuOpen).toHaveBeenCalledWith(false)
    expect(open).toHaveBeenCalledWith(SESSION)
  })
})

describe('project default dialog', () => {
  it('renders nothing while closed', () => {
    const { container } = renderDialog(stateOf({ open: false }))
    expect(container.innerHTML).toBe('')
  })

  it('shows the loading state before the roster settles', () => {
    const t = translate()
    renderDialog(stateOf({ status: 'loading', workspace: WORKSPACE }))
    expect(screen.getByText(t('loading'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('save') })).toHaveProperty('disabled', true)
  })

  it('shows the load failure without options', () => {
    const t = translate()
    renderDialog(stateOf({ status: 'error', error: 'offline', workspace: WORKSPACE }))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(t('loadFailed'))).toBeTruthy()
  })

  it('lists follow-global and every preset, marking the global default', () => {
    const t = translate()
    renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS, selected: 'story', current: 'story' }))
    expect(screen.getByText(t('title', { project: '小说工程' }))).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByText(t('followGlobal'))).toBeTruthy()
    expect(screen.getByText('小说创作')).toBeTruthy()
    expect(screen.getAllByText(t('globalDefault'))).toHaveLength(1)
    expect(radios[2]).toHaveProperty('checked', true)
  })

  it('marks follow-global as current when the project has no rule', () => {
    const t = translate()
    renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS }))
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveProperty('checked', true)
    expect(screen.getAllByText(t('globalDefault'))).toHaveLength(2)
  })

  it('stages a pick through the injected action', () => {
    const { select } = renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS }))
    fireEvent.click(screen.getByRole('radio', { name: /小说创作/ }))
    expect(select).toHaveBeenCalledWith('story')
    fireEvent.click(screen.getByRole('radio', { name: /跟随全局默认/ }))
    expect(select).toHaveBeenCalledWith(undefined)
  })

  it('disables saving for a session outside every workspace', () => {
    const t = translate()
    renderDialog(stateOf({ workspace: null, options: OPTIONS }))
    expect(screen.getByRole('button', { name: t('save') })).toHaveProperty('disabled', true)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('saves the staged choice and closes through the injected action', async () => {
    const save = vi.fn(async () => true)
    const close = vi.fn()
    const t = translate()
    renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS, selected: 'story' }), { save, close })
    fireEvent.click(screen.getByRole('button', { name: t('save') }))
    await waitFor(() => { expect(save).toHaveBeenCalledOnce() })
  })

  it('shows the save failure and keeps the dialog open', () => {
    const t = translate()
    renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS, error: 'refused' }))
    expect(screen.getByText(t('saveFailed'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('save') })).toHaveProperty('disabled', false)
  })

  it('blocks the controls while saving', () => {
    const t = translate()
    renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS, saving: true }))
    expect(screen.getByRole('button', { name: t('saving') })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: t('cancel') })).toHaveProperty('disabled', true)
  })

  it('closes through the cancel action', () => {
    const close = vi.fn()
    const t = translate()
    renderDialog(stateOf({ workspace: WORKSPACE, options: OPTIONS }), { close })
    fireEvent.click(screen.getByRole('button', { name: t('cancel') }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('renders the English dialog copy', () => {
    const t = translate('en')
    const store = createSnapshotStore(stateOf({ workspace: { ...WORKSPACE, title: 'Novel' }, options: OPTIONS }))
    render(<ProjectDefaultDialog {...{
      useProjectDefault: bindStore(store),
      select: vi.fn(), save: vi.fn(), close: vi.fn(), t,
    } as never} />)
    expect(screen.getByText(t('title', { project: 'Novel' }))).toBeTruthy()
    expect(screen.getByText(t('followGlobal'))).toBeTruthy()
  })
})

describe('menu open helper', () => {
  it('keeps the shared bench helper honest', () => {
    const { open } = renderMenu()
    fireEvent.click(screen.getByRole('menuitem'))
    expect(open).toHaveBeenCalledWith(SESSION)
  })
})
