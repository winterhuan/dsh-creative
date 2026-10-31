# Agent Note: 写作模式

Status: implemented

[English](2026-10-31-writer-preset.md) | 中文

## 问题

本仓库的小说流程是完整插件：自有 skill provider、章节 CLI 和文件接口。只需要 oh-story 技能，并要改设定、大纲和章节的 DSH 会话，不必带上那套插件。同一批技能既从工作区副本发现、又从随包目录发现时，模型会跟到哪一份并不清楚。

## 决策

`@winterhuan/dsh-writer` 是独立 bundle。预设 `writer`（写作模式）使用 persona、说明、时间、shell、文件、搜索、jobs、技能、压缩、委派、提问、待办和网页这些工具行。它不登记 agent 入口，也不登记 skill provider。

`skillMount` 是 `workspace` 或 `bundled`，默认 `workspace`。workspace 在首次进入时把包内技能拷到项目 `.agents/skills`，并且不设置 `bundledSkillDir`。已有技能目录保留到执行 `/writer-sync-skills`。bundled 把 `bundledSkillDir` 设为包内 `skills` 的绝对路径，并禁用 workspace 那一行 skill-filesystem。`story-setup` 把 DSH 当成自己的宿主，除非作者点名，否则不部署 Claude Code 或 Codex 的 hooks。

侧栏为预设 `writer` 登记标签和正文。列表和读取走 `workspaceFiles`，版本仍匹配时用 `PUT /writer/file` 保存。它不嵌入 oh-story Dashboard。

## 考虑过的替代方案

**继续用 `@winterhuan/dsh-story`。** 那个插件拥有章节事务、skill provider 和私有文件列表。写作模式要保持薄宿主。

**既设置 `bundledSkillDir` 又拷进工作区。** 项目副本会盖住包内副本，两种模式会同时生效。

**再做一套 `writer-*` 技能。** 模型看到的名字是 oh-story 的名字（`story`、`story-long-write`、`story-short-write`、`story-deslop`）。`story-zhuque` 是明确要求时的检测技能，不是另一套写作流程。

## 影响

安装本 bundle 不改变其他预设。切换 `skillMount` 需要重启。工作区里已有的技能目录在同步命令之前不会刷新。朱雀仍是明确的 `story-zhuque` 请求，不守卫章节保存。

## 验证

包内测试覆盖互斥挂载、workspace 拷贝后能发现 `story`、`story-long-write`、`story-short-write`、`story-deslop` 和 `story-zhuque` 且不会发现未使用的 bundled 目录、不覆盖后再强制同步、带版本的保存，以及 `story-setup` 的 DSH 分支。本环境没有把 bundle 装进正在运行的 DSH profile。
