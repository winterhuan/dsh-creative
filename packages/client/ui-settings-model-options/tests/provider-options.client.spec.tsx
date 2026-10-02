// @vitest-environment jsdom
/** Editable capabilities, rejected writes, concurrent changes, and the read-only card. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProviderOptions } from '../src/client/ProviderOptions.tsx'
import type { ProviderOptionsProps } from '../src/client/ProviderOptions.tsx'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SaveOutcome } from '../src/client/operations.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

function bench(locale: 'zh' | 'en' = 'en', models: readonly { id: string; name?: string; reasoningEfforts?: unknown }[] = [
  { id: 'a' }, { id: 'b', reasoningEfforts: { high: 'ultra' } },
]) {
  const snapshot: ConfigFormSnapshot<unknown> = {
    status: 'ready', revision: 7, writable: true, mode: 'host', base: {}, user: {},
    value: { providers: { gateway: { models } } },
  }
  const save = vi.fn<ProviderOptionsProps['save']>().mockResolvedValue({ ok: true })
  const loadModels = vi.fn<ProviderOptionsProps['loadModels']>().mockResolvedValue({ ok: true, models: [] })
  const props = {
    provider: { provider: 'gateway', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'gateway'], displayName: 'Gateway' },
    configured: true, keyConfigured: true,
    useSettings: <T,>(select: (value: ConfigFormSnapshot<unknown>) => T): T => select(snapshot),
    read: (value: unknown, path: readonly string[]) => path.reduce<unknown>((node, key) =>
      node !== null && typeof node === 'object' ? Reflect.get(node, key) : undefined, value),
    t: (key: keyof typeof en, params?: Record<string, string>) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, value), (locale === 'zh' ? zh : en)[key]),
    save, loadModels,
  } as ProviderOptionsProps
  const view = render(<ProviderOptions {...props} />)
  const open = async () => {
    fireEvent.click(screen.getByText(props.t('title')))
    await screen.findByRole('spinbutton')
    await waitFor(() => { expect(loadModels).toHaveBeenCalled() })
  }
  return { props, snapshot, save, loadModels, view, open }
}

describe('provider options', () => {
  it.each(['en', 'zh'] as const)('stages both controls and sends one fenced save in %s', async locale => {
    const b = bench(locale)
    await b.open()
    const t = b.props.t
    fireEvent.change(screen.getByLabelText(t('reasoning')), { target: { value: 'custom' } })
    expect(screen.getByRole('button', { name: t('save'), exact: true })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByLabelText(t('high')))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    expect(b.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('save'), exact: true }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledTimes(1) })
    expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'], value: 3 },
      { op: 'set', path: ['providers', 'gateway', 'models', '0', 'reasoningEfforts'], value: { high: 'high' } },
    ], 7)
  })

  it('retains each model draft when switching the selected model', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByLabelText('Thinking capability'), { target: { value: 'disabled' } })
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'b' } })
    expect(screen.getByLabelText('High')).toHaveProperty('checked', true)
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'a' } })
    expect(screen.getByLabelText('Thinking capability')).toHaveProperty('value', 'disabled')
  })

  it('shows off omission distinctly from an explicit wire value', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByLabelText('Thinking capability'), { target: { value: 'custom' } })
    fireEvent.click(screen.getByLabelText('Off'))
    fireEvent.click(screen.getByLabelText('High'))
    fireEvent.click(screen.getByText('Request parameter values'))
    expect(screen.getByLabelText('Off parameter value')).toHaveProperty('value', '')
    fireEvent.change(screen.getByLabelText('Off parameter value'), { target: { value: 'none' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => { expect(b.save).toHaveBeenCalled() })
    expect(b.save.mock.calls[0]?.[0][0]).toMatchObject({ value: { off: 'none', high: 'high' } })
  })

  it.each(['en', 'zh'] as const)('previews and stages selected models with exact mappings in %s', async locale => {
    const b = bench(locale, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd', reasoningEfforts: false }])
    await b.open()
    const t = b.props.t
    expect(screen.getByRole('option', { name: t('modelOption', { model: 'a', summary: t('summaryInherit') }) })).toBeTruthy()
    expect(screen.getByRole('option', { name: t('modelOption', { model: 'd', summary: t('disabled') }) })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('reasoning')), { target: { value: 'custom' } })
    fireEvent.click(screen.getByLabelText(t('off')))
    fireEvent.click(screen.getByLabelText(t('high')))
    fireEvent.click(screen.getByText(t('mapping')))
    fireEvent.change(screen.getByLabelText(t('wireValue', { level: t('high') })), { target: { value: 'ultra' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: t('batchTitle') }))
    const panel = within(screen.getByRole('group', { name: t('batchTitle') }))
    expect(panel.getByText('ultra')).toBeTruthy()
    expect(panel.getByText(t('omitParameter'))).toBeTruthy()
    expect(panel.queryByLabelText(t('selectTarget', { model: 'a' }))).toBeNull()
    expect(panel.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true)
    expect(panel.getByRole('button', { name: t('applyTargets', { count: '0' }) })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: t('save'), exact: true })).toHaveProperty('disabled', true)
    fireEvent.click(panel.getByLabelText(t('selectTarget', { model: 'b' })))
    fireEvent.click(panel.getByLabelText(t('selectTarget', { model: 'c' })))
    fireEvent.click(panel.getByRole('button', { name: t('applyTargets', { count: '2' }) }))
    expect(b.save).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: t('modelOption', {
      model: 'b', summary: t('pendingSummary', { summary: `${t('off')} / ${t('high')}` }),
    }) })).toBeTruthy()
    fireEvent.change(screen.getByLabelText(t('model')), { target: { value: 'b' } })
    fireEvent.change(screen.getByLabelText(t('wireValue', { level: t('high') })), { target: { value: 'deep' } })
    fireEvent.click(screen.getByRole('button', { name: t('save'), exact: true }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledTimes(1) })
    expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'], value: 3 },
      { op: 'set', path: ['providers', 'gateway', 'models', '0', 'reasoningEfforts'], value: { off: null, high: 'ultra' } },
      { op: 'set', path: ['providers', 'gateway', 'models', '1', 'reasoningEfforts'], value: { off: null, high: 'deep' } },
      { op: 'set', path: ['providers', 'gateway', 'models', '2', 'reasoningEfforts'], value: { off: null, high: 'ultra' } },
    ], 7)
  })

  it('selects only filtered results and retains hidden selections', async () => {
    const b = bench('en', [{ id: 'a' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }, { id: 'd', name: 'Delta' }])
    await b.open()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to other models' }))
    const panel = within(screen.getByRole('group', { name: 'Apply to other models' }))
    fireEvent.click(panel.getByLabelText('Select Gamma (c)'))
    fireEvent.change(panel.getByRole('searchbox'), { target: { value: 'BETA' } })
    fireEvent.click(panel.getByRole('button', { name: 'Select all results' }))
    expect(panel.getByText('2 models selected')).toBeTruthy()
    expect(panel.getByText('Beta (b), Gamma (c)')).toBeTruthy()
    fireEvent.click(panel.getByRole('button', { name: 'Deselect all results' }))
    expect(panel.getByText('1 models selected')).toBeTruthy()
    fireEvent.change(panel.getByRole('searchbox'), { target: { value: 'missing' } })
    expect(panel.getByText('No matching models')).toBeTruthy()
    fireEvent.click(panel.getByRole('button', { name: 'Apply to 1 models' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'unset', path: ['providers', 'gateway', 'models', '2', 'reasoningEfforts'] },
    ], 7) })
  })

  it('copies a stored catalog override without changing the source or replacing the catalog', async () => {
    const b = bench('en', [])
    b.snapshot.value = { providers: { gateway: { modelOverrides: { a: { reasoningEfforts: { off: 'none', high: 'ultra' } } } } } }
    b.loadModels.mockResolvedValue({ ok: true, models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
    await b.open()
    await screen.findByRole('button', { name: 'Apply to other models' })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to other models' }))
    expect(screen.getByText('none')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Select B (b)'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 models' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'modelOverrides', 'b', 'reasoningEfforts'], value: { off: 'none', high: 'ultra' } },
    ], 7) })
  })

  it('cancels recipient selection without losing drafts and discards applied changes together', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByLabelText('Thinking capability'), { target: { value: 'disabled' } })
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply to other models' }))
    fireEvent.click(screen.getByLabelText('Select b'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }))
    expect(screen.getByLabelText('Thinking capability')).toHaveProperty('value', 'disabled')
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Apply to other models' }))
    expect(screen.getByLabelText('Select b')).toHaveProperty('checked', false)
    fireEvent.click(screen.getByLabelText('Select b'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply to 1 models' }))
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'b' } })
    expect(screen.getByLabelText('Thinking capability')).toHaveProperty('value', 'disabled')
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByLabelText('High')).toHaveProperty('checked', true)
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '5')
    expect(b.save).not.toHaveBeenCalled()
  })

  it('cannot copy missing levels or blank thinking parameter values', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByLabelText('Thinking capability'), { target: { value: 'custom' } })
    const copy = screen.getByRole('button', { name: 'Apply to other models' })
    expect(copy).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByLabelText('Off'))
    expect(copy).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByLabelText('High'))
    expect(copy).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByText('Request parameter values'))
    fireEvent.change(screen.getByLabelText('High parameter value'), { target: { value: ' ' } })
    expect(copy).toHaveProperty('disabled', true)
  })

  it('fences a batch opened before the first draft against concurrent settings changes', async () => {
    const b = bench()
    await b.open()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to other models' }))
    fireEvent.click(screen.getByLabelText('Select b'))
    b.props.useSettings = select => select({ ...b.snapshot, revision: 8 })
    b.view.rerender(<ProviderOptions {...b.props} />)
    expect(screen.getByRole('alert').textContent).toContain('Settings changed elsewhere')
    expect(screen.getByRole('button', { name: 'Apply to 1 models' }).closest('fieldset')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Apply to other models' })).toBeNull()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => { expect(b.save.mock.calls[0]?.[1]).toBe(8) })
  })

  it('retains edits after refusal and can retry the same draft', async () => {
    const b = bench()
    b.save.mockResolvedValueOnce({ ok: false, conflict: false, message: 'refused' })
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Save', exact: true })).toHaveProperty('disabled', false) })
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledTimes(2) })
  })

  it('blocks a stale model index after another surface changes the namespace', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    const next = { ...b.snapshot, revision: 8 }
    b.props.useSettings = select => select(next)
    b.view.rerender(<ProviderOptions {...b.props} />)
    expect(screen.getByRole('alert').textContent).toContain('Settings changed elsewhere')
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toHaveProperty('disabled', true)
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('locks controls during a save and does not update a closed card on settlement', async () => {
    const b = bench()
    let resolve!: (outcome: SaveOutcome) => void
    b.save.mockReturnValue(new Promise(result => { resolve = result }))
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true)
    b.view.unmount()
    resolve({ ok: true })
    await Promise.resolve()
  })

  it('prevents read-only writes and omits unsaved providers', async () => {
    const b = bench()
    b.snapshot.writable = false
    await b.open()
    expect(screen.getByText('Model settings are read-only')).toBeTruthy()
    expect(screen.getByRole('spinbutton').closest('fieldset')).toHaveProperty('disabled', true)
    b.view.rerender(<ProviderOptions {...b.props} configured={false} />)
    expect(screen.queryByText('Thinking and retries')).toBeNull()
  })
})
