/** Searchable recipients and an explicit preview of the thinking capability to apply. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReasoningDraft, ThinkingLevel } from './options.ts'
import { BatchTargets } from './BatchTargets.tsx'
import type { BatchTarget } from './BatchTargets.tsx'
import css from './options.module.css'

/** Levels the batch offers locale labels for; anything else prints its own name. */
const LABELED_LEVELS = ['off', 'low', 'medium', 'high'] as const

/**
 * Summarize a configured capability without inferring an endpoint's support.
 * @param reasoning - the stored or staged model configuration.
 * @param t - model options dictionary.
 * @returns inheritance, non-thinking, or the explicitly selected level names.
 */
export function reasoningSummary(reasoning: ReasoningDraft, t: TranslateNS<'settings.modelOptions'>): string {
  if (reasoning.mode === 'inherit') return t('summaryInherit')
  if (reasoning.mode === 'disabled') return t('disabled')
  const label = (level: ThinkingLevel): string =>
    (LABELED_LEVELS as readonly string[]).includes(level) ? t(level as (typeof LABELED_LEVELS)[number]) : level
  const selected = Object.keys(reasoning.efforts) as ThinkingLevel[]
  return selected.length === 0 ? t('summaryEmpty') : selected.map(label).join(' / ')
}

/** Preview and selection actions; applying changes drafts, never the Host settings. */
export interface BatchReasoningProps {
  reasoning: ReasoningDraft
  targets: readonly BatchTarget[]
  t: TranslateNS<'settings.modelOptions'>
  onApply: (ids: readonly string[]) => void
  onCancel: () => void
}

/**
 * Select models that will receive one thinking capability.
 * @param props - capability preview, available targets, localized copy, and draft actions.
 * @returns an inline selection panel with no targets preselected.
 */
export function BatchReasoning({ reasoning, targets, t, onApply, onCancel }: BatchReasoningProps) {
  return <BatchTargets label={t('reasoningBatchTitle')}
    hint={t('reasoningBatchHint')} targets={targets} t={t} onApply={onApply} onCancel={onCancel}
    preview={<p className={css.hint}>{t('reasoningBatchPreview', { capability: reasoningSummary(reasoning, t) })}</p>} />
}
