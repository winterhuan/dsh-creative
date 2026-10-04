import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import Subprocess from '@deepseek-ai/dsh-subprocess-local'
import Sandbox from '@deepseek-ai/dsh-sandbox-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import NodeRuntime from '@deepseek-ai/dsh-ptc-runtime-node'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import * as BashTool from '@deepseek-ai/dsh-tool-bash'
import * as FsTools from '@deepseek-ai/dsh-tool-fs'
import { LlmAdapter, ToolCallId, createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { STRUCTURED_OUTPUT_TOOL } from '@deepseek-ai/dsh-subagent-in-process-driver'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
import Workflow from '@deepseek-ai/dsh-workflow-ptc'
import * as WorkflowTool from '@deepseek-ai/dsh-tool-workflow'
import { createStorySkillProvider } from '../src/skill-provider.ts'
import type {} from '@deepseek-ai/dsh-tool-workflow/types'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { execa } from 'execa'
import { describe, expect, it, type TestContext } from 'vitest'
import { registerCreativeHooks } from '../src/native-hooks.ts'

const resources = resolve(import.meta.dirname, '../knowledge/story')
const skillsRoot = join(resources, 'skills')
const writeSkill = join(skillsRoot, 'story-write')
const reviewSkill = join(skillsRoot, 'story-review')
const cliPath = resolve(resources, '../../lib/cli.js')
const script = await readFile(join(writeSkill, 'workflows/chapter.js'), 'utf8')
const finalBody = await readFile(new URL('./fixtures/workflow-body.md', import.meta.url), 'utf8')
const outlineText = await readFile(new URL('./fixtures/workflow-outline.md', import.meta.url), 'utf8')
const scenePlan = '主角在封门前出示签押，拒交钥匙并取回账册；只揭示缺页，不揭幕后主使。'
const initialBody = finalBody.replace('签押', '篮子')
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
type Step = { name: string; args: object } | (() => Promise<{ name: string; args: object }>)

class ChapterAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  readonly queues = new Map<string, Step[]>()
  readonly childEntered = Promise.withResolvers<void>()
  readonly childStopped = Promise.withResolvers<void>()
  reviewCount = 0
  constructor(readonly workflowArgs: Record<string, unknown>, readonly project: string,
    readonly mode: 'commit' | 'create-outline' | 'prepare-needs-input' | 'missing-approved-outline' | 'needs-input' | 'invalid-review' | 'cancel' | 'writer-error' | 'writer-text' | 'writer-reasoning') { super() }
  override async resolveModel(provider: string, model: string) { return { provider, id: model, name: model } }
  read(file_path: string): Step { return { name: 'read', args: { file_path } } }
  skill(name: string): Step { return { name: 'skill', args: { name } } }
  bash(command: string): Step { return { name: 'bash', args: { command, description: 'Chapter fixture operation', workdir: this.project } } }
  cliCommand(group: string, action: string, extra: string[] = []) {
    return [process.execPath, cliPath, group, action, '--workspace', dirname(this.project), '--book', basename(this.project), '--json', ...extra].map(quote).join(' ')
  }
  checkCommand(action = 'check') { return this.cliCommand('chapter', action, ['--chapter', '1']) }
  async checkResult() {
    const check = JSON.parse(await readFile(join(this.project, 'checked.json'), 'utf8'))
    expect(check.quality, JSON.stringify(check)).toMatchObject({ status: 'pass' })
    expect(check.outline_readiness, JSON.stringify(check)).toMatchObject({ status: 'pass' })
    return check
  }
  async sourceResult() {
    const check = await this.checkResult()
    return { body_sha256: check.body_sha256, outline_sha256: check.outline_sha256, state_revision: check.state_revision }
  }
  makeSteps(request: GenerateOptions): Step[] {
    if (request.sessionId === 'chapter-lead') return [
      this.read(join(writeSkill, 'references/long/native-workflow.md')),
      this.read(join(writeSkill, 'workflows/chapter.js')),
      { name: 'workflow', args: { meta: { name: 'story-chapter', description: 'Chapter integration' }, script, args: this.workflowArgs } },
    ]
    const prompt = JSON.stringify(request.messages)
    const body = join(this.project, '正文/第1章.md')
    const outline = join(this.project, '大纲/细纲_第1章.md')
    if (prompt.includes('You prepare this chapter.')) {
      expect(prompt).toContain('--kind foreshadow --filter due --chapter 1')
      const tracking = this.cliCommand('project', 'check')
      const outlineCheck = this.cliCommand('outline', 'check', ['--chapter', '1'])
      const steps: Step[] = [this.skill('story-write'),
        this.read(join(writeSkill, 'references/long/workflow-chapter.md')),
        this.read(join(writeSkill, 'references/long/continuity-context.md')),
        this.bash(this.cliCommand('project', 'query', ['--kind', 'foreshadow', '--filter', 'due', '--chapter', '1']) + ' > due-hooks.json'),
        this.bash(`${tracking} > preparation-state.json && cat preparation-state.json`),
        this.read(join(this.project, '追踪/上下文.md')), this.read(join(this.project, '大纲/卷纲.md')),
        this.bash(outlineCheck),
      ]
      if (this.mode === 'prepare-needs-input' || this.mode === 'missing-approved-outline') {
        if (this.mode === 'missing-approved-outline') steps.push(this.read(body))
        return [...steps, { name: STRUCTURED_OUTPUT_TOOL, args: { status: 'needs_input', summary: this.mode === 'prepare-needs-input'
          ? '卷纲缺少下一步目标，需要作者裁定。' : '已有正文但找不到原批准细纲，保留正文并等待恢复。' } }]
      }
      if (this.mode === 'create-outline') steps.push(
        this.read(join(writeSkill, 'references/long/workflow-setup.md')),
        { name: 'write', args: { file_path: outline, content: outlineText } }, this.bash(outlineCheck),
      )
      const identityCommand = this.checkCommand('snapshot') + ' --outline-only'
      steps.push(this.bash(`${identityCommand} > preparation-before.json && cat preparation-before.json`),
        this.read(outline), this.bash(tracking), this.bash(`${identityCommand} > prepared.json && cat prepared.json`),
        async () => {
          expect(JSON.parse(await readFile(join(this.project, 'due-hooks.json'), 'utf8'))).toMatchObject({ initialized: true, state_revision: 0, items: [], next_offset: null })
          expect(await readFile(join(this.project, 'preparation-before.json'), 'utf8')).toBe(await readFile(join(this.project, 'prepared.json'), 'utf8'))
          await expect(readFile(body)).rejects.toMatchObject({ code: 'ENOENT' })
          const snapshot = JSON.parse(await readFile(join(this.project, 'prepared.json'), 'utf8'))
          return { name: STRUCTURED_OUTPUT_TOOL, args: {
            status: 'ready', summary: 'Outline checked and scene plan prepared.', body_path: body, outline_path: outline,
            context_paths: [join(this.project, '追踪/上下文.md')], scene_execution_plan: scenePlan,
            outline_sha256: snapshot.outline_sha256, state_revision: snapshot.state_revision,
          } }
        },
      )
      return steps
    }
    if (prompt.includes('You are the narrative-writer.')) {
      expect(prompt).toContain(scenePlan)
      if (this.mode.startsWith('writer-')) return [this.skill('story-write')]
      const prose = this.reviewCount ? finalBody : initialBody
      return [this.skill('story-write'), this.read(join(writeSkill, 'references/roles/narrative-writer.md')),
        this.read(outline),
        this.read(join(this.project, '追踪/上下文.md')),
        ...this.reviewCount ? [this.read(body)] : [],
        { name: 'write', args: { file_path: body, content: prose } },
        this.bash(`${this.checkCommand()} > checked.json && cat checked.json`),
        async () => ({ name: STRUCTURED_OUTPUT_TOOL, args: {
          status: 'checked', summary: 'Draft checked against actual files.', compression_used: false,
          length_status: (await this.checkResult()).length.status, ...await this.sourceResult(),
        } }),
      ]
    }
    if (prompt.includes('You are an independent reviewer.')) {
      this.reviewCount++
      const recommendation = this.mode === 'invalid-review' ? 'invalid' : this.mode === 'needs-input' ? 'needs_input' : this.reviewCount === 1 ? 'revise' : 'ready'
      const identityCommand = this.checkCommand('snapshot')
      return [this.skill('story-review'),
        this.read(join(reviewSkill, 'references/workflow.md')), this.read(join(reviewSkill, 'references/quality-rubric.md')),
        this.bash(`${identityCommand} > before.json && cat before.json`), this.read(outline), this.read(body),
        this.bash(`${identityCommand} > after.json && cat after.json`),
        async () => {
          expect(await readFile(join(this.project, 'before.json'), 'utf8')).toBe(await readFile(join(this.project, 'after.json'), 'utf8'))
          return { name: STRUCTURED_OUTPUT_TOOL, args: { recommendation, review: recommendation === 'needs_input' ? '细纲与设定对账册归属冲突，需要作者裁定。' : '正文第3段：签押是凭据，不应写成篮子。' } }
        },
      ]
    }
    if (!prompt.includes('You own tracking verification')) throw new Error('Unexpected child task')
    return [this.skill('story-write'), this.read(join(writeSkill, 'references/long/tracking-transaction.md')), this.read(body), this.read(outline),
      async () => {
        const current = await this.sourceResult()
        const transaction = JSON.parse(await readFile(join(this.project, 'transaction.json'), 'utf8'))
        const guarded = { ...transaction, expected_body_sha256: current.body_sha256, expected_outline_sha256: current.outline_sha256 }
        return { name: 'write', args: { file_path: join(this.project, 'transaction.json'), content: JSON.stringify(guarded) } }
      },
      this.bash(`${this.checkCommand('commit')} --input transaction.json`),
      this.bash(this.cliCommand('project', 'check')),
      this.bash(`${this.checkCommand()} > checked.json && cat checked.json`),
      this.read(join(this.project, '追踪/_tracking-state.json')),
      async () => ({ name: STRUCTURED_OUTPUT_TOOL, args: { status: 'committed', summary: 'Actual tracking and sources verified.', ...await this.sourceResult() } }),
    ]
  }
  async *stream(request: GenerateOptions): AsyncIterable<StreamChunk> {
    if (request.sessionId === undefined) throw new Error('Chapter fixture requires a Session')
    this.requests.push(request)
    if (request.sessionId !== 'chapter-lead' && this.mode === 'cancel') {
      this.childEntered.resolve()
      try {
        await new Promise<void>((resolve) => {
          if (request.signal?.aborted) resolve()
          else request.signal?.addEventListener('abort', () => resolve(), { once: true })
        })
      } finally { this.childStopped.resolve() }
      throw new Error('Cancelled scripted child')
    }
    let steps = this.queues.get(request.sessionId)
    if (!steps) { steps = this.makeSteps(request); this.queues.set(request.sessionId, steps) }
    const step = steps.shift()
    if (!step) {
      if (request.sessionId !== 'chapter-lead') {
        if (this.mode === 'writer-error') {
          yield { type: 'finish', reason: { kind: 'error', failure: { code: 'PI_AI_ERROR', message: 'Provider rejected the request.' } } }
          return
        }
        if (this.mode === 'writer-reasoning') {
          yield { type: 'block-start', index: 0, blockType: 'reasoning' }
          yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'The draft still needs to be written.' } }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: this.mode === 'writer-text' ? 'I will now check tracking.' : 'Chapter run ended.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    const { name, args } = typeof step === 'function' ? await step() : step
    const id = ToolCallId(`call-${this.requests.length}`)
    const argumentsJson = JSON.stringify(args)
    yield { type: 'block-start', index: 0, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsJson }
    yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsJson } }
    yield { type: 'finish', reason: { kind: 'tool-calls' } }
  }
}

