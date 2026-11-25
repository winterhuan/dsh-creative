/** Static page templates shared by the homepage, archive, and article pages. */
import { escapeHtml as e, readingMinutes, renderArticle } from './content.ts'
import type { Post, Site } from './content.ts'

const arrow = '<span aria-hidden="true">↗</span>'
const formattedDate = (date: string) => date.replaceAll('-', '.')
const postUrl = (site: Site, post: Post) => `${site.basePath}posts/${post.slug}/`

/** Wrap a page with shared navigation, metadata, and accessible content landmarks. */
export function layout(site: Site, title: string, path: string, body: string, description = site.description): string {
  const url = site.url ? `${site.url}${site.basePath}${path}` : ''
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title === site.title ? title : `${title} · ${site.title}`)}</title>
<meta name="description" content="${e(description)}"><meta name="color-scheme" content="light dark">
<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="${path.startsWith('posts/') ? 'article' : 'website'}">
${url ? `<link rel="canonical" href="${e(url)}"><meta property="og:url" content="${e(url)}"><link rel="alternate" type="application/rss+xml" title="${e(site.title)}" href="${site.basePath}feed.xml">` : '<meta name="robots" content="noindex,nofollow">'}
<link rel="icon" href="${site.basePath}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${site.basePath}style.css"><script src="${site.basePath}theme.js"></script><script src="${site.basePath}site.js" defer></script>
</head><body><a class="skip-link" href="#main">跳到正文</a>
<header class="site-header wrap"><a class="brand" href="${site.basePath}" aria-label="${e(site.title)}首页"><span class="monogram" aria-hidden="true">w.</span><span>${e(site.title)}<small>THINKING IN PROGRESS</small></span></a>
<nav aria-label="主导航"><a ${path === '' ? 'aria-current="page"' : ''} href="${site.basePath}">文章</a><a ${path === 'archive/' ? 'aria-current="page"' : ''} href="${site.basePath}archive/">归档</a><a ${path === 'about/' ? 'aria-current="page"' : ''} href="${site.basePath}about/">关于</a><button class="theme-toggle" type="button" aria-label="切换深色模式" hidden><span aria-hidden="true">◐</span></button></nav></header>
<main id="main" class="wrap" tabindex="-1">${body}</main>
<footer class="site-footer wrap"><p>${e(site.title)}<span>保持好奇，慢慢积累。</span></p><div>${site.url ? `<a href="${site.basePath}feed.xml">RSS 订阅 ${arrow}</a>` : ''}<a href="#main">回到顶部 ↑</a></div></footer></body></html>`
}

function tagLinks(site: Site, post: Post): string {
  return post.tags.map(tag => `<a class="tag" href="${site.basePath}?tag=${encodeURIComponent(tag)}#articles">${e(tag)}</a>`).join('')
}

/** Render the article collection with optional client-side search and topic filtering. */
export function home(site: Site, posts: Post[]): string {
  const topics = [...new Set(posts.flatMap(post => post.tags))]
  return layout(site, site.title, '', `
<section class="intro"><div><p class="eyebrow"><span class="status-dot"></span> A PERSONAL JOURNAL</p><h1>把想清楚的事，<br>慢慢写下来<span class="accent">。</span></h1><p class="intro-copy">关于 AI、写作与知识工作。<br>把阅读变成理解，把想法写成文章。</p><a class="text-link" href="#articles">从这里开始阅读 <span aria-hidden="true">↓</span></a></div>
<aside class="margin-note"><span class="note-index">01 / FIELD NOTES</span><p>阅读，思考，<br>然后留下<br>一点自己的东西。</p><div class="note-bottom"><span>${e(site.author)}</span><span>持续记录中 ↗</span></div></aside></section>
<section id="articles" class="collection" aria-labelledby="collection-title"><div class="section-title"><h2 id="collection-title">文章<span class="count">${String(posts.length).padStart(2, '0')}</span></h2><label class="search" hidden><span aria-hidden="true">⌕</span><span class="sr-only">搜索文章</span><input type="search" placeholder="搜索标题、内容或标签" aria-label="搜索文章"></label></div>
<div class="collection-tools" hidden><div class="filters" role="group" aria-label="按主题筛选"><button type="button" data-tag="" aria-pressed="true">全部</button>${topics.map(tag => `<button type="button" data-tag="${e(tag)}" aria-pressed="false">${e(tag)}</button>`).join('')}</div><span class="result-count" aria-live="polite">${posts.length} 篇文章</span></div>
<div class="post-grid">${posts.map((post, index) => `<article class="post-card" data-post="${e(post.slug)}"><a class="cover-link" href="${postUrl(site, post)}" tabindex="-1" aria-hidden="true">${post.cover ? `<img src="${site.basePath}${post.cover}" alt="" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} width="840" height="480">` : '<div class="cover-placeholder">Notes & thoughts</div>'}<span class="cover-number">${String(index + 1).padStart(2, '0')}</span></a><div class="post-details"><div class="post-meta"><time datetime="${post.date}">${formattedDate(post.date)}</time><span>${readingMinutes(post.body)} 分钟阅读</span></div><h3><a href="${postUrl(site, post)}">${e(post.title)}</a></h3><p>${e(post.description)}</p><div class="post-bottom"><div class="tags">${tagLinks(site, post)}</div><a class="read-link" href="${postUrl(site, post)}" aria-label="阅读：${e(post.title)}">${arrow}</a></div></div></article>`).join('')}</div>
<div class="empty-state" ${posts.length ? 'hidden' : ''}><p>这里还没有文章</p><span>新的思考，正在路上。</span><button class="reset-search" type="button" hidden>查看全部文章</button></div><noscript><p class="muted">所有文章已列出；搜索和筛选需要启用 JavaScript。</p></noscript>
</section><section class="closing-note"><span class="asterisk" aria-hidden="true">✳</span><div><h2>知识值得整理，想法值得留下。</h2><p>这里收录从个人 Wiki 中整理出的文章，记录理解，也保留每次思考的来处。</p></div><a class="text-link" href="${site.basePath}about/">关于这里 ${arrow}</a></section>`)
}

/** Render a complete article with section navigation and adjacent reading. */
export function article(site: Site, post: Post, posts: Post[]): string {
  const rendered = renderArticle(post, posts, site.basePath)
  const next = posts[(posts.indexOf(post) + 1) % posts.length]
  return layout(site, post.title, `posts/${post.slug}/`, `<div class="article-top"><a class="text-link" href="${site.basePath}#articles">← 全部文章</a></div>
