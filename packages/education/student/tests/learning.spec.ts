import { describe, expect, it } from 'vitest'
import { studyDay, studyStatus, updateStudy } from '../src/learning.ts'
import { stateSchema } from '../src/schema.ts'
import { queryStudy } from '../src/store.ts'
import { NOW, MINUTE, DAY, setup, material, course, start, attempt, mistake, confirm } from './fixtures.ts'

describe('daily learning and rest', () => {
  it('requires confirmed setup and rejects out-of-range time settings', () => {
    expect(() => updateStudy(undefined, start, NOW)).toThrow('家长确认')
    expect(() => updateStudy(undefined, { ...setup, profile: { ...setup.profile, limits: { ...setup.profile.limits, dailyMinutes: 90 } } }, NOW)).toThrow()
    const state = updateStudy(undefined, setup, NOW)
    expect(() => updateStudy(state, setup, NOW)).toThrow('已存在')
    expect(studyStatus(state, NOW)).toMatchObject({ phase: 'ready', remainingMs: 20 * MINUTE, unconfirmedSubjects: ['chinese', 'math', 'english'] })
  })

  it('counts all subjects and exploration against one budget and requires real stop plus break', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    expect(() => updateStudy(state, { ...start, id: 'parallel' }, NOW)).toThrow('结束当前')
    expect(studyStatus(state, NOW + 10 * MINUTE).phase).toBe('stop-required')
    expect(() => updateStudy(state, { action: 'record', attempt }, NOW + 11 * MINUTE)).toThrow('已到时')
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 15 * MINUTE)
    expect(state.sessions[0]?.spentMs).toBe(10 * MINUTE)
    expect(studyStatus(state, NOW + 16 * MINUTE).phase).toBe('break')
    expect(() => updateStudy(state, { ...start, id: 'b2', subject: 'english', mode: 'explore' }, NOW + 19 * MINUTE)).toThrow('休息')
    state = updateStudy(state, { ...start, id: 'b2', subject: 'english', mode: 'explore' }, NOW + 20 * MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: 'b2', reflection: '' }, NOW + 30 * MINUTE)
    expect(studyStatus(state, NOW + 35 * MINUTE).phase).toBe('daily-complete')
    expect(() => updateStudy(state, { ...start, id: 'b3' }, NOW + 35 * MINUTE)).toThrow('上限')
    expect(studyStatus(state, NOW + DAY).phase).toBe('ready')
    expect(state.rewards).toEqual([])
  })

  it('gives no stars for idle time and at most two per day for actual work and reflection', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    const record = { action: 'record', attempt }
    state = updateStudy(state, record, NOW + MINUTE)
    expect(updateStudy(state, record, NOW + 2 * MINUTE)).toBe(state)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, response: '另一答案' } }, NOW + 2 * MINUTE)).toThrow('ID')
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '先凑十再相加。' }, NOW + 2 * MINUTE)
    expect(state.rewards).toHaveLength(2)
    expect(updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 3 * MINUTE)).toBe(state)
    state = updateStudy(state, { ...start, id: 'b2' }, NOW + 7 * MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'a2', sessionId: 'b2', result: 'incorrect' } }, NOW + 8 * MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: 'b2', reflection: '需要再试一次。' }, NOW + 9 * MINUTE)
    expect(state.rewards).toHaveLength(2)
  })

  it('permits stopping early and counts only elapsed time without imposing a catch-up debt', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + MINUTE)
    expect(studyStatus(state, NOW + 6 * MINUTE)).toMatchObject({ phase: 'ready', remainingMs: 19 * MINUTE, stars: 0 })
    expect(() => updateStudy(state, { ...start, id: 'b2' }, NOW)).toThrow('时钟')
  })

  it('caps a block at Shanghai midnight and attributes delayed closure to the day of work', () => {
    const late = Date.parse('2026-10-05T23:58:00+08:00')
    let state = updateStudy(updateStudy(undefined, setup, late), start, late)
    state = updateStudy(state, { action: 'record', attempt }, late + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, late + 10 * MINUTE)
    expect(state.sessions[0]?.spentMs).toBe(2 * MINUTE)
    expect(state.rewards[0]?.day).toBe('2026-10-05')
    expect(studyDay(late + 2 * MINUTE)).toBe('2026-10-06')
    expect(studyStatus(state, late + 15 * MINUTE).remainingMs).toBe(20 * MINUTE)
  })
})

