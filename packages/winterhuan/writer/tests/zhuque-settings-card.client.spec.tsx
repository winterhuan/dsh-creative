// @vitest-environment jsdom

/** The Writer Zhuque settings page shows the key and opens a bulk dialog for it. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZhuqueSettingsCard, type ZhuqueSettingsCardProps } from '../src/client/ZhuqueSettingsCard.tsx'
import type { WriterZhuqueCardState } from '../src/client/zhuque-settings-controller.ts'

afterEach(cleanup)

function state(overrides: Partial<WriterZhuqueCardState> = {}): WriterZhuqueCardState {
  return {
    available: true,
    writable: true,
    dirty: false,
    invalid: false,
    saving: false,
    failed: false,
    key: { draft: { text: '', overridden: false, invalid: false }, configured: false, writable: true },
    ...overrides,
  }
}

function propsFor(snapshot: WriterZhuqueCardState): ZhuqueSettingsCardProps {
  return {
    t: (key: string) => key,
    useWriterZhuqueCard: (selector: (value: WriterZhuqueCardState) => unknown) => selector(snapshot),
    edit: vi.fn(),
    resetField: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
    saveKeys: vi.fn(async () => true),
  } as ZhuqueSettingsCardProps
}

describe('ZhuqueSettingsCard', () => {
  it('renders its one-liner in the summary view', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} view="summary" />)
    expect(screen.getByText('description')).toBeTruthy()
    expect(screen.queryByLabelText('makersKeyLabel')).toBeNull()
  })

  it('shows the Zhuque key and opens the bulk dialog', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} />)
    expect(screen.getByLabelText('makersKeyLabel')).toHaveProperty('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'manageKeys' }))
    const dialog = screen.getByRole('dialog', { name: 'title' })
    expect(within(dialog).getByLabelText('makersKeyLabel')).toBeTruthy()
  })

  it('explains why an environment key cannot be edited', () => {
    render(<ZhuqueSettingsCard {...propsFor(state({
      key: { draft: { text: '', overridden: false, invalid: false }, configured: true, writable: false },
    }))} />)
    expect(screen.getByLabelText('makersKeyLabel')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'manageKeys' })).toHaveProperty('disabled', true)
    expect(screen.getByText('makersKeyReadOnlyHint')).toBeTruthy()
  })
})
