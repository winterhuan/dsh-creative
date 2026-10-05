---
description: "短剧子系统：剧集修订、生产意图、确认回执与媒体验证交付。"
---

# 短剧

[English](short-drama.md) | 中文

## 概要

开发剧集、检查创作文档，并在工作台跟踪已确认的媒体生产。项目文档与验证后的产物持久保存为文件，工作台从 DSH 结果还原生产状态。本文区分文档编辑、生产意图与付费执行。

## 目录

- [包与项目边界](#ownership)
- [意图、执行与交付](#production)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与项目边界

[短剧包](../../packages/creative/short-drama/README.zh.md)拥有技能、工具、`/short-drama` 路由与侧栏，安装时带入[生产设置](production-settings.zh.md)；其他创作插件独立安装。DSH 拥有 Session 身份、文件系统授权、shell 执行与作业。

完整的项目和剧集路径标识文档与目标，`EP001` 或 `SHOT-001` 等重复名称不是全局身份。Host 将五份剧集文档作为同一受检修订读取。路由检查可信主机、允许路径、解析后路径包含关系和文件预算；编辑器使用 `FsVersion` 比较后写入，冲突时保留草稿。媒体支持分段读取，停止生产前核对作业归属。

<a id="production"></a>
## 意图、执行与交付

`creative_production` 将工作台意图记录到 Session 日志。回放这些结果会更新生产视图，不会编辑创作文档或授权付费。待处理输入归 Session inbox，生产结果归 Conversation 投影，展示草稿归工作台。界面的生产操作通过 DSH 提交对话提示词。

执行生产时，`drama_produce_run` 要求一个已准备、已明确确认的作业及匹配的 adapter。离线诊断不消耗作业确认。执行器消耗单次回执，检查已确认输入，验证产物并记录交付。有限次数的密钥轮换只适用于请求受理前的明确拒绝。`drama_produce_status` 只报告凭据是否存在，不执行生产。

Python 创作文档检查器负责结构诊断。带哈希的生产清单将已验证媒体关联到目标和请求。`episode-compose` adapter 使用随包分发的视频语音、混音和字幕运行时副本，不要求安装视频插件。

<a id="related"></a>
## 相关契约

[成片交付决策](../../.agents/notes/implemented/feature/2026-09-27-short-drama-finished-episode.zh.md)说明交付证据。[生产设置](production-settings.zh.md)说明共用凭据命名空间，[视频解说](video-recap.zh.md)说明通过项目文件进行的改编。

<a id="dev-note"></a>
## 开发备注

无。
