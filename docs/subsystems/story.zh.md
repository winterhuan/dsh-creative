---
description: "小说子系统：作品身份、章节一致性、原生 workflow 与朱雀凭据归属。"
---

# 小说

[English](story.md) | 中文

## 概要

创作与审查长篇或短篇小说，让大纲、正文和追踪数据始终归属于同一部命名作品。概览只读进度与一致性数据，编辑器按版本保存文档。本文说明职责与信任边界，安装和命令归包 README 所有。

## 目录

- [包与执行归属](#ownership)
- [作品身份与一致性](#continuity)
- [设置与检测](#detection)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与执行归属

[小说包](../../packages/creative/story/README.zh.md)拥有技能、hook、CLI 与工作台，安装时带入[小说设置客户端](../../packages/client/ui-settings-story/README.zh.md)。DSH 拥有 Session、模型、文件系统授权、shell 与作业；该子系统不要求安装其他创作插件。 `story` 预设负责模型可见的能力；Host 路由和设置独立于单个预设代际。浏览器根据会话预设投影控制工作台入口和文件跳转，编辑缓冲仍归会话所有。

各 Skill 拥有自己的参考和专家 Role。Role 为原生子 Agent 提供专业指令，所选 Skill 或原生 workflow 分配工作并安排顺序。确定性操作调用包内 `dsh-story` CLI。章节与拆文 workflow 归属各自 Skill，父会话校验并保存提取的拆文卡片。

<a id="continuity"></a>
## 作品身份与一致性

长篇与短篇统一使用 `{工作区}/{作品名称}/`。项目发现、文件路由、跳转和写作指引都使用这一边界；工作区本身不是作品。工作区级拆文库具有独立身份。作品发现独立于有数量上限的文件列表继续执行，因此文件列表截断不会隐藏概览中的作品。

`/story` API 解析调用方的 Session，检查可信主机、允许路径、解析后路径包含关系与文件预算。编辑器使用已观察的 `FsVersion` 写入，保存冲突时保留草稿。章节提交在事务落盘前检查哈希与追踪修订。写入 hook 提醒审查，并将追踪变更交给指定提交者；概览不会推进追踪。

<a id="detection"></a>
## 设置与检测

`story` 命名空间保存朱雀凭据引用。设置客户端通过 DSH 凭据服务写入密钥，空草稿保留已存密钥。启动环境中的密钥优先，并使该引用在界面中只读。`story_zhuque` 只向 CLI 子进程传入所需的 `MAKERS_API_KEY`。技能要求用户明确请求检测，普通润色不会将正文发送给朱雀。

<a id="related"></a>
## 相关契约

章节交接见[原生 workflow 决策](../../.agents/notes/implemented/feature/2026-10-03-story-native-workflow.zh.md)，确定性检查见[规则归属决策](../../.agents/notes/implemented/simplification/2026-10-03-story-rule-ownership.zh.md)。仅供人浏览技能的能力归 [Skill Viewer](skill-viewer.zh.md) 所有。

<a id="dev-note"></a>
## 开发备注

无。
