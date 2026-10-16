import { describe, expect, it, vi } from 'vitest'
import { checkInHistory, curriculumView, studyDay, studyInsight, studyStatus, updateStudy } from '../src/learning.ts'
import { stateSchema } from '../src/schema.ts'
import { queryStudy } from '../src/store.ts'
import { renderWorksheet } from '../src/worksheet.ts'
import { NOW, MINUTE, DAY, setup, material, course, start, attempt, mistake, confirm } from './fixtures.ts'

const dueDay = (from: number, days = 1) => Date.parse(`${studyDay(from + days * DAY)}T00:00:00+08:00`)

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
    expect(state.mistakes[0]).toMatchObject({ uncertainties: '', prompt: attempt.prompt, dueAt: dueDay(NOW) })
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
    expect(state.mistakes[0]).toMatchObject({ stage: 0, independentDays: [], dueAt: at + DAY })
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
    expect(queryStudy(state, 'attempts', 0, { id: 'a22' })).toMatchObject({ total: 1, items: [expect.objectContaining({ id: 'a22' })] })
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

describe('subject knowledge and paper practice', () => {
  const concept = { id: 'make-ten', subject: 'math' as const, name: '凑十', definition: '把加数拆开，先组成十。', example: '8 + 7 = 8 + 2 + 5。', source: '家长核对的数学教材。' }
  const objective = { id: 'add-with-ten', subject: 'math' as const, title: '用凑十法解释加法', goal: '能说明 8 + 7 如何先凑十。', conceptIds: [concept.id], method: 'represent' as const }
  const sheet = { id: 'sheet-1', subject: 'math' as const, objectiveId: objective.id, items: [{ id: 'q1', mistakeId: mistake.id, prompt: '9 + 6 = ? 请说明过程。', answer: '15', explanation: '把 6 分成 1 和 5。', answerEvidence: '9 + 1 + 5 = 15。' }] }
  const draft = { worksheetId: sheet.id, itemId: 'q1', response: '15，先凑十。', result: 'correct' as const, assistance: 'independent' as const, uncertainties: '' }
  const paperConfirm = { worksheetId: sheet.id, results: [{ itemId: 'q1', result: 'correct' as const }], userConfirmation: '家长确认纸上原答案。' }

  it('reads old records and leaves legacy mistakes unclassified', () => {
    const state = updateStudy(undefined, setup, NOW)
    const { concepts: _concepts, objectives: _objectives, relations: _relations, worksheets: _worksheets, paperResults: _results, ...old } = state
    const restored = stateSchema.parse(old)
    expect(restored).toMatchObject({ format: 1, concepts: [], objectives: [], relations: [], worksheets: [], paperResults: [] })
    expect(restored.mistakes).toEqual([])
  })

  it('requires confirmed same-subject concepts and keeps paper results outside the timer', () => {
    let state = updateStudy(undefined, setup, NOW)
    state = updateStudy(state, { action: 'concept', concept }, NOW)
    expect(() => updateStudy(state, { action: 'objective', objective }, NOW)).toThrow('已确认概念')
    state = updateStudy(state, { action: 'confirm-concept', id: concept.id, userConfirmation: '家长核对了定义。' }, NOW)
    expect(() => updateStudy(state, { action: 'objective', objective: { ...objective, subject: 'english' } }, NOW)).toThrow('学习方法与科目不符')
    state = updateStudy(state, { action: 'objective', objective }, NOW)
    state = updateStudy(state, { action: 'mistake', mistake }, NOW)
    state = updateStudy(state, confirm, NOW)
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: sheet }, NOW)).toThrow('已归类')
    state = updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: objective.id }, NOW)
    state = updateStudy(state, { action: 'worksheet', worksheet: sheet }, NOW)
    expect(state.worksheets[0]).toMatchObject({ id: sheet.id, createdAt: NOW })
    expect(() => updateStudy(state, { action: 'paper-draft', paperDraft: { ...draft, itemId: 'missing' } }, NOW + 2 * DAY)).toThrow('已保存的练习单项')
    expect(() => updateStudy(state, { action: 'confirm-paper', ...paperConfirm }, NOW + 2 * DAY)).toThrow('转录')
    state = updateStudy(state, { action: 'paper-draft', paperDraft: draft }, NOW + 2 * DAY)
    expect(state.paperDrafts[0]).toMatchObject({ itemId: 'q1', receivedAt: NOW + 2 * DAY })
    expect(updateStudy(state, { action: 'paper-draft', paperDraft: draft }, NOW + 2 * DAY)).toBe(state)
    expect(state.paperResults).toEqual([])
    state = updateStudy(state, { action: 'confirm-paper', ...paperConfirm }, NOW + 2 * DAY)
    expect(state.paperDrafts).toEqual([])
    expect(state.paperResults[0]).toMatchObject({ response: draft.response, receivedAt: NOW + 2 * DAY, feedback: '家长核对照片转录' })
    expect(state.mistakes[0]).toMatchObject({ stage: 1, dueAt: dueDay(NOW, 5) })
    expect(state.sessions).toEqual([])
    expect(state.rewards).toEqual([])
    expect(updateStudy(state, { action: 'confirm-paper', ...paperConfirm }, NOW + 2 * DAY)).toBe(state)
    expect(queryStudy(state, 'worksheets', 0, { id: sheet.id })).toMatchObject({ total: 1, items: [expect.objectContaining({ id: sheet.id })] })
  })

  it('turns a wrong practice-sheet answer into a mistake and lets the same ids be reused', () => {
    let state = updateStudy(undefined, setup, NOW)
    const practice = { id: 'practice-1', subject: 'math' as const, objectiveId: 'm2a-o-meaning', items: [{ id: 'q1', prompt: '3 + 3 + 3 可以怎样写成乘法？', answer: '3 × 3', explanation: '3 个 3 连加就是 3 乘 3。', answerEvidence: '求几个相同加数的和可以用乘法。' }] }
    state = updateStudy(state, { action: 'worksheet', worksheet: practice }, NOW)
    const wrong = { worksheetId: practice.id, itemId: 'q1', response: '3 + 3', result: 'incorrect' as const, assistance: 'independent' as const, uncertainties: '' }
    state = updateStudy(state, { action: 'paper-draft', paperDraft: wrong }, NOW)
    state = updateStudy(state, { action: 'confirm-paper', worksheetId: practice.id, results: [{ itemId: 'q1', result: 'incorrect' as const }], userConfirmation: '家长核对了卷面答案。' }, NOW)
    expect(state.paperDrafts).toEqual([])
    expect(state.worksheets[0]?.items[0]?.mistakeId).toBe('w-practice-1-q1')
    expect(state.mistakes[0]).toMatchObject({ id: 'w-practice-1-q1', objectiveId: 'm2a-o-meaning', confirmedAt: NOW, learnerAnswer: '3 + 3', dueAt: dueDay(NOW) })
    expect(studyStatus(state, NOW).progress[0]).toMatchObject({ objectiveId: 'm2a-o-meaning' })
    expect(updateStudy(state, { action: 'confirm-paper', worksheetId: practice.id, results: [{ itemId: 'q1', result: 'incorrect' as const }], userConfirmation: '家长核对了卷面答案。' }, NOW)).toBe(state)
    state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id: 'pending-1', prompt: '第一遍' } }, NOW)
    state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id: 'pending-1', prompt: '看清了题干' } }, NOW)
    expect(state.mistakes.find(item => item.id === 'pending-1')?.prompt).toBe('看清了题干')
    state = updateStudy(state, { ...start }, NOW)
    state = updateStudy(state, { action: 'task', task: { id: 'q1', sessionId: start.id, subject: 'math', topic: '加法', prompt: attempt.prompt } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'q1', response: attempt.response }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'q1' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + MINUTE)
    state = updateStudy(state, { ...start }, NOW + 8 * MINUTE)
    expect(state.sessions.find(item => item.endedAt === undefined)?.id).toBe(start.id)
    expect(state.sessions.some(item => item.id.startsWith(`${start.id}-past-`))).toBe(true)
    state = updateStudy(state, { action: 'task', task: { id: 'q1', sessionId: start.id, subject: 'math', topic: '减法', prompt: '9 - 4 等于多少？' } }, NOW + 8 * MINUTE)
    expect(state.task).toMatchObject({ id: 'q1', prompt: '9 - 4 等于多少？' })
  })

  it('attributes each question on a unit sheet to its own goal', () => {
    let state = updateStudy(undefined, setup, NOW)
    const sheet = {
      id: 'unit-1', subject: 'math' as const, objectiveId: 'm2a-o-sub',
      items: [
        { id: 'q1', prompt: '54 − 20 等于多少？', answer: '34', explanation: '十位 5 减 2，个位 4 不变。', answerEvidence: '54 − 20 = 34。' },
        { id: 'q2', objectiveId: 'm2a-o-shop', prompt: '一块橡皮 2 元，付出 5 元，找回多少元？', answer: '3 元', explanation: '找回的是付出的钱减去应付的钱。', answerEvidence: '5 − 2 = 3。' },
      ],
    }
    state = updateStudy(state, { action: 'worksheet', worksheet: sheet }, NOW)
    state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'unit-1', itemId: 'q2', response: '2 元', result: 'incorrect', assistance: 'independent', uncertainties: '' } }, NOW)
    state = updateStudy(state, { action: 'confirm-paper', worksheetId: 'unit-1', results: [{ itemId: 'q2', result: 'incorrect' }], userConfirmation: '家长核对了卷面。' }, NOW)
    expect(state.mistakes.at(-1)).toMatchObject({ objectiveId: 'm2a-o-shop', prompt: sheet.items[1].prompt })
    expect(studyInsight(state, NOW).objectives.find(item => item.id === 'm2a-o-shop')).toMatchObject({ attempts: 1, level: 'weak' })
    expect(studyInsight(state, NOW).objectives.find(item => item.id === 'm2a-o-sub')).toMatchObject({ attempts: 0, level: 'untouched' })
    expect(studyStatus(state, NOW).progress.find(item => item.objectiveId === 'm2a-o-shop')).toBeTruthy()
    expect(studyStatus(state, NOW).progress.find(item => item.objectiveId === 'm2a-o-sub')).toBeUndefined()
  })

  it('records evidence-backed concept relationships within one subject', () => {
    let state = updateStudy(undefined, setup, NOW)
    for (const item of [concept, { ...concept, id: 'addition', name: '加法' }]) {
      state = updateStudy(state, { action: 'concept', concept: item }, NOW)
      state = updateStudy(state, { action: 'confirm-concept', id: item.id, userConfirmation: '家长核对' }, NOW)
    }
    const relation = { id: 'ten-explains-add', fromId: 'make-ten', toId: 'addition', kind: 'explains', explanation: '凑十解释进位加法的一种计算方法。', source: '家长核对的课页。' }
    state = updateStudy(state, { action: 'relation', relation }, NOW)
    expect(queryStudy(state, 'relations', 0, { id: relation.id })).toMatchObject({ total: 1, items: [expect.objectContaining({ fromId: concept.id, toId: 'addition' })] })
    expect(() => updateStudy(state, { action: 'relation', relation: { ...relation, id: 'self', toId: concept.id } }, NOW)).toThrow('同科两个')
  })
})

