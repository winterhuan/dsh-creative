/** Provider-card controls; drafts remain local until one atomic settings save succeeds. */
import { useEffect, useId, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ModelCatalogModel } from '@deepseek-ai/dsh-api-remotes/client'
import { STANDARD_REASONING, draftError, imageDraft, modelOptions, optionOperations, reasoningDraft, retryableCodes } from './options.ts'
import type { ImageDraft, ImageField, OptionsDraft, ReasoningDraft, RetryDraft } from './options.ts'
import type { ProviderOptionsFace } from './operations.ts'
import { BatchReasoning, reasoningSummary } from './BatchReasoning.tsx'
import { BatchImage, imageSummary } from './BatchImage.tsx'
import css from './options.module.css'

/** Provider identity, translated copy, settings snapshot, and Host actions supplied by the slot. */
export type ProviderOptionsProps = PropsRuntime<'settings.models.provider-card'>
  & PropsLocale<'settings.modelOptions'> & InjectFace<ProviderOptionsFace>

/**
 * Render the saved provider's optional controls without adding another settings page.
 * @param props - provider-card owner and injected settings actions.
 * @returns a disclosure, or nothing for an unsaved provider.
 */
export function ProviderOptions(props: ProviderOptionsProps) {
  const [open, setOpen] = useState(false)
  const snapshot = props.useSettings(value => value)
  if (!props.configured) return null
  return <details className={css.details} onToggle={event => { setOpen(event.currentTarget.open) }}>
    <summary>{props.t('title')}</summary>
    {open ? <OptionsEditor {...props} snapshot={snapshot} /> : null}
  </details>
}

/** One capability staged for a batch apply, with the snapshot the panel opened against. */
interface CapabilityBatch<T> {
  capability: T
  snapshot: ConfigFormSnapshot<unknown>
}

