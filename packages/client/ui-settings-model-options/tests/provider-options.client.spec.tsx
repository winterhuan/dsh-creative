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

/** The owning label's text for a target checkbox: id plus its capability summary. */
function targetLabel(panel: ReturnType<typeof within>, name: string): string {
  const label = panel.getByLabelText(name).closest('label')
  return label?.textContent ?? ''
}

function bench(locale: 'zh' | 'en' = 'en', models: readonly ({ id: string; name?: string } & Record<string, unknown>)[] = [
  { id: 'a' }, { id: 'b', reasoningEfforts: { high: 'ultra' } },
], settingsNs: 'llm-pi-ai' | 'llm-deepseek' = 'llm-pi-ai') {
  const snapshot: ConfigFormSnapshot<unknown> = {
    status: 'ready', revision: 7, writable: true, mode: 'host', base: {}, user: {},
    value: { providers: { gateway: { models } } },
  }
  const save = vi.fn<ProviderOptionsProps['save']>().mockResolvedValue({ ok: true })
  const loadModels = vi.fn<ProviderOptionsProps['loadModels']>().mockResolvedValue({ ok: true, models: [] })
  const props = {
    provider: { provider: 'gateway', settingsNs, settingsPath: ['providers', 'gateway'], displayName: 'Gateway' },
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
    if (settingsNs === 'llm-pi-ai') await waitFor(() => { expect(loadModels).toHaveBeenCalled() })
  }
  return { props, snapshot, save, loadModels, view, open }
}

