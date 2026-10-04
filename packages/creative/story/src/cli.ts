#!/usr/bin/env node
/** Packaged command entry; Python owns command parsing and domain operations. */
import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const grouped = process.platform !== 'win32'
const child = spawn('python3', ['-B', resolve(dirname(fileURLToPath(import.meta.url)), '../runtime/cli.py'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  detached: grouped,
  env: { ...process.env, DSH_STORY_NODE: process.execPath },
})
let interrupted: NodeJS.Signals | undefined
const forward = (signal: NodeJS.Signals): void => {
  interrupted = signal
  if (child.pid === undefined) return
  try {
    if (grouped) process.kill(-child.pid, signal)
    else child.kill(signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}
const terminate = (): void => forward('SIGTERM')
const interrupt = (): void => forward('SIGINT')
process.on('SIGTERM', terminate)
process.on('SIGINT', interrupt)
child.on('error', (error) => {
  process.stdout.write(`${JSON.stringify({ schema: 'story-cli-error/v1', error_code: 'PYTHON_UNAVAILABLE', message: error.message })}\n`)
  process.exitCode = 2
})
child.on('close', (code, signal) => {
  process.removeListener('SIGTERM', terminate)
  process.removeListener('SIGINT', interrupt)
  const endedBy = interrupted ?? signal
  process.exitCode = endedBy === null || endedBy === undefined
    ? process.exitCode ?? code ?? 2
    : 128 + constants.signals[endedBy]
})
