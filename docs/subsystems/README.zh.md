---
description: "本仓库所有插件的子系统索引、所属包与组合边界。"
---

# 子系统

[English](README.md) | 中文

## 概要

按插件查找职责与信任边界的所属文档。各创作流程拥有独立说明，Skill Viewer、模型设置增强与共用生产设置也分别说明。包映射同时覆盖可安装的 bundle 与配套客户端。

## 目录

- [包映射](#packages)
- [相关文档](#related)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包映射

下表标明每个包所属的子系统，安装与配置细节归链接的包 README 所有。

| 子系统 | 包 | 组合方式 |
|---|---|---|
| [小说](story.zh.md) | [@winterhuan/dsh-story](../../packages/creative/story/README.zh.md) | 独立 bundle |
| [小说](story.zh.md) | [@winterhuan/dsh-client-ui-settings-story](../../packages/client/ui-settings-story/README.zh.md) | 随小说安装 |
| [短剧](short-drama.zh.md) | [@winterhuan/dsh-short-drama](../../packages/creative/short-drama/README.zh.md) | 独立 bundle |
| [视频解说](video-recap.zh.md) | [@winterhuan/dsh-video-recap](../../packages/creative/video-recap/README.zh.md) | 独立 bundle |
| [小说转游戏](novel-to-game.zh.md) | [@winterhuan/dsh-novel-to-game](../../packages/creative/novel-to-game/README.zh.md) | 独立 bundle |
| [学生学习](student.zh.md) | [@winterhuan/dsh-student](../../packages/education/student/README.zh.md) | 独立 bundle |
| [技能查看器](skill-viewer.zh.md) | [@winterhuan/dsh-skill-viewer](../../packages/skill/skill-viewer/README.zh.md) | 独立 bundle |
| [技能查看器](skill-viewer.zh.md) | [@winterhuan/dsh-client-ui-skill-viewer](../../packages/client/ui-skill-viewer/README.zh.md) | 随技能查看器安装 |
| [模型设置增强](model-options.zh.md) | [@winterhuan/dsh-client-ui-settings-model-options](../../packages/client/ui-settings-model-options/README.zh.md) | 独立 bundle |
| [生产设置](production-settings.zh.md) | [@winterhuan/dsh-client-ui-settings-creative-produce](../../packages/client/ui-settings-creative-produce/README.zh.md) | 随短剧或视频解说安装 |

<a id="related"></a>
## 相关文档

仓库布局、构建流程与本地验证见 [HANDOFF](../../HANDOFF.md)。[四领域决策](../../.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.zh.md)记录创作插件的拆分，[文档规范](../AGENTS.md)定义各类契约的维护位置。

<a id="dev-note"></a>
## 开发备注

无。