describe('curriculum and source identity', () => {
  it.each(['region', 'grade', 'term', 'schoolYear', 'schoolSystem'] as const)('refuses a %s mismatch even with a parent-confirmation string', key => {
    let state = updateStudy(undefined, setup, NOW)
    const mismatched = { ...material, scope: { ...material.scope, [key]: key === 'grade' ? 3 : key === 'term' ? 'second' : key === 'schoolSystem' ? 'six-three' : 'other' } }
    state = updateStudy(state, { action: 'material', material: mismatched }, NOW)
    expect(() => updateStudy(state, { action: 'course', course }, NOW)).toThrow('必须与档案一致')
  })

  it('refuses unconfirmed and generated books for school study, preserves historical editions', () => {
    let state = updateStudy(undefined, setup, NOW)
    expect(() => updateStudy(state, { ...start, mode: 'school' }, NOW)).toThrow('尚未确认')
    state = updateStudy(state, { action: 'material', material: { ...material, kind: 'generated' } }, NOW)
    expect(() => updateStudy(state, { action: 'course', course }, NOW)).toThrow('AI 自编')
    state = updateStudy(state, { action: 'material', material: { ...material, id: 'unverified', editionStatus: 'unconfirmed' } }, NOW)
    expect(() => updateStudy(state, { action: 'course', course: { ...course, materialId: 'unverified' } }, NOW)).toThrow('版次尚未核实')
    state = updateStudy(state, { action: 'material', material: { ...material, id: 'real' } }, NOW)
    state = updateStudy(state, { action: 'course', course: { ...course, materialId: 'real' } }, NOW)
    state = updateStudy(state, { ...start, mode: 'school' }, NOW)
    state = updateStudy(state, { action: 'record', attempt }, NOW + MINUTE)
    expect(state.attempts[0]?.materialId).toBe('real')
    expect(state.materials).toHaveLength(3)
  })
})

describe('photo mistakes and spaced review', () => {
  it('keeps uncertain images pending and makes confirmation retries idempotent', () => {
    let state = updateStudy(undefined, setup, NOW)
    state = updateStudy(state, { action: 'mistake', mistake }, NOW)
    expect(studyStatus(state, NOW)).toMatchObject({ pendingMistakes: ['error-1'], dueMistakes: [] })
    state = updateStudy(state, { ...start, mode: 'review' }, NOW)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, mistakeId: mistake.id } }, NOW)).toThrow('先确认')
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW)
    state = updateStudy(state, confirm, NOW)
    expect(updateStudy(state, confirm, NOW + MINUTE)).toBe(state)
    expect(state.mistakes[0]).toMatchObject({ uncertainties: '', prompt: attempt.prompt, dueAt: NOW + DAY })
    state = updateStudy(state, { ...start, id: 'early', mode: 'review' }, NOW + 5 * MINUTE)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, sessionId: 'early', mistakeId: mistake.id } }, NOW + 6 * MINUTE)).toThrow('尚未到')
  })

  it('extends only independent reviews and returns helped answers to a short interval', () => {
    let state = updateStudy(updateStudy(updateStudy(undefined, setup, NOW), { action: 'mistake', mistake }, NOW), confirm, NOW)
    let at = NOW + DAY
    for (let i = 0; i < 3; i += 1) {
      const id = `review-${i}`
      state = updateStudy(state, { ...start, id, mode: 'review' }, at)
      state = updateStudy(state, { action: 'record', attempt: { ...attempt, id, sessionId: id, mistakeId: mistake.id } }, at + MINUTE)
      state = updateStudy(state, { action: 'stop', sessionId: id, reflection: '' }, at + MINUTE)
      at = state.mistakes[0]!.dueAt!
    }
    expect(state.mistakes[0]?.stage).toBe(3)
    expect(studyStatus(state, at).progress[0]?.level).toBe('independent-on-three-days')
    state = updateStudy(state, { ...start, id: 'hinted', mode: 'review' }, at)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'hinted', sessionId: 'hinted', mistakeId: mistake.id, assistance: 'hint' } }, at + MINUTE)
    expect(state.mistakes[0]).toMatchObject({ stage: 0, independentDays: [], dueAt: at + MINUTE + DAY })
    expect(studyStatus(state, at + MINUTE).progress[0]?.level).toBe('practising')
  })

  it('does not count repeated same-day answers as three independent days', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    for (let i = 0; i < 4; i += 1) state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: `a${i}` } }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).progress[0]).toMatchObject({ independentDays: ['2026-10-05'], level: 'practising' })
    expect(stateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('paginates retained history without losing records', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    for (let i = 0; i < 23; i += 1) state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: `a${i}` } }, NOW + MINUTE)
    expect(queryStudy(state, 'attempts', 0)).toMatchObject({ total: 23, nextOffset: 20 })
    expect(queryStudy(state, 'attempts', 20)).toMatchObject({ total: 23, items: expect.any(Array), nextOffset: null })
    expect(queryStudy(state, 'attempts', 0, 'a22')).toMatchObject({ total: 1, items: [expect.objectContaining({ id: 'a22' })] })
  })
})