describe('shipped knowledge map objectives and insight', () => {
  const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt, objectiveId: 'm2a-o-meaning' }

  it('accepts shipped objective IDs without parent confirmation and rejects other subjects or scopes', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    expect(() => updateStudy(state, { action: 'task', task: { ...task, objectiveId: 'c2a-o1' } }, NOW)).toThrow('科目不符')
    expect(() => updateStudy(state, { action: 'task', task: { ...task, objectiveId: 'm1a-o-count' } }, NOW)).toThrow('学习目标不存在')
    state = updateStudy(state, { action: 'task', task }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: 'm2a-o-meaning' } }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).progress[0]).toMatchObject({ objectiveId: 'm2a-o-meaning', independentDays: ['2026-10-05'] })
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + MINUTE)
    state = updateStudy(state, { action: 'mistake', mistake }, NOW + MINUTE)
    state = updateStudy(state, confirm, NOW + MINUTE)
    expect(() => updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'e2a-o1' }, NOW + MINUTE)).toThrow('同一科目')
    state = updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'm2a-o-tables' }, NOW + MINUTE)
    state = updateStudy(state, { action: 'worksheet', worksheet: { id: 'sheet-map', subject: 'math', objectiveId: 'm2a-o-tables', items: [{ id: 'q1', mistakeId: mistake.id, prompt: '7 × 8 = ? 请写出用到的口诀。', answer: '56', explanation: '七八五十六', answerEvidence: '乘法口诀表。' }] } }, NOW + MINUTE)
    expect(state.worksheets[0]?.objectiveId).toBe('m2a-o-tables')
    expect(queryStudy(state, 'curriculum', 0, { subject: 'math' })).toMatchObject({ curriculum: { id: 'math-grade2-first', objectives: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-tables' })]) } })
    expect(() => queryStudy(state, 'curriculum', 0)).toThrow('科目')
  })

  it('derives weak points, the next step and mastery from evidence', () => {
    let state = updateStudy(undefined, setup, NOW - 3 * DAY)
    expect(studyInsight(state, NOW).recommendation).toMatchObject({ kind: 'diagnose', subject: 'chinese', reason: { code: 'diagnosis-due', count: 6 } })
    state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, objectiveId: 'm2a-o-tables' } }, NOW - 3 * DAY)
    state = updateStudy(state, confirm, NOW - 3 * DAY)
    let insight = studyInsight(state, NOW)
    expect(insight.recommendation).toMatchObject({ kind: 'review', subject: 'math', reason: { code: 'due-mistakes', count: 1 } })
    expect(insight.weakPoints[0]).toMatchObject({ id: 'm2a-o-tables', level: 'due', reasons: [{ code: 'due-mistakes', count: 1 }, { code: 'open-mistakes', count: 1 }] })
    let view = curriculumView(state, 'math', insight)
    expect(view?.concepts.find(item => item.id === 'm2a-table7')).toMatchObject({ level: 'due', dueMistakes: 1 })
    expect(view?.units.find(item => item.id === 'm2a-u-mul')).toMatchObject({ due: 5, concepts: 7 })
    expect(view?.summary).toMatchObject({ concepts: 20, due: 5, untouched: 15 })
    for (let day = 0; day < 3; day += 1) {
      const at = NOW - (2 - day) * DAY
      const id = `m-${day}`
      state = updateStudy(state, { ...start, id }, at)
      state = updateStudy(state, { action: 'record', attempt: { ...attempt, id, sessionId: id, objectiveId: 'm2a-o-meaning' } }, at + MINUTE)
      state = updateStudy(state, { action: 'stop', sessionId: id, reflection: '' }, at + MINUTE)
    }
    insight = studyInsight(state, NOW + 2 * MINUTE)
    expect(insight.objectives.find(item => item.id === 'm2a-o-meaning')).toMatchObject({ level: 'mastered', independentDays: 3, priority: 0 })
    view = curriculumView(state, 'math', insight)
    expect(view?.units.find(item => item.id === 'm2a-u-mul')).toMatchObject({ mastered: 2, due: 5, concepts: 7 })
    const at = NOW + DAY
    state = updateStudy(state, { ...start, id: 'h1' }, at)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'h1', sessionId: 'h1', objectiveId: 'm2a-o-shop', assistance: 'hint' } }, at + MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'h2', sessionId: 'h1', objectiveId: 'm2a-o-shop', result: 'incorrect' } }, at + 2 * MINUTE)
    insight = studyInsight(state, at + 3 * MINUTE)
    expect(insight.objectives.find(item => item.id === 'm2a-o-shop')).toMatchObject({ level: 'weak', helpedOrWrong: 2, reasons: [{ code: 'recent-help-or-error', count: 2 }] })
    expect(insight.weakPoints.map(item => item.id)).toEqual(['m2a-o-tables', 'm2a-o-shop'])
    expect(studyInsight(state, at + 15 * DAY).objectives.find(item => item.id === 'm2a-o-shop')).toMatchObject({ level: 'stalled', reasons: [{ code: 'not-practised-recently', count: 14 }] })
    expect(studyInsight(state, at + 15 * DAY).objectives.find(item => item.id === 'm2a-o-meaning')?.level).toBe('mastered')
    expect(queryStudy(state, 'weak', 0)).toMatchObject({ recommendation: { kind: 'review' }, practised: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-meaning', level: 'mastered' })]) })
    expect(queryStudy(state, 'status', 0)).toMatchObject({ recommendation: { kind: 'review', subject: 'math' }, weakPoints: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-tables' })]) })
  })

  it('degrades to custom objectives outside grades one and two', () => {
    const state = updateStudy(undefined, { ...setup, profile: { ...setup.profile, grade: 3 } }, NOW)
    const insight = studyInsight(state, NOW)
    expect(insight).toMatchObject({ objectives: [], weakPoints: [], recommendation: null })
    expect(insight.diagnostics.every(plan => !plan.due && plan.sample.length === 0)).toBe(true)
    expect(curriculumView(state, 'math', insight)).toBeNull()
    expect(() => updateStudy(updateStudy(state, start, NOW), { action: 'task', task }, NOW)).toThrow('学习目标不存在')
  })
})

