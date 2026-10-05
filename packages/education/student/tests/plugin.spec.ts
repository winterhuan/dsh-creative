import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SkillRegistry, { renderSkillContent } from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import * as student from '../src/index.ts'
import { createStudySkillProvider } from '../src/skill-provider.ts'
import { studyStore } from '../src/store.ts'
import { stateSchema } from '../src/schema.ts'
import { setup, material, course, start, attempt, mistake, confirm } from './fixtures.ts'

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-student-test-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(LocalFileSystem, { cwd })
  const plugin = ctx.plugin(student)
  await plugin.await()
  const policy = { resolve: vi.fn(() => undefined) }
  function execution(name = 'study_update', signal = new AbortController().signal, sessionId = 'student-session'): ToolRunContext {
    const agent = { session: { id: sessionId, header: { cwd } }, ctx: { get: (name: string) => name === 'sandboxPolicy' ? policy : ctx.get(name) } } as Agent
    const callId = 'study-call' as ToolRunContext['callId']
    return { agent, signal, callId, rootCallId: callId, name, arguments: {}, token: Symbol('study') as ToolRunContext['token'], deferContext() {}, concludeTurn() {} }
  }
  async function call(change: unknown) { return ctx.tools.get('study_update')!.execute({ change }, execution()) }
  return { cwd, ctx, plugin, execution, call, policy }
}

describe('independently loaded student plugin', () => {
  it('loads the Skill and references through the DSH provider and disposes all contributions', async () => {
    const { ctx, plugin } = await fixture()
    expect((await ctx.skills.list()).map(item => item.name)).toEqual(['study'])
    const provider = createStudySkillProvider()
    const candidates = await provider.list({})
    if (!Array.isArray(candidates)) throw new Error('Expected a complete catalog')
    const candidate = candidates[0]!
    const skill = (await provider.get(candidate, {}))!
    expect(renderSkillContent(skill)).toContain('Base directory for this skill:')
    if (skill.resourceBase?.kind !== 'directory') throw new Error('Expected a resource directory')
    for (const file of ['materials.md', 'teaching.md']) expect((await readFile(join(skill.resourceBase.path, 'references', file), 'utf8')).length).toBeGreaterThan(100)
    expect(await provider.get({ ...candidate, path: '/etc/passwd' }, {})).toBeUndefined()
    expect(ctx.tools.get('study_status')).toBeDefined()
    await plugin.dispose()
    expect(await ctx.skills.list()).toEqual([])
    expect(ctx.tools.get('study_update')).toBeUndefined()
    expect(ctx.tools.get('study_status')).toBeUndefined()
  })

  it('runs setup, confirmed schooling, work, stop and photo intake through real native tools', async () => {
    const { ctx, cwd, execution, call, policy } = await fixture()
    const query = () => ctx.tools.get('study_status')!.execute({}, execution('study_status'))
    expect(await query()).toMatchObject({ phase: 'setup-required' })
    expect(await readdir(cwd)).toEqual([])
    await call(setup)
    await call({ action: 'material', material })
    await call({ action: 'course', course })
    await call({ ...start, mode: 'school' })
    await call({ action: 'record', attempt })
    await call({ action: 'stop', sessionId: start.id, reflection: '我学会先凑十。' })
    await call({ action: 'mistake', mistake })
    await call(confirm)
    const bytes = await readFile(join(cwd, '.study/state.json'), 'utf8')
    const state = stateSchema.parse(JSON.parse(bytes))
    expect(state.attempts[0]).toMatchObject({ response: attempt.response, materialId: material.id })
    expect(state.rewards).toHaveLength(2)
    expect(state.mistakes[0]?.uncertainties).toBe('')
    expect(policy.resolve).toHaveBeenCalled()
    const second = execution('study_status', new AbortController().signal, 'resumed-session')
    expect(await studyStore(second)).toEqual(state)
    expect(await query()).toMatchObject({ phase: 'break', stars: 2 })
    expect(await readFile(join(cwd, '.study/state.json'), 'utf8')).toBe(bytes)
  })

  it('rejects unsupported fields and invalid numeric bounds without writing', async () => {
    const { cwd, call } = await fixture()
    await expect(call({ ...setup, profile: { ...setup.profile, schoolYear: '' } })).rejects.toThrow()
    await expect(call({ ...setup, injected: true })).rejects.toThrow()
    await expect(call({ ...setup, profile: { ...setup.profile, limits: { ...setup.profile.limits, breakMinutes: 0 } } })).rejects.toThrow()
    expect(await readdir(cwd)).toEqual([])
  })

  it('returns serializable results through the DSH execution pipeline', async () => {
    const { ctx, execution } = await fixture()
    const result = await ctx.tools.execute({ ...execution(), arguments: { change: setup } })
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([expect.objectContaining({ type: 'text', text: expect.stringContaining('ready') })])
  })

  it('rejects stale competing writes with one committed material rather than lost history', async () => {
    const { ctx, execution, call } = await fixture()
    await call(setup)
    const write = ctx.fs.writeText.bind(ctx.fs)
    let arrived = 0
    let release: () => void = () => { throw new Error('Barrier not ready') }
    const bothRead = new Promise<void>(resolve => { release = resolve })
    const spy = vi.spyOn(ctx.fs, 'writeText').mockImplementation(async (...args) => {
      arrived += 1
      if (arrived === 2) release()
      await bothRead
      return write(...args)
    })
    onTestFinished(() => spy.mockRestore())
    const results = await Promise.allSettled([
      studyStore(execution(), { action: 'material', material }),
      studyStore(execution(), { action: 'material', material: { ...material, id: 'other' } }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected?.status === 'rejected' ? rejected.reason : undefined).toMatchObject({ code: 'FS_STALE_VERSION' })
    expect((await studyStore(execution()))?.materials).toHaveLength(1)
  })

  it('does not follow a learning directory link outside the workspace', async () => {
    const { cwd, call } = await fixture()
    const outside = await mkdtemp(join(tmpdir(), 'dsh-student-outside-'))
    onTestFinished(() => rm(outside, { recursive: true, force: true }))
    await symlink(outside, join(cwd, '.study'))
    await expect(call(setup)).rejects.toThrow('当前工作区内')
    expect(await readdir(outside)).toEqual([])
  })

  it('shares sidebar answers across native sessions and rejects stale form revisions', async () => {
    const { execution, call } = await fixture()
    await studyStore(execution(), setup, 0)
    await expect(studyStore(execution(), { action: 'limits', limits: setup.profile.limits, parentConfirmation: '确认' }, 0)).rejects.toThrow('已更新')
    await call(start)
    const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt }
    await call({ action: 'task', task })
    const state = (await studyStore(execution()))!
    await studyStore(execution('study_update', new AbortController().signal, 'second-session'), { action: 'answer', taskId: task.id, response: attempt.response }, state.revision)
    expect((await studyStore(execution()))?.task?.response).toBe(attempt.response)
    await call({ action: 'record', attempt })
    expect((await studyStore(execution()))?.attempts).toHaveLength(1)
  })

  it('preserves malformed state and stops cancelled writes', async () => {
    const { cwd, execution, call } = await fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(studyStore(execution('study_update', controller.signal), setup)).rejects.toMatchObject({ name: 'AbortError' })
    expect(await readdir(cwd)).toEqual([])
    await call(setup)
    await writeFile(join(cwd, '.study/state.json'), '{broken')
    await expect(call({ action: 'material', material })).rejects.toThrow()
    expect(await readFile(join(cwd, '.study/state.json'), 'utf8')).toBe('{broken')
  })
})
