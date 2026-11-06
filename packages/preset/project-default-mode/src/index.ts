/**
 * Per-project default agent preset, Host half.
 *
 * DSH resolves one global default preset for a session that names none
 * (`agentPresets.defaultId`). This plugin adds a per-project override: a rule
 * maps a Workspace identity to an agent preset, and a blank session created
 * under that Workspace composes the rule's preset instead of the global default.
 *
 * The override rides the same seam the new-session hero chip uses — the preset
 * registry's `select`, which mounts the preset revision and appends an
 * `agent-preset/selected` Session event — so the composition a session actually
 * runs is recorded in its log, as the model-visible-implies-logged rule
 * requires. `select` recomposes a published Agent, so the switch runs once the
 * serial `agent/created` dispatch has settled and before the first turn. Only a
 * fresh ordinary session (or a blank session another surface falls back to the
 * global default) is retargeted; a forked or subagent child keeps the
 * composition its lineage already carries, a session whose first turn already
 * started keeps the composition its log fixed, and a request that names a
 * preset other than the global default wins. A request that names the global
 * default explicitly is indistinguishable from an omission and is retargeted
 * like one.
 *
 * DSH reuses a live blank session by selecting the global default onto it when
 * the web client opens its workspace without naming a preset. That selection
 * lands after `agent/created` settled and would silently undo the project
 * default before the first turn, so the Host also watches `agent-preset/selected`
 * events and re-asserts the rule on a blank session that falls back to the
 * global default.
 *
 * This module owns no Remote namespace: rules are ordinary volatile Config the
 * browser half edits through the settings form, and the Host reads them at
 * creation.
 *
 * @module @winterhuan/dsh-project-default-mode
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Type-only: the optional preset, Workspace, and projection services read at creation.
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-workspace'
import type { ProjectDefaultRule } from './types.ts'

export type { ProjectDefaultRule } from './types.ts'

/** Plugin identity and the settings namespace the browser half writes rules to. */
export const name = 'project-default-mode'

/**
 * No hard dependencies: the preset registry, Workspace registry, and projection
 * registry are all read optionally through `ctx.get`, so the plugin activates
 * without them and simply does nothing until they are present.
 */
export const inject: string[] = []

/** Per-project default presets, edited live from the settings form without remounting. */
export interface Config {
  /** Rules over Workspace identities; the last rule for a Workspace wins. */
  readonly rules: Volatile<ProjectDefaultRule[]>
}

/**
 * Config schema. `rules` is volatile so the browser half edits it through the
 * settings form and the running Host observes the change without remounting.
 */
export const Config = z.object({
  rules: z.array(z.object({
    workspaceId: z.string(),
    agentPreset: z.string(),
  })).default([]).volatile(),
}) as z<Config>

/**
 * Install the creation-time override for this plugin's lifetime.
 * @param context - Host context carrying the Agent, Workspace, and preset services.
 * @param config - per-project default rules.
 */
export function apply(context: Context, config: Config): void {
  context.on('agent/created', ({ agent, source }) => {
    // A fresh ordinary creation is the only creation retarget: resume and
    // compaction reuse a composition the log already fixed, and a forked or
    // subagent child (both published with source 'startup') inherits its
    // parent's preset.
    if (source !== 'startup') return
    if (!isRetargetable(context, agent.session)) return
    // `select` rebinds the Agent's scope and emits `tools/change`, which
    // preset-scoped plugins answer by installing and disposing Agent-scoped
    // fibers. The serial `agent/created` dispatch is still running those
    // plugins' listeners against the creation-time preset, so the switch waits
    // for the dispatch to settle instead of recomposing the Agent mid-flight.
    scheduleRetarget(context, config, agent)
  })
  // A live blank session reused by the web client's "open workspace" is
  // re-selected onto the global default after creation settled, which would
  // quietly undo the project default before the first turn. Re-assert the rule
  // whenever a blank session that is still eligible for a project default falls
  // back to the global default; a session already on another preset, or past its
  // first turn, is left alone.
  context.on('session/event', (session, event) => {
    if (event.type !== 'agent-preset/selected') return
    const presets = context.get('agentPresets')
    if (presets === undefined || event.data.agentPreset !== presets.defaultId) return
    if (!isRetargetable(context, session) || !isBlank(context, session)) return
    const agent = context.get('agents')?.get(session.id)
    if (agent === undefined) return
    scheduleRetarget(context, config, agent)
  })
}

