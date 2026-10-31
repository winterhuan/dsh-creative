/** Left-rail chrome prefs: clamp, storage, setWidth / collapse. */
import { expect, it } from 'vitest'
import {
  WRITER_RAIL_DEFAULT_WIDTH,
  WRITER_RAIL_MAX_WIDTH,
  WRITER_RAIL_MIN_WIDTH,
  clampRailWidth,
  defaultRailChrome,
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
