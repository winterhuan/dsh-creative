/** Searchable recipients and an explicit preview of the image capability to apply. */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { ImageDraft } from './options.ts'
import { BatchTargets } from './BatchTargets.tsx'
import type { BatchTarget } from './BatchTargets.tsx'
import css from './options.module.css'

/**
 * Summarize an image capability declaration without inferring an endpoint's support.
 * @param image - the stored or staged model configuration.
 * @param t - model options dictionary.
 * @returns inherited, text-only, or text-and-image.
 */
export function imageSummary(image: ImageDraft, t: TranslateNS<'settings.modelOptions'>): string {
  if (image.mode === 'inherit') return t('summaryInherit')
  return image.mode === 'textAndImage' ? t('imageTextAndImage') : t('imageText')
}

/** Preview and selection actions; applying changes drafts, never the Host settings. */
export interface BatchImageProps {
  image: ImageDraft
  targets: readonly BatchTarget[]
  t: TranslateNS<'settings.modelOptions'>
  onApply: (ids: readonly string[]) => void
  onCancel: () => void
}

/**
 * Select models that will receive one image capability.
 * @param props - capability preview, available targets, localized copy, and draft actions.
 * @returns an inline selection panel with no targets preselected.
 */
export function BatchImage({ image, targets, t, onApply, onCancel }: BatchImageProps) {
  return <BatchTargets label={t('imageBatchTitle')}
    hint={t('imageBatchHint')} targets={targets} t={t} onApply={onApply} onCancel={onCancel}
    preview={<p className={css.hint}>{t('imageBatchPreview', { capability: imageSummary(image, t) })}</p>} />
}