describe('provider options', () => {
  it.each(['en', 'zh'] as const)('stages retry controls and thinking batches in one fenced save in %s', async locale => {
    const b = bench(locale)
    await b.open()
    const t = b.props.t
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    fireEvent.click(screen.getByLabelText(t('retryInvalidRequests')))
    expect(b.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledTimes(1) })
    expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'], value: 3 },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'INVALID_REQUEST'] },
    ], 7)
  })

  it('reads inherited invalid-request eligibility and discards a pending change', async () => {
    const b = bench()
    b.snapshot.value = { providers: { gateway: { retryPolicy: { mode: 'normal', maxRetries: 2, retryableCodes: ['SERVER', 'INVALID_REQUEST'] } } } }
    await b.open()
    const checkbox = screen.getByLabelText(b.props.t('retryInvalidRequests'))
    expect(checkbox).toHaveProperty('checked', true)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(checkbox).toHaveProperty('checked', true)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['SERVER'] },
    ], 7) })
  })

  it('saves AUTH retry eligibility separately', async () => {
    const b = bench()
    await b.open()
    const checkbox = screen.getByLabelText(b.props.t('retryAuthErrors'))
    expect(checkbox).toHaveProperty('checked', false)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: b.props.t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'AUTH'] },
    ], 7) })
  })

  it('saves unclassified-error eligibility with the same fenced save', async () => {
    const b = bench()
    await b.open()
    const checkbox = screen.getByLabelText(b.props.t('retryUnclassifiedErrors'))
    expect(checkbox).toHaveProperty('checked', false)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: b.props.t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'PI_AI_ERROR'] },
    ], 7) })
  })

  it('omits the unclassified class on other adapter families', async () => {
    const b = bench()
    await b.open()
    expect(screen.getByLabelText(b.props.t('retryUnclassifiedErrors'))).toBeTruthy()
    b.props = { ...b.props, provider: { ...b.props.provider, settingsNs: 'llm-deepseek' } }
    b.view.rerender(<ProviderOptions {...b.props} />)
    expect(screen.queryByLabelText(b.props.t('retryUnclassifiedErrors'))).toBeNull()
    expect(screen.getByLabelText(b.props.t('retryAuthErrors'))).toBeTruthy()
  })

  it.each(['en', 'zh'] as const)('saves QUOTA eligibility with a zero retry limit in %s', async locale => {
    const b = bench(locale)
    await b.open()
    const checkbox = screen.getByLabelText(b.props.t('retryQuotaErrors'))
    expect(checkbox).toHaveProperty('checked', false)
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: b.props.t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'], value: 0 },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'QUOTA'] },
    ], 7) })
  })

  it('explains default restoration when QUOTA is the only configured class', async () => {
    const b = bench()
    b.snapshot.value = { providers: { gateway: { retryPolicy: { mode: 'normal', retryableCodes: ['QUOTA'] } } } }
    await b.open()
    fireEvent.click(screen.getByLabelText(b.props.t('retryQuotaErrors')))
    expect(screen.getByText(b.props.t('retryDefaultsRestored'))).toBeTruthy()
  })

  it('keeps always mode intact until a finite limit is entered', async () => {
    const b = bench()
    b.snapshot.value = { providers: { gateway: { retryPolicy: { mode: 'always' } } } }
    await b.open()
    const checkbox = screen.getByLabelText(b.props.t('retryInvalidRequests'))
    expect(checkbox).toHaveProperty('checked', true)
    expect(checkbox).toHaveProperty('disabled', true)
    expect(screen.getByLabelText(b.props.t('retryQuotaErrors'))).toHaveProperty('checked', true)
    expect(screen.getByLabelText(b.props.t('retryQuotaErrors'))).toHaveProperty('disabled', true)
    expect(screen.getByLabelText(b.props.t('retryUnclassifiedErrors'))).toHaveProperty('checked', true)
    expect(screen.getByLabelText(b.props.t('retryUnclassifiedErrors'))).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    expect(checkbox).toHaveProperty('disabled', false)
    expect(checkbox).toHaveProperty('checked', false)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save).toHaveBeenCalled() })
    expect(b.save.mock.calls[0]?.[0]).toEqual([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'], value: 0 },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'INVALID_REQUEST'] },
    ])
  })

  it('restores only the inherited limit while retaining the staged error choice', async () => {
    const b = bench()
    await b.open()
    fireEvent.click(screen.getByLabelText(b.props.t('retryInvalidRequests')))
    fireEvent.click(screen.getByRole('button', { name: 'Restore inherited retry limit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'unset', path: ['providers', 'gateway', 'retryPolicy', 'maxRetries'] },
      { op: 'set', path: ['providers', 'gateway', 'retryPolicy', 'retryableCodes'], value: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'INVALID_REQUEST'] },
    ], 7) })
  })

  it.each([['retryInvalidRequests', 'INVALID_REQUEST'], ['retryUnclassifiedErrors', 'PI_AI_ERROR']] as const)('explains the fallback when %s is the only configured error class', async (field, code) => {
    const b = bench()
    b.snapshot.value = { providers: { gateway: { retryPolicy: { mode: 'normal', retryableCodes: [code] } } } }
    await b.open()
    fireEvent.click(screen.getByLabelText(b.props.t(field)))
    expect(screen.getByText(b.props.t('retryDefaultsRestored'))).toBeTruthy()
  })

  it.each(['en', 'zh'] as const)('stages one thinking capability on selected models in %s', async locale => {
    const b = bench(locale, [{ id: 'a' }, { id: 'b', reasoningEfforts: { high: 'ultra' } }, { id: 'c', reasoningEfforts: false }])
    await b.open()
    const t = b.props.t
    expect(screen.getByLabelText(t('reasoningTarget'))).toHaveProperty('value', 'custom')
    fireEvent.click(screen.getByRole('button', { name: t('reasoningBatchTitle') }))
    const panel = within(screen.getByRole('group', { name: t('reasoningBatchTitle') }))
    expect(panel.getByText(t('reasoningBatchPreview', {
      capability: [t('off'), t('low'), t('medium'), t('high')].join(' / '),
    }))).toBeTruthy()
    expect(targetLabel(panel, t('selectTarget', { model: 'a' }))).toContain(t('summaryInherit'))
    expect(targetLabel(panel, t('selectTarget', { model: 'b' }))).toContain(t('high'))
    expect(targetLabel(panel, t('selectTarget', { model: 'c' }))).toContain(t('disabled'))
    expect(panel.getByRole('button', { name: t('applyTargets', { count: '0' }) })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: t('save') })).toHaveProperty('disabled', true)
    fireEvent.click(panel.getByLabelText(t('selectTarget', { model: 'a' })))
    fireEvent.click(panel.getByLabelText(t('selectTarget', { model: 'c' })))
    fireEvent.click(panel.getByRole('button', { name: t('applyTargets', { count: '2' }) }))
    expect(b.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'models', '0', 'reasoningEfforts'], value: { off: null, low: 'low', medium: 'medium', high: 'high' } },
      { op: 'set', path: ['providers', 'gateway', 'models', '2', 'reasoningEfforts'], value: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    ], 7) })
  })

  it('applies not-supported and inherited thinking capabilities without custom levels', async () => {
    const b = bench()
    await b.open()
    const t = b.props.t
    fireEvent.change(screen.getByLabelText(t('reasoningTarget')), { target: { value: 'disabled' } })
    fireEvent.click(screen.getByRole('button', { name: t('reasoningBatchTitle') }))
    const disabled = within(screen.getByRole('group', { name: t('reasoningBatchTitle') }))
    expect(disabled.getByText(t('reasoningBatchPreview', { capability: t('disabled') }))).toBeTruthy()
    fireEvent.click(disabled.getByRole('button', { name: t('cancelBatch') }))
    fireEvent.change(screen.getByLabelText(t('reasoningTarget')), { target: { value: 'inherit' } })
    fireEvent.click(screen.getByRole('button', { name: t('reasoningBatchTitle') }))
    const inherited = within(screen.getByRole('group', { name: t('reasoningBatchTitle') }))
    expect(inherited.getByText(t('reasoningBatchPreview', { capability: t('summaryInherit') }))).toBeTruthy()
    fireEvent.click(inherited.getByRole('button', { name: t('selectVisible') }))
    fireEvent.click(inherited.getByRole('button', { name: t('applyTargets', { count: '2' }) }))
    fireEvent.click(screen.getByRole('button', { name: t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'unset', path: ['providers', 'gateway', 'models', '0', 'reasoningEfforts'] },
      { op: 'unset', path: ['providers', 'gateway', 'models', '1', 'reasoningEfforts'] },
    ], 7) })
  })

  it('selects only filtered results and retains hidden selections', async () => {
    const b = bench('en', [{ id: 'a' }, { id: 'b', name: 'Beta' }, { id: 'c', name: 'Gamma' }, { id: 'd', name: 'Delta' }])
    await b.open()
    fireEvent.click(screen.getByRole('button', { name: 'Apply thinking capability to models' }))
    const panel = within(screen.getByRole('group', { name: 'Apply thinking capability to models' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'models', '2', 'reasoningEfforts'], value: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    ], 7) })
  })

  it('writes catalog overrides without pinning the catalog as an explicit model list', async () => {
    const b = bench('en', [])
    b.snapshot.value = { providers: { gateway: { modelOverrides: { a: { reasoningEfforts: { off: 'none', high: 'ultra' } } } } } }
    b.loadModels.mockResolvedValue({ ok: true, models: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
    await b.open()
    await screen.findByRole('button', { name: 'Apply thinking capability to models' })
    fireEvent.click(screen.getByRole('button', { name: 'Apply thinking capability to models' }))
    const panel = within(screen.getByRole('group', { name: 'Apply thinking capability to models' }))
    expect(targetLabel(panel, 'Select A (a)')).toContain('High')
    fireEvent.click(panel.getByLabelText('Select B (b)'))
    fireEvent.click(panel.getByRole('button', { name: 'Apply to 1 models' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'modelOverrides', 'b', 'reasoningEfforts'], value: { off: null, low: 'low', medium: 'medium', high: 'high' } },
    ], 7) })
  })

  it('cancels recipient selection without losing drafts and discards applied changes together', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: b.props.t('reasoningBatchTitle') }))
    fireEvent.click(screen.getByLabelText(b.props.t('selectTarget', { model: 'b' })))
    fireEvent.click(screen.getByRole('button', { name: b.props.t('cancelBatch') }))
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '2')
    fireEvent.click(screen.getByRole('button', { name: b.props.t('reasoningBatchTitle') }))
    const panel = within(screen.getByRole('group', { name: b.props.t('reasoningBatchTitle') }))
    expect(targetLabel(panel, b.props.t('selectTarget', { model: 'b' }))).toContain(b.props.t('high'))
    expect(panel.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true)
    fireEvent.click(panel.getByLabelText(b.props.t('selectTarget', { model: 'b' })))
    fireEvent.click(panel.getByRole('button', { name: b.props.t('applyTargets', { count: '1' }) }))
    expect(b.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: b.props.t('reasoningBatchTitle') }))
    const applied = within(screen.getByRole('group', { name: b.props.t('reasoningBatchTitle') }))
    expect(targetLabel(applied, b.props.t('selectTarget', { model: 'b' }))).toContain(b.props.t('pendingSummary', {
      summary: [b.props.t('off'), b.props.t('low'), b.props.t('medium'), b.props.t('high')].join(' / '),
    }))
    fireEvent.click(screen.getByRole('button', { name: b.props.t('discard') }))
    fireEvent.click(screen.getByRole('button', { name: b.props.t('reasoningBatchTitle') }))
    expect(targetLabel(within(screen.getByRole('group', { name: b.props.t('reasoningBatchTitle') })), b.props.t('selectTarget', { model: 'b' }))).toContain(b.props.t('high'))
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '5')
    expect(b.save).not.toHaveBeenCalled()
  })

  it('fences a batch opened before the first draft against concurrent settings changes', async () => {
    const b = bench()
    await b.open()
    fireEvent.click(screen.getByRole('button', { name: b.props.t('reasoningBatchTitle') }))
    fireEvent.click(screen.getByLabelText(b.props.t('selectTarget', { model: 'a' })))
    b.props.useSettings = select => select({ ...b.snapshot, revision: 8 })
    b.view.rerender(<ProviderOptions {...b.props} />)
    expect(screen.getByRole('alert').textContent).toContain('Settings changed elsewhere')
    expect(screen.getByRole('button', { name: b.props.t('applyTargets', { count: '1' }) }).closest('fieldset')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: b.props.t('save') })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: b.props.t('discard') }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('group', { name: b.props.t('reasoningBatchTitle') })).toBeNull()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save.mock.calls[0]?.[1]).toBe(8) })
  })

  it('retains edits after refusal and can retry the same draft', async () => {
    const b = bench()
    b.save.mockResolvedValueOnce({ ok: false, conflict: false, message: 'refused' })
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false) })
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '0')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledTimes(2) })
  })

  it('blocks a stale model index after another surface changes the namespace', async () => {
    const b = bench()
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2' } })
    fireEvent.click(screen.getByLabelText(b.props.t('retryInvalidRequests')))
    const next = { ...b.snapshot, revision: 8 }
    b.props.useSettings = select => select(next)
    b.view.rerender(<ProviderOptions {...b.props} />)
    expect(screen.getByRole('alert').textContent).toContain('Settings changed elsewhere')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('spinbutton')).toHaveProperty('value', '2')
    expect(screen.getByLabelText(b.props.t('retryInvalidRequests')).closest('fieldset')).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('locks controls during a save and does not update a closed card on settlement', async () => {
    const b = bench()
    let resolve!: (outcome: SaveOutcome) => void
    b.save.mockReturnValue(new Promise(result => { resolve = result }))
    await b.open()
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
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
    expect(screen.queryByText(b.props.t('title'))).toBeNull()
  })

  it.each(['en', 'zh'] as const)('stages one image capability on selected models in %s', async locale => {
    const b = bench(locale)
    await b.open()
    const t = b.props.t
    expect(screen.getByLabelText(t('imageTarget'))).toHaveProperty('value', 'textAndImage')
    fireEvent.click(screen.getByRole('button', { name: t('imageBatchTitle') }))
    const panel = within(screen.getByRole('group', { name: t('imageBatchTitle') }))
    expect(panel.getByText(t('imageBatchPreview', { capability: t('imageTextAndImage') }))).toBeTruthy()
    expect(panel.getByRole('button', { name: t('applyTargets', { count: '0' }) })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: t('save') })).toHaveProperty('disabled', true)
    fireEvent.click(panel.getByLabelText(t('selectTarget', { model: 'a' })))
    fireEvent.click(panel.getByLabelText(t('selectTarget', { model: 'b' })))
    fireEvent.click(panel.getByRole('button', { name: t('applyTargets', { count: '2' }) }))
    expect(b.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: t('imageBatchTitle') }))
    const reopened = within(screen.getByRole('group', { name: t('imageBatchTitle') }))
    expect(reopened.getAllByText(t('pendingSummary', { summary: t('imageTextAndImage') }))).toHaveLength(2)
    fireEvent.click(reopened.getByRole('button', { name: t('cancelBatch') }))
    fireEvent.click(screen.getByRole('button', { name: t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'models', '0', 'input'], value: ['text', 'image'] },
      { op: 'set', path: ['providers', 'gateway', 'models', '1', 'input'], value: ['text', 'image'] },
    ], 7) })
  })

  it('offers inherited image input on pi-ai providers only', async () => {
    const b = bench()
    await b.open()
    const t = b.props.t
    const select = within(screen.getByLabelText(t('imageTarget')))
    expect(select.getByRole('option', { name: t('imageInherit') })).toBeTruthy()
    b.props = { ...b.props, provider: { ...b.props.provider, settingsNs: 'llm-deepseek' } }
    b.view.rerender(<ProviderOptions {...b.props} />)
    const deepseek = within(screen.getByLabelText(t('imageTarget')))
    expect(deepseek.queryByRole('option', { name: t('imageInherit') })).toBeNull()
    expect(screen.queryByLabelText(t('reasoningTarget'))).toBeNull()
  })

  it('clears deepseek image request limits when applying text-only', async () => {
    const b = bench('en', [
      { id: 'a', inputModalities: ['text', 'image'], imagePixelBudget: 'low', imageMaxBytes: 2048 },
      { id: 'b', inputModalities: ['text', 'image'] },
    ], 'llm-deepseek')
    await b.open()
    fireEvent.change(screen.getByLabelText(b.props.t('imageTarget')), { target: { value: 'text' } })
    fireEvent.click(screen.getByRole('button', { name: b.props.t('imageBatchTitle') }))
    const panel = within(screen.getByRole('group', { name: b.props.t('imageBatchTitle') }))
    expect(panel.getByText(b.props.t('imageBatchPreview', { capability: b.props.t('imageText') }))).toBeTruthy()
    fireEvent.click(panel.getByRole('button', { name: b.props.t('selectVisible') }))
    fireEvent.click(panel.getByRole('button', { name: b.props.t('applyTargets', { count: '2' }) }))
    fireEvent.click(screen.getByRole('button', { name: b.props.t('save') }))
    await waitFor(() => { expect(b.save).toHaveBeenCalledWith([
      { op: 'set', path: ['providers', 'gateway', 'models', '0', 'inputModalities'], value: ['text'] },
      { op: 'unset', path: ['providers', 'gateway', 'models', '0', 'imagePixelBudget'] },
      { op: 'unset', path: ['providers', 'gateway', 'models', '0', 'imageMaxBytes'] },
      { op: 'set', path: ['providers', 'gateway', 'models', '1', 'inputModalities'], value: ['text'] },
      { op: 'unset', path: ['providers', 'gateway', 'models', '1', 'imagePixelBudget'] },
      { op: 'unset', path: ['providers', 'gateway', 'models', '1', 'imageMaxBytes'] },
    ], 7) })
  })

  it('fences an image batch opened before the first draft against concurrent settings changes', async () => {
    const b = bench()
    await b.open()
    fireEvent.click(screen.getByRole('button', { name: b.props.t('imageBatchTitle') }))
    fireEvent.click(screen.getByLabelText(b.props.t('selectTarget', { model: 'a' })))
    b.props.useSettings = select => select({ ...b.snapshot, revision: 8 })
    b.view.rerender(<ProviderOptions {...b.props} />)
    expect(screen.getByRole('alert').textContent).toContain('Settings changed elsewhere')
    expect(screen.getByRole('button', { name: b.props.t('applyTargets', { count: '1' }) }).closest('fieldset')).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: b.props.t('save') })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: b.props.t('discard') }))
    expect(screen.queryByRole('group', { name: b.props.t('imageBatchTitle') })).toBeNull()
  })
})
