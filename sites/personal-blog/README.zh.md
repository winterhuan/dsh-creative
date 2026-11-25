---
description: 从个人 Wiki 选取文章，生成带搜索、标签和阅读目录的静态博客，并更新 Cloudflare Pages 网站。
---

# 个人博客

[English](README.md) | 中文

## 概要

博客提供文章阅读、全文搜索、标签筛选、归档、深浅色模式和手机布局。文章正文来自明确选中的 Wiki 页面，构建读取仓库中的公开快照，不需要部署整个 Wiki。它独立运行，不安装到 DSH profile。

## 目录

- [本地预览](#preview)
- [维护文章](#content)
- [部署网站](#deploy)
- [实现与验证](#development)
- [已知限制](#limitations)

<a id="preview"></a>
## 本地预览

需要 Node 24 和 pnpm 11.7.0。从本目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

打开 `http://127.0.0.1:4173`。`pnpm dev` 先构建再启动相同预览；修改模板或内容后重新运行 `pnpm build`。父仓库提供 `blog:dev`、`blog:build` 和 `blog:check` 快捷入口。

<a id="content"></a>
## 维护文章

[publications.json](publications.json) 是选稿清单，每项指定 Wiki 内的相对路径、稳定英文 slug、公开标签、简介和可选封面。先审阅文章是否完整、来源与日期是否自洽、是否适合公开，再加入清单。清单本身不替代事实和版权核查。

本机完整 Wiki 位于 Windows 的 `C:\Users\maiscrm\wiki`，WSL 路径如下；当前 WSL 的 `~/wiki` 是另一份普通目录，不能作为该路径的别名。

```sh
pnpm sync /mnt/c/Users/maiscrm/wiki
pnpm build
```

也可通过 `WIKI_PATH` 指定来源后执行 `pnpm sync`。同步只读 Wiki，重新生成整个 `content/`；撤稿时删除清单项并重新同步、构建。公开快照应随网站源码保存，云端构建不访问个人 Wiki。不要手改 `content/` 中的生成文件。

导出只接受 `notes/` 内的明确路径，拒绝内部素材、隐藏历史、越界软链、草稿、私密标记、示例和不足 200 个非空白字符的正文。它保留正文、标题和日期，只导出指定的公开元数据与封面。`ready` 状态不会自动加入选稿清单。来源脚注、版本限制和正文中的证据说明保持原文。

<a id="deploy"></a>
## 部署网站

网站发布在 [winter-notes.pages.dev](https://winter-notes.pages.dev/)，使用 Cloudflare Pages 免费地址，不要求自有域名；[静态资源请求免费且不限次数](https://developers.cloudflare.com/pages/functions/pricing/#static-asset-requests)。[wrangler.jsonc](wrangler.jsonc)固定项目名、构建目录和兼容日期。

在 [site.json](site.json) 设置站名、作者和实际获得的站点地址：`url` 只填协议与主机名，`basePath` 默认 `/`。`url` 为空时输出不允许索引的本地预览；填入真实地址并重新构建后生成 canonical、RSS 和 sitemap。子目录托管使用 `/blog/` 这样的 `basePath`，不要把它写进 `url`。

本项目通过 Wrangler 直接上传 `dist/`，未关联 Git 自动部署。该目录包含完整网站与 HTTP 响应头配置，不包含源码、Wiki 或开发依赖。已登录 Cloudflare 后执行下列命令，会重新构建并更新正式站点；必须写 `pnpm run deploy`，避免调用 pnpm 自带的同名命令。

```sh
pnpm run deploy
```

发布后核对正式地址、文章页面、搜索和 `feed.xml`。登录过期时先完成 Wrangler OAuth；Cloudflare MCP 不参与网站构建或发布。

<a id="development"></a>
## 实现与验证

[同步器](src/sync.ts)验证选稿并生成公开快照；[构建器](src/build.ts)生成静态 HTML、搜索索引及已引用素材。导出和构建先完成临时目录，再替换生成目录，验证失败保留上次结果。Markdown 禁用原始 HTML，站内链接只允许已公开文章，页面导航与正文无需 JavaScript。

```sh
pnpm typecheck
pnpm test
pnpm build
```

[回归测试](tests/blog.test.ts)覆盖公开筛选、来源只读、路径与软链限制、Markdown 渲染、子目录链接、索引与撤稿。浏览器检查覆盖搜索、标签、无结果提示、目录跳转、主题持久化和手机宽度；改动这些行为后重新检查。

<a id="limitations"></a>
## 已知限制

- 同步支持清单中的封面；正文内图片和 Wiki 内链需要先整理成适合公开的内容，否则导出会失败。不会自动发布 Raw、研究素材、历史或所有知识页面。
- 未配置评论、登录和自动同步。正文仍可能包含不宜公开的文字，作者需在选稿时审阅；结构检查不判断事实准确性。
- 域名、HTTPS、搜索、RSS、sitemap 和响应头已在正式站点验证；各地区网络可达性未逐一验证。

## 开发备注

无。