describe('choice tasks, map browsing and recurring check-ins', () => {
  it('restricts answers to the published choices', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    const task = { id: 'c1', sessionId: start.id, subject: 'math' as const, topic: '乘法', prompt: '3 + 3 + 3 + 3 写成乘法是？', choices: ['3 × 4', '3 + 4', '4 × 4'], objectiveId: 'm2a-o-meaning' }
    expect(() => updateStudy(state, { action: 'task', task: { ...task, choices: ['只有一个'] } }, NOW)).toThrow()
    state = updateStudy(state, { action: 'task', task }, NOW)
    expect(() => updateStudy(state, { action: 'answer', taskId: 'c1', response: '12' }, NOW)).toThrow('选项')
    state = updateStudy(state, { action: 'answer', taskId: 'c1', response: '3 × 4' }, NOW)
    expect(state.task).toMatchObject({ choices: task.choices, response: '3 × 4' })
  })

  it('browses another term without mastery while task validation stays on the profile term', () => {
    const state = updateStudy(undefined, setup, NOW)
    const insight = studyInsight(state, NOW)
    expect(curriculumView(state, 'math', insight)?.scope).toEqual({ grade: 2, term: 'first', current: true })
    const browsed = curriculumView(state, 'math', insight, { grade: 1, term: 'second' })
    expect(browsed).toMatchObject({ id: 'math-grade1-second', scope: { grade: 1, term: 'second', current: false } })
    expect(browsed?.objectives.every(item => item.level === 'untouched' && item.attempts === 0 && item.unitName.length > 0)).toBe(true)
    expect(queryStudy(state, 'curriculum', 0, { subject: 'chinese', grade: 1, term: 'first' })).toMatchObject({ curriculum: { id: 'chinese-grade1-first', scope: { current: false } } })
    expect(curriculumView(state, 'math', insight, { grade: 3, term: 'first' })).toBeNull()
    expect(() => updateStudy(updateStudy(state, start, NOW), { action: 'task', task: { id: 'q', sessionId: start.id, subject: 'math', topic: '测量', prompt: '量一量', objectiveId: 'm1b-o-measure' } }, NOW)).toThrow('学习目标不存在')
  })

  it('plans a recurring check-in across units and turns wrong probes into targeted practice', () => {
    let state = updateStudy(undefined, setup, NOW - DAY)
    let insight = studyInsight(state, NOW)
    const plan = insight.diagnostics.find(item => item.subject === 'math')
    expect(plan).toMatchObject({ due: true, untouched: 8, stalled: 0, recheck: 0 })
    expect(plan?.sample).toHaveLength(6)
    expect(new Set(plan?.sample.slice(0, 4).map(item => item.unit)).size).toBe(4)
    expect(insight.recommendation).toMatchObject({ kind: 'diagnose', subject: 'chinese' })
    expect(queryStudy(state, 'diagnose', 0, { subject: 'math' })).toMatchObject({ diagnostics: [{ subject: 'math', due: true, sample: expect.any(Array) }] })
    state = updateStudy(state, { ...start, id: 'check', mode: 'diagnose' }, NOW)
    expect(() => updateStudy(state, { action: 'task', task: { id: 'p0', sessionId: 'check', subject: 'math', topic: '乘法', prompt: '几个几？' } }, NOW)).toThrow('摸底题')
    const probes: [string, 'correct' | 'incorrect'][] = [['m2a-o-meaning', 'correct'], ['m2a-o-tables', 'incorrect'], ['m2a-o-home', 'incorrect']]
    for (const [index, [objectiveId, result]] of probes.entries()) {
      const id = `p${index}`
      const at = NOW + index * MINUTE
      state = updateStudy(state, { action: 'task', task: { id, sessionId: 'check', subject: 'math', topic: '摸底', prompt: `第 ${index + 1} 题`, objectiveId } }, at)
      state = updateStudy(state, { action: 'answer', taskId: id, response: '答' }, at)
      state = updateStudy(state, { action: 'record', attempt: { ...attempt, id, sessionId: 'check', topic: '摸底', prompt: `第 ${index + 1} 题`, response: '答', result, objectiveId } }, at)
    }
    state = updateStudy(state, { action: 'stop', sessionId: 'check', reflection: '' }, NOW + 4 * MINUTE)
    insight = studyInsight(state, NOW + 5 * MINUTE)
    expect(insight.objectives.find(item => item.id === 'm2a-o-tables')).toMatchObject({ level: 'weak', reasons: [{ code: 'recent-help-or-error', count: 1 }] })
    expect(insight.objectives.find(item => item.id === 'm2a-o-meaning')?.level).toBe('practising')
    expect(insight.recommendation).toMatchObject({ kind: 'practice', subject: 'math', objectiveId: 'm2a-o-tables' })
    expect(insight.diagnostics.find(item => item.subject === 'math')).toMatchObject({ due: false, lastAt: NOW, nextAt: NOW + 14 * DAY, untouched: 5 })
    expect(studyInsight(state, NOW + 14 * DAY).diagnostics.find(item => item.subject === 'math')?.due).toBe(true)
  })

  it('spot-checks mastered objectives after thirty days', () => {
    let state = updateStudy(undefined, setup, NOW - 40 * DAY)
    for (let day = 0; day < 3; day += 1) {
      const at = NOW - (40 - day) * DAY
      const id = `m-${day}`
      state = updateStudy(state, { ...start, id }, at)
      state = updateStudy(state, { action: 'record', attempt: { ...attempt, id, sessionId: id, objectiveId: 'm2a-o-meaning' } }, at + MINUTE)
      state = updateStudy(state, { action: 'stop', sessionId: id, reflection: '' }, at + MINUTE)
    }
    const plan = studyInsight(state, NOW).diagnostics.find(item => item.subject === 'math')
    expect(plan).toMatchObject({ recheck: 1, untouched: 7 })
    expect(plan?.sample.find(item => item.id === 'm2a-o-meaning')).toBeUndefined()
    expect(plan?.samples.deep.find(item => item.id === 'm2a-o-meaning')?.reason).toBe('recheck')
  })
})

