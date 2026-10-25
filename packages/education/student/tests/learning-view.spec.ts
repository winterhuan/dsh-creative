import { describe, expect, it, vi } from 'vitest'
import { updateStudy } from '../src/learning/update/index.ts'
import { queryStudy } from '../src/store.ts'
import { NOW, MINUTE, DAY, setup, start, attempt, mistake, confirm } from './fixtures.ts'

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
    expect(state.mistakes[0]).toMatchObject({ stage: 4, dueAt: at('2026-12-05T00:00:00+08:00') })
    vi.restoreAllMocks()
  })

  it('credits an early independent answer and keeps the stage after a wrong answer', () => {
    let state = linked()
    const at = (iso: string) => Date.parse(iso)
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('e1') }, at('2026-10-11T09:00:00+08:00'))
    state = updateStudy(state, mark('e1', 'correct'), at('2026-10-11T09:00:00+08:00'))
    expect(state.mistakes[0]).toMatchObject({ stage: 1, dueAt: at('2026-10-14T00:00:00+08:00') })
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('e2') }, at('2026-10-13T09:00:00+08:00'))
    state = updateStudy(state, mark('e2', 'correct'), at('2026-10-13T09:00:00+08:00'))
    expect(state.mistakes[0]).toMatchObject({ stage: 2, dueAt: at('2026-10-20T00:00:00+08:00') })
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('e3') }, at('2026-10-19T09:00:00+08:00'))
    state = updateStudy(state, mark('e3', 'incorrect'), at('2026-10-19T09:00:00+08:00'))
    expect(state.mistakes[0]).toMatchObject({ stage: 2, dueAt: at('2026-10-20T00:00:00+08:00') })
    state = updateStudy(state, { action: 'worksheet', worksheet: reviewSheet('e4') }, at('2026-10-20T09:00:00+08:00'))
    state = updateStudy(state, mark('e4', 'correct'), at('2026-10-20T09:00:00+08:00'))
    expect(state.mistakes[0]).toMatchObject({ stage: 3, dueAt: at('2026-11-03T00:00:00+08:00') })
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


describe('review-sheet variant floor', () => {
  it('raises a stage-zero pick to a context variant when the goal carries a recurring error cause', () => {
    let state = updateStudy(undefined, setup, NOW - DAY)
    for (const id of ['error-a', 'error-b']) {
      state = updateStudy(state, { action: 'mistake', mistake: { ...mistake, id, objectiveId: 'm2a-o-sub', errorType: 'carry-borrow', uncertainties: '' } }, NOW - DAY)
      state = updateStudy(state, { action: 'confirm-mistake', id, prompt: mistake.prompt, correction: '15', explanation: '退位', answerEvidence: 'evidence', userConfirmation: '家长确认' }, NOW - DAY)
    }
    const plan = queryStudy(state, 'review-sheet', 0, { subject: 'math' })
    expect(plan.picks.length).toBeGreaterThanOrEqual(2)
    for (const pick of plan.picks.filter(item => item.objectiveId === 'm2a-o-sub')) expect(pick.variantLevel).toBe('context')
  })
})
