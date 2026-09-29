import { describe, expect, it } from 'vitest'
import { WorkspaceVerificationTracker } from '../src/game-verification.js'

describe('workspace game QA freshness', () => {
  it('does not pretend an imported QA record is bound to the current preview', () => {
    const tracker = new WorkspaceVerificationTracker()
    expect(tracker.observe('session:game', 'qa-v1', 'build-v1')).toEqual({ binding: 'UNBOUND' })
    expect(tracker.observe('session:game', 'qa-v1', 'build-v2')).toEqual({ binding: 'UNBOUND' })
  })

  it('binds a QA rewrite and marks later preview changes stale', () => {
    const tracker = new WorkspaceVerificationTracker()
    expect(tracker.observe('session:game', undefined, 'build-v1')).toEqual({ binding: 'UNBOUND' })
    expect(tracker.observe('session:game', 'qa-v1', 'build-v1')).toEqual({
      binding: 'CURRENT',
      verifiedPreviewVersion: 'build-v1',
    })
    expect(tracker.observe('session:game', 'qa-v1', 'build-v2')).toEqual({
      binding: 'STALE',
      verifiedPreviewVersion: 'build-v1',
    })
    expect(tracker.observe('session:game', 'qa-v2', 'build-v2')).toEqual({
      binding: 'CURRENT',
      verifiedPreviewVersion: 'build-v2',
    })
  })
})

// The key is returned only to the trusted runner; edited workspace JSON must reauthenticate.
import { createHash, createHmac } from 'node:crypto'
import { gameQaEnvironment, validateGameEvidence } from '../src/game-verification.ts'

it('accepts only an authenticated complete run whose evidence and build still exist', async () => {
  const key = gameQaEnvironment('/workspace', 'session').DSH_GAME_QA_KEY!
  const bytes = Buffer.from('render evidence')
  const file = { path: 'game-adaptations/test/qa/trace.json', sha256: createHash('sha256').update(bytes).digest('hex') }
  const names = ['launch', 'render', 'input', 'coreLoop', 'outcome', 'restart']
  const command = ['node', 'game-qa/scripts/run-qa.mjs', 'game-adaptations/test']
  const record = { driver: 'chrome-cdp-v1', status: 'PASS', checks: Object.fromEntries(names.map(name => [name, 'PASS'])), completeRun: { command, exitCode: 0 }, evidence: [file], buildFiles: [file], suites: Object.fromEntries(names.map(name => [name, { command, exitCode: 0, evidence: [file.path] }])) }
  const signed = (value: object) => {
    const payload = JSON.stringify(value)
    return { ...value, attestation: { payload, signature: createHmac('sha256', key).update(payload).digest('hex') } }
  }
  expect(await validateGameEvidence(record, async () => bytes)).toBe(false)
  expect(await validateGameEvidence(signed(record), async () => bytes)).toBe(true)
  expect(await validateGameEvidence(signed(record), async () => bytes, [file.path])).toBe(true)
  expect(await validateGameEvidence(signed(record), async () => bytes, [file.path, 'game-adaptations/test/build/app/added.js'])).toBe(false)
  expect(await validateGameEvidence(signed(record), async () => { throw new Error('missing') })).toBe(false)
  expect(await validateGameEvidence(signed(record), async () => Buffer.from('new build'))).toBe(false)
  expect(await validateGameEvidence(signed({ ...record, checks: { ...record.checks, render: 'FAIL' } }), async () => bytes)).toBe(false)
  expect(await validateGameEvidence(signed({ ...record, evidence: [{ ...file, path: '../escape' }] }), async () => bytes)).toBe(false)
  expect(await validateGameEvidence({ ...signed(record), status: 'FAIL' }, async () => bytes)).toBe(false)
})
