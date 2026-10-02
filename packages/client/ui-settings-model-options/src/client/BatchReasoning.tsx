/** Searchable recipients and an explicit preview of the thinking configuration to copy. */
import { useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { THINKING_LEVELS } from './options.ts'
import type { ModelOption, ReasoningDraft } from './options.ts'
import css from './options.module.css'

/**
 * Summarize a configured capability without inferring an endpoint's support.
 * @param reasoning - the stored or staged model configuration.
 * @param t - model options dictionary.
 * @returns inheritance, non-thinking, or the explicitly selected level names.
 */
export function reasoningSummary(reasoning: ReasoningDraft, t: TranslateNS<'settings.modelOptions'>): string {
  if (reasoning.mode === 'inherit') return t('summaryInherit')
  if (reasoning.mode === 'disabled') return t('disabled')
  const selected = THINKING_LEVELS.filter(level => reasoning.efforts[level] !== undefined)
  return selected.length === 0 ? t('summaryEmpty') : selected.map(level => t(level)).join(' / ')
}

/** One target model's current configuration, including unsaved edits. */
export interface ReasoningTarget extends ModelOption {
  summary: string
}

/** Preview and selection actions; applying changes drafts, never the Host settings. */
export interface BatchReasoningProps {
  sourceName: string
  reasoning: ReasoningDraft
  targets: readonly ReasoningTarget[]
  t: TranslateNS<'settings.modelOptions'>
  onApply: (ids: readonly string[]) => void
  onCancel: () => void
}

/**
 * Select models that will receive the source's levels and exact parameter mapping.
 * @param props - source preview, available targets, localized copy, and draft actions.
 * @returns an inline selection panel with no targets preselected.
 */
export function BatchReasoning({ sourceName, reasoning, targets, t, onApply, onCancel }: BatchReasoningProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const query = search.trim().toLowerCase()
  const visible = targets.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(query))
  const recipients = targets.filter(model => selected.has(model.id))
  const allVisible = visible.length > 0 && visible.every(model => selected.has(model.id))
  return <section className={css.batch} role="group" aria-label={t('batchTitle')}>
    <p className={css.hint}>{t('batchSource', { model: sourceName })}</p>
    <div className={css.preview}>
      <p className={css.hint}>{reasoningSummary(reasoning, t)}</p>
      {reasoning.mode === 'custom' ? <dl className={css.mappingPreview}>
        {THINKING_LEVELS.filter(level => reasoning.efforts[level] !== undefined).map(level => <div key={level}>
          <dt>{t(level)}</dt>
          <dd>{level === 'off' && reasoning.efforts[level]?.trim() === '' ? t('omitParameter') : reasoning.efforts[level]}</dd>
        </div>)}
      </dl> : reasoning.mode === 'inherit' ? <p className={css.hint}>{t('batchInheritHint')}</p> : null}
    </div>
    <p className={css.hint}>{t('batchHint')}</p>
    <label className={css.field}>
      <span>{t('searchModels')}</span>
      <input type="search" value={search} onChange={event => { setSearch(event.target.value) }} />
    </label>
    <button type="button" className={css.link} disabled={visible.length === 0} onClick={() => {
      const next = new Set(selected)
      for (const model of visible) {
        if (allVisible) next.delete(model.id)
        else next.add(model.id)
      }
      setSelected(next)
    }}>{t(allVisible ? 'deselectVisible' : 'selectVisible')}</button>
    <ul className={css.targetList}>
      {visible.map(model => <li key={model.id}>
        <label className={css.target}>
          <input type="checkbox" aria-label={t('selectTarget', { model: model.name === model.id ? model.id : `${model.name} (${model.id})` })}
            checked={selected.has(model.id)} onChange={event => {
              const next = new Set(selected)
              if (event.target.checked) next.add(model.id)
              else next.delete(model.id)
              setSelected(next)
            }} />
          <span className={css.targetCopy}>
            <span>{model.name === model.id ? model.id : `${model.name} (${model.id})`}</span>
            <span className={css.hint}>{model.summary}</span>
          </span>
        </label>
      </li>)}
    </ul>
    {visible.length === 0 ? <p className={css.hint}>{t('noMatches')}</p> : null}
    <p className={css.hint} aria-live="polite">{t('selectedTargets', { count: String(recipients.length) })}</p>
    {recipients.length > 0 ? <p className={css.recipientNames}>{recipients.map(model => model.name === model.id ? model.id : `${model.name} (${model.id})`).join(t('listSeparator'))}</p> : null}
    <div className={css.actions}>
      <button type="button" className={css.discard} onClick={onCancel}>{t('cancelBatch')}</button>
      <button type="button" className={css.save} disabled={recipients.length === 0} onClick={() => { onApply(recipients.map(model => model.id)) }}>
        {t('applyTargets', { count: String(recipients.length) })}
      </button>
    </div>
  </section>
}
