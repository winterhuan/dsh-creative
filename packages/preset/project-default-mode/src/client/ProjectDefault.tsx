/**
 * The menu item and dialog for one session's project default mode.
 *
 * The menu row lives in `sidebar.workspaces.session.menu.item` and only raises
 * the open request with the row's session; the dialog lives in `shell.overlay`
 * so it outlives the row menu that opened it, the same split the shipped rename
 * and archive actions use. Both read the shared controller store through their
 * injected faces, so one handle serves any session.
 */

import { MenuItemButton, IconSettingsOutlineRegular, Modal, Button } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the session-menu SlotMap merge (owner props, menu-open hook).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProjectDefaultState } from './controller.ts'
import css from './dialog.module.css'

/** The menu item's injected behavior: raise the dialog for the row's session. */
export interface ProjectDefaultMenuInjected {
  /** Open the dialog for one session. */
  open: (sessionId: SessionId) => void
}

/** Props of the menu entry: owner share + this namespace's locale + its injected face. */
export type ProjectDefaultMenuProps =
  PropsRuntime<'sidebar.workspaces.session.menu.item'>
  & PropsLocale<'projectDefaultMode'>
  & InjectFace<ProjectDefaultMenuInjected>

/**
 * Menu row (order 500): open the project default dialog for this session.
 * @param props - owner share, menu open state, the open callback, and the locale seat.
 * @returns the row.
 */
export function ProjectDefaultMenuItem({ sessionId, useMenuOpenState, open, t }: ProjectDefaultMenuProps) {
  const [, setMenuOpen] = useMenuOpenState()
  return (
    <MenuItemButton
      icon={<IconSettingsOutlineRegular />}
      onSelect={() => {
        setMenuOpen(false)
        open(sessionId)
      }}
    >
      {t('menu')}
    </MenuItemButton>
  )
}

/** The dialog's injected behavior: the shared state plus its actions. */
export interface ProjectDefaultDialogInjected {
  hooks: {
    /** The shared dialog state, bound by the renderer as useProjectDefault. */
    projectDefault: HostObservable<ProjectDefaultState>
  }
  /** Stage one choice: a preset id, or undefined for follow-global. */
  select: (preset: string | undefined) => void
  /** Persist the staged choice and close on success. */
  save: () => Promise<boolean>
  /** Close the dialog and drop its staged state. */
  close: () => void
}

/** Props of the dialog entry in `shell.overlay`. */
export type ProjectDefaultDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<'projectDefaultMode'>
  & InjectFace<ProjectDefaultDialogInjected>

/**
 * The dialog: nothing while closed, otherwise one project's mode picker. A save
 * refusal keeps the dialog open with the failure notice; a session outside any
 * registered Workspace shows the hint but offers nothing to save.
 * @param props - the shared state hook, its actions, and the locale seat.
 * @returns the open dialog, or null while closed.
 */
export function ProjectDefaultDialog({ useProjectDefault, select, save, close, t }: ProjectDefaultDialogProps) {
  const state = useProjectDefault(current => current)
  if (!state.open) return null
  const disabled = state.saving || state.status !== 'ready' || state.workspace === null
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('close')}
      title={t('title', { project: state.workspace?.title ?? '' })}
      footer={(
        <>
          <Button variant="outline" disabled={state.saving} onClick={close}>{t('cancel')}</Button>
          <Button variant="primary" disabled={disabled} onClick={() => { void save() }}>
            {state.saving ? t('saving') : t('save')}
          </Button>
        </>
      )}
    >
      <p className={css.hint}>{t('hint')}</p>
      {state.status === 'loading' && <p className={css.status}>{t('loading')}</p>}
      {state.status === 'error' && <div className={css.error} role="alert">{t('loadFailed')}</div>}
      {state.status === 'ready' && state.workspace !== null && (
        <fieldset className={css.options} disabled={state.saving}>
          <label className={css.option}>
            <input
              type="radio"
              name="project-default-mode"
              checked={state.selected === undefined}
              onChange={() => { select(undefined) }}
            />
            <span>{t('followGlobal')}</span>
            {state.current === undefined && <span className={css.badge}>{t('globalDefault')}</span>}
          </label>
          {state.options.map(option => (
            <label key={option.preset} className={css.option}>
              <input
                type="radio"
                name="project-default-mode"
                checked={state.selected === option.preset}
                onChange={() => { select(option.preset) }}
              />
              <span>{option.label}</span>
              {option.isGlobalDefault && <span className={css.badge}>{t('globalDefault')}</span>}
            </label>
          ))}
        </fieldset>
      )}
      {state.status === 'ready' && state.error !== null && (
        <div className={css.error} role="alert">{t('saveFailed')}</div>
      )}
    </Modal>
  )
}
