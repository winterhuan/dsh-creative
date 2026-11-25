/** Publication checks use temporary Wikis; personal source files never enter test fixtures. */
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build } from '../src/build.ts'
import { date, parseDocument, readPosts, readingMinutes, renderArticle } from '../src/content.ts'
import type { Post } from '../src/content.ts'
import { syncWiki, wikiFile } from '../src/sync.ts'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const body = '这是一篇完整的公开文章，介绍如何把知识整理成自己的理解。\n\n'.repeat(15)
const source = `---\ntitle: 一篇文章\ncreatedAt: 2026-11-10T00:00:00Z\nupdatedAt: 2026-11-12T00:00:00Z\nsources:\n  - reference: /Users/private/research.md\n---\n\n${body}`
const selected = [{ source: 'notes/works/post.md', slug: 'a-post', tags: ['写作'], description: '一篇公开文章的简介。' }]
const post: Post = { slug: 'a-post', title: '一篇文章', date: '2026-11-10', updated: '2026-11-12',
  tags: ['写作'], description: '简介', body }

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'personal-blog-test-'))
  const wiki = resolve(root, 'wiki')
  await mkdir(resolve(wiki, 'notes/works'), { recursive: true })
  await writeFile(resolve(wiki, 'notes/works/post.md'), source)
  await writeFile(resolve(root, 'publications.json'), JSON.stringify(selected))
  await writeFile(resolve(root, 'site.json'), JSON.stringify({ title: '测试手记', author: '作者',
    description: '测试网站', url: '', basePath: '/' }))
  await cp(resolve(project, 'public'), resolve(root, 'public'), { recursive: true })
  return { root, wiki }
}

test('exports only reviewed articles and public metadata, preserving the Wiki byte for byte', async t => {
  const { root, wiki } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(resolve(wiki, 'notes/works/unselected.md'), source.replace('一篇文章', '不公开的文章'))
  assert.equal(await syncWiki(root, wiki), 1)
  assert.deepEqual(await readdir(resolve(root, 'content/posts')), ['a-post.md'])
  const exported = await readFile(resolve(root, 'content/posts/a-post.md'), 'utf8')
  assert.equal(exported.includes('/Users/private'), false)
  assert.equal(exported.includes('sources:'), false)
  assert.equal(parseDocument(exported).body, body.trim())
  assert.equal(await readFile(resolve(wiki, 'notes/works/post.md'), 'utf8'), source)
  const posts = await readPosts(root)
  assert.equal(posts[0].date, '2026-11-10')
  assert.equal(posts[0].updated, '2026-11-12')
})

test('samples, drafts, private records and incomplete articles cannot replace a good export', async t => {
  const { root, wiki } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await syncWiki(root, wiki)
  const original = await readFile(resolve(root, 'content/posts/a-post.md'), 'utf8')
  for (const flag of ['sample: true', 'id: seed_4', 'draft: true', 'private: true', 'status: draft', 'visibility: private', 'published: false', 'publish: false']) {
    await writeFile(resolve(wiki, 'notes/works/post.md'), source.replace('title:', `${flag}\ntitle:`))
    await assert.rejects(syncWiki(root, wiki), /cannot be exported/)
  }
  await writeFile(resolve(wiki, 'notes/works/post.md'), source.replace(body, '只有标题，正文还没完成。'))
  await assert.rejects(syncWiki(root, wiki), /incomplete/)
  assert.equal(await readFile(resolve(root, 'content/posts/a-post.md'), 'utf8'), original)
})

