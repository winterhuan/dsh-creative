import { stat } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { PRODUCTION_BINDING_SCHEMA, PRODUCTION_CONTEXT_SCHEMA } from './production-binding.ts'
import { ownedProductionJob, resolveProductionContext } from './production-context.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JobOutcome, JobSourceRead } from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-settings'
import type { ShellProcess } from '@deepseek-ai/dsh-shell'
import { defineTool, TOOL_ABORTED, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defaultDramaSkillRoot } from './skill-provider.ts'
import { configuredProduceCredentials, currentProduceConfig, resolveProduceEnvs, type ProduceConfig } from './produce-settings.ts'

/** Model-facing tool running one pinned creative production script with forwarded credentials. */
export { CREATIVE_PRODUCE_RUN_TOOL_NAME } from './production-binding.ts'

/** Read-only production credential discovery tool. */
export const CREATIVE_PRODUCE_STATUS_TOOL_NAME = 'drama_produce_status'

/** Pinned production scripts this tool may run; anything else is rejected. */
export const PRODUCE_ENTRIES = ['drama'] as const
/** One runnable pinned production script. */
export type ProduceEntry = typeof PRODUCE_ENTRIES[number]

/** Provider adapters the drama entry accepts. */
export const DRAMA_ADAPTERS = ['episode-compose', 'gpt-image-2', 'minimax-h3', 'minimax-music', 'seedance', 'agnes-image', 'agnes-video'] as const
/** One drama provider adapter. */
export type DramaAdapter = typeof DRAMA_ADAPTERS[number]

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    produce: 'produce'
  }
}

/** Model-supplied argument vector cap: adapters take file-scale input on stdin, not argv. */
const MAX_ARGV_ENTRIES = 64
/** One argument may name a file or carry flags, never a document. */
const MAX_ARGV_ENTRY_CHARS = 8_192
/** Job documents ride stdin; beyond this the caller stages a file instead. */
const MAX_STDIN_BYTES = 1_048_576

/** Rotation cursor spreading consecutive calls across the resolved key variants. */
let produceKeyRotation = 0

/** Maximum distinct credentials passed to one confirmation-gated drama run. */
const MAX_KEY_ATTEMPTS = 16

const DRAMA_CREDENTIALS: Readonly<Record<DramaAdapter, string>> = {
  'episode-compose': 'MIMO_API_KEY',
  'gpt-image-2': 'OPENAI_API_KEY',
  'minimax-h3': 'MINIMAX_API_KEY',
  'minimax-music': 'MINIMAX_API_KEY',
  seedance: 'ARK_API_KEY',
  'agnes-image': 'AGNES_API_KEY',
  'agnes-video': 'AGNES_API_KEY',
}

/** The tool-call abort failure, shared by every cancellation point. */
function abortError(): HarnessError {
  const error = new HarnessError('tool call aborted', TOOL_ABORTED)
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError()
}

/** Options for building the produce-run tool. */
export interface ProduceToolOptions {
  /** Composition entry seeding the profile when no settings provider is mounted. */
  readonly entry?: ProduceConfig
}

/**
 * Build a production status tool that never launches a process or returns credentials.
 * @param options - composition profile used when no settings provider is mounted.
 * @returns presence facts for drama adapters, video providers, and Zhuque detection.
 */
export function createCreativeProduceStatusTool(options: ProduceToolOptions = {}): ToolDefinition {
  const entryConfig = options.entry ?? {}
  return defineTool({
    name: CREATIVE_PRODUCE_STATUS_TOOL_NAME,
    description: 'Inspect configured short-drama production credentials without exposing keys or running production. Use this before asking for a missing key or choosing an adapter. DSH injects credentials from its settings and credential store into drama_produce_run; checking os.environ in an ordinary bash process does not test that store. Credential presence does not validate provider connectivity or authorize a paid run.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dramaAdapters: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                adapter: { type: 'string', required: true, enum: DRAMA_ADAPTERS },
                credentialConfigured: { type: 'boolean', required: true },
              },
            },
          },
          mimoConfigured: { type: 'boolean', required: true },
          fishAudioConfigured: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    presentCall: () => ({ card: 'generic', title: CREATIVE_PRODUCE_STATUS_TOOL_NAME, kind: 'read' }),
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      if (exec.agent === undefined) throw new Error('drama_produce_status requires a calling DSH Agent.')
      throwIfAborted(exec.signal)
      const section = currentProduceConfig(exec.agent.ctx, entryConfig)
      const configured = await configuredProduceCredentials(exec.agent.ctx, section)
      throwIfAborted(exec.signal)
      return {
        dramaAdapters: DRAMA_ADAPTERS.map(adapter => ({
          adapter,
          credentialConfigured: configured.has(DRAMA_CREDENTIALS[adapter]),
        })),
        mimoConfigured: configured.has('MIMO_API_KEY'),
        fishAudioConfigured: configured.has('FISH_API_KEY'),
      }
    },
  })
}

