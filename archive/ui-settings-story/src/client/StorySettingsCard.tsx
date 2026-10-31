/**
 * The story settings page: the Zhuque detection key.
 * The key is written through the credentials domain, never into the settings section.
 */

import { useState, type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './card.module.css'
import { KeysDialog } from './KeysDialog.tsx'
import { formLabels } from './locales.ts'
import type { StoryKeyControlState, StorySettingsCardFace } from './story-settings-controller.ts'

/** Props the renderer binds for the story settings page. */
export type StorySettingsCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.story'>
  & InjectFace<StorySettingsCardFace>

/**
 * Render the story settings page, or its one-liner when the Plugins page asks for a summary.
 * @param props - the view asked for, locale copy, the page snapshot, and its form actions.
 * @returns the one-liner, or the form.
 */
export function StorySettingsCard(props: StorySettingsCardProps): ReactNode {
  const { t } = props
  const state = props.useStorySettingsCard(snapshot => snapshot)
  const [bulk, setBulk] = useState(false)
  if (props.view === 'summary') return t('description')
  const control: StoryKeyControlState = state.key
  return (
    <SettingsForm
      labels={formLabels(t)}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <SettingsSecretField
        id="plugin-config-story-makers-key"
        label={t('makersKeyLabel')}
        hint={t(control.writable ? 'makersKeyHint' : 'makersKeyReadOnlyHint')}
        stateLabel={control.configured ? t('keySet') : t('keyUnset')}
        onEdit={(text) => { props.edit('makersApiKey', text) }}
        disabled={!control.writable}
        text={control.draft.text}
        configured={control.configured}
      />
      <button
        type="button"
        className={css.manage}
        disabled={!control.writable}
        onClick={() => { setBulk(true) }}
      >
        {t('manageKeys')}
      </button>
      {bulk
        ? (
          <KeysDialog
            title={t('title')}
            description={t('keysDialogDescription')}
            label={t('makersKeyLabel')}
            inputId="plugin-config-story-makers-pool"
            placeholder={t('keysDialogPlaceholder')}
            countLabel={t('keysCount')}
            clearLabel={t('keysClear')}
            saveLabel={t('save')}
            discardLabel={t('discard')}
            failedLabel={t('saveFailed')}
            closeLabel={t('keysCloseLabel')}
            disabled={!control.writable}
            onSave={props.saveKeys}
            onClose={() => { setBulk(false) }}
          />
        )
        : null}
    </SettingsForm>
  )
}
