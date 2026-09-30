---
description: "创意生产分组：小说/短剧/互动游戏/视频解说工作台与 Skills。"
kind: "package-group"
---

# creative/ — 创意生产族

[English](README.md) | 中文

## 概要

创意分组基于 DeepSeek Harness 提供小说/短剧/游戏/视频的生产工作台。打包固定的 Creative / Drama / NovelToGame / video-recap Skills、专家 Roles、Host hooks/tools/routes 与浏览器工作台，workspace、session、模型、工具与权限仍由 DSH 拥有。

## 目录

- [包列表](#packages)
- [关联文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包列表

| 包 | 职责 | ctx key |
|---|---|---|
| [`creative/`](creative/README.zh.md) | 四领域插件安装组合及 Host 兼容入口，无聚合页面 | `creative` |
| [`novel-to-game/`](novel-to-game/README.zh.md) | 可独立安装的游戏技能、签名 QA 与游戏工作台 | — |
| [`story/`](story/README.zh.md) | 独立小说技能、角色、写作检查与编辑器 | — |
| [`short-drama/`](short-drama/README.zh.md) | 独立短剧技能、确认生产与剧集工作台 | — |
| [`video-recap/`](video-recap/README.zh.md) | 独立解说技能、交付工具与视频工作台 | — |

<a id="related-documentation"></a>
## 关联文档

- [DeepSeek Harness 架构](../../upstream/docs/architecture.md)
- [Creative 子系统](../../docs/subsystems/creative.zh.md)
- [创意工作台 Agent Note](../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.zh.md) — 工作区归属、生产、知识库与技能查看。

<a id="dev-note"></a>
## 开发备注

无。
