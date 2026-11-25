/** Export explicitly selected Wiki articles into portable, public-only snapshots. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dump } from 'js-yaml'
import { date, parseDocument, record, renderArticle, slug, string, tags } from './content.ts'
import type { Post } from './content.ts'

/** Read a selected file only when its real path stays inside an allowed Wiki subtree. */
export async function wikiFile(wiki: string, path: string, asset = false): Promise<Buffer> {
  const root = await realpath(wiki)
  const segments = path.split(/[\\/]/)
  if (isAbsolute(path) || segments.some(part => !part || part.startsWith('.'))
    || segments[0] !== 'notes' || segments.some(part => ['materials', 'preferences', 'raw', '_meta'].includes(part))
    || (asset && segments[1] !== 'assets') || (!asset && !path.endsWith('.md'))) throw new Error(`Unpublishable source path: ${path}`)
  const file = await realpath(resolve(root, path))
  const inside = relative(root, file)
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error(`Source escapes Wiki: ${path}`)
  const actual = inside.split(sep)
  if (actual[0] !== 'notes' || actual.some(part => part.startsWith('.') || ['materials', 'preferences', 'raw', '_meta'].includes(part))
    || (asset && actual[1] !== 'assets')) throw new Error(`Source resolves to unpublished material: ${path}`)
  return readFile(file)
}

/** Build all selected snapshots before replacing the existing export; never mutate the Wiki. */
export async function syncWiki(root: string, wiki: string): Promise<number> {
  const manifest: unknown = JSON.parse(await readFile(resolve(root, 'publications.json'), 'utf8'))
  if (!Array.isArray(manifest)) throw new Error('publications.json must be an array')
  const posts: Post[] = []
  const assets = new Map<string, Buffer>()
  for (const item of manifest) {
    const selection = record(item)
    const source = string(selection.source, 'source')
    const { data, body } = parseDocument((await wikiFile(wiki, source)).toString('utf8'))
    if (data.sample === true || String(data.id ?? '').startsWith('seed_') || data.draft === true
      || data.private === true || data.published === false || data.publish === false
      || ['private', 'draft', 'idea', 'outline'].includes(String(data.status)) || data.visibility === 'private') {
      throw new Error(`Draft, sample or private content cannot be exported: ${source}`)
    }
    if (body.replace(/\s/g, '').length < 200) throw new Error(`Article is incomplete; review before publishing: ${source}`)
    const post: Post = { slug: slug(selection.slug), title: string(data.title, 'title'),
      date: date(data.createdAt ?? data.created, 'created date'), updated: date(data.updatedAt ?? data.updated, 'updated date'),
      tags: tags(selection.tags), description: string(selection.description, 'description'), body }
    if (posts.some(previous => previous.slug === post.slug)) throw new Error(`Duplicate slug: ${post.slug}`)
    if (selection.cover !== undefined) {
      const cover = string(selection.cover, 'cover')
      const extension = extname(cover).toLowerCase()
      if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) throw new Error(`Unsupported cover: ${cover}`)
      const bytes = await wikiFile(wiki, cover, true)
      post.cover = `assets/${createHash('sha256').update(bytes).digest('hex')}${extension}`
      assets.set(post.cover, bytes)
    }
    posts.push(post)
  }
  for (const post of posts) renderArticle(post, posts, '/')
  const temporary = await mkdtemp(resolve(root, '.import-'))
  try {
    await mkdir(resolve(temporary, 'posts'))
    await mkdir(resolve(temporary, 'assets'))
    for (const post of posts) {
      const { body, ...metadata } = post
      await writeFile(resolve(temporary, 'posts', `${post.slug}.md`), `---\n${dump({ ...metadata, published: true }, { lineWidth: -1 })}---\n\n${body}\n`)
    }
    for (const [path, bytes] of assets) await writeFile(resolve(temporary, path), bytes)
    await replaceDirectory(temporary, resolve(root, 'content'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return posts.length
}

/** Replace a generated directory, restoring its prior version if installation fails. */
export async function replaceDirectory(staging: string, destination: string): Promise<void> {
  const backup = `${staging}-previous`
  let previous = false
  try {
    await rename(destination, backup)
    previous = true
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  try {
    await rename(staging, destination)
  } catch (error) {
    if (previous) await rename(backup, destination)
    throw error
  }
  if (previous) await rm(backup, { recursive: true })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const wiki = process.argv[2] ?? process.env.WIKI_PATH
  if (!wiki) throw new Error('Provide the Wiki path: pnpm sync /absolute/path/to/wiki')
  console.log(`Exported ${await syncWiki(root, resolve(wiki))} reviewed articles. Wiki unchanged.`)
}
