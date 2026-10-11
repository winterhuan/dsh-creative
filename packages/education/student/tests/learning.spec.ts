import { describe, expect, it } from 'vitest'
import { curriculumView, studyDay, studyInsight, studyStatus, updateStudy } from '../src/learning.ts'
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
  const paperResult = { worksheetId: sheet.id, itemId: 'q1', response: '15，先凑十。', result: 'correct' as const, assistance: 'independent' as const, feedback: '说明了凑十步骤。', answerEvidence: '9 + 1 + 5 = 15。', userConfirmation: '家长确认纸上原答案。' }

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
    expect(() => updateStudy(state, { action: 'paper-result', paperResult: { ...paperResult, itemId: 'missing' } }, NOW + 2 * DAY)).toThrow('题号')
    state = updateStudy(state, { action: 'paper-result', paperResult }, NOW + 2 * DAY)
    expect(state.paperResults[0]).toMatchObject({ response: paperResult.response, receivedAt: NOW + 2 * DAY })
    expect(state.mistakes[0]).toMatchObject({ stage: 1, dueAt: NOW + 5 * DAY })
    expect(state.sessions).toEqual([])
    expect(state.rewards).toEqual([])
    expect(updateStudy(state, { action: 'paper-result', paperResult }, NOW + 2 * DAY)).toBe(state)
    expect(queryStudy(state, 'worksheets', 0, { id: sheet.id })).toMatchObject({ total: 1, items: [expect.objectContaining({ id: sheet.id })] })
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
    expect(() => updateStudy(state, { action: 'task', task: { ...task, objectiveId: 'c2a-o-chazi' } }, NOW)).toThrow('科目不符')
    expect(() => updateStudy(state, { action: 'task', task: { ...task, objectiveId: 'm1a-o-count' } }, NOW)).toThrow('学习目标不存在')
    state = updateStudy(state, { action: 'task', task }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: 'm2a-o-meaning' } }, NOW + MINUTE)
    expect(studyStatus(state, NOW + MINUTE).progress[0]).toMatchObject({ objectiveId: 'm2a-o-meaning', independentDays: ['2026-10-05'] })
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + MINUTE)
    state = updateStudy(state, { action: 'mistake', mistake }, NOW + MINUTE)
    state = updateStudy(state, confirm, NOW + MINUTE)
    expect(() => updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'e2a-o-greet' }, NOW + MINUTE)).toThrow('同一科目')
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
    expect(view?.units.find(item => item.id === 'm2a-u2')).toMatchObject({ due: 5, concepts: 5 })
    expect(view?.summary).toMatchObject({ concepts: 12, due: 5, untouched: 7 })
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
    expect(view?.units.find(item => item.id === 'm2a-u1')).toMatchObject({ mastered: 2, concepts: 2 })
    const at = NOW + DAY
    state = updateStudy(state, { ...start, id: 'h1' }, at)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'h1', sessionId: 'h1', objectiveId: 'm2a-o-div', assistance: 'hint' } }, at + MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'h2', sessionId: 'h1', objectiveId: 'm2a-o-div', result: 'incorrect' } }, at + 2 * MINUTE)
    insight = studyInsight(state, at + 3 * MINUTE)
    expect(insight.objectives.find(item => item.id === 'm2a-o-div')).toMatchObject({ level: 'weak', helpedOrWrong: 2, reasons: [{ code: 'recent-help-or-error', count: 2 }] })
    expect(insight.weakPoints.map(item => item.id)).toEqual(['m2a-o-tables', 'm2a-o-div'])
    expect(studyInsight(state, at + 15 * DAY).objectives.find(item => item.id === 'm2a-o-div')).toMatchObject({ level: 'stalled', reasons: [{ code: 'not-practised-recently', count: 14 }] })
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
    expect(plan).toMatchObject({ due: true, untouched: 6, stalled: 0, recheck: 0 })
    expect(plan?.sample).toHaveLength(6)
    expect(new Set(plan?.sample.slice(0, 4).map(item => item.unit)).size).toBe(4)
    expect(insight.recommendation).toMatchObject({ kind: 'diagnose', subject: 'chinese' })
    expect(queryStudy(state, 'diagnose', 0, { subject: 'math' })).toMatchObject({ diagnostics: [{ subject: 'math', due: true, sample: expect.any(Array) }] })
    state = updateStudy(state, { ...start, id: 'check', mode: 'diagnose' }, NOW)
    expect(() => updateStudy(state, { action: 'task', task: { id: 'p0', sessionId: 'check', subject: 'math', topic: '乘法', prompt: '几个几？' } }, NOW)).toThrow('摸底题')
    const probes: [string, 'correct' | 'incorrect'][] = [['m2a-o-meaning', 'correct'], ['m2a-o-tables', 'incorrect'], ['m2a-o-div', 'incorrect']]
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
    expect(insight.diagnostics.find(item => item.subject === 'math')).toMatchObject({ due: false, lastAt: NOW, nextAt: NOW + 14 * DAY, untouched: 3 })
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
    expect(plan).toMatchObject({ recheck: 1, untouched: 5 })
    expect(plan?.sample.find(item => item.id === 'm2a-o-meaning')?.reason).toBe('recheck')
  })
})
