// @vitest-environment jsdom

/** The Writer cover key control on the Writing settings page. */

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
    coverKey: { draft: { text: '', overridden: false, invalid: false }, configured: false, writable: true },
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
    saveCoverKeys: vi.fn(async () => true),
  } as ZhuqueSettingsCardProps
}

describe('Writer cover settings card', () => {
  it('renders cover controls beside Zhuque on the detail view', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} />)
    expect(screen.getByLabelText('makersKeyLabel')).toBeTruthy()
    expect(screen.getByLabelText('coverKeyLabel')).toHaveProperty('type', 'password')
    expect(screen.getByRole('button', { name: 'manageCoverKeys' })).toBeTruthy()
  })

  it('explains why an environment cover key cannot be edited', () => {
    render(<ZhuqueSettingsCard {...propsFor(state({
      coverKey: { draft: { text: '', overridden: false, invalid: false }, configured: true, writable: false },
    }))} />)
    expect(screen.getByLabelText('coverKeyLabel')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'manageCoverKeys' })).toHaveProperty('disabled', true)
    expect(screen.getByText('coverKeyReadOnlyHint')).toBeTruthy()
  })

  it('opens the cover bulk dialog without overlapping Zhuque labels', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} />)
    fireEvent.click(screen.getByRole('button', { name: 'manageCoverKeys' }))
    const dialog = screen.getByRole('dialog', { name: 'title' })
    expect(within(dialog).getByLabelText('coverKeyLabel')).toBeTruthy()
    expect(within(dialog).queryByLabelText('makersKeyLabel')).toBeNull()
  })
})
