/** Generate a portable static website from reviewed article snapshots. */
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { escapeHtml as e, readPosts, readSite, renderArticle } from './content.ts'
import { replaceDirectory } from './sync.ts'
import { about, archive, article, home, layout } from './templates.ts'

/** Build in a staging directory so a failed article cannot replace the last working site. */
export async function build(root: string): Promise<number> {
  const site = await readSite(root)
  const posts = await readPosts(root)
  const pages = new Map([
    ['index.html', home(site, posts)], ['archive/index.html', archive(site, posts)],
    ['about/index.html', about(site)], ['404.html', layout(site, '页面未找到', '404.html',
      `<section class="page-heading"><p class="eyebrow">404 / PAGE NOT FOUND</p><h1>这页暂时找不到。</h1><p>文章可能换了位置，回到首页继续阅读吧。</p><a class="text-link" href="${site.basePath}">返回首页 →</a></section>`)],
  ])
  for (const post of posts) pages.set(`posts/${post.slug}/index.html`, article(site, post, posts))
  pages.set('search.json', JSON.stringify(posts.map(post => ({ slug: post.slug,
    text: [post.title, post.description, ...post.tags, post.body].join(' '), tags: post.tags }))))
  if (site.url) {
    const origin = `${site.url}${site.basePath}`
    pages.set('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${e(site.title)}</title><link>${e(origin)}</link><description>${e(site.description)}</description><language>zh-CN</language>${posts.map(post => `<item><title>${e(post.title)}</title><link>${e(`${origin}posts/${post.slug}/`)}</link><guid>${e(`${origin}posts/${post.slug}/`)}</guid><description>${e(post.description)}</description><pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate></item>`).join('')}</channel></rss>\n`)
    pages.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', 'archive/', 'about/', ...posts.map(post => `posts/${post.slug}/`)].map(path => `<url><loc>${e(origin + path)}</loc></url>`).join('')}</urlset>\n`)
    pages.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}sitemap.xml\n`)
  } else pages.set('robots.txt', 'User-agent: *\nDisallow: /\n')
  const temporary = await mkdtemp(resolve(root, '.dist-'))
  try {
    for (const [path, content] of pages) {
      await mkdir(dirname(resolve(temporary, path)), { recursive: true })
      await writeFile(resolve(temporary, path), content)
    }
    for (const file of ['style.css', 'site.js', 'theme.js', 'favicon.svg', '_headers']) {
      await copyFile(resolve(root, 'public', file), resolve(temporary, file))
    }
    const assets = new Set(posts.flatMap(post => renderArticle(post, posts, site.basePath).assets))
    for (const asset of assets) {
      await mkdir(resolve(temporary, 'assets'), { recursive: true })
      await writeFile(resolve(temporary, asset), await readFile(resolve(root, 'content', asset)))
    }
    await replaceDirectory(temporary, resolve(root, 'dist'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  console.log(`Built ${posts.length} articles in dist/ (${site.url || 'local preview'}${site.basePath})`)
  return posts.length
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await build(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
}