<header class="article-header"><div class="tags">${tagLinks(site, post)}</div><h1>${e(post.title)}</h1><p class="article-description">${e(post.description)}</p><div class="post-meta"><span>${e(site.author)}</span><time datetime="${post.date}">${formattedDate(post.date)}</time><span>${readingMinutes(post.body)} 分钟阅读</span>${post.updated !== post.date ? `<span>更新于 ${formattedDate(post.updated)}</span>` : ''}</div></header>
<div class="reading-layout"><article class="prose">${rendered.html}<div class="article-end"><span aria-hidden="true">✳</span><p>感谢读到这里。</p><a href="${site.basePath}#articles">继续阅读其他文章 →</a></div></article>
${rendered.headings.length ? `<aside class="toc"><details open><summary>本文目录</summary><nav aria-label="文章目录">${rendered.headings.map(heading => `<a href="#${e(heading.id)}">${e(heading.title)}</a>`).join('')}</nav></details></aside>` : ''}</div>
${next && next !== post ? `<a class="next-post" href="${postUrl(site, next)}"><span>继续阅读</span><h2>${e(next.title)}</h2><span aria-hidden="true">→</span></a>` : ''}`, post.description)
}

/** Group public posts by year while preserving reverse chronological order. */
export function archive(site: Site, posts: Post[]): string {
  const years = [...new Set(posts.map(post => post.date.slice(0, 4)))]
  return layout(site, '文章归档', 'archive/', `<header class="page-heading"><p class="eyebrow">THE ARCHIVE</p><h1>日积月累。</h1><p>${posts.length} 篇文章，一段持续生长的记录。</p></header>${years.map(year => `<section class="archive-year"><h2>${year}</h2><div>${posts.filter(post => post.date.startsWith(year)).map(post => `<a class="archive-row" href="${postUrl(site, post)}"><time datetime="${post.date}">${post.date.slice(5).replace('-', '.')}</time><h3>${e(post.title)}</h3>${arrow}</a>`).join('')}</div></section>`).join('') || '<p>文章正在整理中。</p>'}`)
}

/** Explain the personal blog and the origin of its published writing. */
export function about(site: Site): string {
  return layout(site, '关于这里', 'about/', `<header class="page-heading"><p class="eyebrow">BEHIND THE NOTES</p><h1>你好，我是 ${e(site.author)}<span class="accent">。</span></h1><p>欢迎来到我的一小块互联网。</p></header><article class="prose about-prose"><h2>把阅读变成自己的理解</h2><p>这里关注 AI、写作与知识工作。文章从个人 Wiki 中整理而来：有对工具和方法的观察，也有关于如何收集材料、组织想法、持续创作的实践记录。</p><p>Wiki 是积累材料的地方，这里是把想法写清楚的地方。每篇文章尽量围绕一个具体问题展开，让读者带走一个可以继续思考或尝试的方向。</p><h2>让观点保留来处</h2><p>涉及项目能力或研究结论时，文章保留相应的来源、日期与适用版本。旧文章记录当时的理解，具体工具的今天仍然需要回到最新资料核对。</p><p>把事实与判断说清楚，也给新的理解留一些空间。</p><a class="text-link" href="${site.basePath}#articles">去读一篇文章 ${arrow}</a></article>`)
}
