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
import { resolveWriterSyncPreset } from './sync-gate.ts'
import { syncWriterSkills, unsyncWriterSkills, type SyncResult, type UnsyncResult } from './sync-skills.ts'
import { registerWriterRoute } from './write-route.ts'

export { packageSkillsDir } from './skills-dir.ts'
export { skillFilesystemRowDisabled, writerSkillMount } from './mount.ts'
export { resolveWriterSyncPreset } from './sync-gate.ts'
export { syncWriterSkills, unsyncWriterSkills, packagedSkillNames, projectRootFor } from './sync-skills.ts'
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
  readonly gptImageApiKeyEnv?: Volatile<string>
}

/** Schema for the writing plugin. */
export const Config = z.object({
  skillMount: z.union(['workspace', 'bundled'] as const).default('bundled'),
  editorMaxBytes: z.natural().min(65_536).max(8_388_608).default(2_097_152),
  makersApiKeyEnv: z.string().role('credential-ref').default('MAKERS_API_KEY').volatile(),
  gptImageApiKeyEnv: z.string().role('credential-ref').default('GPT_IMAGE_API_KEY').volatile(),
  trustedHosts: z.array(z.string()).default([]),
}) as z<Config>

/** Service the preset rows and the sync command read. */
export interface WriterHost {
  readonly skillMount: SkillMount
  readonly skillsDir: string
  /** Credential environment name for Zhuque. The host does not read the secret. */
  readonly makersApiKeyEnv: string
  /** Credential environment name for cover image API. The host does not read the secret. */
  readonly gptImageApiKeyEnv: string
  sync(workspaceDir: string, force: boolean): Promise<SyncResult>
  unsync(workspaceDir: string): Promise<UnsyncResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Writing-mode host state for the current process. */
    writerHost: WriterHost
  }
}

const MOUNT_ENV = 'DSH_WRITER_SKILL_MOUNT'

function credentialName(value: Volatile<string> | string | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (value !== undefined && typeof value !== 'string') {
    const current = value.get()
    if (typeof current === 'string' && current.trim() !== '') return current.trim()
  }
  return fallback
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) delete process.env[name]
  else process.env[name] = previous
}

/**
 * Install the mount, optional first-entry copy, the save route, and skill sync/unsync commands.
 * @param context - host context.
 * @param config - plugin configuration after schema defaults.
 */