function OptionsEditor(props: ProviderOptionsProps & { snapshot: ConfigFormSnapshot<unknown> }) {
  const { snapshot, provider, read, t, loadModels, save } = props
  const id = useId()
  const [draft, setDraft] = useState<OptionsDraft | null>(null)
  const [reasoningMode, setReasoningMode] = useState<ReasoningDraft['mode']>('custom')
  const [reasoningBatch, setReasoningBatch] = useState<CapabilityBatch<ReasoningDraft> | null>(null)
  const [imageMode, setImageMode] = useState<ImageDraft['mode']>('textAndImage')
  const [imageBatch, setImageBatch] = useState<CapabilityBatch<ImageDraft> | null>(null)
  const [catalog, setCatalog] = useState<readonly ModelCatalogModel[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [conflicted, setConflicted] = useState(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const piAi = provider.settingsNs === 'llm-pi-ai'
  useEffect(() => {
    if (!piAi) return
    let current = true
    void loadModels(provider.provider).then(result => {
      if (!current) return
      if (result.ok) { setCatalog(result.models); setCatalogError(null) }
      else setCatalogError(result.message)
    })
    return () => { current = false }
  }, [piAi, loadModels, provider.provider, snapshot.revision, reload])

  const source = draft?.snapshot ?? reasoningBatch?.snapshot ?? imageBatch?.snapshot ?? snapshot
  const profile = read(source.value, provider.settingsPath)
  const imageField: ImageField = piAi ? 'input' : 'inputModalities'
  const models = modelOptions(profile, catalog, read, imageField)
  const stale = conflicted || source.revision !== snapshot.revision
  const error = draft === null ? undefined : draftError(draft)
  const blocked = saving || !snapshot.writable || stale || snapshot.status !== 'ready'
  const retry = draft?.retry
  const policyPath = [...provider.settingsPath, 'retryPolicy']
  const inherited = retry?.mode === 'inherit'
  const policySource = inherited ? source.base : source.value
  const unlimited = retry?.mode !== 'normal' && read(policySource, [...policyPath, 'mode']) === 'always'
  const retries = read(policySource, [...policyPath, 'maxRetries'])
  const retryText = retry?.mode === 'normal' ? retry.count : unlimited ? '' : String(typeof retries === 'number' ? retries : 5)
  const codes = retryableCodes(source.value, provider.settingsPath, read)
  const retryInvalid = unlimited || (draft?.retryInvalidRequests ?? codes.includes('INVALID_REQUEST'))
  const retryAuth = unlimited || (draft?.retryAuthErrors ?? codes.includes('AUTH'))
  const retryQuota = unlimited || (draft?.retryQuotaErrors ?? codes.includes('QUOTA'))
  const retryUnclassified = unlimited || (draft?.retryUnclassifiedErrors ?? codes.includes('PI_AI_ERROR'))

  const edit = (change: (current: OptionsDraft) => OptionsDraft): void => {
    setDraft(current => change(current ?? { snapshot: source, reasoning: new Map(), image: new Map() }))
  }
  const editRetry = (next: RetryDraft): void => { edit(current => ({ ...current, retry: next })) }
  const summaries = models.map(item => {
    const pending = draft?.reasoning.get(item.id)
    const summary = reasoningSummary(pending ?? reasoningDraft(item.reasoning), t)
    return { id: item.id, name: item.name, summary: pending === undefined ? summary : t('pendingSummary', { summary }) }
  })
  const imageSummaries = models.map(item => {
    const pending = draft?.image.get(item.id)
    const summary = imageSummary(pending ?? imageDraft(item.image), t)
    return { id: item.id, name: item.name, summary: pending === undefined ? summary : t('pendingSummary', { summary }) }
  })
  const submit = async (): Promise<void> => {
    if (draft === null || reasoningBatch !== null || imageBatch !== null || blocked || error !== undefined || draft.snapshot.revision === undefined) return
    setSaving(true)
    const result = await save(optionOperations(draft, provider.settingsPath, models, read), draft.snapshot.revision)
    if (!active.current) return
    setSaving(false)
    if (result.ok) { setDraft(null); setConflicted(false) }
    else if (result.conflict) setConflicted(true)
  }

  if (snapshot.status !== 'ready') return <p role="status">{t('unavailable')}</p>
  return <div className={css.editor}>
    {!snapshot.writable ? <p className={css.notice} role="status">{t('readOnly')}</p> : null}
    {piAi && catalogError !== null ? <div className={css.notice} role="status">
      {t('catalogFailed', { message: catalogError })}
      <button type="button" className={css.link} onClick={() => { setReload(value => value + 1) }}>{t('reload')}</button>
    </div> : null}
    {piAi && models.length > 0 ? <fieldset className={css.group} disabled={blocked || imageBatch !== null}>
      <legend>{t('reasoning')}</legend>
      {reasoningBatch !== null ? <BatchReasoning reasoning={reasoningBatch.capability} targets={summaries} t={t}
        onCancel={() => { setReasoningBatch(null) }} onApply={ids => {
          edit(current => {
            const next = new Map(current.reasoning)
            for (const target of ids) next.set(target, reasoningBatch.capability)
            return { ...current, reasoning: next }
          })
          setReasoningBatch(null)
        }} /> : <>
        <p className={css.hint}>{t('reasoningHint')}</p>
        <div className={css.field}>
          <label htmlFor={`${id}-reasoning`}>{t('reasoningTarget')}</label>
          <select id={`${id}-reasoning`} value={reasoningMode} onChange={event => {
            const mode = event.target.value
            if (mode === 'inherit' || mode === 'disabled' || mode === 'custom') setReasoningMode(mode)
          }}>
            <option value="custom">{t('reasoningEnabled')}</option>
            <option value="disabled">{t('disabled')}</option>
            <option value="inherit">{t('inherit')}</option>
          </select>
        </div>
        <button type="button" className={css.discard} onClick={() => {
          setReasoningBatch({
            capability: reasoningMode === 'custom' ? { ...STANDARD_REASONING, efforts: { ...STANDARD_REASONING.efforts } }
              : { mode: reasoningMode, efforts: {} },
            snapshot: source,
          })
        }}>{t('reasoningBatchTitle')}</button>
      </>}
    </fieldset> : null}
    {models.length > 0 ? <fieldset className={css.group} disabled={blocked || reasoningBatch !== null}>
      <legend>{t('imageInput')}</legend>
      {imageBatch !== null ? <BatchImage image={imageBatch.capability} targets={imageSummaries} t={t}
        onCancel={() => { setImageBatch(null) }} onApply={ids => {
          edit(current => {
            const next = new Map(current.image)
            for (const target of ids) next.set(target, { mode: imageBatch.capability.mode })
            return { ...current, image: next }
          })
          setImageBatch(null)
        }} /> : <>
        <p className={css.hint}>{t('imageInputHint')}</p>
        <div className={css.field}>
          <label htmlFor={`${id}-image`}>{t('imageTarget')}</label>
          <select id={`${id}-image`} value={imageMode} onChange={event => {
            const mode = event.target.value
            if (mode === 'inherit' || mode === 'text' || mode === 'textAndImage') setImageMode(mode)
          }}>
            <option value="textAndImage">{t('imageTextAndImage')}</option>
            <option value="text">{t('imageText')}</option>
            {piAi ? <option value="inherit">{t('imageInherit')}</option> : null}
          </select>
        </div>
        <button type="button" className={css.discard} onClick={() => {
          setImageBatch({ capability: { mode: imageMode }, snapshot: source })
        }}>{t('imageBatchTitle')}</button>
      </>}
    </fieldset> : null}
    <fieldset className={css.group} disabled={blocked}>
      <legend>{t('retry')}</legend>
      <p className={css.hint} id={`${id}-retry-hint`}>{t('retryHint')}</p>
      {unlimited ? <p className={css.notice}>{t('unlimited')}</p> : null}
      <input className={css.count} type="number" min={0} max={Number.MAX_SAFE_INTEGER} step={1}
        aria-label={t('retry')} aria-describedby={`${id}-retry-hint`} aria-invalid={error === 'invalidRetries'}
        value={retryText} onChange={event => { editRetry({ mode: 'normal', count: event.target.value }) }} />
      <button type="button" className={css.link} onClick={() => { editRetry({ mode: 'inherit' }) }}>{t('inheritedRetry')}</button>
      {inherited ? <p className={css.hint}>{t('restored')}</p> : null}
      <label className={css.check}>
        <input type="checkbox" checked={retryInvalid} disabled={unlimited} aria-describedby={`${id}-invalid-retry-hint`}
          onChange={event => { const checked = event.target.checked; edit(current => ({ ...current, retryInvalidRequests: checked })) }} />
        {t('retryInvalidRequests')}
      </label>
      <p className={css.hint} id={`${id}-invalid-retry-hint`}>{t('retryInvalidHint')}</p>
      <label className={css.check}>
        <input type="checkbox" checked={retryAuth} disabled={unlimited} aria-describedby={`${id}-auth-retry-hint`}
          onChange={event => { const checked = event.target.checked; edit(current => ({ ...current, retryAuthErrors: checked })) }} />
        {t('retryAuthErrors')}
      </label>
      <p className={css.hint} id={`${id}-auth-retry-hint`}>{t('retryAuthHint')}</p>
      <label className={css.check}>
        <input type="checkbox" checked={retryQuota} disabled={unlimited} aria-describedby={`${id}-quota-retry-hint`}
          onChange={event => { const checked = event.target.checked; edit(current => ({ ...current, retryQuotaErrors: checked })) }} />
        {t('retryQuotaErrors')}
      </label>
      <p className={css.hint} id={`${id}-quota-retry-hint`}>{t('retryQuotaHint')}</p>
      {piAi ? <>
        <label className={css.check}>
          <input type="checkbox" checked={retryUnclassified} disabled={unlimited} aria-describedby={`${id}-unclassified-retry-hint`}
            onChange={event => { const checked = event.target.checked; edit(current => ({ ...current, retryUnclassifiedErrors: checked })) }} />
          {t('retryUnclassifiedErrors')}
        </label>
        <p className={css.hint} id={`${id}-unclassified-retry-hint`}>{t('retryUnclassifiedHint')}</p>
      </> : null}
      {!unlimited && !retryInvalid && !retryAuth && !retryQuota && !retryUnclassified && codes.length > 0 && codes.every(code => code === 'INVALID_REQUEST' || code === 'AUTH' || code === 'QUOTA' || code === 'PI_AI_ERROR')
        ? <p className={css.hint}>{t('retryDefaultsRestored')}</p> : null}
    </fieldset>
    <div className={css.validation} aria-live="polite">
      {stale ? <p role="alert">{t('conflict')}</p> : error === undefined ? null : <p role="alert">{t(error)}</p>}
    </div>
    <div className={css.actions}>
      <button type="button" className={css.save} disabled={blocked || draft === null || reasoningBatch !== null || imageBatch !== null || error !== undefined} onClick={() => { void submit() }}>
        {saving ? t('saving') : t('save')}
      </button>
      <button type="button" className={css.discard} disabled={saving || draft === null && reasoningBatch === null && imageBatch === null} onClick={() => { setDraft(null); setReasoningBatch(null); setImageBatch(null); setConflicted(false) }}>
        {t('discard')}
      </button>
    </div>
  </div>
}