test('path traversal, internal metadata and symlinks cannot expose private Wiki material', async t => {
  const { root, wiki } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(resolve(wiki, 'raw'))
  await writeFile(resolve(wiki, 'raw/secret.md'), source)
  await symlink(resolve(wiki, 'raw/secret.md'), resolve(wiki, 'notes/works/raw-link.md'))
  await writeFile(resolve(root, 'secret.md'), source)
  await symlink(resolve(root, 'secret.md'), resolve(wiki, 'notes/works/escape.md'))
  for (const path of ['../secret.md', 'notes/works/../../../secret.md', 'raw/secret.md', 'notes/.media-desk/history.md', 'notes/materials/source.md']) {
    await assert.rejects(wikiFile(wiki, path), /Unpublishable/)
  }
  await assert.rejects(wikiFile(wiki, 'notes/works/raw-link.md'), /unpublished material/)
  await assert.rejects(wikiFile(wiki, 'notes/works/escape.md'), /escapes Wiki/)
})

test('safe Markdown escapes executable HTML, preserves code, and gives duplicate headings distinct anchors', () => {
  const rendered = renderArticle({ ...post, body: '# 一篇文章\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n## 方法\n\n正文\n\n## 方法\n\n```js\nconst x = 1\n```' }, [post], '/')
  assert.equal(rendered.html.includes('<script>'), false)
  assert.equal(rendered.html.includes('href="javascript:'), false)
  assert.match(rendered.html, /language-js/)
  assert.deepEqual(rendered.headings.map(heading => heading.id), ['方法', '方法-2'])
})

test('unpublished links and images fail, while public links work below a deployment subpath', () => {
  for (const body of ['[source](../../raw/source.md)', '[[private-note]]', '![scan](../../raw/image.png)']) {
    assert.throws(() => renderArticle({ ...post, body }, [post], '/blog/'))
  }
  assert.doesNotMatch(renderArticle({ ...post, body: '[private](file:///Users/private/a.md)' }, [post], '/').html, /href="file:/)
  assert.match(renderArticle({ ...post, body: '[read](posts/a-post/)' }, [post], '/blog/').html, /href="\/blog\/posts\/a-post\/"/)
})

test('build creates only public pages, handles deployment subpaths, and removes withdrawn content', async t => {
  const { root, wiki } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await syncWiki(root, wiki)
  await build(root)
  assert.match(await readFile(resolve(root, 'dist/robots.txt'), 'utf8'), /Disallow/)
  assert.equal((await readdir(resolve(root, 'dist'))).includes('feed.xml'), false)
  await writeFile(resolve(root, 'site.json'), JSON.stringify({ title: '测试 & 手记', author: '作者', description: '测试网站', url: 'https://example.com', basePath: '/blog/' }))
  await build(root)
  const html = await readFile(resolve(root, 'dist/posts/a-post/index.html'), 'utf8')
  assert.match(html, /href="\/blog\/style.css"/)
  assert.match(html, /https:\/\/example.com\/blog\/posts\/a-post\//)
  assert.match(html, /本文目录|感谢读到这里/)
  assert.doesNotMatch(html, /\/Users\/private|unselected|sources:/)
  assert.match(await readFile(resolve(root, 'dist/feed.xml'), 'utf8'), /测试 &amp; 手记/)
  assert.match(await readFile(resolve(root, 'dist/sitemap.xml'), 'utf8'), /https:\/\/example.com\/blog\/posts\/a-post\//)
  await writeFile(resolve(root, 'publications.json'), '[]')
  await syncWiki(root, wiki)
  assert.equal(await build(root), 0)
  await assert.rejects(readFile(resolve(root, 'dist/posts/a-post/index.html')), /ENOENT/)
  assert.deepEqual(JSON.parse(await readFile(resolve(root, 'dist/search.json'), 'utf8')), [])
})

test('invalid dates, custom YAML tags and duplicate output URLs stop publication', async t => {
  assert.throws(() => date('2026-02-30', 'created'), /Invalid/)
  assert.throws(() => parseDocument('---\ntitle: !unsafe value\n---\ntext'))
  assert.equal(readingMinutes('中文'.repeat(401)), 3)
  const { root, wiki } = await fixture()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(resolve(root, 'publications.json'), JSON.stringify([...selected, ...selected]))
  await assert.rejects(syncWiki(root, wiki), /Duplicate slug/)
})
