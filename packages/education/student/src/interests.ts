/** Example tags used when a profile has not saved its own list. */
export const DEFAULT_INTEREST_TAGS = ['购物超市钱', '运动球类', '动物宠物', '故事角色动画', '积木拼搭手工', '美食做饭'] as const

/** One saved tag: 2–16 Han characters, letters or digits, with no spaces. */
export const INTEREST_TAG = /^[\p{Script=Han}A-Za-z0-9]{2,16}$/u

/** Tags the tutor and the desk should use: the saved list, or the examples when none is saved. */
export function interestTagsOf(saved: readonly string[] | undefined): string[] {
  return saved !== undefined && saved.length >= 3 ? [...saved] : [...DEFAULT_INTEREST_TAGS]
}

/**
 * The tag to wrap first today. The Shanghai calendar day rotates through the list so the same scene is not used every day.
 * @param tags - the effective tag list.
 * @param day - `YYYY-MM-DD` in the teaching timezone.
 */
export function interestFocus(tags: readonly string[], day: string): string {
  const list = tags.length > 0 ? tags : DEFAULT_INTEREST_TAGS
  let hash = 0
  for (const char of day) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  return list[hash % list.length] ?? DEFAULT_INTEREST_TAGS[0]
}
