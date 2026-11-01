// @vitest-environment jsdom

/** The Writer cover key control on the Writing settings page. */

import { cleanup, render, screen } from '@testing-library/react'
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
    gptImageBaseUrl: { text: '', overridden: false, invalid: false },
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
  } as ZhuqueSettingsCardProps
}

describe('Writer cover settings card', () => {
  it('renders cover controls beside Zhuque on the detail view', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} />)
    expect(screen.getByLabelText('makersKeyLabel')).toBeTruthy()
    expect(screen.getByLabelText('coverKeyLabel')).toHaveProperty('type', 'password')
  })

  it('explains why an environment cover key cannot be edited', () => {
    render(<ZhuqueSettingsCard {...propsFor(state({
      coverKey: { draft: { text: '', overridden: false, invalid: false }, configured: true, writable: false },
    }))} />)
    expect(screen.getByLabelText('coverKeyLabel')).toHaveProperty('disabled', true)
    expect(screen.getByText('coverKeyReadOnlyHint')).toBeTruthy()
  })
})