describe('check-in intensity, coverage, history and learning order', () => {
  it('stores the intensity on diagnose blocks only and sizes samples per intensity', () => {
    let state = updateStudy(undefined, setup, NOW)
    expect(() => updateStudy(state, { ...start, intensity: 'light' }, NOW)).toThrow('摸底强度')
    const plan = studyInsight(state, NOW).diagnostics.find(item => item.subject === 'chinese')
    expect(plan).toMatchObject({ coverage: { probed: 0, total: 9 }, recommendedIntensity: 'standard' })
    expect(plan?.samples.light).toHaveLength(3)
    expect(plan?.samples.standard).toHaveLength(6)
    expect(plan?.samples.deep).toHaveLength(9)
    expect(plan?.samples.deep.every(item => item.reason === 'untouched')).toBe(true)
    state = updateStudy(state, { ...start, id: 'deep', mode: 'diagnose', intensity: 'deep' }, NOW)
    expect(state.sessions[0]?.intensity).toBe('deep')
    state = updateStudy(state, { action: 'task', task: { id: 'd1', sessionId: 'deep', subject: 'math', topic: '摸底', prompt: '题', objectiveId: 'm2a-o-meaning' } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'd1', response: '答' }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'd1', sessionId: 'deep', topic: '摸底', prompt: '题', response: '答', assistance: 'hint', objectiveId: 'm2a-o-meaning' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: 'deep', reflection: '' }, NOW + 2 * MINUTE)
    const history = checkInHistory(state)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ subject: 'math', intensity: 'deep', counts: { independent: 0, helped: 1, wrong: 0, unassessed: 0 }, results: [{ objectiveId: 'm2a-o-meaning', title: '把同数连加改写成乘法算式并说明意义' }] })
    expect(studyInsight(state, NOW + 3 * MINUTE).diagnostics.find(item => item.subject === 'math')).toMatchObject({ coverage: { probed: 1, total: 8 } })
    expect(queryStudy(state, 'diagnose', 0, { subject: 'math' })).toMatchObject({ history: [{ sessionId: 'deep' }] })
    expect(stateSchema.parse(JSON.parse(JSON.stringify(state))).sessions[0]?.intensity).toBe('deep')
  })

  it('orders knowledge points so prerequisites come first', () => {
    const state = updateStudy(undefined, setup, NOW)
    const view = curriculumView(state, 'math', studyInsight(state, NOW))
    expect(view?.order).toHaveLength(20)
    expect(new Set(view?.order).size).toBe(20)
    const position = (id: string) => view?.order.indexOf(id) ?? -1
    const pairs: [string, string][] = [['m2a-sub-plain', 'm2a-sub-borrow'], ['m2a-rmb', 'm2a-pay'], ['m2a-mulmeaning', 'm2a-table248'], ['m2a-table510', 'm2a-table248'], ['m2a-table369', 'm2a-tableuse']]
    for (const [before, after] of pairs) expect(position(before)).toBeLessThan(position(after))
    expect(view?.concepts.find(item => item.id === 'm2a-mulmeaning')?.lastAt).toBeUndefined()
  })
})

