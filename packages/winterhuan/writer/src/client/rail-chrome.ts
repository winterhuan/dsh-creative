/** Chrome prefs for the writing left rail: width and collapsed (localStorage only). */

export const WRITER_RAIL_STORAGE_KEY = 'writer.rail.chrome'
export const WRITER_RAIL_MIN_WIDTH = 180
export const WRITER_RAIL_MAX_WIDTH = 480
export const WRITER_RAIL_DEFAULT_WIDTH = 220
/** Resize handle column width (must match plugin.css). */
export const WRITER_RAIL_HANDLE_WIDTH = 5
/** Minimum stage column so the editor is still usable beside the rail. */
export const WRITER_STAGE_MIN_WIDTH = 160

export interface WriterRailChrome {
  width: number
  collapsed: boolean
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Clamp a proposed rail width into the usable range.
 * @param width - raw pixel width from drag or storage.
 * @returns integer px within min/max (or the default when not finite).
 */
export function clampRailWidth(width: number): number {
  if (!Number.isFinite(width)) return WRITER_RAIL_DEFAULT_WIDTH
  return Math.min(WRITER_RAIL_MAX_WIDTH, Math.max(WRITER_RAIL_MIN_WIDTH, Math.round(width)))
}

/**
 * Cap a preferred rail width so rail + handle (+ stage min when possible) fit
 * inside the desk. The CSS rail track is a *fixed* `var(--writer-rail-width)`
 * (not minmax(0, …)) with `overflow:hidden` on the desk — if the track is
 * wider than the visible desk, the right side of the rail is clipped while
 * the left Tab (`拆文库`) keeps its full layout width (looks like it "won't
 * shrink" while `写作项目` is covered). So this may drop *below*
 * {@link WRITER_RAIL_MIN_WIDTH} on a narrow host: equal Tab columns then
 * ellipsis together instead of mid-glyph clipping. Manual drag still clamps
 * to min via {@link clampRailWidth}.
 * @param preferred - stored or dragged width (will be clamped first).
 * @param deskWidth - `.writer-desk` clientWidth in CSS px.
 * @returns width to apply as `--writer-rail-width` (≤ desk − handle when desk > 0).
 */
export function fitRailWidth(preferred: number, deskWidth: number): number {
  const width = clampRailWidth(preferred)
  if (!Number.isFinite(deskWidth) || deskWidth <= 0) return width
  const maxWithStage = deskWidth - WRITER_RAIL_HANDLE_WIDTH - WRITER_STAGE_MIN_WIDTH
  // Keep stage floor when anything positive remains for the rail.
  if (maxWithStage > 0) return Math.min(width, Math.round(maxWithStage))
  // Extremely narrow: stage min cannot fit — rail takes desk − handle (may be 0).
  return Math.max(0, Math.round(deskWidth - WRITER_RAIL_HANDLE_WIDTH))
}

/**
 * Default chrome when nothing is stored or storage is unusable.
 * @returns default width and expanded rail.
 */
export function defaultRailChrome(): WriterRailChrome {
  return { width: WRITER_RAIL_DEFAULT_WIDTH, collapsed: false }
}

function safeStorage(): StorageLike | undefined {
  try {
    if (typeof globalThis === 'undefined') return undefined
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage
    return storage
  } catch {
    return undefined
  }
}

/**
 * Read persisted rail chrome; invalid or missing values fall back to defaults.
 * @param storage - optional storage (tests); defaults to `localStorage`.
 * @returns clamped width and collapsed flag.
 */
export function readRailChrome(storage: StorageLike | undefined = safeStorage()): WriterRailChrome {
  const fallback = defaultRailChrome()
  if (storage === undefined) return fallback
  try {
    const raw = storage.getItem(WRITER_RAIL_STORAGE_KEY)
    if (raw === null || raw === '') return fallback
    const parsed = JSON.parse(raw) as Partial<WriterRailChrome>
    return {
      width: clampRailWidth(typeof parsed.width === 'number' ? parsed.width : fallback.width),
      collapsed: parsed.collapsed === true,
    }
  } catch {
    return fallback
  }
}

/**
 * Persist rail chrome (width always clamped).
 * @param chrome - next prefs.
 * @param storage - optional storage (tests); defaults to `localStorage`.
 */
export function writeRailChrome(
  chrome: WriterRailChrome,
  storage: StorageLike | undefined = safeStorage(),
): void {
  if (storage === undefined) return
  const next: WriterRailChrome = {
    width: clampRailWidth(chrome.width),
    collapsed: chrome.collapsed === true,
  }
  try {
    storage.setItem(WRITER_RAIL_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota / private mode — chrome still works in-memory for the session.
  }
}

/**
 * Apply a new width while keeping the collapsed flag.
 * @param chrome - current prefs.
 * @param width - proposed width.
 * @returns updated chrome with clamped width.
 */
export function setRailWidth(chrome: WriterRailChrome, width: number): WriterRailChrome {
  return { ...chrome, width: clampRailWidth(width) }
}

/**
 * Toggle or set collapsed without changing width.
 * @param chrome - current prefs.
 * @param collapsed - next collapsed flag; omit to flip.
 * @returns updated chrome.
 */
export function setRailCollapsed(
  chrome: WriterRailChrome,
  collapsed?: boolean,
): WriterRailChrome {
  return {
    ...chrome,
    collapsed: collapsed === undefined ? !chrome.collapsed : collapsed === true,
  }
}
