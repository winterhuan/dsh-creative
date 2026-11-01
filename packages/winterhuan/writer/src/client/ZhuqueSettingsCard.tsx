/**
 * The Writer settings page: Zhuque detection key and cover image API key.
 * Keys are written through the credentials domain, never into the settings section.
 */

import { type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './zhuque-locales.ts'
import type { WriterZhuqueCardFace, WriterZhuqueKeyControlState } from './zhuque-settings-controller.ts'

/** Props the renderer binds for the Writer settings page. */
export type ZhuqueSettingsCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.writer'>
  & InjectFace<WriterZhuqueCardFace>

/**
 * Render the Writer settings page, or its one-liner when the Plugins page asks for a summary.
 * @param props - the view asked for, locale copy, the page snapshot, and its form actions.
 * @returns the one-liner, or the form.
 */
export function ZhuqueSettingsCard(props: ZhuqueSettingsCardProps): ReactNode {
  const { t } = props
  const state = props.useWriterZhuqueCard(snapshot => snapshot)
  if (props.view === 'summary') return t('description')
  const control: WriterZhuqueKeyControlState = state.key
  const cover: WriterZhuqueKeyControlState = state.coverKey
  return (
    <SettingsForm
      labels={formLabels(t)}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SettingsSecretField
        id="plugin-config-writer-makers-key"
        label={t('makersKeyLabel')}
        hint={t(control.writable ? 'makersKeyHint' : 'makersKeyReadOnlyHint')}
        stateLabel={control.configured ? t('keySet') : t('keyUnset')}
        onEdit={(text) => { props.edit('makersApiKey', text) }}
        disabled={!control.writable}
        text={control.draft.text}
        configured={control.configured}
      />
      <SettingsSecretField
        id="plugin-config-writer-cover-key"
        label={t('coverKeyLabel')}
        hint={t(cover.writable ? 'coverKeyHint' : 'coverKeyReadOnlyHint')}
        stateLabel={cover.configured ? t('keySet') : t('keyUnset')}
        onEdit={(text) => { props.edit('gptImageApiKey', text) }}
        disabled={!cover.writable}
        text={cover.draft.text}
        configured={cover.configured}
      />
      <SettingsValueField
        id="plugin-config-writer-cover-base-url"
        label={t('gptImageBaseUrlLabel')}
        hint={t('gptImageBaseUrlHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidText')}
        placeholder="https://api.openai.com/v1"
        disabled={!state.writable}
        {...state.gptImageBaseUrl}
        onEdit={(text) => { props.edit('gptImageBaseUrl', text) }}
        onReset={() => { props.resetField('gptImageBaseUrl') }}
      />
    </SettingsForm>
  )
}
