import { describe, expect, it, vi } from 'vitest'
import { updateNotices, updateStudy } from '../src/learning/update/index.ts'
import { diagnosticFor, studyInsight } from '../src/learning/mastery.ts'
import { checkInHistory } from '../src/learning/view.ts'
import { studyStatus } from '../src/learning/status.ts'
import { curriculumView } from '../src/learning/view.ts'
import { queryStudy } from '../src/store.ts'
import { stateSchema } from '../src/schema.ts'
import { NOW, MINUTE, DAY, setup, material, course, start, attempt, mistake, confirm } from './fixtures.ts'

describe('shipped knowledge map objectives and insight', () => {
  const task = { id: attempt.id, sessionId: attempt.sessionId, subject: attempt.subject, topic: attempt.topic, prompt: attempt.prompt, objectiveId: 'm2a-o-meaning' }

  it('accepts shipped objective IDs without parent confirmation and rejects other subjects or scopes', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    expect(() => updateStudy(state, { action: 'task', task: { ...task, objectiveId: 'c2a-o1' } }, NOW)).toThrow('科目不符')
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'cross-grade', objectiveId: 'm1a-o-count' } }, NOW)
    expect(state.task?.objectiveId).toBe('m1a-o-count')
    state = updateStudy(state, { action: 'answer', taskId: 'cross-grade', response: attempt.response }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'cross-grade', objectiveId: 'm1a-o-count' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'task', task }, NOW + MINUTE)
    state = updateStudy(state, { action: 'answer', taskId: task.id, response: attempt.response }, NOW + MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, objectiveId: 'm2a-o-meaning' } }, NOW + 2 * MINUTE)
    expect(studyStatus(state, NOW + 2 * MINUTE).progress).toEqual(expect.arrayContaining([expect.objectContaining({ objectiveId: 'm2a-o-meaning', independentDays: ['2026-10-05'] }), expect.objectContaining({ objectiveId: 'm1a-o-count', independentDays: ['2026-10-05'] })]))
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 2 * MINUTE)
    state = updateStudy(state, { action: 'mistake', mistake }, NOW + 2 * MINUTE)
    state = updateStudy(state, confirm, NOW + 2 * MINUTE)
    expect(() => updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'e2a-o1' }, NOW + 2 * MINUTE)).toThrow('同一科目')
    state = updateStudy(state, { action: 'link-mistake', mistakeId: mistake.id, objectiveId: 'm2a-o-tables' }, NOW + 2 * MINUTE)
    state = updateStudy(state, { action: 'worksheet', worksheet: { id: 'sheet-map', subject: 'math', objectiveId: 'm2a-o-tables', items: [{ id: 'q1', mistakeId: mistake.id, prompt: '7 × 8 = ? 请写出用到的口诀。', answer: '56', explanation: '七八五十六', answerEvidence: '乘法口诀表。' }] } }, NOW + 2 * MINUTE)
    expect(state.worksheets[0]?.objectiveId).toBe('m2a-o-tables')
    expect(queryStudy(state, 'curriculum', 0, { subject: 'math' })).toMatchObject({ curriculum: { id: 'math-grade2-first', objectives: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-tables' })]) } })
    expect(() => queryStudy(state, 'curriculum', 0)).toThrow('科目')
    expect(() => queryStudy(state, 'bogus', 0)).toThrow('未知的查询类型')
  })

  it('applies the same mastery rule to cross-grade check-in pools as to the current term', () => {
    let state = updateStudy(undefined, setup, NOW)
    state = updateStudy(state, start, NOW)
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'wrong-profile', objectiveId: 'm2a-o-sub' } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'wrong-profile', response: '12' }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'wrong-profile', objectiveId: 'm2a-o-sub', response: '12', result: 'incorrect' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + MINUTE)
    state = updateStudy(state, { action: 'start', id: 'diag-1', subject: 'math', mode: 'diagnose', scope: { grade: 1, term: 'first' } }, NOW + 2 * MINUTE)
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'wrong-cross', sessionId: 'diag-1', objectiveId: 'm1a-o-count' } }, NOW + 2 * MINUTE)
    state = updateStudy(state, { action: 'answer', taskId: 'wrong-cross', response: '12' }, NOW + 2 * MINUTE)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'wrong-cross', sessionId: 'diag-1', objectiveId: 'm1a-o-count', response: '12', result: 'incorrect' } }, NOW + 3 * MINUTE)
    // One recent wrong answer with no independent correct marks the objective weak — in the profile insight…
    const profile = studyInsight(state, NOW + 3 * MINUTE).objectives.find(item => item.id === 'm2a-o-sub')
    expect(profile?.level).toBe('weak')
    expect(profile?.reasons).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'recent-help-or-error' })]))
    // …and in the cross-grade pool, where a weak objective is no longer re-probed by a deep check-in.
    const plan = diagnosticFor(state, 'math', NOW + 3 * MINUTE, { grade: 1, term: 'first', objectiveIds: ['m1a-o-count'] })
    expect(plan.coverage).toMatchObject({ probed: 1, total: 1 })
    expect(plan.samples.standard.some(item => item.id === 'm1a-o-count')).toBe(false)
    expect(plan.samples.deep.some(item => item.id === 'm1a-o-count')).toBe(false)
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
    expect(insight.objectives.find(item => item.id === 'm2a-o-shop')).toMatchObject({ level: 'weak', helpedOrWrong: 2, reasons: [{ code: 'needs-teaching', count: 1 }, { code: 'recent-help-or-error', count: 2 }] })
    expect(insight.weakPoints.map(item => item.id)).toEqual(['m2a-o-shop', 'm2a-o-tables'])
    expect(studyInsight(state, at + 15 * DAY).objectives.find(item => item.id === 'm2a-o-shop')).toMatchObject({ level: 'weak', reasons: [{ code: 'needs-teaching', count: 1 }] })
    expect(studyInsight(state, at + 15 * DAY).objectives.find(item => item.id === 'm2a-o-meaning')?.level).toBe('mastered')
    expect(queryStudy(state, 'weak', 0)).toMatchObject({ recommendation: { kind: 'review' }, practised: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-meaning', level: 'mastered' })]) })
    expect(queryStudy(state, 'status', 0)).toMatchObject({ recommendation: { kind: 'review', subject: 'math' }, weakPoints: expect.arrayContaining([expect.objectContaining({ id: 'm2a-o-tables' })]) })
  })

  it('supports cross-grade objectives while unshipped grades stay on custom goals', () => {
    const state = updateStudy(undefined, { ...setup, profile: { ...setup.profile, grade: 3 } }, NOW)
    const insight = studyInsight(state, NOW)
    expect(insight).toMatchObject({ objectives: [], weakPoints: [], recommendation: null })
    expect(insight.diagnostics.every(plan => !plan.due && plan.sample.length === 0)).toBe(true)
    expect(curriculumView(state, 'math', insight)).toBeNull()
    expect(diagnosticFor(state, 'math', NOW, { grade: 2, term: 'first' }).coverage.total).toBe(8)
  })
})

