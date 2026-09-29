import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const knowledge = resolve(import.meta.dirname, '../knowledge')
const OTHER_HOSTS = /claude|codex|kimi|opencode|openclaw|dashboard/iu
const HOST_METADATA = /(?:^|[\\/])agents[\\/]openai\.yaml$/u

async function bundledFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name === '.DS_Store') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await bundledFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

describe('bundled knowledge', () => {
  it('addresses only DSH, with no other agent host or separate dashboard', async () => {
    const offenders: string[] = []
    for (const path of await bundledFiles(knowledge)) {
      const name = relative(knowledge, path)
      if (HOST_METADATA.test(name) || OTHER_HOSTS.test(name) || OTHER_HOSTS.test(await readFile(path, 'utf8'))) offenders.push(name)
    }
    expect(offenders).toEqual([])
  })
})
