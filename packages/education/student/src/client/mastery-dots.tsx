import type { Translate } from './locales.ts'

/** Three dots showing independent-correct days toward mastery (n of 3); undefined hides the row. */
export function MasteryDots({ days, t }: { days: number | undefined; t: Translate }) {
  if (days === undefined) return null
  const lit = Math.min(3, days)
  return <p className="student-mastery" aria-label={`${t('masteryProgress')} ${lit}/3`}>{[0, 1, 2].map(index => <span key={index} className={index < lit ? 'student-level-mastered' : 'student-level-untouched'} />)}</p>
}
