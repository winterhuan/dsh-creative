/** The writing host injects the cover API endpoint settings as environment variables. */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, onTestFinished } from 'vitest'
import { apply } from '../src/index.ts'

const INJECTED = [
  'DSH_WRITER_SKILL_MOUNT',
  'WRITER_ZHUQUE_KEY_ENV',
  'WRITER_COVER_KEY_ENV',
  'GPT_IMAGE_BASE_URL',
] as const

/** @returns the current values of every variable the host touches. */
function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(INJECTED.map(name => [name, process.env[name]]))
}

/** @param snapshot - put every tracked variable back. */
function restoreEnv(snapshot: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

describe('writer host env injection', () => {
  it('injects the configured base URL, trimmed', () => {
    const before = snapshotEnv()
    onTestFinished(() => restoreEnv(before))
    delete process.env.GPT_IMAGE_BASE_URL
    const context = new Context()
    onTestFinished(async () => { await context.fiber.dispose() })
    apply(context, { gptImageBaseUrl: ' https://proxy.example/v1 ' })
    expect(process.env.GPT_IMAGE_BASE_URL).toBe('https://proxy.example/v1')
    expect(context.writerHost.gptImageBaseUrl).toBe('https://proxy.example/v1')
  })

  it('leaves a shell-exported base URL alone when the setting is blank', async () => {
    const before = snapshotEnv()
    onTestFinished(() => restoreEnv(before))
    process.env.GPT_IMAGE_BASE_URL = 'https://shell.example/v1'
    const context = new Context()
    apply(context, { gptImageBaseUrl: '   ' })
    expect(process.env.GPT_IMAGE_BASE_URL).toBe('https://shell.example/v1')
    await context.fiber.dispose()
    expect(process.env.GPT_IMAGE_BASE_URL).toBe('https://shell.example/v1')
  })

  it('restores the previous base URL on dispose', async () => {
    const before = snapshotEnv()
    onTestFinished(() => restoreEnv(before))
    delete process.env.GPT_IMAGE_BASE_URL
    const context = new Context()
    apply(context, { gptImageBaseUrl: 'https://proxy.example/v1' })
    expect(process.env.GPT_IMAGE_BASE_URL).toBe('https://proxy.example/v1')
    await context.fiber.dispose()
    expect(process.env.GPT_IMAGE_BASE_URL).toBeUndefined()
  })
})
