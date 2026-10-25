import type { InsightReason } from '../learning/mastery.ts'
import type { Translate } from './locales.ts'

/** Shared subject order for the workbench. */
export const subjects = ['chinese', 'math', 'english'] as const
/** One workbench subject. */
export type Subject = typeof subjects[number]
/** Stored learning mode. Sync practice is recorded as school or foundation. */
export type Mode = 'foundation' | 'school' | 'review' | 'explore' | 'diagnose'
/** The subject and mode the learner is about to start. */
export type Activity = { subject: Subject; mode: Mode }
/** Optional grade, term or unit for one block. */
export type ScopeChoice = { grade?: number; term?: 'first' | 'second'; unit?: string }

export const levelKeys = { due: 'levelDue', weak: 'levelWeak', stalled: 'levelStalled', mastered: 'levelMastered', practising: 'levelPractising', untouched: 'levelUntouched' } as const
export const reasonKeys = { 'due-mistakes': 'reasonDue', 'open-mistakes': 'reasonOpen', 'recent-help-or-error': 'reasonRecent', 'recurring-error': 'reasonRecurring', 'not-practised-recently': 'reasonStalled', 'not-started': 'reasonNew', 'diagnosis-due': 'reasonDiagnose', preview: 'reasonPreview', 'school-pace': 'reasonSchoolPace', 'needs-teaching': 'reasonTeaching', 'prerequisite-gap': 'reasonPrerequisite' } as const
export const planKeys = { review: 'recommendReview', practice: 'recommendPractice', diagnose: 'recommendDiagnose', learn: 'recommendLearn', preview: 'recommendPreview', hold: 'recommendHold' } as const
export const intensityKeys = { light: 'intensityLight', standard: 'intensityStandard', deep: 'intensityDeep' } as const
export const intensityHelpKeys = { light: 'intensityLightHelp', standard: 'intensityStandardHelp', deep: 'intensityDeepHelp' } as const
export const sampleKeys = { untouched: 'sampleUntouched', stalled: 'sampleStalled', recheck: 'sampleRecheck', progress: 'sampleProgress' } as const
export const assistKeys = { independent: 'assistIndependent', hint: 'assistHint', 'worked-example': 'assistWorked' } as const
export const focusKeys = { literacy: 'focusLiteracy', pinyin: 'focusPinyin', reading: 'focusReading', writing: 'focusWriting', concepts: 'focusConcepts', calculation: 'focusCalculation', geometry: 'focusGeometry', measurement: 'focusMeasurement', words: 'focusWords', sentences: 'focusSentences', story: 'focusStory', listen: 'focusListen', project: 'focusProject', review: 'focusReview' } as const
export const reminderKeys = { 'first-explain': 'remindFirst', 'after-correction': 'remindAfterFix', 'before-next': 'remindNext' } as const

/** Remaining time as m:ss. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Local calendar date, or an empty string when unknown. */
export function day(ms: number | undefined): string {
  return ms === undefined ? '' : new Date(ms).toLocaleDateString()
}

/** One line of evidence reasons for a goal or recommendation. */
export function reasonText(reasons: InsightReason[], t: Translate): string {
  return reasons.map(reason => reason.code === 'not-started' || reason.code === 'preview' || reason.code === 'school-pace' || reason.code === 'needs-teaching' ? t(reasonKeys[reason.code]) : `${t(reasonKeys[reason.code])} ${reason.count}`).join(' · ')
}
