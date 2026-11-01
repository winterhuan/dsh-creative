/** Locale bundles for the Writer settings page (Zhuque + cover keys). */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type WriterZhuqueLocaleKey =
  | 'title' | 'description' | 'keySet' | 'keyUnset'
  | 'makersKeyLabel' | 'makersKeyHint' | 'makersKeyReadOnlyHint'
  | 'coverKeyLabel' | 'coverKeyHint' | 'coverKeyReadOnlyHint'
  | 'gptImageBaseUrlLabel' | 'gptImageBaseUrlHint'
  | 'overridden' | 'reset' | 'invalidText'
  | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'discard' | 'saveFailed'

/** English copy. */
export const en: Record<WriterZhuqueLocaleKey, string> = {
  title: 'Writing',
  description: 'Zhuque detection and cover image API keys for author-triggered skills.',
  keySet: 'A key is configured.',
  keyUnset: 'No key is configured.',
  makersKeyLabel: 'EdgeOne Makers API key (Zhuque detection)',
  makersKeyHint: 'Used by story-zhuque when you ask for a Zhuque check. Stored outside the settings file. Leave blank to keep the current key; a MAKERS_API_KEY exported in the shell that starts dsh also works.',
  makersKeyReadOnlyHint: 'The startup environment supplies this key, so it cannot be edited here. Remove the key environment variable from the shell that starts dsh and restart, then save the key here.',
  coverKeyLabel: 'GPT Image API key (cover generation)',
  coverKeyHint: 'Used by story-cover when you ask for a generated cover image. Prompt-only delivery needs no key. Stored outside the settings file. Leave blank to keep the current key; a GPT_IMAGE_API_KEY exported in the shell that starts dsh also works.',
  coverKeyReadOnlyHint: 'The startup environment supplies this key, so it cannot be edited here. Remove the key environment variable from the shell that starts dsh and restart, then save the key here.',
  gptImageBaseUrlLabel: 'GPT Image API base URL',
  gptImageBaseUrlHint: 'Base URL of an OpenAI-compatible endpoint for cover generation. Saved into the settings file; the host injects it as GPT_IMAGE_BASE_URL. Leave blank to use a shell-exported value or the default.',
  overridden: 'Overrides the default.',
  reset: 'Reset',
  invalidText: 'This value is not accepted.',
  readOnly: 'This setting is read-only.',
  unavailable: 'Writing settings are not available.',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  saveFailed: 'Could not save. Try again.',
}

/** Simplified Chinese copy. */
export const zh: Record<WriterZhuqueLocaleKey, string> = {
  title: '写作',
  description: '明确要求朱雀检测或封面生图时使用的密钥。',
  keySet: '已配置密钥。',
  keyUnset: '未配置密钥。',
  makersKeyLabel: 'EdgeOne Makers API Key（朱雀检测）',
  makersKeyHint: '供 story-zhuque 在你明确要求朱雀检测时使用。不写入设置文件。留空表示保持当前密钥；在启动 dsh 的 shell 里 export 的 MAKERS_API_KEY 同样有效。',
  makersKeyReadOnlyHint: '当前密钥由启动环境提供，无法在网页修改。请在启动 dsh 的 shell 中取消该密钥环境变量后重启，再在此保存密钥',
  coverKeyLabel: 'GPT Image API Key（封面生图）',
  coverKeyHint: '供 story-cover 在你明确要求生成封面图时使用。仅提示词交付不需要密钥。不写入设置文件。留空表示保持当前密钥；在启动 dsh 的 shell 里 export 的 GPT_IMAGE_API_KEY 同样有效。',
  coverKeyReadOnlyHint: '当前密钥由启动环境提供，无法在网页修改。请在启动 dsh 的 shell 中取消该密钥环境变量后重启，再在此保存密钥',
  gptImageBaseUrlLabel: 'GPT Image API Base URL',
  gptImageBaseUrlHint: '封面生图兼容端点的 Base URL，保存在设置文件里，Host 会注入为 GPT_IMAGE_BASE_URL。留空表示使用 shell 导出的值或默认值。',
  overridden: '覆盖默认值。',
  reset: '重置',
  invalidText: '此值不被接受。',
  readOnly: '此设置只读。',
  unavailable: '写作设置不可用。',
  save: '保存',
  saving: '正在保存…',
  discard: '放弃',
  saveFailed: '未能保存。请再试一次。',
}

/**
 * Labels the shared settings form reads from this page's dictionary.
 * @param t - the bound translator.
 * @returns the form chrome labels.
 */
export function formLabels(t: (key: WriterZhuqueLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
