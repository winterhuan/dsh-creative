---
description: Select articles from a personal Wiki, build a static blog with search, topics and reading navigation, and update the Cloudflare Pages website.
---

# Personal blog

English | [中文](README.zh.md)

## Summary

The blog provides article reading, full-text search, topic filters, archives, light and dark themes, and mobile layouts. Article bodies come from explicitly selected Wiki pages; builds read public snapshots in the repository without deploying the entire Wiki. It runs independently and does not install into a DSH profile.

## Contents

- [Preview locally](#preview)
- [Maintain articles](#content)
- [Deploy the website](#deploy)
- [Implementation and verification](#development)
- [Known limitations](#limitations)

<a id="preview"></a>
## Preview locally

Use Node 24 and pnpm 11.7.0. Run from this directory:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

Open `http://127.0.0.1:4173`. `pnpm dev` builds before starting the same preview; run `pnpm build` again after changing templates or content. The parent repository provides `blog:dev`, `blog:build`, and `blog:check` shortcuts.

<a id="content"></a>
## Maintain articles

[publications.json](publications.json) lists selected articles with a Wiki-relative path, stable English slug, public tags, description, and optional cover. Review completeness, sources, dates, and suitability for publication before adding an article. Selection does not replace fact checking or a rights review.

The complete local Wiki resides at `C:\Users\maiscrm\wiki` on Windows, with the WSL path below; WSL's current `~/wiki` is a separate ordinary directory and cannot serve as an alias for this path.

```sh
pnpm sync /mnt/c/Users/maiscrm/wiki
pnpm build
```

Alternatively, set `WIKI_PATH` before running `pnpm sync`. Synchronization reads the Wiki and regenerates all of `content/`; remove a manifest entry and synchronize and build again to withdraw an article. Save public snapshots with the website source so cloud builds do not access the personal Wiki. Do not manually edit generated files in `content/`.

Export accepts only explicit paths within `notes/` and rejects internal material, hidden history, escaping symlinks, drafts, private flags, samples, and bodies shorter than 200 non-whitespace characters. It preserves the body, title, and dates and exports only selected public metadata and covers. A `ready` status does not automatically select an article. Source footnotes, version limitations, and evidence statements in the body remain unchanged.

<a id="deploy"></a>
## Deploy the website

The website is published at [winter-notes.pages.dev](https://winter-notes.pages.dev/) using a free Cloudflare Pages address without a custom domain; [static asset requests are free and unlimited](https://developers.cloudflare.com/pages/functions/pricing/#static-asset-requests). [wrangler.jsonc](wrangler.jsonc) pins the project name, build directory, and compatibility date.

Set the site title, author, and assigned address in [site.json](site.json): `url` contains only the scheme and hostname, and `basePath` defaults to `/`. An empty `url` produces a local preview that disallows indexing; rebuilding with the actual address generates canonical links, RSS, and a sitemap. Subdirectory hosting uses a `basePath` such as `/blog/`, rather than including that path in `url`.

This project uploads `dist/` directly through Wrangler and has no automatic Git deployment. The directory contains the complete website and HTTP header configuration without source files, the Wiki, or development dependencies. Once authenticated with Cloudflare, the following command rebuilds and updates production; use `pnpm run deploy` to avoid invoking pnpm's built-in command of the same name.

```sh
pnpm run deploy
```

After deployment, check the production address, article pages, search, and `feed.xml`. Complete Wrangler OAuth again if login expires; Cloudflare MCP does not participate in building or publishing the website.

<a id="development"></a>
## Implementation and verification

The [synchronizer](src/sync.ts) validates selections and produces public snapshots; the [builder](src/build.ts) produces static HTML, the search index, and referenced assets. Export and build finish staging before replacing generated directories, retaining the previous output on validation failure. Markdown disables raw HTML, internal links permit only published articles, and navigation and article bodies work without JavaScript.

```sh
pnpm typecheck
pnpm test
pnpm build
```

[Regression tests](tests/blog.test.ts) cover publication filtering, read-only sources, paths and symlinks, Markdown rendering, subdirectory links, indexes, and withdrawal. Browser checks cover search, tags, empty results, section navigation, persisted themes, and mobile width; repeat them after changing these behaviors.

<a id="limitations"></a>
## Known limitations

- Synchronization supports selected covers; inline images and Wiki links require preparation for public use or export fails. It does not automatically publish Raw sources, research material, history, or all knowledge pages.
- Comments, login, and automatic synchronization are not configured. Authors must review article bodies for private material during selection; structural checks do not establish factual accuracy.
- The domain, HTTPS, search, RSS, sitemap, and headers have been verified in production; regional network availability has not been checked individually.

## Dev note

None.
