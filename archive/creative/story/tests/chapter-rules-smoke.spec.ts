import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHAPTER_RULES_SCHEMA, extractChapterRules } from '../src/core/rules.ts'

const book = process.env.SHENJI_BOOK
const chapter = Number(process.env.SHENJI_CHAPTER ?? '1')

describe('chapter rules smoke', () => {
  it.skipIf(book === undefined || book === '')('reads one local book when SHENJI_BOOK is set', () => {
    expect(book !== undefined && existsSync(book)).toBe(true)
    const result = extractChapterRules(book ?? '', Number.isInteger(chapter) && chapter >= 1 ? chapter : 1)
    expect(result.schema).toBe(CHAPTER_RULES_SCHEMA)
    expect(Array.isArray(result.rules)).toBe(true)
    expect(result.rules_sha256).toMatch(/^[0-9a-f]{64}$/u)
  })
})
