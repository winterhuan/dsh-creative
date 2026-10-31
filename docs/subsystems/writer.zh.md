---
description: "写作子系统：写作模式预设、互斥的技能挂载，以及侧栏保存的边界。"
---

# 写作

[English](writer.md) | 中文

## 概要

写作模式是可选的小说会话预设。Host 把 oh-story 技能拷进工作区，或让技能发现直接读插件目录；侧栏保存设定、大纲和章节 markdown。会话、模型和文件读取仍由 DSH 负责。

## 目录

- [包](#ownership)
- [挂载与保存边界](#boundary)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包

[@winterhuan/dsh-writer](../../packages/winterhuan/writer/README.zh.md) 独立安装。Host 行拥有 `skillMount`、首次拷贝到 `.agents/skills`、`/writer-sync-skills` 和 `PUT /writer/file`。预设行拥有工具列表和 persona。浏览器半边是同一个包的 client 入口。

<a id="boundary"></a>
## 挂载与保存边界

`skillMount` 是 `workspace` 或 `bundled`。workspace 拷贝技能且不设置 `bundledSkillDir`。bundled 把该目录指到包内 `skills`，且不拷贝。已有技能目录要等 `/writer-sync-skills` 才替换。

侧栏的列表和读取走 `workspaceFiles`。Host 路由只接受会话工作区里设定、大纲或章节 markdown 的带版本保存。它不提供 oh-story Dashboard。在这个宿主上，`story-setup` 跳过 Claude Code 和 Codex 的 hook 部署。

<a id="related"></a>
## 相关契约

安装、切换挂载和限制见[包说明](../../packages/winterhuan/writer/README.zh.md)。技能发现归 [skill-filesystem](../../upstream/packages/skill/skill-filesystem/README.zh.md)。侧栏登记遵循[右侧栏](../../upstream/docs/subsystems/sidebar-right.zh.md)。

<a id="dev-note"></a>
## 开发备注

无。
