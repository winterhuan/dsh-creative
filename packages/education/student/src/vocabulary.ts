/**
 * Subject-scoped learning vocabularies shared by the host schemas and the workbench.
 *
 * Kept free of schema dependencies so client code can import the lists without pulling zod.
 * @module @winterhuan/dsh-student/vocabulary
 */

/** Error causes offered for math mistakes. */
export const mathErrorTypes = ['carry-borrow', 'place-value', 'operation-choice', 'calculation', 'unit-quantity', 'reading-task', 'pattern', 'geometry-feature', 'money-measure', 'reasoning-incomplete'] as const
/** Error causes offered for Chinese mistakes. */
export const chineseErrorTypes = ['pinyin-tone', 'character-form', 'character-usage', 'word-meaning', 'reading-evidence', 'order', 'expression-incomplete', 'punctuation', 'listening'] as const
/** Error causes offered for English mistakes. */
export const englishErrorTypes = ['spelling', 'word-meaning', 'word-form', 'sentence-pattern', 'usage-context', 'listening', 'spoken-response', 'writing-complete'] as const
/** Every error-cause value across the three subjects. */
export type ErrorTypeValue = (typeof mathErrorTypes)[number] | (typeof chineseErrorTypes)[number] | (typeof englishErrorTypes)[number]
/** Error causes offered for one subject; the parent can change any classification. */
export const errorTypesBySubject: Record<'chinese' | 'math' | 'english', readonly ErrorTypeValue[]> = {
  math: mathErrorTypes, chinese: chineseErrorTypes, english: englishErrorTypes,
}

/** Daily-practice focuses offered for Chinese units. */
export const chineseFocus = ['literacy', 'pinyin', 'reading', 'writing', 'review'] as const
/** Daily-practice focuses offered for math units. */
export const mathFocus = ['concepts', 'calculation', 'geometry', 'measurement', 'review'] as const
/** Daily-practice focuses offered for English units. */
export const englishFocus = ['words', 'sentences', 'story', 'listen', 'project', 'review'] as const
/** Every daily-practice focus value. */
export type UnitFocusValue = (typeof chineseFocus)[number] | (typeof mathFocus)[number] | (typeof englishFocus)[number]
/** Daily-practice focuses offered for one subject's units. */
export const focusBySubject: Record<'chinese' | 'math' | 'english', readonly UnitFocusValue[]> = {
  chinese: chineseFocus, math: mathFocus, english: englishFocus,
}
