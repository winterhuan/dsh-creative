/** Credential-backed detection through the packaged story CLI. */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, TOOL_ABORTED, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { JobOutcome, JobSourceRead } from '@deepseek-ai/dsh-jobs'
import type { ShellProcess } from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { currentProduceConfig, configuredProduceCredentials, resolveProduceEnvs, type ProduceConfig } from './produce-settings.ts'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap { 'produce': 'produce' }
}

function quote(value: string): string { return `'${value.replaceAll("'", "'\"'\"'")}'` }

/**
 * Build the domain production tool.
 * @param options - initial production configuration.
 * @returns the executable QA tool definition.
 */
export function createCreativeProduceRunTool(options: { readonly entry?: ProduceConfig } = {}): ToolDefinition {
  return defineTool({
    name: 'story_zhuque',
    description: 'Detect AI-like text in one book chapter using Zhuque and DSH credentials. Sends the chapter to Tencent EdgeOne Makers without editing it. Use when the user requests Zhuque detection.',
    parameters: {
      book: { type: 'string', required: true, description: 'Book name, a direct child of the Session workspace.' },
      file: { type: 'string', required: true, description: 'Chapter path inside the book, absolute or relative to its directory.' },
      out: { type: 'string', description: 'Optional JSON report path inside the book, normally under .story-polish/.' },
      target: { type: 'number', description: 'AI ratio threshold, from 0 to 1; defaults to 0.5.' },
      max_chars: { type: 'integer', description: 'Maximum submitted characters; defaults to 20000.' },
      run_in_background: { type: 'boolean', description: 'Return a job ID for job_output and job_kill.' },
      timeoutMs: { type: 'number', description: 'Foreground executor timeout.' },
    },
    output: { schema: {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', required: true, enum: ['foreground', 'background'] },
        jobId: { type: 'string' },
        exitCode: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
        timedOut: { type: 'boolean' },
        signal: { oneOf: [{ type: 'string' }, { type: 'null' }] },
        stdout: { type: 'string' }, stderr: { type: 'string' },
      },
    }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('story_zhuque requires a DSH Session.')
      if (exec.signal.aborted) throw new HarnessError('tool call aborted', TOOL_ABORTED)
      const agent = exec.agent
      const workspace = agent.session.header.cwd
      if (workspace === undefined) throw new Error('story_zhuque requires a Session workspace.')
      const shell = agent.ctx.get('shell')
      if (shell === undefined) throw new Error('story_zhuque requires the DSH shell executor.')
      const policy = agent.ctx.get('sandboxPolicy')?.resolve({ session: agent.session })
      const argv = ['detect', 'zhuque', '--workspace', workspace, '--book', args.book, '--file', args.file, '--json']
      if (args.out !== undefined) argv.push('--out', args.out)
      if (args.target !== undefined) argv.push('--target', String(args.target))
      if (args.max_chars !== undefined) argv.push('--max-chars', String(args.max_chars))
      if (argv.some(value => value.includes('\0'))) throw new Error('Detection paths must not contain null characters.')
      const section = currentProduceConfig(agent.ctx, options.entry ?? {})
      const resolvedEnv = (await resolveProduceEnvs(agent.ctx, section))[0] ?? {}
      const request = {
        command: [process.execPath, resolve(dirname(fileURLToPath(import.meta.url)), '../lib/cli.js'), ...argv].map(quote).join(' '),
        workdir: workspace,
        env: Object.fromEntries(Object.entries(resolvedEnv).filter(([key]) => key === 'MAKERS_API_KEY')),
        ...(policy === undefined ? {} : { sandboxPolicy: policy }),
        ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
      }
      if (args.run_in_background === true) {
        const jobs = agent.ctx.get('jobs')
        if (jobs === undefined) throw new Error('story_zhuque background execution requires DSH jobs.')
        const controller = new AbortController()
        let proc: ShellProcess | undefined
        const observed = (stream: 'stdout' | 'stderr') => (fromByte: number): JobSourceRead =>
          proc === undefined ? { text: '', nextOffset: fromByte, lossy: false } : proc.observed[stream].readFrom(fromByte)
        const jobId = jobs.start({
          kind: 'produce', label: `Zhuque: ${args.book}`, owner: agent.session.id,
          output: [{ channel: 'stdout', read: observed('stdout') }, { channel: 'stderr', read: observed('stderr') }],
          run: () => {
            const done = (async (): Promise<JobOutcome> => {
              try {
                const execution = await shell.execute(shell.resolve({ ...request, signal: controller.signal, onExpiry: 'none' }))
                proc = execution
                if (controller.signal.aborted) execution.kill()
                await execution.done
                return { status: execution.exitCode === 0 ? 'completed' : 'failed', detail: `exit code: ${String(execution.exitCode)}` }
              } catch (error) {
                return { status: 'failed', detail: error instanceof Error ? error.message : String(error) }
              }
            })()
            return { cancel: () => { controller.abort(); proc?.kill() }, done }
          },
        })
        return { kind: 'background' as const, jobId }
      }
      const execution = await shell.execute(shell.resolve({ ...request, signal: exec.signal }))
      const result = await execution.result()
      if (result.aborted) throw new HarnessError('tool call aborted', TOOL_ABORTED)
      return { kind: 'foreground' as const, exitCode: result.exitCode, timedOut: result.timedOut, signal: result.signal, stdout: result.stdout.text, stderr: result.stderr.text }
    },
  })
}

/**
 * Register domain production tools for the lifetime of this plugin.
 * @param context - DSH tool registry context.
 * @param options - initial production configuration.
 */
export function registerCreativeProduceRunTool(context: Context, options: { readonly entry?: ProduceConfig } = {}): void {
  context.tools.register(createCreativeProduceRunTool(options))
  context.tools.register(defineTool({
    name: 'story_produce_status',
    description: 'Report configured domain credential presence without exposing keys or executing production.',
    parameters: {},
    output: { schema: { type: 'object', additionalProperties: false, properties: { configured: { type: 'array', required: true, items: { type: 'string' } } } }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(_args, exec) {
      if (exec.agent === undefined) throw new Error('A DSH Session is required.')
      const configured = await configuredProduceCredentials(exec.agent.ctx, currentProduceConfig(exec.agent.ctx, options.entry ?? {}))
      return { configured: [...configured].filter(key => key === 'MAKERS_API_KEY') }
    },
  }))
}
