/**
 * Run one generated Ego program under real Node semantics.
 *
 * The transport's spill branch uses `await import("node:fs/promises")`, which a
 * Vitest VM context rejects without a dynamic-import callback. Running the
 * program in a child process keeps the test faithful to the runtime the
 * transport actually targets.
 *
 * Usage: node run-ego-program.mjs <input.json>
 * Input: { script: string, value?: unknown, pages?: 'default' | 'none' }
 * Output: { lines: string[], error?: string }
 */
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const lines = []

const page = {
  label: 'p1',
  goto: async () => ({}),
  url: async () => 'https://example.test/',
  evaluate: async () => input.value,
}
const task = {
  spaceId: 7,
  pages: async () => (input.pages === 'none' ? [] : [page]),
  newPage: async () => ({ ...page, label: 'p2' }),
  handOff: async () => {},
  finish: async () => ({ finished: true }),
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
try {
  await new AsyncFunction('taskSpace', 'console', input.script)(
    async () => task,
    { log: (line) => lines.push(line) },
  )
  process.stdout.write(JSON.stringify({ lines }))
} catch (error) {
  process.stdout.write(JSON.stringify({ lines, error: String(error && error.message ? error.message : error) }))
  process.exitCode = 1
}
