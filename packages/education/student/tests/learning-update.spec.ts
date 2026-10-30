import { describe, expect, it, vi } from 'vitest'
import { updateStudy } from '../src/learning/update/index.ts'
import { checkInHistory, diagnosticFor, studyInsight } from '../src/learning/mastery.ts'
import { studyStatus } from '../src/learning/status.ts'
import { studyDay } from '../src/learning/shared.ts'
import { migrateStudyFile, queryStudy } from '../src/store.ts'
import { stateSchema } from '../src/schema.ts'
import { NOW, MINUTE, DAY, setup, material, course, start, attempt, mistake, confirm, figureSamples } from './fixtures.ts'

const dueDay = (from: number, days = 1) => Date.parse(`${studyDay(from + days * DAY)}T00:00:00+08:00`)

describe('daily learning without time limits', () => {
  it('requires confirmed setup and updates an existing profile in place', () => {
    expect(() => updateStudy(undefined, start, NOW)).toThrow('家长确认')
    const state = updateStudy(undefined, setup, NOW)
    expect(studyStatus(state, NOW)).toMatchObject({ phase: 'ready', unconfirmedSubjects: ['chinese', 'math', 'english'] })
    expect(studyStatus(state, NOW).time).toMatchObject({ timezone: 'Asia/Shanghai', blockElapsed: null, todayElapsed: '0秒' })
    const renamed = updateStudy(state, { ...setup, profile: { ...setup.profile, nickname: '小苗' } }, NOW)
    expect(renamed.profile.nickname).toBe('小苗')
    expect(renamed.revision).toBe(state.revision + 1)
    expect(updateStudy(renamed, { ...setup, profile: { ...setup.profile, nickname: '小苗' } }, NOW)).toBe(renamed)
  })

  it('auto-closes an open block when starting another and records elapsed time only', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    expect(studyStatus(state, NOW + 10 * MINUTE)).toMatchObject({ phase: 'studying', time: { blockElapsed: '10分钟', todayElapsed: '10分钟' } })
    state = updateStudy(state, { action: 'record', attempt }, NOW + 11 * MINUTE)
    expect(state.attempts[0]).toMatchObject({ response: attempt.response })
    expect(state.attempts[0]).not.toHaveProperty('late')
    expect(state.sessions[0]).not.toHaveProperty('deadline')
    state = updateStudy(state, { ...start, id: 'b2', subject: 'english', mode: 'explore' }, NOW + 15 * MINUTE)
    expect(state.sessions[0]?.endedAt).toBe(NOW + 15 * MINUTE)
    expect(state.sessions[0]?.spentMs).toBe(15 * MINUTE)
    expect(state.sessions[1]).toMatchObject({ id: 'b2', subject: 'english', mode: 'explore' })
    expect(studyStatus(state, NOW + 15 * MINUTE).phase).toBe('studying')
    state = updateStudy(state, { action: 'stop', sessionId: 'b2', reflection: '' }, NOW + 20 * MINUTE)
    expect(studyStatus(state, NOW + 20 * MINUTE)).toMatchObject({ phase: 'ready', time: { todayElapsed: '20分钟' } })
    expect(state.rewards).toEqual([{ day: '2026-10-05', reason: 'participation' }])
  })

  it('strips legacy time-limit fields when migrating a saved study file', () => {
    const legacy = {
      format: 1, revision: 1, updatedAt: NOW, breakUntil: NOW + MINUTE,
      profile: { ...setup.profile, limits: { blockMinutes: 10, breakMinutes: 5, dailyMinutes: 20 } },
      materials: [], courses: [], sessions: [{ id: 'old', subject: 'math', mode: 'foundation', startedAt: NOW, endedAt: NOW + MINUTE, spentMs: MINUTE, deadline: NOW + 10 * MINUTE }],
      attempts: [{ ...attempt, at: NOW, late: true }], mistakes: [], rewards: [],
    }
    const migrated = stateSchema.parse(migrateStudyFile(legacy))
    expect(migrated).not.toHaveProperty('breakUntil')
    expect(migrated.profile).not.toHaveProperty('limits')
    expect(migrated.sessions[0]).not.toHaveProperty('deadline')
    expect(migrated.attempts[0]).not.toHaveProperty('late')
    expect(migrated.exercises).toEqual([])
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

  it('permits stopping early and counts only elapsed time', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + MINUTE)
    expect(studyStatus(state, NOW + 6 * MINUTE)).toMatchObject({ phase: 'ready', stars: 0, time: { todayElapsed: '1分钟' } })
    expect(() => updateStudy(state, { ...start, id: 'b2' }, NOW)).toThrow('时钟')
  })

  it('attributes delayed closure to the day the block started', () => {
    const late = Date.parse('2026-10-05T23:58:00+08:00')
    let state = updateStudy(updateStudy(undefined, setup, late), start, late)
    state = updateStudy(state, { action: 'record', attempt }, late + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, late + 10 * MINUTE)
    expect(state.sessions[0]?.spentMs).toBe(10 * MINUTE)
    expect(state.rewards[0]?.day).toBe('2026-10-05')
    expect(studyDay(late + 2 * MINUTE)).toBe('2026-10-06')
    expect(studyStatus(state, late + 15 * MINUTE).phase).toBe('ready')
  })

  it('replaces an unanswered task and saves workspace exercises', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    state = updateStudy(state, { action: 'task', task: { id: 't1', sessionId: start.id, subject: 'math', topic: '减法', prompt: '8-3=?', objectiveId: 'm2a-o-sub' } }, NOW)
    state = updateStudy(state, { action: 'task', task: { id: 't2', sessionId: start.id, subject: 'math', topic: '减法', prompt: '9-4=?', steps: ['圈条件', '列式', '验算'], objectiveId: 'm2a-o-sub' } }, NOW + MINUTE)
    expect(state.task).toMatchObject({ id: 't2', steps: ['圈条件', '列式', '验算'] })
    state = updateStudy(state, { action: 'save-exercise', exercise: { id: 'ex-ws-1', subject: 'math', objectiveId: 'm2a-o-sub', role: 'try', variant: 'numeric', prompt: '7-2=?', steps: ['看清减数', '口算'], answer: '5', explanation: '7 减 2 得 5。', answerEvidence: '口算。' } }, NOW + 2 * MINUTE)
    expect(state.exercises).toHaveLength(1)
    state = updateStudy(state, { action: 'delete-exercise', id: 'ex-ws-1' }, NOW + 3 * MINUTE)
    expect(state.exercises).toHaveLength(0)
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


describe('shared workbench tasks', () => {
  const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt }
  const begin = () => updateStudy(updateStudy(updateStudy(undefined, setup, NOW), start, NOW), { action: 'task', task }, NOW)

  it('preserves published questions and submitted answers through reload and rejects fabricated assessment', () => {
    let state = stateSchema.parse(JSON.parse(JSON.stringify(begin())))
    expect(() => updateStudy(state, { action: 'record', attempt }, NOW)).toThrow('请先用 answer 保存原始回答')
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'skip' } }, NOW)
    expect(state.task?.id).toBe('skip')
    state = updateStudy(state, { action: 'task', task }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    expect(() => updateStudy(state, { action: 'task', task: { ...task, id: 'next' } }, NOW + MINUTE)).toThrow('已作答题目的反馈')
    expect(updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)).toBe(state)
    expect(() => updateStudy(state, { action: 'answer', taskId: task.id, response: '改写答案' }, NOW + MINUTE)).toThrow('已提交')
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, prompt: '另一道题' } }, NOW + MINUTE)).toThrow('prompt 不一致。期望：「8 + 7 等于多少？」')
    state = updateStudy(state, { action: 'record', attempt }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).feedback?.id).toBe(task.id)
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'next' } }, NOW + MINUTE)
    expect(state.task?.response).toBeUndefined()
  })

  it('records hints as assistance and still saves a task later in the block', () => {
    let state = updateStudy(begin(), { action: 'hint', taskId: task.id }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    expect(() => updateStudy(state, { action: 'record', attempt }, NOW + MINUTE)).toThrow('不能记录为独立')
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, assistance: 'hint' } }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).progress[0]?.independentDays).toEqual([])
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'late' } }, NOW + 10 * MINUTE)
    state = updateStudy(state, { action: 'answer', taskId: 'late', response: '15' }, NOW + 11 * MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'late', response: '15' } }, NOW + 11 * MINUTE)
    expect(state.attempts.at(-1)).toMatchObject({ id: 'late', response: '15' })
    expect(state.attempts.at(-1)).not.toHaveProperty('late')
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 12 * MINUTE)
    expect(state.task).toMatchObject({ id: 'late', response: '15' })
  })

  it('validates review source before showing a question', () => {
    const state = updateStudy(updateStudy(undefined, setup, NOW), { ...start, mode: 'review' }, NOW)
    expect(() => updateStudy(state, { action: 'task', task }, NOW)).toThrow('已确认的错题')
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
    expect(state.mistakes[0]).toMatchObject({ stage: 1, dueAt: dueDay(NOW + 2 * DAY, 1) })
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


describe('worksheet figures', () => {
  it('accepts every shipped figure kind and rejects figures the schema forbids', () => {
    const base = { objectiveId: 'm2a-o-sub', answer: '略', explanation: '略', answerEvidence: '略' }
    const items = figureSamples.map((figure, index) => ({ ...base, id: `q${index}`, prompt: `第 ${index + 1} 题`, figure }))
    const sheets = [[...items.slice(0, 7), { ...base, id: 'think', prompt: '写出想法', space: 'box' as const }], items.slice(7, 15), items.slice(15, 23), items.slice(23)]
    let state = updateStudy(undefined, setup, NOW)
    for (const [index, sheet] of sheets.entries()) {
      state = updateStudy(state, { action: 'worksheet', worksheet: { id: `fig${index + 1}`, subject: 'math', items: sheet } }, NOW)
    }
    expect(state.worksheets).toHaveLength(4)
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '数一数', figure: { kind: 'money', items: ['3元'] } }] } }, NOW)).toThrow()
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '看图', figure: { kind: 'place-value', tens: 6, ones: 3, crossTens: 2, crossOnes: 8, regroup: 'yes' } }] } }, NOW)).toThrow()
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '看图', figure: { kind: 'place-value', tens: 5, ones: 3, crossTens: 2, crossOnes: 4, regroup: 'no' } }] } }, NOW)).toThrow()
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'ok-overlap', subject: 'math', items: [{ ...base, id: 'q1', prompt: '在□内填数，使每个圈里的两个数相加等于圈上的数。', figure: { kind: 'overlap', left: '', right: '82', leftOnly: '', both: '53', rightOnly: '29' } }] } }, NOW)).not.toThrow()
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '看钟面', figure: { kind: 'clock', clocks: [{ hour: 8, minute: 7 }] } }] } }, NOW)).toThrow()
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '数墙', figure: { kind: 'wall', rows: [['3'], ['1', '2', '0']] } }] } }, NOW)).toThrow()
    expect(() => updateStudy(state, { action: 'worksheet', worksheet: { id: 'bad', subject: 'math', items: [{ ...base, id: 'q1', prompt: '简笔画', figure: { kind: 'sketch', height: 60, elements: [{ draw: 'line', from: { x: 10, y: 80 }, to: { x: 40, y: 20 } }] } }] } }, NOW)).toThrow()
  })
})