/**
 * Schedule one retarget after the current event dispatch settles. Every failure
 * is contained and logged; creation and the log append are never vetoed.
 * @param context - Host context carrying the logger.
 * @param config - per-project default rules.
 * @param agent - the Agent whose session may be retargeted.
 */
function scheduleRetarget(context: Context, config: Config, agent: Agent): void {
  setImmediate(() => {
    retarget(context, config, agent).catch((error: unknown) => {
      context.logger.warn(`project-default-mode: session "${agent.id}" kept its default preset: ${String(error)}`)
    })
  })
}

/**
 * Whether a session is an ordinary top-level session this plugin may retarget:
 * not a forked or subagent child, which inherit their parent's composition.
 * @param context - Host context; reads the preset registry's default id.
 * @param session - the session whose header decides eligibility.
 * @returns whether the session may adopt a project default.
 */
function isRetargetable(context: Context, session: Agent['session']): boolean {
  const header = session.header
  if (header.parentSession !== undefined || header.origin === 'subagent') return false
  // The header records the creation request's resolved preset. The web client
  // names no preset, so its session resolves to the global default; any other
  // value was named explicitly (webhook, SDK, session.create) and must win over
  // this bundle's project default.
  return header.agentPreset === undefined || header.agentPreset === context.get('agentPresets')?.defaultId
}

/**
 * Whether a session is still blank — its first turn has not started — using the
 * same boundary projection the preset registry's `select` guards on.
 * @param context - Host context carrying the Agent registry.
 * @param session - the session to test.
 * @returns whether no turn has started; false when the Agent registry is absent.
 */
function isBlank(context: Context, session: Agent['session']): boolean {
  const agents = context.get('agents')
  if (agents === undefined) return false
  const boundary = agents.turnBoundaryOf(session)
  return boundary.openTurnStartSeq === null && boundary.lastTurn === 0
}

/**
 * Compose a fresh session's project default when its Workspace has a rule and
 * the session is not already on that preset.
 * @param context - Host context carrying the optional preset and Workspace registries.
 * @param config - per-project default rules.
 * @param agent - the just-created Agent whose blank session may be retargeted.
 * @returns resolution once the switch settles or no rule applies.
 */
async function retarget(context: Context, config: Config, agent: Agent): Promise<void> {
  const presets = context.get('agentPresets')
  const workspaces = context.get('workspaceRegistry')
  if (presets === undefined || workspaces === undefined) return
  // Creation may have rolled back while the dispatch settled; an Agent the registry no longer holds is left alone.
  const agents = context.get('agents')
  if (agents !== undefined && agents.get(agent.id) !== agent) return
  const cwd = agent.session.header.cwd
  if (cwd === undefined) return
  const workspace = await workspaces.resolveByPath(cwd)
  if (workspace === undefined) return
  const rule = ruleForWorkspace(config.rules.get(), workspace.id)
  if (rule === undefined) return
  // Skip a session already composing the target, so an explicit matching choice
  // or a repeated creation is not rewritten with a redundant log event.
  if (presets.composedPreset(agent.ctx) === rule.agentPreset) return
  await presets.select(agent, rule.agentPreset)
}

/**
 * Select the effective rule for one Workspace: the last matching entry, so a
 * later edit supersedes an earlier rule for the same project.
 * @param rules - configured per-project defaults.
 * @param workspaceId - resolved Workspace identity.
 * @returns the winning rule, or undefined when the Workspace has none.
 */
export function ruleForWorkspace(
  rules: readonly ProjectDefaultRule[],
  workspaceId: string,
): ProjectDefaultRule | undefined {
  let found: ProjectDefaultRule | undefined
  for (const rule of rules) if (rule.workspaceId === workspaceId) found = rule
  return found
}
