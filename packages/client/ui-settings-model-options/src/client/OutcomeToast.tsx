/** Application-wide save outcome, kept alive when a provider card closes. */
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SaveOutcome } from './operations.ts'

/** A settled write and its sequence, so consecutive identical outcomes restart the toast. */
export interface OutcomeNotice { outcome: SaveOutcome; sequence: number }

/** Plain state and dismissal action for the root overlay. */
export interface OutcomeToastFace {
  hooks: { notice: HostObservable<OutcomeNotice | null> }
  dismiss: () => void
}

/**
 * Show the latest save result independently of the settings page lifetime.
 * @param props - outcome hook, dismissal, and localized copy.
 * @returns the shared Toast primitive, or null while no result is pending.
 */
export function OutcomeToast(props: PropsRuntime<'shell.overlay'> & PropsLocale<'settings.modelOptions'> & InjectFace<OutcomeToastFace>) {
  const notice = props.useNotice(value => value)
  if (notice === null) return null
  return notice.outcome.ok
    ? <Toast key={notice.sequence} text={props.t('saved')} tone="success" onDone={props.dismiss} />
    : <Toast key={notice.sequence} text={props.t('saveFailed', { message: notice.outcome.message })}
      icon={<IconWarningOutlineRegular />} onDone={props.dismiss} />
}
