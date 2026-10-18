import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RULE_AUDIT_VERIFY_SCHEMA, ruleAuditRelativePath, verifyRuleAudit } from '../src/core/rule-audit.ts'

const book = process.env.SHENJI_BOOK
const chapter = Number(process.env.SHENJI_CHAPTER ?? '1')

describe('rule audit smoke', () => {
  it.skipIf(book === undefined || book === '')('reads one local chapter when SHENJI_BOOK is set', () => {
    expect(book !== undefined && existsSync(book)).toBe(true)
    const selected = Number.isInteger(chapter) && chapter >= 1 ? chapter : 1
    const result = verifyRuleAudit(book ?? '', selected, join(book ?? '', ruleAuditRelativePath(selected)))
    expect(result.schema).toBe(RULE_AUDIT_VERIFY_SCHEMA)
    if (result.verified) expect(result.chapter).toBe(selected)
    else expect(result.reasons.length).toBeGreaterThan(0)
  })
})
