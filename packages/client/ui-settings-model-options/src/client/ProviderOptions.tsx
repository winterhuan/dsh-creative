/** Provider-card controls; drafts remain local until one atomic settings save succeeds. */
import { useEffect, useId, useRef, useState } from 'react'
import { IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ModelCatalogModel } from '@deepseek-ai/dsh-api-remotes/client'
import { THINKING_LEVELS, draftError, modelOptions, optionOperations, reasoningDraft, reasoningError, retryableCodes } from './options.ts'
import type { OptionsDraft, ReasoningDraft, RetryDraft } from './options.ts'
import type { ProviderOptionsFace } from './operations.ts'
import { BatchReasoning, reasoningSummary } from './BatchReasoning.tsx'
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

function OptionsEditor(props: ProviderOptionsProps & { snapshot: ConfigFormSnapshot<unknown> }) {
  const { snapshot, provider, read, t, loadModels, save } = props
  const id = useId()
  const [draft, setDraft] = useState<OptionsDraft | null>(null)
  const [batch, setBatch] = useState<{
    id: string; name: string; reasoning: ReasoningDraft; snapshot: ConfigFormSnapshot<unknown>
  } | null>(null)
  const [selected, setSelected] = useState('')
  const [catalog, setCatalog] = useState<readonly ModelCatalogModel[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogLoaded, setCatalogLoaded] = useState(false)
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
      setCatalogLoaded(true)
      if (result.ok) { setCatalog(result.models); setCatalogError(null) }
      else setCatalogError(result.message)
    })
    return () => { current = false }
  }, [piAi, loadModels, provider.provider, snapshot.revision, reload])

  const source = draft?.snapshot ?? batch?.snapshot ?? snapshot
  const profile = read(source.value, provider.settingsPath)
  const models = modelOptions(profile, catalog, read)
  const model = models.find(candidate => candidate.id === selected) ?? models[0]
  const reasoning = model === undefined ? undefined : draft?.reasoning.get(model.id) ?? reasoningDraft(model.reasoning)
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

  const edit = (change: (current: OptionsDraft) => OptionsDraft): void => {
    setDraft(current => change(current ?? { snapshot: source, reasoning: new Map() }))
  }
  const editRetry = (next: RetryDraft): void => { edit(current => ({ ...current, retry: next })) }
  const editReasoning = (next: ReasoningDraft): void => {
    if (model !== undefined) edit(current => ({ ...current, reasoning: new Map(current.reasoning).set(model.id, next) }))
  }
  const summaries = models.map(item => {
    const pending = draft?.reasoning.get(item.id)
    const summary = reasoningSummary(pending ?? reasoningDraft(item.reasoning), t)
    return { ...item, summary: pending === undefined ? summary : t('pendingSummary', { summary }) }
  })
  const submit = async (): Promise<void> => {
    if (draft === null || batch !== null || blocked || error !== undefined || draft.snapshot.revision === undefined) return
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
    {piAi ? <fieldset className={css.group} disabled={blocked}>
      <legend>{t('reasoning')}</legend>
      <p className={css.hint}>{t('reasoningHint')}</p>
      {catalogError === null ? null : <div className={css.notice} role="status">
        {t('catalogFailed', { message: catalogError })}
        <button type="button" className={css.link} onClick={() => { setReload(value => value + 1) }}>{t('reload')}</button>
      </div>}
      {batch !== null ? <BatchReasoning sourceName={batch.name} reasoning={batch.reasoning}
        targets={summaries.filter(item => item.id !== batch.id)} t={t}
        onCancel={() => { setBatch(null) }} onApply={ids => {
          if (blocked) return
          edit(current => {
            const next = new Map(current.reasoning)
            for (const target of ids) next.set(target, { mode: batch.reasoning.mode, efforts: { ...batch.reasoning.efforts } })
            return { ...current, reasoning: next }
          })
          setBatch(null)
        }} /> : model === undefined || reasoning === undefined ? catalogLoaded
        ? <p className={css.hint}>{t('noModels')}</p>
        : <div className={css.loading} role="status" aria-label={t('loadingModels')}><IconLoadingOutlineRegular className={css.spinner} /></div>
        : <>
        <div className={css.field}>
          <label htmlFor={`${id}-model`}>{t('model')}</label>
          <select id={`${id}-model`} value={model.id} onChange={event => { setSelected(event.target.value) }}>
            {summaries.map(item => <option key={item.id} value={item.id}>{t('modelOption', {
              model: item.name === item.id ? item.id : `${item.name} (${item.id})`, summary: item.summary,
            })}</option>)}
          </select>
        </div>
        <div className={css.field}>
          <label htmlFor={`${id}-reasoning`}>{t('reasoning')}</label>
          <select id={`${id}-reasoning`} value={reasoning.mode} onChange={event => {
            const mode = event.target.value
            if (mode === 'inherit' || mode === 'disabled' || mode === 'custom') editReasoning({ ...reasoning, mode })
          }}>
            <option value="inherit">{t('inherit')}</option>
            <option value="disabled">{t('disabled')}</option>
            <option value="custom">{t('custom')}</option>
          </select>
        </div>
        {reasoning.mode === 'custom' ? <>
          <fieldset className={css.levels}>
            <legend>{t('levels')}</legend>
            {THINKING_LEVELS.map(level => <label className={css.check} key={level}>
              <input type="checkbox" checked={reasoning.efforts[level] !== undefined} onChange={event => {
                const efforts = { ...reasoning.efforts }
                if (event.target.checked) efforts[level] = level === 'off' ? '' : level
                else delete efforts[level]
                editReasoning({ mode: 'custom', efforts })
              }} />
              {t(level)}
            </label>)}
          </fieldset>
          <details className={css.mapping}>
            <summary>{t('mapping')}</summary>
            <p className={css.hint}>{t('mappingHint')}</p>
            {THINKING_LEVELS.filter(level => reasoning.efforts[level] !== undefined).map(level => <label className={css.field} key={level}>
              <span>{t('wireValue', { level: t(level) })}</span>
              <input type="text" value={reasoning.efforts[level] ?? ''} onChange={event => {
                editReasoning({ mode: 'custom', efforts: { ...reasoning.efforts, [level]: event.target.value } })
              }} />
            </label>)}
          </details>
        </> : null}
        <button type="button" className={css.link} onClick={() => { editReasoning({ mode: 'inherit', efforts: {} }) }}>
          {t('inheritedReasoning')}
        </button>
        {models.length > 1 ? <button type="button" className={css.discard} disabled={reasoningError(reasoning) !== undefined} onClick={() => {
          setBatch({ id: model.id, name: model.name === model.id ? model.id : `${model.name} (${model.id})`,
            reasoning: { mode: reasoning.mode, efforts: { ...reasoning.efforts } }, snapshot: source })
        }}>{t('batchTitle')}</button> : null}
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
      {!unlimited && !retryInvalid && !retryAuth && !retryQuota && codes.length > 0 && codes.every(code => code === 'INVALID_REQUEST' || code === 'AUTH' || code === 'QUOTA')
        ? <p className={css.hint}>{t('retryDefaultsRestored')}</p> : null}
    </fieldset>
    <div className={css.validation} aria-live="polite">
      {stale ? <p role="alert">{t('conflict')}</p> : error === undefined ? null : <p role="alert">{t(error)}</p>}
    </div>
    <div className={css.actions}>
      <button type="button" className={css.save} disabled={blocked || draft === null || batch !== null || error !== undefined} onClick={() => { void submit() }}>
        {saving ? t('saving') : t('save')}
      </button>
      <button type="button" className={css.discard} disabled={saving || draft === null && batch === null} onClick={() => { setDraft(null); setBatch(null); setConflicted(false) }}>
        {t('discard')}
      </button>
    </div>
  </div>
}