async function setup(test: TestContext, mode: ChapterAdapter['mode']) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-chapter-native-'))
  const ctx = new Context()
  test.onTestFinished(async () => {
    try { await ctx.fiber.dispose() }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
  const project = join(directory, 'book')
  await mkdir(join(project, '正文'), { recursive: true })
  await mkdir(join(project, '大纲'))
  if (!['create-outline', 'prepare-needs-input', 'missing-approved-outline'].includes(mode)) {
    await writeFile(join(project, '大纲/细纲_第1章.md'), outlineText)
  }
  await writeFile(join(project, '大纲/卷纲.md'), mode === 'prepare-needs-input' ? '下一步目标：[待补充]' : '已确认：主角在封门前用签押取回账册，发现缺页。字数目标575，不揭示幕后主使。')
  if (mode === 'missing-approved-outline') await writeFile(join(project, '正文/第1章.md'), finalBody)
  await writeFile(join(project, 'initial.json'), JSON.stringify({ schema_version: 1, book_title: '原生工作流', last_chapter: 0,
    context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '门口' } } }))
  await execa(process.execPath, [cliPath, 'project', 'init', '--workspace', directory, '--book', 'book', '--kind', 'long', '--input', join(project, 'initial.json'), '--json'], { cancelSignal: test.signal })
  await writeFile(join(project, 'transaction.json'), JSON.stringify({ schema_version: 1, mode: 'append', chapter: 1, chapter_title: '账册', expected_state_revision: 0,
    delta: { result: '主角取回账册', character_changes: [], foreshadow_changes: [], timeline_events: [], constraints: [], next_chapter_commitments: [], retired_context_items: [], retired_characters: [] },
    context: { position: { volume: '第一卷', volume_start_chapter: 1, story_time: '清晨', scene: '屋内' }, long_term_constraints: [], active_character_names: [], continuity_risks: [] }, character_snapshots: {} }))
  const workflowArgs = { workspace: directory, book: 'book', cli: cliPath, skills_root: skillsRoot, chapter: 1,
    instructions: '只写第1章，取回账册。', context_paths: [], resume: mode === 'missing-approved-outline', compression_used: false }
  const adapter = new ChapterAdapter(workflowArgs, project, mode)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(Persistence, { root: join(directory, 'sessions'), compression: 'none' })
  await ctx.plugin(LocalFileSystem)
  await ctx.plugin(Subprocess)
  await ctx.plugin(Sandbox)
  await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access', workspaceRoot: directory })
  await ctx.plugin(NodeRuntime)
  await ctx.plugin(ShellEnv, { dshHome: directory })
  await ctx.plugin(LocalBashExecutor)
  await ctx.plugin(BashTool)
  await ctx.plugin(FsTools)
  await ctx.plugin(SkillRegistry)
  ctx.skills.registerProvider(() => createStorySkillProvider())
  await ctx.plugin(ToolSkill)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(Subagents)
  await ctx.plugin(Spawn, { providerName: 'spawn' })
  await ctx.plugin(Workflow)
  await ctx.plugin(WorkflowTool)
  registerCreativeHooks(ctx)
  ctx.llm.registerAdapter(['chapter-test'], adapter)
  const lead = await ctx.agentLoop.create(SessionId('chapter-lead'), { provider: 'chapter-test', model: 'scripted' }, { cwd: directory })
  const idle = new Promise<void>(resolve => {
    const off = ctx.on('agent/status', ({ agent, status }) => { if (agent === lead && status === 'idle') { off(); resolve() } })
  })
  lead.followup(createUserMessage({ content: [{ type: 'text', text: 'Use the native chapter workflow.' }], source: { kind: 'user' } }))
  return { ctx, lead, idle, adapter, project }
}

