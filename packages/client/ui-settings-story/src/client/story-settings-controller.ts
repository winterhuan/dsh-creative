/**
 * The story settings page's staged form over the `story` namespace.
 * The Zhuque key literal never rides a response: it writes through the
 * credentials domain under the reference `makersApiKeyEnv` names.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormScopeSnapshot, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Namespace of the story plugin. Spelled here so this client package does not depend on the Host package. */
export const STORY_SETTINGS_NS = 'story'

/** Section field this page reads for the credential reference name. */
export interface StorySettings {
  /** Credential reference naming the EdgeOne Makers key. Defaults to MAKERS_API_KEY. */
  makersApiKeyEnv?: string
}

/** What the credentials domain last reported for the Zhuque key. */
interface KeyCredentialState {
  /** Reference this answer describes. */
  ref: string
  /** Whether any layer supplies a value for it. */
  configured: boolean
  /** Whether `credentials/set` can affect it. */
  writable: boolean
}

/** The Zhuque key control as the page renders it. */
export interface StoryKeyControlState {
  /** The staged credential, which starts blank on every load. */
  draft: SettingsFieldState
  /** Whether the Host reports a credential configured for the referenced key. */
  configured: boolean
  /** Whether the credentials domain accepts a write. */
  writable: boolean
}

/** What the story settings page renders. */
export interface StorySettingsCardState extends SettingsFormShell {
  /** The Zhuque key control. */
  key: StoryKeyControlState
}

/** The registration-side face the page's slot entry injects. */
export interface StorySettingsCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useStorySettingsCard. */
    storySettingsCard: SnapshotStore<StorySettingsCardState>
  }
  /**
   * Write the key pool immediately. The bulk dialog owns its own save gesture.
   * @param text - one key per line.
   * @returns whether the Host reports a configured credential afterwards.
   */
  saveKeys: (text: string) => Promise<boolean>
}

const FALLBACK_REF = 'MAKERS_API_KEY'

/** Bridges the `story` scope and the credentials domain onto the Zhuque key. */
export class StorySettingsCardController {
  private readonly form: SettingsFormModel<StorySettings>
  private readonly store: SnapshotStore<StorySettingsCardState>
  private credentialState: KeyCredentialState = { ref: '', configured: false, writable: true }

  /**
   * @param scope - the shared configuration form for the `story` namespace.
   * @param ctx - the page plugin's context.
   */
  constructor(
    private readonly scope: SettingsFormScope<StorySettings>,
    private readonly ctx: ClientContext,
  ) {
    this.form = new SettingsFormModel(scope, [], [{ field: 'makersApiKey', write: (text: string) => this.writeKey(text) }])
    this.store = this.form.bind(() => this.projection())
    scope.subscribe(() => { void this.readCredential() })
    void this.readCredential()
  }

  private projection(): StorySettingsCardState {
    return {
      ...this.form.shell(),
      key: {
        draft: this.form.field('makersApiKey'),
        configured: this.credentialState.configured,
        writable: this.credentialState.writable,
      },
    }
  }

  /** Ask the credentials domain about the reference the section names. */
  private async readCredential(): Promise<void> {
    const ref = refOf(this.scope.getSnapshot())
    if (ref !== this.credentialState.ref) {
      this.credentialState = { ref, configured: false, writable: true }
      this.store.set(this.projection())
    }
    const response = await this.ctx.remote.credentials.describe([ref])
    if (!response.ok) return
    if (ref !== refOf(this.scope.getSnapshot())) return
    const view = response.value[ref]
    const next: KeyCredentialState = {
      ref,
      configured: view?.configured ?? false,
      writable: view?.writable ?? true,
    }
    if (next.configured === this.credentialState.configured && next.writable === this.credentialState.writable && next.ref === this.credentialState.ref) return
    this.credentialState = next
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to the watched reference.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (this.credentialState.ref !== ref) return
    void this.readCredential()
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page snapshot and its form actions.
   */
  inject(): StorySettingsCardFace {
    return {
      hooks: { storySettingsCard: this.store },
      ...this.form.actions(),
      saveKeys: (text) => this.saveKeys(text),
    }
  }

  /**
   * Write the key pool from the bulk dialog.
   * @param text - the dialog's whole text, one key per line.
   * @returns whether the Host reports a configured credential afterwards.
   */
  async saveKeys(text: string): Promise<boolean> {
    if (text.trim() === '') return false
    return this.writeKey(text.trim())
  }

  /**
   * Write the staged key, then re-read whether the Host now holds one.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(value: string): Promise<boolean> {
    await this.ctx.remote.credentials.set(refOf(this.scope.getSnapshot()), value)
    await this.readCredential()
    return this.credentialState.configured
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.form.dispose() }
}

/**
 * The credential reference the section names, or MAKERS_API_KEY.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function refOf(snapshot: SettingsFormScopeSnapshot<StorySettings>): string {
  const declared = snapshot.value?.makersApiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : FALLBACK_REF
}