describe('school progress frontier', () => {
  const taught = ['m2a-u-sub', 'm2a-u-shop', 'm2a-u-mul']
  function frontier(posture: 'keep-up' | 'catch-up', unitId: string, pace: 'teaching' | 'review', preview: boolean, at = NOW) {
    let state = updateStudy(undefined, setup, at)
    for (const subject of ['chinese', 'math', 'english'] as const) {
      const book = { ...material, id: `${subject}-book`, subject, title: `${subject} 课本` }
      state = updateStudy(state, { action: 'material', material: book }, at)
      state = updateStudy(state, { action: 'course', course: { subject, materialId: book.id, unit: '测试单元', parentConfirmation: '家长确认这本课本。' } }, at)
    }
    state = updateStudy(state, { action: 'school-progress', subject: 'math', unitId, posture, preview: preview ? 'on' : 'off', pace, parentConfirmation: '家长确认学校数学进度。' }, at)
    state = updateStudy(state, { action: 'school-progress', subject: 'chinese', unitId: 'c2a-u1', posture: 'keep-up', preview: 'off', pace: 'review', parentConfirmation: '家长确认语文这周复习。' }, at)
    state = updateStudy(state, { action: 'school-progress', subject: 'english', unitId: 'e2a-u1', posture: 'keep-up', preview: 'off', pace: 'review', parentConfirmation: '家长确认英语这周复习。' }, at)
    return state
  }
  function recentCheckIns(state: ReturnType<typeof frontier>, at: number) {
    for (const subject of ['chinese', 'math', 'english'] as const) {
      const id = `seen-${subject}`
      state = updateStudy(state, { action: 'start', id, subject, mode: 'diagnose' }, at)
      state = updateStudy(state, { action: 'stop', sessionId: id, reflection: '' }, at + MINUTE)
      at += 6 * MINUTE
    }
    return { state, at }
  }

  it('keeps new goals and check-ins inside the confirmed unit', () => {
    expect(() => updateStudy(updateStudy(undefined, setup, NOW), { action: 'school-progress', subject: 'math', unitId: 'm2a-u-mul', posture: 'keep-up', preview: 'off', pace: 'teaching', parentConfirmation: '家长确认。' }, NOW)).toThrow('先确认该科教材')
    let state = frontier('keep-up', 'm2a-u-mul', 'teaching', false)
    expect(() => updateStudy(state, { action: 'school-progress', subject: 'math', unitId: 'missing-unit', posture: 'keep-up', preview: 'off', pace: 'teaching', parentConfirmation: '家长确认。' }, NOW)).toThrow('知识地图')
    const math = studyInsight(state, NOW).diagnostics.find(item => item.subject === 'math')
    expect(math?.coverage).toMatchObject({ probed: 0, total: 4 })
    expect(math?.sample.map(item => item.unit).every(unit => taught.includes(unit))).toBe(true)
    expect(math?.sample.some(item => item.id === 'm2a-o-home')).toBe(false)
    const quiet = recentCheckIns(state, NOW + MINUTE)
    expect(studyInsight(quiet.state, quiet.at).recommendation).toMatchObject({ kind: 'learn', subject: 'math', objectiveId: 'm2a-o-meaning' })
    const catchingUp = recentCheckIns(frontier('catch-up', 'm2a-u-mul', 'teaching', false), NOW + MINUTE)
    expect(studyInsight(catchingUp.state, catchingUp.at).recommendation).toMatchObject({ kind: 'learn', objectiveId: 'm2a-o-sub' })
    const reviewing = recentCheckIns(frontier('keep-up', 'm2a-u-mul', 'review', false), NOW + MINUTE)
    expect(studyInsight(reviewing.state, reviewing.at).recommendation).toMatchObject({ kind: 'hold', reason: { code: 'school-pace' } })
  })

  it('does not let a later mistake or a textbook edit move the class forward', () => {
    let state = frontier('keep-up', 'm2a-u-mul', 'teaching', false)
    state = updateStudy(state, { action: 'start', id: 'block-ahead', subject: 'math', mode: 'foundation' }, NOW + MINUTE)
    expect(() => updateStudy(state, { action: 'school-progress', subject: 'math', unitId: 'm2a-u-home', posture: 'keep-up', preview: 'off', pace: 'teaching', parentConfirmation: '家长确认。' }, NOW + MINUTE)).toThrow('先结束当前学习')
    state = updateStudy(state, { action: 'stop', sessionId: 'block-ahead', reflection: '' }, NOW + 2 * MINUTE)
    state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id: 'ahead', objectiveId: 'm2a-o-home' } }, NOW + 2 * MINUTE)
    state = updateStudy(state, { ...confirm, id: 'ahead' }, NOW + 2 * MINUTE)
    const quiet = recentCheckIns(state, NOW + 8 * MINUTE)
    const insight = studyInsight(quiet.state, quiet.at)
    expect(insight.recommendation).toMatchObject({ kind: 'learn', objectiveId: 'm2a-o-meaning' })
    expect(insight.weakPoints.some(item => item.id === 'm2a-o-home')).toBe(false)
    state = updateStudy(quiet.state, { action: 'configure-course', material: { ...material, id: 'math-book-2' }, course: { ...course, materialId: 'math-book-2', unit: '家长填写的单元名' } }, quiet.at)
    expect(state.courses.find(item => item.subject === 'math')?.progress).toMatchObject({ unitId: 'm2a-u-mul', posture: 'keep-up' })
  })

  it('previews only the next unit after the current unit has no new goal', () => {
    let state = frontier('keep-up', 'm2a-u-sort', 'teaching', true, NOW - 3 * DAY)
    for (let day = 0; day < 3; day += 1) {
      const at = NOW - (2 - day) * DAY
      const id = `sort-${day}`
      state = updateStudy(state, { ...start, id }, at)
      state = updateStudy(state, { action: 'record', attempt: { ...attempt, id, sessionId: id, objectiveId: 'm2a-o-sort' } }, at + MINUTE)
      state = updateStudy(state, { action: 'stop', sessionId: id, reflection: '' }, at + MINUTE)
    }
    const quiet = recentCheckIns(state, NOW + 7 * MINUTE)
    const insight = studyInsight(quiet.state, quiet.at)
    expect(insight.recommendation).toMatchObject({ kind: 'preview', subject: 'math', objectiveId: 'm2a-o-plaza' })
    expect(insight.diagnostics.find(item => item.subject === 'math')?.sample.some(item => item.unit === 'm2a-u-plaza')).toBe(false)
  })
})