/**
 * Select a drama adapter's offline diagnostic script. Production execution
 * instead uses production_tool.py to consume confirmation and publish outputs.
 * @param adapter - the confirmed drama adapter, if the entry takes one.
 * @param dramaSkillRoot - the bundled short-drama skill root.
 * @returns the runnable pinned script.
 */
export function dramaScriptFor(adapter: DramaAdapter | undefined, dramaSkillRoot: string): string {
  if (adapter !== undefined && adapter.startsWith('agnes-')) {
    return resolve(dramaSkillRoot, 'short-drama-produce/scripts/agnes_adapters.py')
  }
  return resolve(dramaSkillRoot, 'short-drama-produce/scripts/provider_adapters.py')
}

/**
 * Quote one argv element for the shell seam without interpreting it.
 * @param value - the raw argument text.
 * @returns the single-quoted shell token.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function checkedArgv(argv: readonly string[] | undefined): string[] {
  const entries = argv ?? []
  if (entries.length > MAX_ARGV_ENTRIES) throw new Error(`drama_produce_run argv holds at most ${String(MAX_ARGV_ENTRIES)} entries.`)
  for (const entry of entries) {
    if (entry === '' || entry.length > MAX_ARGV_ENTRY_CHARS) {
      throw new Error('drama_produce_run argv entries must be non-empty and short; pass documents on stdin.')
    }
  }
  return [...entries]
}

function checkedStdin(stdin: string | undefined): string | undefined {
  if (stdin !== undefined && Buffer.byteLength(stdin) > MAX_STDIN_BYTES) {
    throw new Error('drama_produce_run stdin exceeds 1 MiB; stage the document as a file instead.')
  }
  return stdin
}

function resolveWorkdir(workdir: string | undefined, agent: Agent): string {
  const cwd = agent.session.header.cwd
  if (workdir === undefined) {
    if (cwd === undefined) throw new Error('drama_produce_run needs a session working directory.')
    return cwd
  }
  if (cwd !== undefined && !isAbsolute(workdir)) return resolve(cwd, workdir)
  return workdir
}

/**
 * Build the produce-run tool. Credentials resolve per call from the
 * creative-produce profile; nothing is cached across calls.
 * @param options - composition entry seeding the profile without a settings provider.
 * @returns the registered tool definition.
 */
