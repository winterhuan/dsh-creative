---
description: "本仓库所有插件的子系统索引、所属包与组合边界。"
---

# 子系统

[English](README.md) | 中文

## 概要

按插件查找职责与信任边界的所属文档。包映射覆盖维护中的组合包和配套客户端。已归档的创作领域包与参考文档位于 `archive/`。

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
| [创作](writer.zh.md) | [@winterhuan/oh-story-dsh](../../plugins/oh-story-dsh/packages/dsh-plugin/README.md) | 上游 fork，四个创作工作台 |
| [Antfarm](antfarm.zh.md) | [@winterhuan/dsh-antfarm](../../plugins/dsh-antfarm/README.zh.md) | 已发布组合包；日常服务使用独立 `antfarm` profile |
| [自媒体工作台](media-desk.zh.md) | [@winterhuan/dsh-media-desk](../../plugins/dsh-media-desk/README.zh.md) | 原生创作 Session、Notes 内容、独立媒体与导出；维护 fork |
| [Shadow Mind](../../plugins/dsh-shadow-mind/README.zh.md) | [@winterhuan/dsh-shadow-mind](../../plugins/dsh-shadow-mind/README.zh.md) | 独立组合包，包含审查运行时、命令与只读审查预设 |
| [Superagent](../../plugins/dsh-superagent-prototype/README.zh.md) | [dsh-superagent](../../plugins/dsh-superagent-prototype/README.zh.md) | 研究原型组合包；远程发布包使用独立 `superagent` profile |

<a id="related"></a>
## 相关文档

仓库布局、构建流程与本地验证见 [HANDOFF](../../HANDOFF.md)。已归档的[四领域决策](../../.agents/notes/archived/architecture/2026-09-30-creative-four-domain-plugins.md)记录创作插件的拆分，[文档规范](../AGENTS.md)定义各类契约的维护位置。

<a id="dev-note"></a>
## 开发备注

已归档的创作领域参考（小说、短剧、视频解说、小说转游戏、生产设置）随包移入 `archive/docs/subsystems/`；它们是冻结的历史快照，不再维护。