describe('printed review sheets and the mistake schedule', () => {
  const evening = Date.parse('2026-10-10T22:15:00+08:00')
  const linked = () => {
    let state = updateStudy(undefined, setup, evening)
    state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, objectiveId: 'm2a-o-sub' } }, evening)
    return updateStudy(state, confirm, evening)
  }
  const reviewSheet = (id: string) => ({ id, subject: 'math' as const, items: [{ id: 'q1', mistakeId: mistake.id, objectiveId: 'm2a-o-sub', prompt: '9 + 6 = ?', answer: '15', explanation: '先凑十。', answerEvidence: '9 + 1 + 5 = 15。' }] })
  const mark = (worksheetId: string, result: 'correct' | 'partial' | 'incorrect') => ({ action: 'grade-sheet', grade: { worksheetId, results: [{ itemId: 'q1', result }], userConfirmation: '家长在面板批改' } })

  it('credits a sheet done on the due day even before the confirmation hour', () => {
    let state = linked()
    expect(state.mistakes[0]).toMatchObject({ stage: 0, dueAt: Date.parse('2026-10-11T00:00:00+08:00') })
    const afternoon = Date.parse('2026-10-11T15:21:00+08:00')
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r1') }, afternoon)
    state = updateStudy(state, mark('r1', 'correct'), afternoon)
    expect(state.paperResults[0]).toMatchObject({ result: 'correct', response: '（家长在面板批改，未转录原答案）', feedback: '家长批改' })
    expect(state.mistakes[0]).toMatchObject({ stage: 1, independentDays: ['2026-10-11'], dueAt: Date.parse('2026-10-14T00:00:00+08:00') })
  })

  it('resets on a wrong answer at any time and replaces a corrected mark', () => {
    let state = linked()
    const next = Date.parse('2026-10-11T08:00:00+08:00')
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r1') }, next)
    state = updateStudy(state, mark('r1', 'correct'), next)
    state = updateStudy(state, mark('r1', 'incorrect'), next + MINUTE)
    expect(state.paperResults).toHaveLength(1)
    expect(state.mistakes[0]).toMatchObject({ stage: 0, dueAt: Date.parse('2026-10-12T00:00:00+08:00') })
    expect(updateStudy(state, mark('r1', 'incorrect'), next + 2 * MINUTE)).toBe(state)
  })

  it('picks due goal-linked mistakes once and keeps them off a second open sheet', () => {
    let state = linked()
    state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id: 'loose' } }, evening)
    state = updateStudy(state, { ...confirm, id: 'loose' }, evening)
    const day = Date.parse('2026-10-11T09:00:00+08:00')
    vi.spyOn(Date, 'now').mockReturnValue(day)
    expect(queryStudy(state, 'review-sheet', 0, { subject: 'math' })).toMatchObject({ picks: [expect.objectContaining({ id: mistake.id, objectiveId: 'm2a-o-sub' })], unlinkedDue: ['loose'] })
    expect(() => queryStudy(state, 'review-sheet', 0)).toThrow('subject')
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { ...reviewSheet('r0'), items: [{ ...reviewSheet('r0').items[0]!, objectiveId: 'm2a-o-shop' }] } }, day)).toThrow('一致')
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r1') }, day)
    expect(queryStudy(state, 'review-sheet', 0, { subject: 'math' })).toMatchObject({ picks: [], openSheets: [expect.objectContaining({ id: 'r1', graded: 0 })] })
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r2') }, day)).toThrow('r1')
    state = updateStudy(state, { action: 'discard-sheet', worksheetId: 'r1' }, day)
    expect(() => updateStudy(state, mark('r1', 'correct'), day)).toThrow('作废')
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r2') }, day)
    state = updateStudy(state, mark('r2', 'correct'), day)
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r3') }, day)).toThrow('明天之后')
    vi.restoreAllMocks()
  })

  it('drops a practice-sheet mistake when the parent corrects the mark to right', () => {
    let state = updateStudy(undefined, setup, NOW)
    const practice = { id: 'p1', subject: 'math' as const, items: [{ id: 'q1', objectiveId: 'm2a-o-sub', prompt: '54 − 20 = ?', figure: { kind: 'place-value' as const, tens: 5, ones: 4, crossTens: 2, crossOnes: 0, regroup: 'no' as const }, answer: '34', explanation: '十位 5 减 2。', answerEvidence: '54 − 20 = 34。' }] }
    state = updateStudy(state, { action: 'worksheet', worksheet: practice }, NOW)
    state = updateStudy(state, mark('p1', 'partial'), NOW)
    expect(state.mistakes).toEqual([expect.objectContaining({ id: 'w-p1-q1', objectiveId: 'm2a-o-sub', source: { worksheetId: 'p1', itemId: 'q1' } })])
    state = updateStudy(state, mark('p1', 'correct'), NOW + MINUTE)
    expect(state.mistakes).toEqual([])
    expect(state.worksheets[0]?.items[0]?.mistakeId).toBeUndefined()
  })

  it('steps a mistake along the numeric, context and reasoning ladder as its stage advances', () => {
    let state = linked()
    const at = (iso: string) => Date.parse(iso)
    const level = (iso: string) => {
      vi.spyOn(Date, 'now').mockReturnValue(at(iso))
      return queryStudy(state, 'review-sheet', 0, { subject: 'math' })
    }
    const sheetAt = (id: string, iso: string) => {
      state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet(id) }, at(iso))
      state = updateStudy(state, mark(id, 'correct'), at(iso))
    }
    expect(level('2026-10-11T09:00:00+08:00')).toMatchObject({ picks: [expect.objectContaining({ id: mistake.id, stage: 0, variantLevel: 'numeric' })] })
    sheetAt('r1', '2026-10-11T09:00:00+08:00')
    sheetAt('r2', '2026-10-14T09:00:00+08:00')
    expect(state.mistakes[0]).toMatchObject({ stage: 2, dueAt: at('2026-10-21T00:00:00+08:00') })
    expect(level('2026-10-20T09:00:00+08:00')).toMatchObject({ picks: [expect.objectContaining({ stage: 2, variantLevel: 'context' })] })
    sheetAt('r3', '2026-10-21T09:00:00+08:00')
    expect(level('2026-11-03T09:00:00+08:00')).toMatchObject({ picks: [expect.objectContaining({ stage: 3, variantLevel: 'reasoning' })] })
    sheetAt('r4', '2026-11-04T09:00:00+08:00')
    expect(state.mistakes[0]).toMatchObject({ stage: 4, independentDays: ['2026-10-11', '2026-10-14', '2026-10-21', '2026-11-04'] })
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('r5') }, at('2026-12-04T09:00:00+08:00'))
    state = updateStudy(state, mark('r5', 'incorrect'), at('2026-12-04T09:00:00+08:00'))
    expect(state.mistakes[0]).toMatchObject({ stage: 0, independentDays: [], dueAt: at('2026-12-05T00:00:00+08:00') })
    vi.restoreAllMocks()
  })

  it('keeps a slot on the review sheet for a weak goal without a due mistake', () => {
    let state = linked()
    state = updateStudy(state, { ...start, id: 'weak-block' }, evening + MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'weak-block', sessionId: 'weak-block', objectiveId: 'm2a-o-meaning', result: 'incorrect' } }, evening + 2 * MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: 'weak-block', reflection: '' }, evening + 3 * MINUTE)
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-11T09:00:00+08:00'))
    expect(queryStudy(state, 'review-sheet', 0, { subject: 'math' })).toMatchObject({
      picks: [expect.objectContaining({ kind: 'mistake', id: mistake.id, objectiveId: 'm2a-o-sub', variantLevel: 'numeric' })],
      objectiveFills: [expect.objectContaining({ kind: 'objective', id: 'm2a-o-meaning', variantLevel: 'numeric' })],
      errorCoverage: [],
    })
    vi.restoreAllMocks()
  })
})

