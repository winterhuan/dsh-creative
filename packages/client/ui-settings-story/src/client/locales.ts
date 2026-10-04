/** Locale bundles for the story Zhuque settings page. */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale keys the page renders. */
export type StorySettingsLocaleKey =
  | 'title' | 'description' | 'keySet' | 'keyUnset'
  | 'makersKeyLabel' | 'makersKeyHint'
  | 'manageKeys' | 'keysDialogDescription' | 'keysDialogPlaceholder'
  | 'keysCount' | 'keysClear' | 'keysCloseLabel'
  | 'readOnly' | 'unavailable'
  | 'save' | 'saving' | 'discard' | 'saveFailed'

/** English copy. */
export const en: Record<StorySettingsLocaleKey, string> = {
  title: 'Story',
  description: 'Zhuque detection key for explicitly requested chapter checks.',
  keySet: 'A key is configured.',
  keyUnset: 'No key is configured.',
  makersKeyLabel: 'EdgeOne Makers API key (Zhuque detection)',
  makersKeyHint: 'Used by story-polish when you ask for a Zhuque check. Stored outside the settings file. Leave blank to keep the current key; a MAKERS_API_KEY exported in the shell that starts dsh also works.',
  manageKeys: 'Manage keys in bulk',
  keysDialogDescription: 'One key per line. Blank lines are ignored. Saving replaces the stored pool.',
  keysDialogPlaceholder: 'Paste keys, one per line',
  keysCount: 'Keys: ',
  keysClear: 'Clear',
  keysCloseLabel: 'Close',
  readOnly: 'This setting is read-only.',
  unavailable: 'Story settings are not available.',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  saveFailed: 'Could not save. Try again.',
}

/** Simplified Chinese copy. */
export const zh: Record<StorySettingsLocaleKey, string> = {
  title: '小说',
  description: '明确要求朱雀检测时使用的密钥。',
  keySet: '已配置密钥。',
  keyUnset: '未配置密钥。',
  makersKeyLabel: 'EdgeOne Makers API Key（朱雀检测）',
  makersKeyHint: '供 story-polish 在你明确要求朱雀检测时使用。不写入设置文件。留空表示保持当前密钥；在启动 dsh 的 shell 里 export 的 MAKERS_API_KEY 同样有效。',
  manageKeys: '批量管理密钥',
  keysDialogDescription: '每行一个密钥。空行会被忽略。保存会替换已存的密钥池。',
  keysDialogPlaceholder: '粘贴密钥，每行一个',
  keysCount: '密钥数：',
  keysClear: '清空',
  keysCloseLabel: '关闭',
  readOnly: '此设置只读。',
  unavailable: '小说设置不可用。',
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
export function formLabels(t: (key: StorySettingsLocaleKey) => string): SettingsFormLabels {
  return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
}
