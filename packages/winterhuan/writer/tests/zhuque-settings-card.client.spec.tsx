// @vitest-environment jsdom

/** The Writer Zhuque settings page shows the key fields backed by the credentials domain. */

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

describe('ZhuqueSettingsCard', () => {
  it('renders its one-liner in the summary view', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} view="summary" />)
    expect(screen.getByText('description')).toBeTruthy()
    expect(screen.queryByLabelText('makersKeyLabel')).toBeNull()
  })

  it('shows the Zhuque key field', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} />)
    expect(screen.getByLabelText('makersKeyLabel')).toHaveProperty('type', 'password')
  })

  it('shows the cover key field', () => {
    render(<ZhuqueSettingsCard {...propsFor(state())} />)
    expect(screen.getByLabelText('coverKeyLabel')).toHaveProperty('type', 'password')
  })

  it('shows the cover base URL as a plain text field with a seeded draft', () => {
    render(<ZhuqueSettingsCard {...propsFor(state({
      gptImageBaseUrl: { text: 'https://proxy.example/v1', overridden: true, invalid: false },
    }))} />)
    expect(screen.getByLabelText('gptImageBaseUrlLabel')).toHaveProperty('type', 'text')
    expect(screen.getByLabelText('gptImageBaseUrlLabel')).toHaveProperty('value', 'https://proxy.example/v1')
  })

  it('explains why an environment key cannot be edited', () => {
    render(<ZhuqueSettingsCard {...propsFor(state({
      key: { draft: { text: '', overridden: false, invalid: false }, configured: true, writable: false },
    }))} />)
    expect(screen.getByLabelText('makersKeyLabel')).toHaveProperty('disabled', true)
    expect(screen.getByText('makersKeyReadOnlyHint')).toBeTruthy()
  })
})