describe('choice tasks, map browsing and recurring check-ins', () => {
  it('rejects a record whose figure differs from the saved task', () => {
    const figure = { kind: 'clock' as const, clocks: [{ hour: 3, minute: 0 }] }
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    const task = { id: 'fig', sessionId: start.id, subject: 'math' as const, topic: '钟面', prompt: '现在是几时？', figure }
    state = updateStudy(state, { action: 'task', task }, NOW)
    expect(state.task?.figure).toEqual(figure)
    state = updateStudy(state, { action: 'answer', taskId: 'fig', response: '3时' }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'fig', sessionId: start.id, topic: '钟面', prompt: '现在是几时？', response: '3时' } }, NOW)
    expect(state.attempts.at(-1)?.figure).toEqual(figure)
    state = updateStudy(state, { action: 'task', task: { ...task, id: 'fig-2' } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'fig-2', response: '3时' }, NOW)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'fig-2', sessionId: start.id, topic: '钟面', prompt: '现在是几时？', response: '3时', figure: { kind: 'clock', clocks: [{ hour: 4, minute: 0 }] } } }, NOW)).toThrow('figure 不一致。期望：{"kind":"clock","clocks":[{"hour":3,"minute":0}]}')
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'fig-2', sessionId: start.id, topic: '钟面', prompt: '现在是几时？', response: '3时', figure } }, NOW)
    expect(state.attempts.at(-1)?.figure).toEqual(figure)
  })

  it('restricts answers to the published choices', () => {
    let state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    const task = { id: 'c1', sessionId: start.id, subject: 'math' as const, topic: '乘法', prompt: '3 + 3 + 3 + 3 写成乘法是？', choices: ['3 × 4', '3 + 4', '4 × 4'], objectiveId: 'm2a-o-meaning' }
    expect(() => updateStudy(state, { action: 'task', task: { ...task, choices: ['只有一个'] } }, NOW)).toThrow()
    state = updateStudy(state, { action: 'task', task }, NOW)
    expect(() => updateStudy(state, { action: 'answer', taskId: 'c1', response: '12' }, NOW)).toThrow('可选：A. 3 × 4；B. 3 + 4；C. 4 × 4')
    state = updateStudy(state, { action: 'answer', taskId: 'c1', response: ' ３ × ４ ' }, NOW)
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'c1', topic: task.topic, prompt: task.prompt, response: '选择A', objectiveId: 'other' } }, NOW)).toThrow('objectiveId 不一致。期望：「m2a-o-meaning」')
    expect(state.task).toMatchObject({ response: '3 × 4', rawResponse: '３ × ４' })
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'c1', topic: task.topic, prompt: task.prompt, response: '选择A' } }, NOW)
    expect(state.attempts.at(-1)).toMatchObject({ response: '3 × 4', rawResponse: '３ × ４', objectiveId: 'm2a-o-meaning' })
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW)
    state = updateStudy(state, { ...start, id: 'en', subject: 'english' }, NOW)
    const english = { id: 'c2', sessionId: 'en', subject: 'english' as const, topic: '动词', prompt: 'Which action is it?', choices: ['run', 'jump', 'play ping-pong'] }
    state = updateStudy(state, { action: 'task', task: english }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'c2', response: 'Jump' }, NOW)
    expect(state.task).toMatchObject({ response: 'jump', rawResponse: 'Jump' })
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'c2', sessionId: 'en', subject: 'english', topic: '动词', prompt: 'Which action is it?', response: '答案是B' } }, NOW)
    expect(state.attempts.at(-1)).toMatchObject({ response: 'jump', rawResponse: 'Jump' })
    expect(updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'c2', sessionId: 'en', subject: 'english', topic: '动词', prompt: 'Which action is it?', response: '答案是B' } }, NOW)).toBe(state)
    state = updateStudy(state, { action: 'task', task: { ...english, id: 'c3' } }, NOW)
    expect(() => updateStudy(state, { action: 'answer', taskId: 'c3', response: 'swim' }, NOW)).toThrow('也可以写 A、B、C')
    state = updateStudy(state, { action: 'answer', taskId: 'c3', response: 'play  ping-pong' }, NOW)
    expect(state.task).toMatchObject({ response: 'play ping-pong', rawResponse: 'play  ping-pong' })
  })

  it('browses another term without mastery while task validation stays on the profile term', () => {
    const state = updateStudy(undefined, setup, NOW)
    const insight = studyInsight(state, NOW)
    expect(curriculumView(state, 'math', insight)?.scope).toEqual({ grade: 2, term: 'first', current: true })
    const browsed = curriculumView(state, 'math', insight, { grade: 1, term: 'second' })
    expect(browsed).toMatchObject({ id: 'math-grade1-second', scope: { grade: 1, term: 'second', current: false } })
    expect(browsed?.ideas.map(idea => idea.id)).toEqual(curriculumView(state, 'math', insight)?.ideas.map(idea => idea.id))
    expect(browsed?.ideas.some(idea => idea.name === '身体尺')).toBe(true)
    expect(browsed?.ideas.some(idea => idea.name === '千以内的数')).toBe(true)
    expect(browsed?.objectives.every(item => item.level === 'untouched' && item.attempts === 0 && item.unitName.length > 0)).toBe(true)
    expect(queryStudy(state, 'curriculum', 0, { subject: 'chinese', grade: 1, term: 'first' })).toMatchObject({ curriculum: { id: 'chinese-grade1-first', scope: { current: false } } })
    expect(curriculumView(state, 'math', insight, { grade: 3, term: 'first' })).toBeNull()
    expect(() => updateStudy(updateStudy(state, start, NOW), { action: 'task', task: { id: 'q', sessionId: start.id, subject: 'math', topic: '测量', prompt: '量一量', objectiveId: 'missing-obj' } }, NOW)).toThrow('学习目标不存在')
    const cross = updateStudy(updateStudy(state, { ...start, id: 'cross' }, NOW), { action: 'task', task: { id: 'q', sessionId: 'cross', subject: 'math', topic: '测量', prompt: '量一量', objectiveId: 'm1b-o-measure' } }, NOW)
    expect(cross.task?.objectiveId).toBe('m1b-o-measure')
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
    state = updateStudy(state, { ...start, intensity: 'light' }, NOW)
    expect(state.sessions[0]?.intensity).toBeUndefined()
    expect(updateNotices({ ...start, intensity: 'light' })).toEqual(['已忽略 intensity「light」。摸底强度只用于摸底检测，本次不记录强度。'])
    state = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW)
    const plan = studyInsight(state, NOW).diagnostics.find(item => item.subject === 'chinese')
    expect(plan).toMatchObject({ coverage: { probed: 0, total: 9 }, recommendedIntensity: 'standard' })
    expect(plan?.samples.light).toHaveLength(3)
    expect(plan?.samples.standard).toHaveLength(6)
    expect(plan?.samples.deep).toHaveLength(9)
    expect(plan?.samples.deep.every(item => item.reason === 'untouched')).toBe(true)
    state = updateStudy(state, { ...start, id: 'deep', mode: 'diagnose', intensity: 'deep' }, NOW)
    expect(state.sessions.find(item => item.id === 'deep')?.intensity).toBe('deep')
    state = updateStudy(state, { action: 'task', task: { id: 'd1', sessionId: 'deep', subject: 'math', topic: '摸底', prompt: '题', objectiveId: 'm2a-o-meaning' } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'd1', response: '答' }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'd1', sessionId: 'deep', topic: '摸底', prompt: '题', response: '答', assistance: 'hint', objectiveId: 'm2a-o-meaning' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: 'deep', reflection: '' }, NOW + 2 * MINUTE)
    const history = checkInHistory(state)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ subject: 'math', intensity: 'deep', counts: { independent: 0, helped: 1, wrong: 0, unassessed: 0 }, results: [{ objectiveId: 'm2a-o-meaning', title: '把同数连加改写成乘法算式并说明意义' }] })
    expect(studyInsight(state, NOW + 3 * MINUTE).diagnostics.find(item => item.subject === 'math')).toMatchObject({ coverage: { probed: 1, total: 8 } })
    expect(queryStudy(state, 'diagnose', 0, { subject: 'math' })).toMatchObject({ history: [{ sessionId: 'deep' }] })
    expect(stateSchema.parse(JSON.parse(JSON.stringify(state))).sessions.find(item => item.id === 'deep')?.intensity).toBe('deep')
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

  it('runs a cross-grade check-in from a session scope, outside the school frontier', () => {
    let state = updateStudy(undefined, setup, NOW)
    const plan = diagnosticFor(state, 'math', NOW, { grade: 1, term: 'first' })
    expect(plan.coverage).toMatchObject({ probed: 0, total: 9 })
    expect(plan.sample.map(item => item.id).every(id => id.startsWith('m1a-'))).toBe(true)
    expect(plan.scope).toMatchObject({ grade: 1, term: 'first' })
    state = updateStudy(state, { action: 'start', id: 'g1-check', subject: 'math', mode: 'diagnose', intensity: 'light', scope: { grade: 1, term: 'first' } }, NOW)
    expect(state.sessions[0]?.scope).toMatchObject({ grade: 1, term: 'first' })
    state = updateStudy(state, { action: 'task', task: { id: 'g1-t1', sessionId: 'g1-check', subject: 'math', topic: '10 以内加减', prompt: '3 + 4 = ?', objectiveId: 'm1a-o-meaning' } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'g1-t1', response: '7' }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'g1-t1', sessionId: 'g1-check', topic: '10 以内加减', prompt: '3 + 4 = ?', response: '7', objectiveId: 'm1a-o-meaning' } }, NOW + MINUTE)
    expect(state.attempts[0]?.objectiveId).toBe('m1a-o-meaning')
    expect(() => updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'g1-t2', sessionId: 'g1-check', objectiveId: 'm2a-o-sub' } }, NOW + MINUTE)).toThrow('不在本段学习范围内')
    state = updateStudy(state, { action: 'stop', sessionId: 'g1-check', reflection: '' }, NOW + 2 * MINUTE)
    const after = diagnosticFor(state, 'math', NOW + 3 * MINUTE, { grade: 1, term: 'first' })
    expect(after.coverage).toMatchObject({ probed: 1, total: 9 })
    expect(stateSchema.parse(JSON.parse(JSON.stringify(state))).sessions[0]?.scope).toMatchObject({ grade: 1, term: 'first' })
  })

  it('narrows a check-in to selected units or objective IDs', () => {
    const state = updateStudy(undefined, setup, NOW)
    const byUnit = diagnosticFor(state, 'math', NOW, { grade: 1, term: 'first', units: ['m1a-u3'] })
    expect(byUnit.coverage.total).toBe(2)
    expect(byUnit.sample.map(item => item.unit).every(unit => unit === 'm1a-u3')).toBe(true)
    const byIds = diagnosticFor(state, 'math', NOW, { grade: 2, term: 'first', objectiveIds: ['m2a-o-sub', 'm2a-o-shop'] })
    expect(byIds.coverage.total).toBe(2)
    expect(byIds.sample.map(item => item.id).sort()).toEqual(['m2a-o-shop', 'm2a-o-sub'])
    expect(byIds.samples.light).toHaveLength(2)
  })

  it('rejects a scope whose units or objectives are not in the named map', () => {
    const state = updateStudy(undefined, setup, NOW)
    expect(() => updateStudy(state, { action: 'start', id: 'bad-unit', subject: 'math', mode: 'diagnose', scope: { grade: 1, term: 'first', units: ['m2a-u-sub'] } }, NOW)).toThrow('不在该年级学期')
    expect(() => updateStudy(state, { action: 'start', id: 'bad-obj', subject: 'math', mode: 'diagnose', scope: { grade: 1, term: 'first', objectiveIds: ['missing'] } }, NOW)).toThrow('学习目标不存在')
    expect(() => updateStudy(state, { action: 'start', id: 'bad-grade', subject: 'math', mode: 'diagnose', scope: { grade: 5, term: 'first' } }, NOW)).toThrow('知识地图不存在')
    expect(() => updateStudy(state, { ...start, id: 'bad-mode', mode: 'review', scope: { grade: 1, term: 'first' } }, NOW)).toThrow('自定义范围只用于摸底或学习')
  })

  it('lets a foundation block learn across grades with a scope, bypassing the frontier', () => {
    let state = frontier('keep-up', 'm2a-u-mul', 'teaching', false)
    expect(studyInsight(state, NOW).recommendation).not.toMatchObject({ objectiveId: 'm1a-o-carry' })
    state = updateStudy(state, { action: 'start', id: 'g1-learn', subject: 'math', mode: 'foundation', scope: { grade: 1, term: 'first', objectiveIds: ['m1a-o-carry'] } }, NOW)
    state = updateStudy(state, { action: 'task', task: { id: 'g1-l1', sessionId: 'g1-learn', subject: 'math', topic: '进位加法', prompt: '9 + 5 = ?', objectiveId: 'm1a-o-carry' } }, NOW)
    state = updateStudy(state, { action: 'answer', taskId: 'g1-l1', response: '14' }, NOW)
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, id: 'g1-l1', sessionId: 'g1-learn', topic: '进位加法', prompt: '9 + 5 = ?', response: '14', objectiveId: 'm1a-o-carry' } }, NOW + MINUTE)
    state = updateStudy(state, { action: 'stop', sessionId: 'g1-learn', reflection: '' }, NOW + 2 * MINUTE)
    expect(state.attempts.some(item => item.objectiveId === 'm1a-o-carry')).toBe(true)
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
    expect(queryStudy(state, 'elements', 0, { subject: 'chinese', id: 'c2a-o2' })).toMatchObject({ objectives: [expect.objectContaining({ knowledgePoints: expect.arrayContaining([expect.objectContaining({ id: 'c2a-u2-1', facts: expect.arrayContaining([expect.stringContaining('一条帆船')]) })]) })] })
  })

  it('derives a three-rung hint ladder from the method, the registered slip and the question points', () => {
    const state = updateStudy(undefined, setup, NOW)
    const shipped = queryStudy(state, 'elements', 0, { subject: 'math', id: 'm2a-o-sub' }).objectives[0]
    expect(shipped?.hintLadder).toHaveLength(3)
    expect(shipped?.questionPoints.length).toBeGreaterThan(0)
    expect(shipped?.hintLadder[0]).toContain('孩子')
    expect(shipped?.hintLadder[2]).toContain(shipped?.questionPoints[0] ?? '')
    const withSlip = queryStudy(state, 'elements', 0, { subject: 'math' }).objectives.find(item => item.misconceptions.length > 0)
    expect(withSlip?.hintLadder[1]).toContain(withSlip?.misconceptions[0] ?? '')
  })
})

