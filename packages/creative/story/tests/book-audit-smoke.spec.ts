import { existsSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { BOOK_AUDIT_SCHEMA } from '../src/core/audit.ts'

const book = process.env.SHENJI_BOOK
const entry = new URL('../src/cli.ts', import.meta.url)
const loader = import.meta.resolve('tsx')

describe('book audit smoke', () => {
  it.skipIf(book === undefined || book === '')('reads chapters 1-12 when SHENJI_BOOK is set', async () => {
    expect(book !== undefined && existsSync(book)).toBe(true)
    const result = await execa(process.execPath, [
      '--import', loader, entry, 'book', 'audit',
      '--workspace', dirname(book ?? ''), '--book', basename(book ?? ''),
      '--from', '1', '--to', '12', '--json',
    ], { reject: false })
    expect(result.exitCode === 0 || result.exitCode === 1, result.stderr).toBe(true)
    const payload = JSON.parse(result.stdout) as { schema?: string; range?: { from: number; to: number } }
    expect(payload.schema).toBe(BOOK_AUDIT_SCHEMA)
    expect(payload.range).toEqual({ from: 1, to: 12 })
  })
})
