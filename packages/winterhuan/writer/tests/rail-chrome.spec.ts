/** Left-rail chrome prefs: clamp, storage, setWidth / collapse. */
import { expect, it } from 'vitest'
import {
  WRITER_RAIL_DEFAULT_WIDTH,
  WRITER_RAIL_HANDLE_WIDTH,
  WRITER_RAIL_MAX_WIDTH,
  WRITER_RAIL_MIN_WIDTH,
  WRITER_STAGE_MIN_WIDTH,
  clampRailWidth,
  defaultRailChrome,
  fitRailWidth,
  readRailChrome,
  setRailCollapsed,
  setRailWidth,
  writeRailChrome,
} from '../src/client/rail-chrome.ts'

function memoryStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    get length() { return map.size },
    clear() { map.clear() },
    getItem(key: string) { return map.has(key) ? map.get(key)! : null },
    key(index: number) { return [...map.keys()][index] ?? null },
    removeItem(key: string) { map.delete(key) },
    setItem(key: string, value: string) { map.set(key, String(value)) },
  }
}

it('clamps rail width into the usable range', () => {
  expect(clampRailWidth(Number.NaN)).toBe(WRITER_RAIL_DEFAULT_WIDTH)
  expect(clampRailWidth(10)).toBe(WRITER_RAIL_MIN_WIDTH)
  expect(clampRailWidth(9999)).toBe(WRITER_RAIL_MAX_WIDTH)
  expect(clampRailWidth(240.6)).toBe(241)
  expect(defaultRailChrome()).toEqual({ width: WRITER_RAIL_DEFAULT_WIDTH, collapsed: false })
})

it('fits rail width into the desk so the stage is not covered', () => {
  expect(fitRailWidth(220, 0)).toBe(220)
  expect(fitRailWidth(400, 500)).toBe(500 - WRITER_RAIL_HANDLE_WIDTH - WRITER_STAGE_MIN_WIDTH)
  expect(fitRailWidth(220, 500)).toBe(220)
  expect(fitRailWidth(220, WRITER_RAIL_MIN_WIDTH + WRITER_RAIL_HANDLE_WIDTH + WRITER_STAGE_MIN_WIDTH)).toBe(WRITER_RAIL_MIN_WIDTH)
  // Narrow host: keep stage min, allow rail below WRITER_RAIL_MIN_WIDTH.
  expect(fitRailWidth(220, 200)).toBe(200 - WRITER_RAIL_HANDLE_WIDTH - WRITER_STAGE_MIN_WIDTH)
  expect(fitRailWidth(220, 200)).toBeLessThan(WRITER_RAIL_MIN_WIDTH)
  // Extremely narrow: stage min cannot fit — rail takes desk - handle.
  expect(fitRailWidth(220, 100)).toBe(Math.max(0, 100 - WRITER_RAIL_HANDLE_WIDTH))
})

it('reads defaults and persists width plus collapsed', () => {
  const storage = memoryStorage()
  expect(readRailChrome(storage)).toEqual(defaultRailChrome())
  writeRailChrome({ width: 120, collapsed: true }, storage)
  expect(readRailChrome(storage)).toEqual({ width: WRITER_RAIL_MIN_WIDTH, collapsed: true })
  writeRailChrome(setRailWidth(readRailChrome(storage), 320), storage)
  expect(readRailChrome(storage)).toEqual({ width: 320, collapsed: true })
  expect(setRailCollapsed(readRailChrome(storage), false)).toEqual({ width: 320, collapsed: false })
  expect(setRailCollapsed({ width: 320, collapsed: false })).toEqual({ width: 320, collapsed: true })
})

it('ignores corrupt storage payloads', () => {
  const storage = memoryStorage({ 'writer.rail.chrome': '{not-json' })
  expect(readRailChrome(storage)).toEqual(defaultRailChrome())
  storage.setItem('writer.rail.chrome', JSON.stringify({ width: 'wide', collapsed: 'yes' }))
  expect(readRailChrome(storage)).toEqual(defaultRailChrome())
})

it('plugin.css keeps the collapsed rail out of flow and search input shrinkable', async () => {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const css = await readFile(join(here, '../src/client/plugin.css'), 'utf8')
  expect(css).toContain(".writer-desk[data-rail-collapsed='true'] > .writer-rail")
  expect(css).toContain('.writer-rail[hidden]')
  expect(css).toMatch(/\.writer-rail\[hidden\][\s\S]*?display:\s*none/)
  expect(css).toMatch(/\.writer-search-slot\s+input\s*\{[\s\S]*?min-width:\s*0/)
  expect(css).toMatch(/\.writer-search-slot\s+input\s*\{[\s\S]*?width:\s*0/)
  // Fixed track width — minmax(0, var) was the clip bug under a narrow host.
  expect(css).toMatch(/grid-template-columns:\s*var\(--writer-rail-width\)\s+5px\s+minmax\(0,\s*1fr\)/)
  expect(css).not.toMatch(/minmax\(0,\s*var\(--writer-rail-width\)\)/)
  expect(css).toContain('.writer-tab > span')
  expect(css).toMatch(/\.writer-tab\s*>\s*span\s*\{[\s\S]*?text-overflow:\s*ellipsis/)
  expect(css).toMatch(/\.writer-tree-label\s*\{[\s\S]*?flex:\s*1 1 0%/)
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  expect(cssNoComments).not.toMatch(/\.writer-search-slot\s*\{[^}]*max-width:\s*100%/)
})
