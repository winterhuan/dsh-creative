/** Pinned game QA execution through the calling DSH Session. */
import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, TOOL_ABORTED, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { JobOutcome, JobSourceRead } from '@deepseek-ai/dsh-jobs'
import type { ShellProcess } from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { defaultNovelToGameSkillRoot } from './skill-provider.ts'
import { gameRoot } from './routes.ts'
import { gameQaEnvironment } from './verification.ts'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap { 'game-qa': 'game-qa' }
}

function quote(value: string): string { return `'${value.replaceAll("'", "'\"'\"'")}'` }

/**
 * Build the game-only QA tool with no production credential dependencies.
 * @returns the executable QA tool definition.
 */
export function createGameQaTool(): ToolDefinition {
  return defineTool({
    name: 'game_qa',
    description: 'Run the bundled Chrome driver against a game build and its qa/plan.json. Verify launch, rendering, input, core loop, outcome and restart; write authenticated evidence for Game Studio. Chrome and Node 22+ must be installed. This checks execution, not subjective fun.',
    parameters: {
      project: { type: 'string', required: true, description: 'Workspace-relative game project root, for example game-adaptations/my-game.' },
      run_in_background: { type: 'boolean', description: 'Return a DSH job id; use job_output and job_kill to observe or stop it.' },
      timeoutMs: { type: 'number', description: 'Foreground executor timeout; background jobs use the driver deadline.' },
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
      if (exec.agent === undefined) throw new Error('game_qa requires a DSH Session.')
      if (exec.signal.aborted) throw new HarnessError('tool call aborted', TOOL_ABORTED)
      if (!gameRoot(args.project) || args.project.includes('\0')) throw new Error('game_qa project must name game-adaptations/<project>.')
      const agent = exec.agent
      const cwd = agent.session.header.cwd
      if (cwd === undefined) throw new Error('game_qa requires a Session workspace.')
      const shell = agent.ctx.get('shell')
      if (shell === undefined) throw new Error('game_qa requires the DSH shell executor.')
      const policy = agent.ctx.get('sandboxPolicy')?.resolve({ session: agent.session })
      const request = {
        command: ['python3', '-B', resolve(defaultNovelToGameSkillRoot(), 'game-qa/scripts/run_qa.py'), args.project].map(quote).join(' '),
        workdir: cwd,
        env: gameQaEnvironment(cwd, agent.session.id),
        ...(policy === undefined ? {} : { sandboxPolicy: policy }),
        ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
      }
      if (args.run_in_background === true) {
        const jobs = agent.ctx.get('jobs')
        if (jobs === undefined) throw new Error('game_qa background execution requires DSH jobs.')
        const controller = new AbortController()
        let proc: ShellProcess | undefined
        const observed = (stream: 'stdout' | 'stderr') => (fromByte: number): JobSourceRead =>
          proc === undefined ? { text: '', nextOffset: fromByte, lossy: false } : proc.observed[stream].readFrom(fromByte)
        const jobId = jobs.start({
          kind: 'game-qa', label: `game QA ${args.project}`, owner: agent.session.id,
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
 * Register the pinned game QA tool for the lifetime of this plugin.
 * @param context - DSH tool registry context.
 */
export function registerGameQaTool(context: Context): void { context.tools.register(createGameQaTool()) }
