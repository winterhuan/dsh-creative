import { expect, it } from 'vitest'
import type { DirEntry } from '../src/client/library.ts'
import {
  MAX_SEARCH_DEPTH,
  MAX_SEARCH_NODES,
  MAX_SEARCH_RESULTS,
  SEARCH_DEBOUNCE_MS,
  searchWriterFilenames,
  writerSearchTruncationMessage,
} from '../src/client/search.ts'

function dirTree(map: Record<string, DirEntry[]>): (path: string) => Promise<{ entries: readonly DirEntry[], truncated: boolean }> {
  return async (path) => {
    const key = path === '.' ? '' : path
    const entries = map[key]
    if (entries === undefined) throw new Error(`missing ${key || '.'}`)
    return { entries, truncated: false }
  }
}

it('matches filenames under the active tab with Dashboard limits', async () => {
  expect(MAX_SEARCH_RESULTS).toBe(100)
  expect(MAX_SEARCH_NODES).toBe(5000)
  expect(MAX_SEARCH_DEPTH).toBe(20)
  expect(SEARCH_DEBOUNCE_MS).toBe(180)

  const listDir = dirTree({
    novel: [
      { name: '设定', type: 'directory' },
      { name: '正文', type: 'directory' },
      { name: 'meta.json', type: 'file' },
    ],
    'novel/设定': [{ name: '世界观.md', type: 'file' }],
    'novel/正文': [
      { name: '第001章.md', type: 'file' },
      { name: 'notes.txt', type: 'file' },
      { name: 'cover.png', type: 'file', size: 12 },
    ],
  })

  const hit = await searchWriterFilenames(['novel'], '章', listDir)
  expect(hit.results.map(item => item.path)).toEqual(['novel/正文/第001章.md'])
  expect(hit.results[0]?.editable).toBe(true)
  expect(hit.truncated).toBe(false)

  const png = await searchWriterFilenames(['novel'], 'cover', listDir)
  expect(png.results).toHaveLength(1)
  expect(png.results[0]?.editable).toBe(false)

  const none = await searchWriterFilenames(['novel'], '没有这个', listDir)
  expect(none.results).toEqual([])
})

it('truncates when result cap is hit and formats hints', async () => {
  const many: DirEntry[] = Array.from({ length: 120 }, (_, index) => ({
    name: `hit${String(index).padStart(3, '0')}.md`,
    type: 'file' as const,
  }))
  const listDir = dirTree({ book: many })
  const result = await searchWriterFilenames(['book'], 'hit', listDir)
  expect(result.results).toHaveLength(MAX_SEARCH_RESULTS)
  expect(result.truncation.byResults).toBe(true)
  expect(result.truncated).toBe(true)
  const message = writerSearchTruncationMessage(result.truncation, result.limits, result.scanErrors, String)
  expect(message).toContain(String(MAX_SEARCH_RESULTS))
})
