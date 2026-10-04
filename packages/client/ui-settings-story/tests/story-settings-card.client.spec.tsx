// @vitest-environment jsdom

/** The story settings page shows the Zhuque key and opens a bulk dialog for it. */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StorySettingsCard, type StorySettingsCardProps } from '../src/client/StorySettingsCard.tsx'
import type { StorySettingsCardState } from '../src/client/story-settings-controller.ts'

afterEach(cleanup)

function state(overrides: Partial<StorySettingsCardState> = {}): StorySettingsCardState {
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

function propsFor(snapshot: StorySettingsCardState): StorySettingsCardProps {
  return {
    t: (key: string) => key,
    useStorySettingsCard: (selector: (value: StorySettingsCardState) => unknown) => selector(snapshot),
    edit: vi.fn(),
    resetField: vi.fn(),
    save: vi.fn(),
    discard: vi.fn(),
    saveKeys: vi.fn(async () => true),
  } as StorySettingsCardProps
}

describe('StorySettingsCard', () => {
  it('renders its one-liner in the summary view', () => {
    render(<StorySettingsCard {...propsFor(state())} view="summary" />)
    expect(screen.getByText('description')).toBeTruthy()
    expect(screen.queryByLabelText('makersKeyLabel')).toBeNull()
  })

  it('shows the Zhuque key and opens the bulk dialog', () => {
    render(<StorySettingsCard {...propsFor(state())} />)
    expect(screen.getByLabelText('makersKeyLabel')).toHaveProperty('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'manageKeys' }))
    const dialog = screen.getByRole('dialog', { name: 'title' })
    expect(within(dialog).getByLabelText('makersKeyLabel')).toBeTruthy()
  })
})