describe('teaching when the learner is stuck', () => {
  const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt, objectiveId: 'm2a-o-sub' }
  const begin = (phase?: 'demo' | 'guide' | 'try' | 'vary') => updateStudy(updateStudy(updateStudy(undefined, setup, NOW), start, NOW), { action: 'task', task: phase ? { ...task, phase } : task }, NOW)

  it('keeps distinct independent days after a later hint and still withholds mastered', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    let at = NOW
    for (let i = 0; i < 3; i += 1) {
      state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: `day-${i}`, objectiveId: 'm2a-o-sub' } }, at)
      at += DAY
    }
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'helped', objectiveId: 'm2a-o-sub', assistance: 'hint' } }, at)
    const goal = studyInsight(state, at).objectives.find(item => item.id === 'm2a-o-sub')
    expect(goal).toMatchObject({ independentDays: 3 })
    expect(goal?.level).not.toBe('mastered')
    expect(studyStatus(state, at).progress.find(item => item.objectiveId === 'm2a-o-sub')?.independentDays).toHaveLength(3)
  })

  it('raises hints up to three and stores an omitted assistance as hint', () => {
    let state = begin()
    for (const level of [1, 2, 3]) {
      state = updateStudy(state, { action: 'hint', taskId: task.id }, NOW)
      expect(state.task?.hintLevel).toBe(level)
    }
    expect(updateStudy(state, { action: 'hint', taskId: task.id }, NOW)).toBe(state)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    const { assistance: _assistance, ...omitted } = attempt
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: task.objectiveId, assistance: 'independent' } }, NOW + MINUTE)).toThrow('不能记录为独立')
    state = updateStudy(state, { action: 'record', attempt: { ...omitted, objectiveId: task.objectiveId } }, NOW + MINUTE)
    expect(state.attempts[0]).toMatchObject({ assistance: 'hint', objectiveId: 'm2a-o-sub' })
  })

  it('rejects an independent record for demo and guide, and lets a demo note skip the child answer', () => {
    let state = begin('guide')
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: task.objectiveId, assistance: 'hint' } }, NOW)).toThrow('引导步要先请求提示')
    state = begin('guide')
    state = updateStudy(state, { action: 'hint', taskId: task.id }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: task.objectiveId, assistance: 'independent' } }, NOW)).toThrow('不能记录为独立')
    state = begin('demo')
    const { assistance: _assistance, ...note } = attempt
    state = updateStudy(state, { action: 'record', attempt: { ...note, objectiveId: task.objectiveId, response: '先把不等号当成等号。' } }, NOW)
    expect(state.attempts[0]).toMatchObject({ assistance: 'worked-example', response: '先把不等号当成等号。' })
    expect(() => updateStudy(begin('demo'), { action: 'record', attempt: { ...attempt, objectiveId: task.objectiveId, assistance: 'independent' } }, NOW)).toThrow('不能记录为独立')
  })

  it('records 不会, keeps today on that objective, and clears it after an independent correct', () => {
    let state = begin()
    state = updateStudy(state, { action: 'stuck', taskId: task.id }, NOW)
    expect(state.attempts[0]).toMatchObject({ response: '不会', result: 'stuck', assistance: 'hint', objectiveId: 'm2a-o-sub' })
    expect(updateStudy(state, { action: 'stuck', taskId: task.id }, NOW)).toBe(state)
    expect(() => updateStudy(state, { action: 'answer', taskId: task.id, response: '13' }, NOW)).toThrow('已记录反馈')
    const held = studyInsight(state, NOW)
    expect(held.objectives.find(item => item.id === 'm2a-o-sub')).toMatchObject({ level: 'weak', reasons: expect.arrayContaining([{ code: 'needs-teaching', count: 1 }]) })
    expect(held.recommendation).toMatchObject({ kind: 'practice', objectiveId: 'm2a-o-sub', reason: { code: 'needs-teaching' } })
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'try-1', phase: 'try' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'answer', taskId: 'try-1', response: '13' }, NOW + MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'try-1', response: '13', objectiveId: 'm2a-o-sub' } }, NOW + 2 * MINUTE)
    expect(studyInsight(state, NOW + 2 * MINUTE).objectives.find(item => item.id === 'm2a-o-sub')?.reasons.some(reason => reason.code === 'needs-teaching')).toBe(false)
    expect(studyInsight(state, NOW + 2 * MINUTE).recommendation).not.toMatchObject({ reason: { code: 'needs-teaching' } })
  })

  it('marks a goal that is correct only with help, including a paper grade', () => {
    let state = begin()
    state = updateStudy(state, { action: 'hint', taskId: task.id }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: 'm2a-o-sub', assistance: 'hint' } }, NOW)
    expect(studyInsight(state, NOW).recommendation).toMatchObject({ kind: 'practice', objectiveId: 'm2a-o-sub', reason: { code: 'needs-teaching' } })
    const sheet = { id: 'help-1', subject: 'math' as const, items: [{ id: 'q1', objectiveId: 'm2a-o-meaning', prompt: '3 个 3 连加写成乘法', answer: '3×3', explanation: '同数连加。', answerEvidence: '3+3+3=3×3。' }] }
    state = updateStudy(state, { action: 'worksheet', worksheet: sheet }, NOW)
    state = updateStudy(state, { action: 'grade-sheet', grade: { worksheetId: 'help-1', results: [{ itemId: 'q1', result: 'correct' as const, assistance: 'hint' as const }], userConfirmation: '家长勾了提示后才对。' } }, NOW)
    expect(studyInsight(state, NOW).objectives.find(item => item.id === 'm2a-o-meaning')).toMatchObject({ level: 'weak', independentDays: 0, reasons: expect.arrayContaining([{ code: 'needs-teaching', count: 1 }]) })
  })

  it('keeps a diagnose block free of teaching steps and still records 不会', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), { ...start, mode: 'diagnose' }, NOW)
    expect(() => updateStudy(state, { action: 'task', task: { ...task, phase: 'demo' } }, NOW)).toThrow('摸底题不进入教学步骤')
    state = updateStudy(state, { action: 'task', task }, NOW)
    state = updateStudy(state, { action: 'stuck', taskId: task.id }, NOW)
    expect(state.attempts[0]?.result).toBe('stuck')
  })

  it('queues a workbook photo after confirmation and turns only an independent wrong into a mistake', () => {
    let state = updateStudy(undefined, setup, NOW)
    const draft = { id: 'page-1', subject: 'math' as const, prompt: '20-( )>6', outcome: 'stuck' as const, uncertainties: '字有点淡', objectiveId: 'm2a-o-sub' }
    state = updateStudy(state, { action: 'workbook-draft', draft }, NOW)
    expect(state.worksheets).toEqual([])
    expect(state.workbookDrafts[0]).toMatchObject({ id: 'page-1', receivedAt: NOW })
    state = updateStudy(state, { action: 'confirm-workbook', id: 'page-1', userConfirmation: '家长确认这题不会。' }, NOW)
    expect(state.workbookDrafts).toEqual([])
    expect(state.mistakes).toEqual([])
    expect(state.teachingQueue[0]).toMatchObject({ id: 'tq-page-1', objectiveId: 'm2a-o-sub', prompt: '20-( )>6' })
    expect(studyInsight(state, NOW).recommendation).toMatchObject({ kind: 'practice', objectiveId: 'm2a-o-sub', reason: { code: 'needs-teaching' } })
    state = updateStudy(state, { action: 'workbook-draft', draft: { ...draft, id: 'page-2', outcome: 'independent-wrong', response: '14' } }, NOW)
    expect(() => updateStudy(state, { action: 'confirm-workbook', id: 'page-2', outcome: 'independent-wrong', userConfirmation: '家长确认。' }, NOW)).toThrow('订正')
    state = updateStudy(state, { action: 'confirm-workbook', id: 'page-2', outcome: 'independent-wrong', correction: '13', explanation: '等号是 14，要改小 1。', answerEvidence: '20-13=7>6。', userConfirmation: '家长确认独立做错。' }, NOW)
    expect(state.mistakes[0]).toMatchObject({ id: 'wb-page-2', learnerAnswer: '14', confirmedAt: NOW, objectiveId: 'm2a-o-sub' })
    const { objectiveId: _goal, ...withoutGoal } = draft
    state = updateStudy(state, { action: 'workbook-draft', draft: { ...withoutGoal, id: 'page-3', outcome: 'independent-correct', response: '13' } }, NOW)
    state = updateStudy(state, { action: 'confirm-workbook', id: 'page-3', userConfirmation: '家长确认独立做对。' }, NOW)
    expect(state.workbookDrafts).toEqual([])
    expect(state.mistakes).toHaveLength(1)
    expect(state.teachingQueue.map(item => item.sourceDraftId)).toEqual(['page-1'])
    state = updateStudy(state, { action: 'workbook-draft', draft: { id: 'page-4', subject: 'math', prompt: '16-( )>2', outcome: 'independent-correct', uncertainties: '', objectiveId: 'm2a-o-sub' } }, NOW)
    state = updateStudy(state, { action: 'confirm-workbook', id: 'page-4', userConfirmation: '家长确认这题会了。' }, NOW)
    expect(state.teachingQueue).toEqual([])
    expect(state.mistakes).toHaveLength(1)
    state = updateStudy(state, { action: 'dismiss-teaching', id: 'tq-page-1' }, NOW)
    expect(state.teachingQueue).toEqual([])
    expect(state.mistakes).toHaveLength(1)
    expect(updateStudy(state, { action: 'confirm-workbook', id: 'page-1', userConfirmation: '家长确认这题不会。' }, NOW)).toBe(state)
  })

  it('teaches an unlinked queue item before the next lesson and migrates an old hint flag', () => {
    let state = updateStudy(undefined, setup, NOW)
    state = updateStudy(state, { action: 'workbook-draft', draft: { id: 'loose', subject: 'math', prompt: '括号里最大能填几', outcome: 'hinted', uncertainties: '' } }, NOW)
    state = updateStudy(state, { action: 'confirm-workbook', id: 'loose', userConfirmation: '家长确认提示后才对。' }, NOW)
    expect(studyInsight(state, NOW).recommendation).toMatchObject({ kind: 'practice', reason: { code: 'needs-teaching' }, title: '括号里最大能填几' })
    expect(studyInsight(state, NOW).recommendation?.objectiveId).toBeUndefined()
    const saved = JSON.parse(JSON.stringify(updateStudy(undefined, setup, NOW))) as Record<string, unknown>
    delete saved.workbookDrafts
    delete saved.teachingQueue
    saved.task = { id: 'q', sessionId: 's', subject: 'math', topic: '加法', prompt: '1+1', hintRequested: true }
    const restored = stateSchema.parse(migrateStudyFile(saved))
    expect(restored.workbookDrafts).toEqual([])
    expect(restored.teachingQueue).toEqual([])
    expect(restored.task).toMatchObject({ hintLevel: 1 })
    expect(restored.task).not.toHaveProperty('hintRequested')
  })
})

describe('archiving a term', () => {
  it('keeps the profile, drops all evidence and marks the file archived; an active block refuses', () => {
    const base = updateStudy(undefined, setup, NOW)
    const archived = updateStudy(base, { action: 'archive-term', parentConfirmation: '家长确认归档' }, NOW + MINUTE)
    expect(archived).toMatchObject({ archivedAt: NOW + MINUTE, profile: base.profile, sessions: [], attempts: [], mistakes: [], rewards: [] })
    expect(archived.materials).toHaveLength(0)
    // The store's read layer treats an archived file as absent, so setup opens a new term; the handler itself only guards the active block.
    expect(() => updateStudy(updateStudy(base, start, NOW + MINUTE), { action: 'archive-term', parentConfirmation: '家长确认' }, NOW + 2 * MINUTE)).toThrow('先结束当前学习')
  })
})