export function apply(context: Context, config: Config = {}): void {
  const skillMount = writerSkillMount(config.skillMount, undefined)
  const trustedHosts = config.trustedHosts ?? []
  for (const host of trustedHosts) assertTrustedWriterAuthority(host)
  const skillsDir = packageSkillsDir()
  const maxBytes = config.editorMaxBytes ?? 2_097_152
  const makersApiKeyEnv = credentialName(config.makersApiKeyEnv, 'MAKERS_API_KEY')
  const gptImageApiKeyEnv = credentialName(config.gptImageApiKeyEnv, 'GPT_IMAGE_API_KEY')
  const previousMount = process.env[MOUNT_ENV]
  const previousKeyEnv = process.env.WRITER_ZHUQUE_KEY_ENV
  const previousCoverKeyEnv = process.env.WRITER_COVER_KEY_ENV
  process.env[MOUNT_ENV] = skillMount
  process.env.WRITER_ZHUQUE_KEY_ENV = makersApiKeyEnv
  process.env.WRITER_COVER_KEY_ENV = gptImageApiKeyEnv
  context.effect(() => () => {
    restoreEnv(MOUNT_ENV, previousMount)
    restoreEnv('WRITER_ZHUQUE_KEY_ENV', previousKeyEnv)
    restoreEnv('WRITER_COVER_KEY_ENV', previousCoverKeyEnv)
  }, 'writer: skill mount')
  const host: WriterHost = {
    skillMount,
    skillsDir,
    makersApiKeyEnv,
    gptImageApiKeyEnv,
    sync: (workspaceDir, force) => syncWriterSkills({ sourceDir: skillsDir, workspaceDir, force }),
    unsync: workspaceDir => unsyncWriterSkills({ sourceDir: skillsDir, workspaceDir }),
  }
  context.provide('writerHost', host)
  const copy = (agent: Agent, eventPreset?: string): void => {
    if (skillMount !== 'workspace') return
    const cwd = agent.session.header.cwd
    if (cwd === undefined) return
    const composed = context.get('agentPresets')?.composedPreset(agent.ctx)
    const selected = resolveWriterSyncPreset({
      ...(eventPreset !== undefined ? { eventPreset } : {}),
      ...(composed !== undefined ? { composedPreset: composed } : {}),
      ...(agent.session.header.agentPreset !== undefined
        ? { headerPreset: agent.session.header.agentPreset }
        : {}),
    })
    if (selected !== 'writer') return
    void host.sync(cwd, false).catch((error: unknown) => {
      context.logger('writer').warn(`skill copy skipped: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  context.on('agent/created', ({ agent }) => { copy(agent) })
  context.on('agent-preset/selected', (sessionId: SessionId, preset: string) => {
    if (skillMount !== 'workspace') return
    const agent = context.get('agents')?.get(sessionId)
    if (agent !== undefined) copy(agent, preset)
  })
  context.inject(['webServer', 'typert'], ctx => {
    registerWriterRoute(ctx, { maxBytes, trustedHosts })
  })
  context.inject(['commands'], ctx => {
    ctx.effect(() => ctx.commands.register({
      definitionId: CommandDefinitionId('@winterhuan/dsh-writer/sync-skills'),
      name: 'writer-sync-skills',
      description: '把随包写作技能强制写入当前项目 .agents/skills（bundled 默认下也可写入，便于改副本或切 workspace）',
      handler: invocation => syncCommand(ctx, invocation),
    }), 'writer: sync command')
    ctx.effect(() => ctx.commands.register({
      definitionId: CommandDefinitionId('@winterhuan/dsh-writer/unsync-skills'),
      name: 'writer-unsync-skills',
      description: '删除此前 sync 写入的 Writer 技能目录，保留项目里其它 .agents/skills',
      handler: invocation => unsyncCommand(ctx, invocation),
    }), 'writer: unsync command')
  })
}

async function syncCommand(context: Context, invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== '') return { kind: 'error', text: '用法：/writer-sync-skills' }
  const host = context.get('writerHost')
  if (host === undefined) return { kind: 'error', text: '写作插件还没有就绪。' }
  const cwd = invocation.agent.session.header.cwd
  if (cwd === undefined) return { kind: 'error', text: '这个会话没有工作区目录。' }
  const result = await host.sync(cwd, true)
  const mountNote = host.skillMount === 'bundled'
    ? ' 当前是 bundled 挂载：会话仍读包内技能；项目副本供改稿或切到 workspace 后使用。'
    : ''
  return { kind: 'success', text: `已强制同步 ${String(result.copied.length)} 个技能到 ${result.destination}。${mountNote}` }
}

async function unsyncCommand(context: Context, invocation: CommandInvocation): Promise<CommandResult> {
  if (invocation.rawInput.trim() !== '') return { kind: 'error', text: '用法：/writer-unsync-skills' }
  const host = context.get('writerHost')
  if (host === undefined) return { kind: 'error', text: '写作插件还没有就绪。' }
  const cwd = invocation.agent.session.header.cwd
  if (cwd === undefined) return { kind: 'error', text: '这个会话没有工作区目录。' }
  const result = await host.unsync(cwd)
  if (result.removed.length === 0) {
    return { kind: 'success', text: `没有找到可撤销的 Writer 技能目录（已对照包内 skills）。目标：${result.destination}` }
  }
  return {
    kind: 'success',
    text: `已删除 ${String(result.removed.length)} 个 Writer 技能目录（${result.removed.join('、')}）。未触碰其它 .agents/skills。`,
  }
}
