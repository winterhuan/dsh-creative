/**
 * The Writer settings page: the Zhuque detection key.
 * The key is written through the credentials domain, never into the settings section.
 */

import { useState, type ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsSecretField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './zhuque-card.module.css'
import { ZhuqueKeysDialog } from './ZhuqueKeysDialog.tsx'
import { formLabels } from './zhuque-locales.ts'
import type { WriterZhuqueCardFace, WriterZhuqueKeyControlState } from './zhuque-settings-controller.ts'

/** Props the renderer binds for the Writer Zhuque settings page. */
export type ZhuqueSettingsCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.writer'>
  & InjectFace<WriterZhuqueCardFace>

/**
 * Render the Writer Zhuque settings page, or its one-liner when the Plugins page asks for a summary.
 * @param props - the view asked for, locale copy, the page snapshot, and its form actions.
 * @returns the one-liner, or the form.
 */
export function ZhuqueSettingsCard(props: ZhuqueSettingsCardProps): ReactNode {
  const { t } = props
  const state = props.useWriterZhuqueCard(snapshot => snapshot)
  const [bulk, setBulk] = useState(false)
  if (props.view === 'summary') return t('description')
  const control: WriterZhuqueKeyControlState = state.key
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
          <ZhuqueKeysDialog
            title={t('title')}
            description={t('keysDialogDescription')}
            label={t('makersKeyLabel')}
            inputId="plugin-config-writer-makers-pool"
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
