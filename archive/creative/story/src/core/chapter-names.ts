/**
 * Chapter file stems shared by claims, audits, tracking records and summaries.
 *
 * The width is at least three digits and never truncates a longer chapter number.
 * `String(n).padStart(3, '0')` is the same string.
 */

/**
 * Zero-pad a chapter number to at least three digits.
 * @param chapter - the chapter number. Callers that require a positive integer check that themselves.
 * @returns the digit string used inside `第NNN章`.
 */
export function paddedChapterNumber(chapter: number): string {
  return String(chapter).padStart(3, '0')
}
