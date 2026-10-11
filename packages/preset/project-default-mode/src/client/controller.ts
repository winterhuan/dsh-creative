/**
 * Dialog controller for the per-project default mode.
 *
 * One instance is owned by the plugin's apply closure and shared by the menu
 * item and the dialog through its stable store, so the dialog can open for any
 * session without a per-request registration. Opening resolves the Workspace
 * that accounts for the session, reads the preset roster, and stages the
 * project's current default. Saving replaces the whole `rules` field of the Host
 * namespace through the settings form: every other project's rule is preserved,
 * and the form carries the namespace revision fence and recovers its mirror on a
 * refusal.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: the agentPresets Remote namespace, so `ctx.remote.agentPresets` resolves from this package's own dependency.
import type {} from '@deepseek-ai/dsh-agent-preset-registry/remote'
// Type-only: pulls the ctx.remote merge (agentPresets, settings) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ProjectDefaultRule } from '../types.ts'

/** Settings namespace of the Host plugin, whose `rules` field this controller edits. */
export const PROJECT_DEFAULT_MODE_NS = 'project-default-mode'

/** One selectable mode: a preset, or following the global default. */
export interface ProjectDefaultOption {
  /** Preset id, or `undefined` for the follow-global choice. */
  readonly preset: string | undefined
  /** Display label: the preset's own published name, or its id. */
  readonly label: string
  /** Whether the deployment resolves this preset as the global default. */
  readonly isGlobalDefault: boolean
}

/** The dialog state as the component renders it. */
export interface ProjectDefaultState {
  /** Whether the dialog is showing. */
  open: boolean
  status: 'loading' | 'ready' | 'error'
  error: string | null
  saving: boolean
  /** Workspace the opened session belongs to; null outside any registered Workspace. */
  workspace: WorkspaceView | null
  /** Available modes, without the follow-global choice the dialog adds itself. */
  options: readonly ProjectDefaultOption[]
  /** The staged choice: a preset id, or undefined for follow-global. */
  selected: string | undefined
  /** The rule the Workspace carried at open; the dialog marks it as the project's current mode. */
  current: string | undefined
}

const INITIAL: ProjectDefaultState = {
  open: false, status: 'loading', error: null, saving: false, workspace: null, options: [], selected: undefined, current: undefined,
}

/** Resolves the opened session's project, reads the roster, and stages its default. */
export class ProjectDefaultController {
  /** Observable dialog state; the menu item and the dialog share this one handle. */
  readonly store: SnapshotStore<ProjectDefaultState> = createSnapshotStore(INITIAL)
  private readonly form: ConfigForm<{ rules?: ProjectDefaultRule[] }>
  private loadGeneration = 0
  /** Releases the wait for the settings form; set only while an open is waiting on it. */
  private releaseForm: (() => void) | undefined

  /** @param ctx - browser plugin context carrying the Workspace list, remotes, and config forms. */
  constructor(private readonly ctx: ClientContext) {
    this.form = ctx.configForms.get<{ rules?: ProjectDefaultRule[] }>(PROJECT_DEFAULT_MODE_NS)
  }

