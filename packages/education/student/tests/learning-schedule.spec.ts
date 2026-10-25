import { describe, expect, it, vi } from 'vitest'
import { updateStudy } from '../src/learning/update/index.ts'
import { studyStatus } from '../src/learning/status.ts'
import { queryStudy } from '../src/store.ts'
import { studyDay } from '../src/learning/shared.ts'
import { stateSchema } from '../src/schema.ts'
import { NOW, MINUTE, DAY, setup, start, attempt, mistake, confirm } from './fixtures.ts'

const dueDay = (from: number, days = 1) => Date.parse(`${studyDay(from + days * DAY)}T00:00:00+08:00`)

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
    state = updateStudy(state, { action: 'record', attempt: { ...attempt, sessionId: 'early', mistakeId: mistake.id } }, NOW + 6 * MINUTE)
    expect(state.mistakes[0]).toMatchObject({ stage: 1, dueAt: dueDay(NOW, 3) })
  })

  it('extends independent reviews on any day and only shortens the next review for helped answers', () => {
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
    expect(state.mistakes[0]).toMatchObject({ stage: 3, dueAt: at + DAY })
    expect(studyStatus(state, at + MINUTE).progress[0]).toMatchObject({ level: 'independent-on-three-days', independentDays: expect.any(Array) })
    expect(studyStatus(state, at + MINUTE).progress[0]?.independentDays).toHaveLength(3)
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

