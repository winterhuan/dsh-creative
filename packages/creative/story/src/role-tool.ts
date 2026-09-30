import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SubagentRuntime } from '@deepseek-ai/dsh-subagent'
import { isJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import {
  CREATIVE_ROLE_NAMES,
  loadBundledRoleDefinition,
  type BundledCreativeRole,
  type CreativeRoleName,
} from './role-provider.js'

/** The tool name that runs one bundled Creative Role as a child DSH subagent. */
export const CREATIVE_ROLE_TOOL_NAME = 'creative_role'
/** The subagent capability the tool needs; injectable to decouple tests from the Agent context. */
export type CreativeRoleSubagents = Pick<SubagentRuntime, 'start'>

const roleTools: Readonly<Record<CreativeRoleName, readonly string[]>> = {
  'chapter-extractor': ['read', 'glob', 'grep'],
  'character-designer': ['read', 'glob', 'grep', 'write', 'edit'],
  'consistency-checker': ['read', 'glob', 'grep'],
  'narrative-writer': ['read', 'glob', 'grep', 'write', 'edit', 'bash'],
  'story-architect': ['read', 'glob', 'grep', 'write', 'edit'],
  'story-explorer': ['read', 'glob', 'grep'],
  'story-researcher': ['read', 'glob', 'grep', 'bash', 'write', 'web_search', 'web_fetch'],
}

/**
 * The per-role least-privilege tool allowlist; execution intersects it with the
 * tools actually visible to the calling Agent.
 * @param role - the bundled role about to run.
 * @returns the allowlist handed to the subagent's tool filter.
 */
export function roleToolFilter(role: CreativeRoleName): { readonly allow: readonly string[] } {
  return { allow: roleTools[role] }
}

function resultText(output: readonly JsonValue[]): string {
  return output.map(block => typeof block === 'object' && block !== null && !Array.isArray(block)
    && block.type === 'text' && typeof block.text === 'string' ? block.text : JSON.stringify(block)).join('\n')
}

function isJsonArray<T>(value: T): value is T & JsonValue[] {
  return Array.isArray(value) && isJsonValue(value)
}

function resolvedAgentOptions(parent: Agent, requested: AgentOptions | undefined): AgentOptions {
  const request = parent.session?.requestHeader?.()?.config
  const inherited: AgentOptions = request === undefined
    ? { ...parent.options }
    : {
        ...parent.options.maxTokens === undefined ? {} : { maxTokens: parent.options.maxTokens },
        provider: request.provider,
        model: request.model,
        ...request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort },
      }
  const resolved = { ...inherited, ...requested }
  const routeChanged = requested !== undefined
    && (requested.provider !== undefined || requested.model !== undefined)
    && (resolved.provider !== inherited.provider || resolved.model !== inherited.model)
  if (routeChanged && requested?.reasoningEffort === undefined) delete resolved.reasoningEffort
  return resolved
}

function jsonAgentOptions(options: AgentOptions): {
  readonly provider?: string
  readonly model?: string
  readonly reasoningEffort?: string
  readonly maxTokens?: number
} {
  return {
    ...options.provider === undefined ? {} : { provider: options.provider },
    ...options.model === undefined ? {} : { model: options.model },
    ...options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort },
    ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
  }
}

/**
 * Build the `creative_role` tool definition with every bundled persona
 * preloaded, so execution only starts the subagent run.
 * @param subagents - optional subagent runtime override; defaults to the calling
 * Agent context's `subagents` service.
 * @returns the tool definition consumed by the tools registry.
 */
export async function createCreativeRoleTool(subagents?: CreativeRoleSubagents): Promise<ToolDefinition> {
  const roles = new Map<CreativeRoleName, BundledCreativeRole>()
  await Promise.all(CREATIVE_ROLE_NAMES.map(async (role) => {
    roles.set(role, await loadBundledRoleDefinition(role, undefined, 'native-tools'))
  }))
  return defineTool({
    name: CREATIVE_ROLE_TOOL_NAME,
    description: 'Run one of the seven bundled novel-writing Roles as a child of the current DSH Agent. Load workflow Skills such as short-drama-develop with the skill tool; Skill names are not Role names. The child uses the Role\'s packaged model overrides when present and otherwise inherits the DSH model; it always inherits workspace, permissions, lifecycle, and UI.',
    parameters: {
      role: {
        type: 'string',
        required: true,
        enum: CREATIVE_ROLE_NAMES,
        description: 'One of the listed novel specialist Role names.',
      },
      prompt: {
        type: 'string',
        required: true,
        description: 'A self-contained task. The child inherits the current DSH workspace but not the current in-flight turn.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          role: { type: 'string', required: true, enum: CREATIVE_ROLE_NAMES },
          runId: { type: 'string', required: true },
          resolvedAgent: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              provider: { type: 'string' },
              model: { type: 'string' },
              reasoningEffort: { type: 'string' },
              maxTokens: { type: 'number' },
            },
          },
          content: { type: 'array', required: true, items: { type: 'json' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `${JSON.stringify({ role: value.role, runId: value.runId, resolvedAgent: value.resolvedAgent })}\n\n${resultText(value.content)}`,
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('creative_role requires a calling DSH Agent.')
      const role = roles.get(args.role)
      if (role === undefined) throw new Error(`Creative Role ${args.role} is not bundled.`)
      const allowed = roleToolFilter(args.role).allow.filter(name =>
        exec.agent?.ctx.tools.get(name, exec.agent) !== undefined)
      const runtime = subagents ?? exec.agent.ctx.get('subagents')
      if (runtime === undefined) throw new Error('creative_role requires the DSH subagent runtime.')
      const resolved = resolvedAgentOptions(exec.agent, role.agentOptions)
      const run = await runtime.start('spawn', {
        label: `creative:${args.role}`,
        prompt: [{ type: 'text', text: args.prompt }],
        parent: exec.agent,
        persona: role.persona,
        ...role.agentOptions === undefined ? {} : { agentOptions: role.agentOptions },
        toolFilter: { allow: allowed },
        maxDepth: 1,
        signal: exec.signal,
      })
      try {
        const result = await run.result
        if (result.stopReason !== 'completed') {
          throw new Error(`Creative Role ${args.role} ended with ${result.stopReason}${result.diagnostic === undefined ? '' : `: ${result.diagnostic}`}`)
        }
        const content: readonly ContentBlock[] = result.output
        if (!isJsonArray(content)) throw new Error(`Creative Role ${args.role} returned content that is not JSON.`)
        return {
          role: args.role,
          runId: run.id,
          resolvedAgent: jsonAgentOptions(run.localAgent === undefined
            ? resolved : resolvedAgentOptions(run.localAgent, undefined)),
          content,
        }
      } finally {
        await run.dispose()
      }
    },
  })
}

/**
 * Mount `creative_role` only while the `spawn` subagent provider is present.
 * @param context - the plugin context holding tools and subagent services.
 */
export async function registerCreativeRoleTool(context: Context): Promise<void> {
  const definition = await createCreativeRoleTool(context.subagents)
  let dispose: (() => void) | undefined
  const mount = (): void => { dispose ??= context.tools.register(definition) }
  const unmount = (): void => { dispose?.(); dispose = undefined }
  context.on('subagent/provider-added', (provider) => { if (provider.name === 'spawn') mount() })
  context.on('subagent/provider-removed', (name) => { if (name === 'spawn') unmount() })
  if (context.subagents.getProvider('spawn') !== undefined) mount()
}