describe('error causes, understanding reminders and photo drafts', () => {
  it('classifies a confirmed mistake by error cause and aggregates the profile', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), { action: 'mistake', mistake: { ...mistake, objectiveId: 'm2a-o-sub' } }, NOW)
    expect(() => updateStudy(state, { action: 'classify-mistake', mistakeId: mistake.id, errorType: 'carry-borrow' }, NOW)).toThrow('先确认')
    state = updateStudy(state, confirm, NOW)
    expect(() => updateStudy(state, { action: 'classify-mistake', mistakeId: mistake.id, errorType: 'pinyin-tone' }, NOW)).toThrow('科目不符')
    state = updateStudy(state, { action: 'classify-mistake', mistakeId: mistake.id, errorType: 'carry-borrow' }, NOW)
    expect(state.mistakes[0]?.errorType).toBe('carry-borrow')
    expect(updateStudy(state, { action: 'classify-mistake', mistakeId: mistake.id }, NOW)).toBe(state)
    expect(studyInsight(state, NOW).errorProfile).toEqual([{ subject: 'math', type: 'carry-borrow', count: 1, objectiveIds: ['m2a-o-sub'] }])
    state = updateStudy(state, { action: 'classify-mistake', mistakeId: mistake.id, errorType: '' }, NOW)
    expect(state.mistakes[0]?.errorType).toBeUndefined()
  })

  it('flags a repeated error cause as recurring on its goal', () => {
    let state = updateStudy(undefined, setup, NOW)
    for (const id of ['e1', 'e2']) {
      state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id, objectiveId: 'm2a-o-sub', errorType: 'carry-borrow' } }, NOW)
      state = updateStudy(state, { ...confirm, id }, NOW)
    }
    const goal = studyInsight(state, NOW).objectives.find(item => item.id === 'm2a-o-sub')
    expect(goal).toMatchObject({ errorTypes: [{ type: 'carry-borrow', count: 2 }], reasons: [{ code: 'open-mistakes', count: 2 }, { code: 'recurring-error', count: 1 }], priority: 24 })
  })

  it('suggests an explain-it-back reminder without touching mastery or state', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt, objectiveId: 'm2a-o-meaning' }
    state = updateStudy(state, { action: 'task', task }, NOW)
    state = updateStudy(state, { action: 'hint', taskId: task.id }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: 'm2a-o-meaning', assistance: 'hint' } }, NOW + 2 * MINUTE)
    const insight = studyInsight(state, NOW + 3 * MINUTE)
    expect(insight.understandingReminders).toEqual([{ code: 'first-explain', subject: 'math', objectiveId: 'm2a-o-meaning', title: '把同数连加改写成乘法算式并说明意义' }])
    expect(insight.objectives.find(item => item.id === 'm2a-o-meaning')).toMatchObject({ independentDays: 0, helpedOrWrong: 1 })
    expect(stateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
    expect(studyInsight(state, NOW + 2 * DAY).understandingReminders).toEqual([])
  })

  it('keeps photographed answers as drafts until the parent confirms', () => {
    let state = updateStudy(undefined, setup, NOW)
    const practice = { id: 'draft-1', subject: 'math' as const, objectiveId: 'm2a-o-meaning', items: [
      { id: 'q1', prompt: '3 + 3 + 3 可以怎样写成乘法？', answer: '3 × 3', explanation: '3 个 3 连加。', answerEvidence: '求几个相同加数的和可以用乘法。' },
      { id: 'q2', prompt: '5 + 5 + 5 + 5 等于多少？', answer: '20', explanation: '四个五相加。', answerEvidence: '5 × 4 = 20。' },
    ] }
    state = updateStudy(state, { action: 'worksheet', worksheet: practice }, NOW)
    state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'draft-1', itemId: 'q1', response: '3 × 3', result: 'correct', assistance: 'independent', uncertainties: '' } }, NOW)
    state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'draft-1', itemId: 'q2', response: '25', result: 'incorrect', assistance: 'independent', uncertainties: '答案有点糊', errorType: 'calculation' } }, NOW)
    state = updateStudy(state, { action: 'paper-draft', paperDraft: { worksheetId: 'draft-1', itemId: 'q1', response: '3 × 3，三个三', result: 'correct', assistance: 'independent', uncertainties: '' } }, NOW + MINUTE)
    expect(state.paperDrafts.find(draft => draft.itemId === 'q1')).toMatchObject({ response: '3 × 3，三个三', receivedAt: NOW })
    expect(state.paperResults).toEqual([])
    expect(state.mistakes).toEqual([])
    expect(queryStudy(state, 'worksheets', 0, { id: 'draft-1' })).toMatchObject({ items: [expect.objectContaining({ drafts: [expect.objectContaining({ itemId: 'q1', response: '3 × 3，三个三' }), expect.objectContaining({ itemId: 'q2', uncertainties: '答案有点糊', errorType: 'calculation' })] })] })
    state = updateStudy(state, { action: 'confirm-paper', worksheetId: 'draft-1', results: [{ itemId: 'q2', result: 'incorrect' as const, errorType: 'carry-borrow' as const }], userConfirmation: '家长核对照片。' }, NOW + 2 * MINUTE)
    expect(state.paperDrafts.map(draft => draft.itemId)).toEqual(['q1'])
    expect(state.paperResults).toHaveLength(1)
    expect(state.mistakes[0]).toMatchObject({ id: 'w-draft-1-q2', errorType: 'carry-borrow', learnerAnswer: '25', objectiveId: 'm2a-o-meaning', confirmedAt: NOW })
    expect(state.worksheets[0]?.items.find(item => item.id === 'q2')?.mistakeId).toBe('w-draft-1-q2')
    expect(state.worksheets[0]?.items.find(item => item.id === 'q1')?.mistakeId).toBeUndefined()
  })

  it('serves per-objective elements for the taught units', () => {
    const state = updateStudy(undefined, setup, NOW)
    expect(() => queryStudy(state, 'elements', 0)).toThrow('科目')
    expect(() => queryStudy(state, 'elements', 0, { subject: 'math', grade: 1 })).toThrow('当前学期')
    expect(queryStudy(state, 'elements', 0, { subject: 'math' })).toMatchObject({ objectives: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-sub', unit: 'm2a-u-sub', knowledgePoints: expect.arrayContaining([expect.objectContaining({ name: expect.any(String) })]) })]) })
    expect(queryStudy(state, 'elements', 0, { subject: 'math', unit: 'm2a-u-mul' })).toMatchObject({ objectives: expect.arrayContaining([expect.objectContaining({ unit: 'm2a-u-mul' })]) })
    expect(queryStudy(state, 'elements', 0, { subject: 'math', id: 'm2a-o-sub' })).toMatchObject({ objectives: [expect.objectContaining({ id: 'm2a-o-sub' })] })
  })
})

