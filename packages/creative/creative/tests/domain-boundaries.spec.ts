import { readFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const domains = ['story', 'short-drama', 'novel-to-game', 'video-recap']
const group = fileURLToPath(new URL('../../', import.meta.url))

async function sources(directory: string): Promise<string[]> {
  const result: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) result.push(...await sources(path))
    else if (/\.tsx?$/u.test(entry.name)) result.push(path)
  }
  return result
}

describe('independently distributable domains', () => {
  it('installs the domain pages without publishing an aggregate browser entry', async () => {
    const manifest = JSON.parse(await readFile(resolve(group, 'creative/package.json'), 'utf8'))
    expect(manifest.dsh).not.toHaveProperty('client')
    expect(manifest.exports).not.toHaveProperty('./client')
    for (const domain of domains) expect(manifest.dependencies).toHaveProperty(`@winterhuan/dsh-${domain}`)
    expect(await readdir(resolve(group, 'creative/src'))).not.toContain('client')
  })
  it.each(domains)('%s neither depends on nor imports a sibling business package', async domain => {
    const root = resolve(group, domain)
    const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
    const forbidden = ['creative', ...domains.filter(name => name !== domain)]
    for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
      for (const name of forbidden) expect(manifest[section] ?? {}).not.toHaveProperty(`@winterhuan/dsh-${name}`)
    }
    for (const file of await sources(resolve(root, 'src'))) {
      const content = await readFile(file, 'utf8')
      for (const match of content.matchAll(/(?:from\s*|import\s*\(?)["']([^"']+)["']/gu)) {
        const specifier = match[1]!
        for (const name of forbidden) expect(specifier, file).not.toMatch(new RegExp(`^@winterhuan/dsh-${name}(?:/|$)`, 'u'))
        if (specifier.startsWith('.')) expect(resolve(dirname(file), specifier), file).toMatch(new RegExp(`^${root}/`, 'u'))
      }
    }
  })
})
