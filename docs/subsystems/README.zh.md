---
description: "本仓库所有插件的子系统索引、所属包与组合边界。"
---

# 子系统

[English](README.md) | 中文

## 概要

按插件查找职责与信任边界的所属文档。学生学习工作台、Skill Viewer、模型设置增强、按项目的默认模式、写作模式与 Antfarm 分别说明。包映射同时覆盖可安装的 bundle 与配套客户端。四个创作领域（小说、短剧、视频解说、小说转游戏）及其设置客户端已于 2026-10-31 归档，包与参考文档现位于 `archive/` 下。

## 目录

- [包映射](#packages)
- [相关文档](#related)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包映射

下表标明每个现役包所属的子系统，安装与配置细节归链接的包 README 所有。

| 子系统 | 包 | 组合方式 |
|---|---|---|
| [学生学习](student.zh.md) | [@winterhuan/dsh-student](../../plugins/dsh-student/packages/winterhuan/student/README.zh.md) | 独立 bundle |
| [技能查看器](skill-viewer.zh.md) | [@winterhuan/dsh-skill-viewer](../../plugins/dsh-skills-viewer/packages/winterhuan/skill-viewer/README.zh.md) | 独立 bundle |
| [技能查看器](skill-viewer.zh.md) | [@winterhuan/dsh-client-ui-skill-viewer](../../plugins/dsh-skills-viewer/packages/winterhuan/ui-skill-viewer/README.zh.md) | 随技能查看器安装 |
| [模型设置增强](model-options.zh.md) | [@winterhuan/dsh-client-ui-settings-model-options](../../plugins/dsh-client-ui-settings-model-options/packages/winterhuan/ui-settings-model-options/README.zh.md) | 独立 bundle |
| [项目默认模式](project-default-mode.zh.md) | [@winterhuan/dsh-project-default-mode](../../plugins/dsh-project-default-mode/packages/winterhuan/project-default-mode/README.zh.md) | 独立 bundle |
| [写作](writer.zh.md) | [@winterhuan/dsh-writer](../../plugins/dsh-writer/packages/winterhuan/writer/README.zh.md) | 独立 bundle |
| [Antfarm](antfarm.zh.md) | [dsh-antfarm](../../plugins/dsh-antfarm/README.zh.md) | 面向 DSH 0.2.2-rc.1 的独立开发 bundle；尚未发布 |
| [自媒体工作台](../../plugins/dsh-media-desk/README.zh.md) | [@winterhuan/dsh-media-desk](../../plugins/dsh-media-desk/README.zh.md) | 独立 bundle；原作者插件的维护 fork |

<a id="related"></a>
## 相关文档

仓库布局、构建流程与本地验证见 [HANDOFF](../../HANDOFF.md)。已归档的[四领域决策](../../.agents/notes/archived/architecture/2026-09-30-creative-four-domain-plugins.md)记录创作插件的拆分，[文档规范](../AGENTS.md)定义各类契约的维护位置。

<a id="dev-note"></a>
## 开发备注

已归档的创作领域参考（小说、短剧、视频解说、小说转游戏、生产设置）随包移入 `archive/docs/subsystems/`；它们是冻结的历史快照，不再维护。