describe('printable figures', () => {
  it('draws every figure kind and answer space into the PDF', async () => {
    const base = { objectiveId: 'm2a-o-sub', answer: '略', explanation: '略', answerEvidence: '略' }
    const figures = [
      { kind: 'bar-model', bars: [{ name: '小明', segments: [{ label: '', units: 8 }, { label: '多 8 颗', units: 3, style: 'dashed' }], total: '35 颗' }, { name: '小红', segments: [{ label: '?', units: 8 }] }] },
      { kind: 'money', items: ['10元', '5元', '1元', '5角', '1角'] },
      { kind: 'place-value', tens: 4, ones: 2, crossTens: 1, crossOnes: 7, regroup: 'yes' },
      { kind: 'hundred-chart', hidden: [23, 37, 100] },
      { kind: 'vertical', count: 3 },
      { kind: 'shapes', rows: [{ name: '○', shape: 'circle', count: 9, blank: 0 }, { name: '△', shape: 'triangle', count: 0, blank: 6 }] },
    ] as const
    const items = [...figures.map((figure, index) => ({ ...base, id: `q${index}`, prompt: `第 ${index + 1} 题`, figure })), { ...base, id: 'q6', prompt: '写出想法', space: 'box' as const }]
    let state = updateStudy(undefined, setup, NOW)
    state = updateStudy(state, { action: 'worksheet', worksheet: { id: 'fig', subject: 'math', items } }, NOW)
    const pdf = await renderWorksheet(state, 'fig')
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '数一数', figure: { kind: 'money', items: ['3元'] } }] } }, NOW)).toThrow()
  })
})
