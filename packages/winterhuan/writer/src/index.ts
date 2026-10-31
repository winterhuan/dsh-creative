/**
 * Writing-mode host: skill mount, workspace copy, and the sidebar save route.
 * Skills are discovered by skill-filesystem. This entry does not register a skill provider.
 */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { CommandDefinitionId, type CommandInvocation, type CommandResult } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-commands'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { writerSkillMount, type SkillMount } from './mount.ts'
import { assertTrustedWriterAuthority } from './request-trust.ts'
import { packageSkillsDir } from './skills-dir.ts'
import { syncWriterSkills, type SyncResult } from './sync-skills.ts'
import { registerWriterRoute } from './write-route.ts'

export { packageSkillsDir } from './skills-dir.ts'
export { skillFilesystemRowDisabled, writerSkillMount } from './mount.ts'
export { syncWriterSkills, projectRootFor } from './sync-skills.ts'
export { registerWriterRoute } from './write-route.ts'
export { classifyWriterPath, isEditableWriterPath } from './editable.ts'

/** Plugin id. The preset id is the same string, registered by the bundle patch. */
export const name = 'writer'

/** Web and command services are optional so a headless host can still copy skills. */
export const inject: string[] = []

/** Host configuration. `skillMount` is not volatile: changing it takes a restart. */
export interface Config {
  readonly skillMount?: SkillMount
  readonly editorMaxBytes?: number
  readonly trustedHosts?: string[]
  readonly makersApiKeyEnv?: Volatile<string>
}

/** Schema for the writing plugin. */
export const Config = z.object({
  skillMount: z.union(['workspace', 'bundled'] as const).default('workspace'),
  editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152),
  makersApiKeyEnv: z.string().role('credential-ref').default('MAKERS_API_KEY').volatile(),
  trustedHosts: z.array(z.string()).default([]),
}) as z<Config>

/** Service the preset rows and the sync command read. */
export interface WriterHost {
  readonly skillMount: SkillMount
  readonly skillsDir: string
  /** Credential environment name. The host does not read the secret. */
  readonly makersApiKeyEnv: string
  sync(workspaceDir: string, force: boolean): Promise<SyncResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Writing-mode host state for the current process. */
    writerHost: WriterHost
  }
}

const MOUNT_ENV = 'DSH_WRITER_SKILL_MOUNT'

function credentialName(value: Volatile<string> | string | undefined): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (value !== undefined && typeof value !== 'string') {
    const current = value.get()
    if (typeof current === 'string' && current.trim() !== '') return current.trim()
  }
  return 'MAKERS_API_KEY'
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name]
  else process.env[name] = previous
}

/**
 * Install the mount, the first-entry copy, the save route, and `/writer-sync-skills`.
 * @param context - host context.
 * @param config - plugin configuration after schema defaults.
 */
export function apply(context: Context, config: Config = {}): void {
  const skillMount = writerSkillMount(config.skillMount, undefined)
  const trustedHosts = config.trustedHosts ?? []
  for (const host of trustedHosts) assertTrustedWriterAuthority(host)
  const skillsDir = packageSkillsDir()
  const maxBytes = config.editorMaxBytes ?? 2_097_152
  const makersApiKeyEnv = credentialName(config.makersApiKeyEnv)
  const previousMount = process.env[MOUNT_ENV]
  const previousKeyEnv = process.env.WRITER_ZHUQUE_KEY_ENV
  process.env[MOUNT_ENV] = skillMount
  process.env.WRITER_ZHUQUE_KEY_ENV = makersApiKeyEnv
  context.effect(() => () => {
    restoreEnv(MOUNT_ENV, previousMount)
    restoreEnv('WRITER_ZHUQUE_KEY_ENV', previousKeyEnv)
  }, 'writer: skill mount')
  const host: WriterHost = {
    skillMount,
    skillsDir,
    makersApiKeyEnv,
    sync: (workspaceDir, force) => syncWriterSkills({ sourceDir: skillsDir, workspaceDir, force }),
  }
  context.provide('writerHost', host)
  const copy = (agent: Agent): void => {
    if (skillMount !== 'workspace') return
    const cwd = agent.session.header.cwd
    if (cwd === undefined) return
    const selected = agent.session.header.agentPreset ?? context.get('agentPresets')?.composedPreset(agent.ctx)
    if (selected !== 'writer') return
    void host.sync(cwd, false).catch((error: unknown) => {
      context.logger('writer').warn(`skill copy skipped: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  context.on('agent/created', ({ agent }) => { copy(agent) })
  context.on('agent-preset/selected', (sessionId: SessionId, preset: string) => {
    if (preset !== 'writer' || skillMount !== 'workspace') return
    const agent = context.get('agents')?.get(sessionId)
    if (agent !== undefined) copy(agent)
  })
  context.inject(['webServer', 'typert'], ctx => {
    registerWriterRoute(ctx, { maxBytes, trustedHosts })
  })
  context.inject(['commands'], ctx => {
    ctx.effect(() => ctx.commands.register({
      definitionId: CommandDefinitionId('@winterhuan/dsh-writer/sync-skills'),
      name: 'writer-sync-skills',
      description: '强制把随包写作技能同步到当前工作区 .agents/skills',
      handler: invocation => syncCommand(ctx, invocation),
    }), 'writer: sync command')
  })
}

async function syncCommand(context: Context, invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== '') return { kind: 'error', text: '用法：/writer-sync-skills' }
  const host = context.get('writerHost')
  if (host === undefined) return { kind: 'error', text: '写作插件还没有就绪。' }
  if (host.skillMount === 'bundled') {
    return { kind: 'error', text: '当前是 bundled 挂载，技能从插件目录读取，不会写入工作区。把 skillMount 改为 workspace 并重启后再同步。' }
  }
  const cwd = invocation.agent.session.header.cwd
  if (cwd === undefined) return { kind: 'error', text: '这个会话没有工作区目录。' }
  const result = await host.sync(cwd, true)
  return { kind: 'success', text: `已强制同步 ${String(result.copied.length)} 个技能到 ${result.destination}。` }
}
