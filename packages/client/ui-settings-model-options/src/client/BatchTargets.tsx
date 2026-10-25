/** Searchable recipients shared by the capability batch panels. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './options.module.css'

/** One target model's current configuration, including unsaved edits. */
export interface BatchTarget {
  id: string
  name: string
  summary: string
}

/** Preview and selection actions; applying changes drafts, never the Host settings. */
export interface BatchTargetsProps {
  /** Accessible name of the selection group. */
  label: string
  /** Optional line naming the configuration being copied. */
  source?: string
  /** Preview of the capability that will replace the selected drafts. */
  preview: ReactNode
  /** Explanation of what applying does. */
  hint: string
  targets: readonly BatchTarget[]
  t: TranslateNS<'settings.modelOptions'>
  onApply: (ids: readonly string[]) => void
  onCancel: () => void
}

/**
 * Select models that will receive one capability and review it before applying.
 * @param props - capability preview, available targets, localized copy, and draft actions.
 * @returns an inline selection panel with no targets preselected.
 */
export function BatchTargets({ label, source, preview, hint, targets, t, onApply, onCancel }: BatchTargetsProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const query = search.trim().toLowerCase()
  const visible = targets.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(query))
  const recipients = targets.filter(model => selected.has(model.id))
  const allVisible = visible.length > 0 && visible.every(model => selected.has(model.id))
  return <section className={css.batch} role="group" aria-label={label}>
    {source === undefined ? null : <p className={css.hint}>{source}</p>}
    <div className={css.preview}>{preview}</div>
    <p className={css.hint}>{hint}</p>
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