describe('chapter template through the native model and tool runtime', () => {
  it.for(['commit', 'create-outline'] as const)('prepares %s, revises with a fresh reviewer and verifies a guarded commit', async (mode, test) => {
    const { ctx, lead, idle, adapter, project } = await setup(test, mode)
    await idle
    const events = lead.session.snapshotEvents()
    const workflowEvents = events.filter(event => event.type.startsWith('tool-workflow/'))
    expect(workflowEvents.map(event => event.type)).toEqual([
      'tool-workflow/run-start', ...Array.from({ length: 6 }, () => ['tool-workflow/agent-start', 'tool-workflow/agent-end']).flat(), 'tool-workflow/run-end',
    ])
    expect(workflowEvents.at(-1)?.data, JSON.stringify(adapter.requests.at(-2)?.messages.slice(-5))).toMatchObject({ stopReason: 'completed' })
    const state = JSON.parse(await readFile(join(project, '追踪/_tracking-state.json'), 'utf8'))
    expect(state).toMatchObject({ last_committed_chapter: 1, state_revision: 1 })
    expect(state.wordcount_records['1'].body_sha256).toBe(createHash('sha256').update(finalBody).digest('hex'))
    expect(state).not.toHaveProperty('reader_value_records')
    expect(await readFile(join(project, '正文/第1章.md'), 'utf8')).toBe(finalBody)
    const children = [...adapter.queues.keys()].filter(id => id !== lead.id)
    expect(children).toHaveLength(6)
    expect(events.filter(event => event.type === 'tool-workflow/agent-start').map(event => event.data.label))
      .toEqual(['Prepare', 'Write', 'Review', 'Revise 1', 'Review 1', 'Submit'])
    expect(await readFile(join(project, '大纲/细纲_第1章.md'), 'utf8')).toBe(outlineText)
    for (const id of children) expect(ctx.agents.get(SessionId(id))).toBeUndefined()
    const history = JSON.stringify(adapter.requests)
    expect(history).toContain('# Narrative Writer')
    expect(history.includes((await readFile(join(reviewSkill, 'SKILL.md'), 'utf8')).split('\n').find(line => line.startsWith('# '))!)).toBe(true)
    expect(history).toContain('body_sha256')
    const writerHistory = JSON.stringify(adapter.requests.filter(request => request.sessionId === children[1]))
    expect(writerHistory).toContain('<creative-post-write>')
    expect(writerHistory).toContain('由当前流程指定的提交者')
    expect(writerHistory).not.toContain('继续当前步骤前核对并更新')
    expect(writerHistory).not.toContain('# 原生 workflow 单章执行')
    const toolText = events.filter(event => event.type === 'tool/result')
      .flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    expect(toolText).toContain('"status": "committed"')
    await ctx.sessionPersistence.flush()
  })

  it('does not submit when native structured validation rejects the reviewer', async test => {
    const { lead, idle, adapter, project } = await setup(test, 'invalid-review')
    await idle
    expect(adapter.queues.size).toBe(4)
    expect(lead.session.snapshotEvents().filter(event => event.type === 'tool-workflow/run-end').at(-1)?.data).toMatchObject({ stopReason: 'error' })
    expect(JSON.parse(await readFile(join(project, '追踪/_tracking-state.json'), 'utf8')).last_committed_chapter).toBe(0)
  })

  it.for(['writer-error', 'writer-text', 'writer-reasoning'] as const)('diagnoses %s as a missing structured result without retrying', async (mode, test) => {
    const { ctx, lead, idle, adapter, project } = await setup(test, mode)
    await idle
    const events = lead.session.snapshotEvents()
    const started = events.filter(event => event.type === 'tool-workflow/agent-start')
    expect(started).toHaveLength(2)
    expect(events.find(event => event.type === 'tool-workflow/run-end')?.data).toMatchObject({ stopReason: 'error' })
    const text = events.filter(event => event.type === 'tool/result')
      .flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    expect(text).toContain('Write failed: no structured result')
    expect(text).toContain('child Session')
    expect(text).not.toContain('invalid summary')
    expect(adapter.queues.size).toBe(3)
    for (const id of adapter.queues.keys()) if (id !== lead.id) expect(ctx.agents.get(SessionId(id))).toBeUndefined()
    expect(JSON.parse(await readFile(join(project, '追踪/_tracking-state.json'), 'utf8'))).toMatchObject({ last_committed_chapter: 0, state_revision: 0 })
    await expect(readFile(join(project, '正文/第1章.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.for(['prepare-needs-input', 'missing-approved-outline'] as const)('stops at preparation for %s without starting a writer', async (mode, test) => {
    const { lead, idle, adapter, project } = await setup(test, mode)
    await idle
    const events = lead.session.snapshotEvents()
    expect(events.filter(event => event.type === 'tool-workflow/agent-start').map(event => event.data.label)).toEqual(['Prepare'])
    expect(events.find(event => event.type === 'tool-workflow/run-end')?.data).toMatchObject({ stopReason: 'completed' })
    const text = events.filter(event => event.type === 'tool/result')
      .flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    expect(text).toContain('"status": "needs_input"')
    expect(adapter.queues.size).toBe(2)
    expect(JSON.parse(await readFile(join(project, '追踪/_tracking-state.json'), 'utf8')).state_revision).toBe(0)
    await expect(readFile(join(project, '大纲/细纲_第1章.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    if (mode === 'missing-approved-outline') expect(await readFile(join(project, '正文/第1章.md'), 'utf8')).toBe(finalBody)
    else await expect(readFile(join(project, '正文/第1章.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('returns the reviewer’s decision request while retaining the uncommitted draft', async test => {
    const { lead, idle, project } = await setup(test, 'needs-input')
    await idle
    expect(lead.session.snapshotEvents().find(event => event.type === 'tool-workflow/run-end')?.data).toMatchObject({ stopReason: 'completed' })
    const text = lead.session.snapshotEvents().filter(event => event.type === 'tool/result')
      .flatMap(event => event.data.message.content).filter(block => block.type === 'text').map(block => block.text).join('\n')
    expect(text).toContain('"status": "needs_input"')
    expect(text).toContain('需要作者裁定')
    expect(JSON.parse(await readFile(join(project, '追踪/_tracking-state.json'), 'utf8')).state_revision).toBe(0)
    expect(await readFile(join(project, '正文/第1章.md'), 'utf8')).toBe(initialBody)
  })

  it('cancels a live child and waits for its termination before recording run-end', async test => {
    const { ctx, lead, idle, adapter, project } = await setup(test, 'cancel')
    await adapter.childEntered.promise
    lead.cancel({ kind: 'user' })
    await idle
    await adapter.childStopped.promise
    const ended = lead.session.snapshotEvents().find(event => event.type === 'tool-workflow/run-end')
    expect(ended?.data).toMatchObject({ stopReason: 'cancelled' })
    for (const request of adapter.requests.filter(request => request.sessionId !== lead.id)) {
      if (request.sessionId === undefined) throw new Error('Missing child Session')
      expect(ctx.agents.get(request.sessionId)).toBeUndefined()
    }
    expect(JSON.parse(await readFile(join(project, '追踪/_tracking-state.json'), 'utf8')).state_revision).toBe(0)
  })
})