describe('shared workbench tasks', () => {
  const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt }
  const begin = () => updateStudy(updateStudy(updateStudy(undefined, setup, NOW), start, NOW), { action: 'task', task }, NOW)

  it('preserves published questions and submitted answers through reload and rejects fabricated assessment', () => {
    let state = stateSchema.parse(JSON.parse(JSON.stringify(begin())))
    expect(() => updateStudy(state, { action: 'record', attempt }, NOW)).toThrow('已保存')
    expect(() => updateStudy(state, { action: 'task', task: { ...task, id: 'next' } }, NOW)).toThrow('完成当前')
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    expect(updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)).toBe(state)
    expect(() => updateStudy(state, { action: 'answer', taskId: task.id, response: '改写答案' }, NOW + MINUTE)).toThrow('已提交')
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, prompt: '另一道题' } }, NOW + MINUTE)).toThrow('对应当前')
    state = updateStudy(state, { action: 'record', attempt }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).feedback?.id).toBe(task.id)
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'next' } }, NOW + MINUTE)
    expect(state.task?.response).toBeUndefined()
  })

  it('records hints as assistance and prevents extra work at or after the deadline', () => {
    let state = updateStudy(begin(), { action: 'hint', taskId: task.id }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    expect(() => updateStudy(state, { action: 'record', attempt }, NOW + MINUTE)).toThrow('不能记录为独立')
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, assistance: 'hint' } }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).progress[0]?.independentDays).toEqual([])
    for (const action of [{ action: 'task', task: { ...task, id: 'late' } }, { action: 'answer', taskId: task.id, response: '15' }, { action: 'hint', taskId: task.id }]) expect(() => updateStudy(state, action, NOW + 10 * MINUTE)).toThrow()
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 10 * MINUTE)
    expect(state.task?.response).toBe(attempt.response)
  })

  it('validates review source before showing a question', () => {
    const state = updateStudy(updateStudy(undefined, setup, NOW), { ...start, mode: 'review' }, NOW)
    expect(() => updateStudy(state, { action: 'task', task }, NOW)).toThrow('到期错题')
    expect(() => updateStudy(state, { action: 'task', task: { ...task, mistakeId: 'missing' } }, NOW)).toThrow()
  })

  it('saves course configuration atomically with one revision and keeps prior state on mismatch', () => {
    const state = updateStudy(undefined, setup, NOW)
    const next = updateStudy(state, { action: 'configure-course', material, course }, NOW)
    expect(next.revision).toBe(state.revision + 1)
    expect(next.materials).toEqual([material])
    expect(next.courses).toEqual([course])
    expect(() => updateStudy(state, { action: 'configure-course', material, course: { ...course, subject: 'chinese' } }, NOW)).toThrow('同一份资料')
    expect(state.materials).toEqual([])
  })
})