  private set(patch: Partial<ProjectDefaultState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  /**
   * Open the dialog for one session: resolve its Workspace, wait for the
   * settings form's first accepted section, and load the roster. A newer open
   * supersedes an in-flight read. A session outside any Workspace still opens,
   * with `workspace` null and nothing to save.
   * @param sessionId - the session whose project default is edited.
   */
  async open(sessionId: SessionId): Promise<void> {
    const generation = ++this.loadGeneration
    this.releaseForm?.()
    const workspace = this.workspaceFor(sessionId)
    this.set({ ...INITIAL, open: true, workspace })
    try {
      // The rules the dialog marks and folds over must be the Host mirror, not
      // the empty draft a form carries before its first accepted section.
      await this.formSettled()
      if (generation !== this.loadGeneration) return
      const rules = this.form.getSnapshot().value?.rules ?? []
      const current = workspace === null ? undefined : ruleForWorkspace(rules, workspace.workspaceId)
      this.set({ current, selected: current })
      const result = await this.ctx.remote.agentPresets.list()
      if (generation !== this.loadGeneration) return
      if (!result.ok) throw new Error(result.error.message)
      const options: ProjectDefaultOption[] = result.value.presets.map(preset => ({
        preset: preset.id,
        // Shipped presets publish no name; their localized copy belongs to the
        // built-in surfaces, so a preset without its own name shows its id.
        label: preset.name ?? preset.id,
        isGlobalDefault: preset.isDefault,
      }))
      this.set({ status: 'ready', options })
    } catch (error) {
      if (generation !== this.loadGeneration) return
      this.set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Stage one choice without writing.
   * @param preset - the selected preset id, or undefined for follow-global.
   */
  select(preset: string | undefined): void {
    this.set({ selected: preset })
  }

  /**
   * Persist the staged choice for the opened Workspace. Follow-global removes
   * the Workspace's rule; a preset adds or replaces it. A successful save closes
   * the dialog; a refusal keeps it open and reports the failure. Nothing is
   * written while the form has no accepted section.
   * @returns whether the Host accepted the write.
   */
  async save(): Promise<boolean> {
    const state = this.store.getSnapshot()
    if (state.workspace === null || state.saving) return false
    // Never fold over a form without an accepted section: its mirror is empty,
    // and writing that back would drop every other project's rule.
    const snapshot = this.form.getSnapshot()
    if (snapshot.status !== 'ready') {
      this.set({ error: `settings form is ${snapshot.status}` })
      return false
    }
    this.set({ saving: true, error: null })
    try {
      const rules = withRule(snapshot.value?.rules ?? [], state.workspace.workspaceId, state.selected)
      const accepted = await this.form.set('rules', rules)
      // A refusal keeps the dialog open (status stays 'ready') with a non-null
      // error, which the component renders as the localized save failure; a load
      // failure instead sets status 'error'.
      if (accepted) this.close()
      else this.set({ error: 'refused' })
      return accepted
    } catch (error) {
      this.set({ error: error instanceof Error ? error.message : String(error) })
      return false
    } finally {
      this.set({ saving: false })
    }
  }

  /** Close the dialog and drop its staged state; an in-flight load or form wait is superseded. */
  close(): void {
    this.loadGeneration++
    this.releaseForm?.()
    this.store.set(INITIAL)
  }

  /**
   * Resolve once the settings form has left its initial `loading` state (its
   * first accepted section, or `unavailable`), or as soon as the dialog closes
   * or a newer open supersedes this one.
   * @returns resolution when the form has settled or the wait was released.
   */
  private formSettled(): Promise<void> {
    if (this.form.getSnapshot().status !== 'loading') return Promise.resolve()
    return new Promise(resolve => {
      const off = this.form.subscribe(() => {
        if (this.form.getSnapshot().status !== 'loading') this.releaseForm?.()
      })
      this.releaseForm = () => {
        this.releaseForm = undefined
        off()
        resolve()
      }
    })
  }

  /** The Workspace accounting for a session, from the client Workspace snapshot. */
  private workspaceFor(sessionId: SessionId): WorkspaceView | null {
    const items = this.ctx.workspaces.list.getSnapshot().items
    return items.find(workspace => workspace.sessionIds.includes(sessionId)) ?? null
  }
}

/**
 * The effective rule for one Workspace: the last matching entry wins, matching
 * the Host's own resolution.
 * @param rules - configured per-project defaults.
 * @param workspaceId - Workspace identity to look up.
 * @returns its rule's preset, or undefined when it follows the global default.
 */
export function ruleForWorkspace(
  rules: readonly ProjectDefaultRule[],
  workspaceId: string,
): string | undefined {
  let found: string | undefined
  for (const rule of rules) if (rule.workspaceId === workspaceId) found = rule.agentPreset
  return found
}

/**
 * Replace a Workspace's rule in a fresh array: a preset adds or updates its
 * entry, and undefined removes it. Other Workspaces' rules keep their order.
 * @param rules - current per-project defaults.
 * @param workspaceId - Workspace being edited.
 * @param preset - the chosen preset, or undefined to follow the global default.
 * @returns the next rules array.
 */
export function withRule(
  rules: readonly ProjectDefaultRule[],
  workspaceId: string,
  preset: string | undefined,
): ProjectDefaultRule[] {
  const without = rules.filter(rule => rule.workspaceId !== workspaceId)
  return preset === undefined ? without : [...without, { workspaceId, agentPreset: preset }]
}
