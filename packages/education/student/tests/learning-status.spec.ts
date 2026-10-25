import { describe, expect, it } from 'vitest'
import { studyInsight } from '../src/learning/mastery.ts'
import { weeklySummary } from '../src/learning/status.ts'
import { updateStudy } from '../src/learning/update/index.ts'
import { NOW, MINUTE, setup, start } from './fixtures.ts'

describe('weekly summary', () => {
  it('counts minutes per day, active days and empty flows on a quiet week', () => {
    const state = updateStudy(updateStudy(undefined, setup, NOW), start, NOW)
    const stopped = updateStudy(state, { action: 'stop', sessionId: start.id, reflection: '' }, NOW + 10 * MINUTE)
    const weekly = weeklySummary(stopped, NOW + 11 * MINUTE, studyInsight(stopped, NOW + 11 * MINUTE))
    expect(weekly.minutesByDay).toHaveLength(7)
    expect(weekly.minutesByDay.at(-1)?.minutes).toBe(10)
    expect(weekly.activeDays).toBe(1)
    expect(weekly.practisedGoals).toBe(0)
    expect(weekly.masteredGoals).toBe(0)
    expect(weekly.newMistakes).toBe(0)
    expect(weekly.dueCompletion).toEqual({ done: 0, total: 0 })
    expect(weekly.errorCauses).toEqual([])
  })
})