export function createCreativeProduceRunTool(options: ProduceToolOptions = {}): ToolDefinition {
  const entryConfig = options.entry ?? {}
  return defineTool({
    name: 'drama_produce_run',
    description: 'Run a prepared, explicitly confirmed short-drama job with DSH-managed credentials. Use drama_produce_status to inspect adapters. Supply the confirmed job_id and adapter; production consumes confirmation once, verifies outputs and records delivery. Only explicit authentication, permission or rate-limit rejection before acceptance may rotate credentials, bounded at sixteen attempts. Use argv ["--selftest"] for offline adapter diagnostics.',
    parameters: {
      entry: { type: 'string', required: true, enum: PRODUCE_ENTRIES, description: 'Confirmed short-drama production, including episode-compose.' },
      adapter: { type: 'string', enum: DRAMA_ADAPTERS, description: 'Required for entry drama; must match the prepared job adapter.' },
      job_id: { type: 'string', description: 'Prepared and explicitly confirmed drama job id. Required for drama production; not accepted by video entries or diagnostics.' },
      argv: { type: 'array', items: { type: 'string' }, description: 'Exactly ["--selftest"] for offline adapter diagnostics; production accepts no extra arguments.' },
      stdin: { type: 'string', description: 'Production reads its confirmed job; replacement input is rejected.' },
      workdir: { type: 'string', description: 'Working directory; for drama, the prepared short-drama project or a directory inside it. Defaults to the session workspace.' },
      timeoutMs: { type: 'number', description: 'Executor timeout; background runs ignore it.' },
      run_in_background: { type: 'boolean', description: 'Return a produce job id immediately (collect with job_output, stop with job_kill). No executor timeout applies; adapters retain their own timeouts.' },
      production: { ...PRODUCTION_CONTEXT_SCHEMA, description: 'Production request to bind to this run. Requires run_in_background: true and does not replace the prepared job confirmation.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true, enum: ['background', 'foreground'], description: 'How the script ran.' },
          jobId: { type: 'string', description: 'Produce job id; set only for background runs.' },
          exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }], description: 'Script exit code; set only for foreground runs.' },
          timedOut: { type: 'boolean', description: 'Whether the executor timed out, independently of the exit code; set only for foreground runs.' },
          signal: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Terminating signal, or null for a normal exit; set only for foreground runs.' },
          stdout: { type: 'string', description: 'Collected stdout; set only for foreground runs.' },
          stderr: { type: 'string', description: 'Collected stderr; set only for foreground runs.' },
          production: PRODUCTION_BINDING_SCHEMA,
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.production !== undefined ? JSON.stringify({ production: value.production }) : value.kind === 'background'
          ? `started produce job ${value.jobId ?? 'unknown'}`
          : `produce exited ${value.exitCode === undefined ? 'unknown' : String(value.exitCode)}${value.timedOut === true ? '\nproduce timed out' : ''}${value.signal == null ? '' : `\nsignal: ${value.signal}`}\n${value.stdout ?? ''}${value.stderr === undefined || value.stderr === '' ? '' : `\nstderr:\n${value.stderr}`}`,
      }],
      presentationMeta: (_args, value) => value.production === undefined ? {} : { production: value.production },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('drama_produce_run requires a calling DSH Agent.')
      throwIfAborted(exec.signal)
      const agent = exec.agent
      if (args.production !== undefined && args.run_in_background !== true) throw new Error('Production requests require run_in_background: true.')
      const production = args.production === undefined ? undefined : await resolveProductionContext(args.production, agent)
      const entry = String(args.entry)
      const adapter = args.adapter
      if (entry === 'drama' && adapter === undefined) throw new Error('drama_produce_run entry drama requires adapter.')
      if (entry !== 'drama' && adapter !== undefined) throw new Error('drama_produce_run adapter applies only to entry drama.')
      const argv = checkedArgv(args.argv)
      let stdin = checkedStdin(args.stdin)
      const diagnostic = entry === 'drama' && argv.length === 1 && argv[0] === '--selftest'
      if (entry === 'drama') {
        if (diagnostic) {
          if (args.job_id !== undefined || stdin !== undefined || production !== undefined) {
            throw new Error('Drama diagnostics do not accept job_id, stdin or production context.')
          }
        } else {
          if (args.job_id === undefined || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(args.job_id)) {
            throw new Error('Drama production requires a prepared and explicitly confirmed job_id.')
          }
          if (argv.length !== 0 || stdin !== undefined) {
            throw new Error('Drama production reads the prepared job; argv and stdin cannot replace it.')
          }
        }
      } else if (args.job_id !== undefined) {
        throw new Error('drama_produce_run job_id applies only to drama production.')
      }
      const dramaSkillRoot = defaultDramaSkillRoot()
      const script = entry === 'drama'
        ? diagnostic ? dramaScriptFor(adapter, dramaSkillRoot) : resolve(dramaSkillRoot, 'short-drama-produce/scripts/production_tool.py')
        : (() => { throw new Error('Only drama production is supported') })()
      const scriptStat = await stat(script).catch(() => undefined)
      if (scriptStat?.isFile() !== true) throw new Error(`drama_produce_run bundled script is missing: ${script}`)
      const shell = agent.ctx.get('shell')
      if (shell === undefined) throw new Error('drama_produce_run requires the DSH shell executor.')
      const section = currentProduceConfig(agent.ctx, entryConfig)
      const envs = await resolveProduceEnvs(agent.ctx, section)
      const start = produceKeyRotation % envs.length
      produceKeyRotation += 1
      const initialEnv = envs[start]
      /* v8 ignore next -- resolveProduceEnvs always yields at least one environment. */
      if (initialEnv === undefined) throw new Error('drama_produce_run resolved no key environment.')
      const runEnv = initialEnv
      if (production !== undefined) runEnv.DSH_PRODUCTION_CONTEXT = JSON.stringify(production)
      let scriptArgs = [...(adapter === undefined ? [] : [adapter]), ...argv]
      if (entry === 'drama' && !diagnostic && adapter !== undefined && args.job_id !== undefined) {
        scriptArgs = ['run', '.', '--job-id', args.job_id, '--bundled-adapter', adapter, '--credential-pool-stdin']
        const ordered = [...envs.slice(start), ...envs.slice(0, start)]
        const keys = [...new Set(ordered.flatMap(env => env[DRAMA_CREDENTIALS[adapter]] ?? []))].slice(0, MAX_KEY_ATTEMPTS)
        stdin = JSON.stringify(keys)
        if (Buffer.byteLength(stdin) > MAX_STDIN_BYTES) throw new Error('drama_produce_run credential pool exceeds 1 MiB.')
      }
      const policy = agent.ctx.get('sandboxPolicy')?.resolve({ session: agent.session })
      const workdir = resolveWorkdir(args.workdir, agent)
      const command = ['python3', '-B', script, ...scriptArgs].map(shellQuote).join(' ')
      const request = {
        command,
        workdir,
        ...args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {},
        ...stdin !== undefined ? { stdin } : {},
        ...policy !== undefined ? { sandboxPolicy: policy } : {},
      }
      if (args.run_in_background === true) {
        throwIfAborted(exec.signal)
        const jobs = agent.ctx.get('jobs')
        if (jobs === undefined) throw new Error('background produce jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
        const label = adapter === undefined ? `produce ${entry}` : `produce ${entry}:${adapter}`
        // shell.execute resolves asynchronously, but ctx.jobs admits work
        // through synchronous hooks: bridge preparation like the shell tools'
        // background adapter and expose nothing until it publishes.
        const controller = new AbortController()
        let proc: ShellProcess | undefined
        const observed = (stream: 'stdout' | 'stderr') => (fromByte: number): JobSourceRead =>
          proc === undefined ? { text: '', nextOffset: fromByte, lossy: false } : proc.observed[stream].readFrom(fromByte)
        const jobId = jobs.start({
          kind: 'produce',
          label,
          owner: agent.session.id,
          // The registry pumps the process's observed streams into the ring;
          // reads before preparation resolves yield nothing, and observed
          // readers never steal bytes from any consumer cursor.
          output: [
            { channel: 'stdout', read: observed('stdout') },
            { channel: 'stderr', read: observed('stderr') },
          ],
          run: () => {
            const done = (async (): Promise<JobOutcome> => {
              try {
                // A background run outlives the executor deadline; the job registry and
                // the runner's own timeout bound it, as for the shell tools' background runs.
                await Promise.resolve()
                const env = production === undefined ? runEnv : { ...runEnv, DSH_PRODUCTION_JOB: JSON.stringify({ sessionId: agent.session.id, jobId, startedAt: ownedProductionJob(agent, jobId).startedAt }) }
                const execution = await shell.execute(shell.resolve({ ...request, env, signal: controller.signal, onExpiry: 'none' }))
                proc = execution
                try {
                  if (controller.signal.aborted) execution.kill()
                } finally {
                  await execution.done
                }
                return { status: execution.exitCode === 0 ? 'completed' : 'failed', detail: `exit code: ${String(execution.exitCode)}` }
              } catch (error: unknown) {
                return { status: 'failed', detail: error instanceof Error ? error.message : String(error) }
              }
            })()
            return {
              cancel: () => {
                controller.abort()
                proc?.kill()
              },
              done,
            }
          },
        })
        return {
          kind: 'background' as const, jobId,
          ...(production === undefined ? {} : {
            production: { ...production, job: { jobId, startedAt: ownedProductionJob(agent, jobId).startedAt } },
          }),
        }
      }
      const execution = await shell.execute(shell.resolve({ ...request, env: runEnv, signal: exec.signal }))
      const result = await execution.result()
      if (result.aborted) throw abortError()
      return {
        kind: 'foreground' as const,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        signal: result.signal,
        stdout: result.stdout.text,
        stderr: result.stderr.text,
      }
    },
  })
}

/**
 * Register production status and execution tools on the tools runtime.
 * @param context - creative plugin context owning the registration.
 * @param options - composition entry seeding the profile without a settings provider.
 */
export function registerCreativeProduceRunTool(context: Context, options: ProduceToolOptions = {}): void {
  context.tools.register(createCreativeProduceStatusTool(options))
  context.tools.register(createCreativeProduceRunTool(options))
}
