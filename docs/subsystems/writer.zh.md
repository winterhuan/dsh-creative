---
description: "Oh Story fork 集成：创作工作台、上游归属和本地开发检查。"
---

# 创作

[English](writer.md) | 中文

## 概要

Oh Story fork 为 DSH 提供小说、短剧、互动游戏和视频解说工作台。Agent、会话、模型与权限由 DSH 管理；技能、角色和创作文档由插件提供。

## 目录

- [源码](#source)
- [运行与资产](#runtime)
- [开发](#development)
- [开发备注](#dev-note)

<a id="source"></a>
## 源码

[plugins/oh-story-dsh](../../plugins/oh-story-dsh/README.md) 跟踪 [winterhuan/oh-story-dsh](https://github.com/winterhuan/oh-story-dsh)，它是 [zenstory-ai/oh-story-dsh](https://github.com/zenstory-ai/oh-story-dsh) 的 fork。包名为 `@winterhuan/oh-story-dsh`，源码与构建产物位于 `packages/dsh-plugin`。

短剧工作台统一在此 fork 维护，取舍见[独立插件提案的拒绝记录](../../.agents/notes/rejected/architecture/2026-11-08-short-drama-canvas-workbench.zh.md)。

原 `plugins/dsh-writer` 源码在本机归档于 `archive/dsh-writer/`，不参与构建。其[预设](../../.agents/notes/archived/feature/2026-10-31-writer-preset.md)和 [Box/Ego 接入](../../.agents/notes/archived/architecture/2026-11-07-writer-box-ego.md)保留为历史决策。新 fork 沿用上游工作台，不复制旧侧栏、`writer_agent` 和凭据设置。浏览器任务直接使用官方 [ego-browser](https://lite.ego.app/document/zh/docs/ego-browser)，执行 `ego-browser skill` 按需读取当前安装版本的指南。

<a id="runtime"></a>
## 运行与资产

bundle 在所属 DSH profile 中登记 `oh-story`，提供四个工作台、技能 provider 和 `oh_story_role` 工具；对话与权限继续由 DSH 管理。安装和运行行为见[上游包说明](../../plugins/oh-story-dsh/packages/dsh-plugin/README.md)与[架构文档](../../plugins/oh-story-dsh/docs/ARCHITECTURE.md)。

四套固定资产位于 `packages/knowledge/{oh-story,drama,novel-to-game,video-recap}`，manifest 记录版本与逐文件哈希。遵循 fork 的 [AGENTS.md](../../plugins/oh-story-dsh/AGENTS.md) 及同步命令，不手改知识副本。角色和参考资料的加载沿用 fork 自身适配。

macOS 和 Linux／WSL 上的 Oh Story 均使用独立 `writer` profile 和端口 `3086`，由 `dsh-writer` 或 `dsh-sre` 管理。新会话使用原生 Standard 模式；两端 profile 均保留采用 Standard 配置的 `writer` 模式声明，供记录了该模式的旧会话恢复。安装版本、会话和书稿位置见 [HANDOFF.md](../../HANDOFF.md#independent-service-profiles)。

<a id="development"></a>
## 开发

父仓库命令发现该 fork 的 workspace 和 `packages/dsh-plugin/package.json`，安装、类型检查、构建与测试调用其自身工具链；仅对声明了清理命令的插件执行可选清理。在 fork 内运行 `pnpm verify`，覆盖 lint、类型、资产一致性、DSH 归属检查、脚本测试、单元测试与构建。显式 Vitest 配置避免外层仓库改变测试发现范围。

fork 保留上游源码与文档约定。父仓库风格和双语模板检查覆盖集成说明；fork 自身检查覆盖实现与固定资产。父仓库指向 fork 的链接照常检查。真实 DSH 验证与发布遵循其[贡献指南](../../plugins/oh-story-dsh/CONTRIBUTING.md)和[发布指南](../../plugins/oh-story-dsh/docs/RELEASING.md)。

<a id="dev-note"></a>
## 开发备注

无。
