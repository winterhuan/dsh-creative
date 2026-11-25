/** Read reviewed Markdown snapshots and render public article content. */
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { JSON_SCHEMA, load } from 'js-yaml'
import MarkdownIt from 'markdown-it'

/** Public article fields; internal Wiki metadata is never copied into this model. */
export interface Post {
  slug: string
  title: string
  date: string
  updated: string
  tags: string[]
  description: string
  body: string
  cover?: string
}

/** Website identity and URL settings used by all generated links. */
export interface Site {
  title: string
  author: string
  description: string
  url: string
  basePath: string
}

/** Reject arrays and scalar values at JSON and YAML file boundaries. */
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  return value as Record<string, unknown>
}

/** Read a required, nonempty string field. */
export function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing or invalid ${field}`)
  return value.trim()
}

/** Parse YAML frontmatter without executing custom tags. */
export function parseDocument(text: string): { data: Record<string, unknown>, body: string } {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text)
  if (!match) throw new Error('Markdown must begin with YAML frontmatter')
  return { data: record(load(match[1], { schema: JSON_SCHEMA })), body: match[2].trim() }
}

/** Validate a calendar date or ISO timestamp, retaining its original calendar day. */
export function date(value: unknown, field: string): string {
  const text = string(value, field)
  const day = text.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(text))
    || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error(`Invalid ${field}: ${text}`)
  return day
}

/** Validate public tags. */
export function tags(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some(tag => typeof tag !== 'string' || !tag.trim())) {
    throw new Error('tags must contain nonempty strings')
  }
  return [...new Set(value.map(tag => String(tag).trim()))]
}

/** Stable article URLs use simple slugs, never source filenames. */
export function slug(value: unknown): string {
  const result = string(value, 'slug')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) throw new Error(`Invalid slug: ${result}`)
  return result
}

/** Escape a value for HTML text, attributes, and XML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

/** Load deploy settings. An empty URL produces a local preview with no invented canonical URL. */
export async function readSite(root: string): Promise<Site> {
  const data = record(JSON.parse(await readFile(resolve(root, 'site.json'), 'utf8')))
  const basePath = string(data.basePath, 'basePath')
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) throw new Error('basePath must be / or /segment/')
  if (typeof data.url !== 'string') throw new Error('url must be a string')
  const url = data.url.replace(/\/$/, '')
  if (url) {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.origin !== url) throw new Error('url must be an HTTP(S) origin; use basePath for a subdirectory')
  }
  return { title: string(data.title, 'title'), author: string(data.author, 'author'),
    description: string(data.description, 'description'), url, basePath }
}

/** Load only exported public snapshots; invalid and duplicate slugs stop the build. */
export async function readPosts(root: string): Promise<Post[]> {
  const directory = resolve(root, 'content/posts')
  const posts: Post[] = []
  for (const filename of (await readdir(directory)).filter(name => name.endsWith('.md')).sort()) {
    const { data, body } = parseDocument(await readFile(resolve(directory, filename), 'utf8'))
    if (data.published !== true || data.draft === true || data.private === true || data.sample === true) continue
    const post: Post = { slug: slug(data.slug), title: string(data.title, 'title'), date: date(data.date, 'date'),
      updated: date(data.updated, 'updated'), tags: tags(data.tags), description: string(data.description, 'description'), body }
    if (!body) throw new Error(`Empty article: ${filename}`)
    if (data.cover !== undefined) post.cover = assetPath(data.cover)
    if (posts.some(item => item.slug === post.slug)) throw new Error(`Duplicate slug: ${post.slug}`)
    posts.push(post)
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
}

/** Only fingerprinted raster assets produced by the importer can enter public output. */
export function assetPath(value: unknown): string {
  const path = string(value, 'asset')
  if (!/^assets\/[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif)$/.test(path)) throw new Error(`Invalid asset: ${path}`)
  return path
}

/** Estimate reading time for mixed Chinese and Latin text. */
export function readingMinutes(body: string): number {
  const chinese = body.match(/\p{Script=Han}/gu)?.length ?? 0
  const words = body.replace(/\p{Script=Han}/gu, ' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0
  return Math.max(1, Math.ceil(chinese / 400 + words / 220))
}

/** Render safe Markdown with stable heading links; unpublished local references fail closed. */
export function renderArticle(post: Post, posts: Post[], basePath: string): { html: string, headings: { id: string, title: string }[], assets: string[] } {
  const md = new MarkdownIt({ html: false, linkify: true })
  const headings: { id: string, title: string }[] = []
  const assets = new Set(post.cover ? [assetPath(post.cover)] : [])
  const tokens = md.parse(post.body.replace(/^# [^\n]+\n+/, ''), {})
  const headingCounts = new Map<string, number>()
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type === 'heading_open') {
      const title = tokens[index + 1].content
      const stem = title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section'
      const count = (headingCounts.get(stem) ?? 0) + 1
      headingCounts.set(stem, count)
      const id = count === 1 ? stem : `${stem}-${count}`
      token.attrSet('id', id)
      if (token.tag === 'h2' || token.tag === 'h3') headings.push({ id, title })
    }
    for (const child of token.children ?? []) {
      if (child.type === 'image') {
        const source = String(child.attrGet('src') ?? '')
        if (!/^assets\/[a-f0-9]{64}\.(?:png|jpg|jpeg|webp|gif)$/.test(source)) {
          throw new Error(`Article ${post.slug}: image must be an exported asset: ${source}`)
        }
        child.attrSet('src', `${basePath}${source}`)
        assets.add(source)
        child.attrSet('loading', 'lazy')
        child.attrSet('decoding', 'async')
      }
      if (child.type === 'link_open') {
        const href = String(child.attrGet('href') ?? '')
        if (/^https?:\/\//i.test(href)) child.attrSet('rel', 'noopener noreferrer')
        else if (/^(?:#|mailto:)/i.test(href)) continue
        else {
          const match = /^posts\/([a-z0-9-]+)\/(#.*)?$/.exec(href)
          if (!match || !posts.some(item => item.slug === match[1])) throw new Error(`Article ${post.slug}: unpublished local link: ${href}`)
          child.attrSet('href', `${basePath}${href}`)
        }
      }
    }
  }
  if (tokens.some(token => token.type === 'inline' && token.content.includes('[['))) {
    throw new Error(`Article ${post.slug}: unresolved Wiki link; review it before export`)
  }
  return { html: md.renderer.render(tokens, md.options, {}), headings, assets: [...assets] }
}
