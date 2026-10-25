import { DAY, studyDay } from './shared.ts'
import type { StudyState } from '../schema.ts'

const REVIEW_DAYS = [1, 3, 7, 14, 30]

/** Midnight in the teaching timezone that starts the given calendar day. */
export function dayStart(day: string): number { return Date.parse(`${day}T00:00:00+08:00`) }

/**
 * Replay every confirmed mistake's review evidence: answers that cite it and paper results on items that cite it.
 * A mistake is due from the calendar day after confirmation or after the last wrong answer, not at a clock time.
 * Wrong, partial or helped answers keep the stage and only make it due again the next day. An independent correct
 * answer on any day, earlier than the due day included, advances it at most once per day; the next due day counts
 * from that answer.
 * Stage 4 (a 30-day interval) is consolidated.
 */
export function scheduleMistakes(state: StudyState): StudyState {
  const evidence = new Map<string, { at: number; result: string; assistance: string }[]>()
  const add = (mistakeId: string | undefined, at: number, result: string, assistance: string) => {
    if (!mistakeId) return
    evidence.set(mistakeId, [...evidence.get(mistakeId) ?? [], { at, result, assistance }])
  }
  for (const attempt of state.attempts) add(attempt.mistakeId, attempt.at, attempt.result, attempt.assistance)
  const sheets = new Map(state.worksheets.map(sheet => [sheet.id, sheet]))
  for (const result of state.paperResults) add(sheets.get(result.worksheetId)?.items.find(item => item.id === result.itemId)?.mistakeId, result.receivedAt, result.result, result.assistance)
  for (const mistake of state.mistakes) {
    if (mistake.confirmedAt === undefined) continue
    const confirmedAt = mistake.confirmedAt
    let stage = 0
    let days: string[] = []
    let wrongs = 0
    let due = studyDay(confirmedAt + DAY)
    for (const item of (evidence.get(mistake.id) ?? []).filter(entry => entry.at >= confirmedAt).sort((a, b) => a.at - b.at)) {
      if (item.result === 'unassessed' || item.result === 'stuck') continue
      const day = studyDay(item.at)
      if (item.result !== 'correct' || item.assistance !== 'independent') {
        // A repeated wrong or helped answer waits an extra day; one slip only resets to the next day.
        wrongs += 1
        due = studyDay(item.at + (wrongs >= 2 ? 2 : 1) * DAY)
        continue
      }
      if (days.includes(day)) continue
      days = [...days, day]
      stage = Math.min(4, stage + 1)
      due = studyDay(item.at + (REVIEW_DAYS[stage] ?? 1) * DAY)
    }
    mistake.stage = stage
    mistake.independentDays = days
    mistake.dueAt = dayStart(due)
  }
  return state
}
