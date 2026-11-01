/**
 * The Writer settings page's staged form over the `writer` namespace.
 * Key literals never ride a response: they write through the credentials
 * domain under the references `makersApiKeyEnv` and `gptImageApiKeyEnv` name.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-settings-controller/remote'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel,
  settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormScopeSnapshot, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'

/** Namespace of the writer plugin. Spelled here so the client half does not import Host values. */
export const WRITER_SETTINGS_NS = 'writer'

/** Section fields this page reads for credential reference names and cover API endpoints. */
export interface WriterZhuqueSettings {
  /** Credential reference naming the EdgeOne Makers key. Defaults to MAKERS_API_KEY. */
  makersApiKeyEnv?: string
  /** Credential reference naming the cover image API key. Defaults to GPT_IMAGE_API_KEY. */
  gptImageApiKeyEnv?: string
  /** Cover image API base URL; the host injects it into GPT_IMAGE_BASE_URL when set. */
  gptImageBaseUrl?: string
}

/** What the credentials domain last reported for one key. */
interface KeyCredentialState {
  /** Reference this answer describes. */
  ref: string
  /** Whether any layer supplies a value for it. */
  configured: boolean
  /** Whether `credentials/set` can affect it. */
  writable: boolean
}

/** One credential control as the page renders it. */
export interface WriterZhuqueKeyControlState {
  /** The staged credential, which starts blank on every load. */
  draft: SettingsFieldState
  /** Whether the Host reports a credential configured for the referenced key. */
  configured: boolean
  /** Whether the credentials domain accepts a write. */
  writable: boolean
}

/** What the Writer settings page renders. */
export interface WriterZhuqueCardState extends SettingsFormShell {
  /** The Zhuque key control. */
  key: WriterZhuqueKeyControlState
  /** The cover image API key control. */
  coverKey: WriterZhuqueKeyControlState
  /** The cover image API base URL draft. */
  gptImageBaseUrl: SettingsFieldState
}

/** The registration-side face the page's slot entry injects. */
export interface WriterZhuqueCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useWriterZhuqueCard. */
    writerZhuqueCard: SnapshotStore<WriterZhuqueCardState>
  }
}

const FALLBACK_MAKERS_REF = 'MAKERS_API_KEY'
const FALLBACK_COVER_REF = 'GPT_IMAGE_API_KEY'

/** Bridges the `writer` scope and the credentials domain onto Zhuque and cover keys. */
export class WriterZhuqueCardController {
  private readonly form: SettingsFormModel<WriterZhuqueSettings>
  private readonly store: SnapshotStore<WriterZhuqueCardState>
  private makersState: KeyCredentialState = { ref: '', configured: false, writable: true }
  private coverState: KeyCredentialState = { ref: '', configured: false, writable: true }

  /**
   * @param scope - the shared configuration form for the `writer` namespace.
   * @param ctx - the page plugin's context.
   */
  constructor(
    private readonly scope: SettingsFormScope<WriterZhuqueSettings>,
    private readonly ctx: ClientContext,
  ) {
    this.form = new SettingsFormModel(scope, [
      settingsTextField('gptImageBaseUrl'),
    ], [
      { field: 'makersApiKey', write: (text: string) => this.writeKey('makers', text) },
      { field: 'gptImageApiKey', write: (text: string) => this.writeKey('cover', text) },
    ])
    this.store = this.form.bind(() => this.projection())
    scope.subscribe(() => { void this.readCredentials() })
    void this.readCredentials()
  }

  private projection(): WriterZhuqueCardState {
    return {
      ...this.form.shell(),
      key: {
        draft: this.form.field('makersApiKey'),
        configured: this.makersState.configured,
        writable: this.makersState.writable,
      },
      coverKey: {
        draft: this.form.field('gptImageApiKey'),
        configured: this.coverState.configured,
        writable: this.coverState.writable,
      },
      gptImageBaseUrl: this.form.field('gptImageBaseUrl'),
    }
  }

  /** Ask the credentials domain about both references the section names. */
  private async readCredentials(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    const makersRef = makersRefOf(snapshot)
    const coverRef = coverRefOf(snapshot)
    let projected = false
    if (makersRef !== this.makersState.ref) {
      this.makersState = { ref: makersRef, configured: false, writable: true }
      projected = true
    }
    if (coverRef !== this.coverState.ref) {
      this.coverState = { ref: coverRef, configured: false, writable: true }
      projected = true
    }
    if (projected) this.store.set(this.projection())
    const response = await this.ctx.remote.credentials.describe([makersRef, coverRef])
    if (!response.ok) return
    const latest = this.scope.getSnapshot()
    if (makersRef !== makersRefOf(latest) || coverRef !== coverRefOf(latest)) return
    const makersView = response.value[makersRef]
    const coverView = response.value[coverRef]
    const nextMakers: KeyCredentialState = {
      ref: makersRef,
      configured: makersView?.configured ?? false,
      writable: makersView?.writable ?? true,
    }
    const nextCover: KeyCredentialState = {
      ref: coverRef,
      configured: coverView?.configured ?? false,
      writable: coverView?.writable ?? true,
    }
    const makersSame = nextMakers.configured === this.makersState.configured
      && nextMakers.writable === this.makersState.writable
      && nextMakers.ref === this.makersState.ref
    const coverSame = nextCover.configured === this.coverState.configured
      && nextCover.writable === this.coverState.writable
      && nextCover.ref === this.coverState.ref
    if (makersSame && coverSame) return
    this.makersState = nextMakers
    this.coverState = nextCover
    this.store.set(this.projection())
  }

  /**
   * Re-read after the Host reports a change to a watched reference.
   * @param ref - the reference the Host reports as changed.
   */
  refreshCredential(ref: string): void {
    if (this.makersState.ref !== ref && this.coverState.ref !== ref) return
    void this.readCredentials()
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page snapshot and its form actions.
   */
  inject(): WriterZhuqueCardFace {
    return {
      hooks: { writerZhuqueCard: this.store },
      ...this.form.actions(),
    }
  }

  /**
   * Write a staged key, then re-read whether the Host now holds one.
   * @param which - Zhuque or cover.
   * @param value - the staged credential literal.
   * @returns whether the Host reports a configured credential afterwards.
   */
  private async writeKey(which: 'makers' | 'cover', value: string): Promise<boolean> {
    const snapshot = this.scope.getSnapshot()
    const ref = which === 'makers' ? makersRefOf(snapshot) : coverRefOf(snapshot)
    const response = await this.ctx.remote.credentials.set(ref, value)
    if (!response.ok) return false
    await this.readCredentials()
    return which === 'makers' ? this.makersState.configured : this.coverState.configured
  }

  /** Release configuration subscriptions. */
  dispose(): void { this.form.dispose() }
}

/**
 * The Zhuque credential reference the section names, or MAKERS_API_KEY.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function makersRefOf(snapshot: SettingsFormScopeSnapshot<WriterZhuqueSettings>): string {
  const declared = snapshot.value?.makersApiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : FALLBACK_MAKERS_REF
}

/**
 * The cover credential reference the section names, or GPT_IMAGE_API_KEY.
 * @param snapshot - the current scope snapshot.
 * @returns the reference to address.
 */
function coverRefOf(snapshot: SettingsFormScopeSnapshot<WriterZhuqueSettings>): string {
  const declared = snapshot.value?.gptImageApiKeyEnv
  return declared !== undefined && declared.length > 0 ? declared : FALLBACK_COVER_REF
}
