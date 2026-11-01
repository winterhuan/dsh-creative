---
description: "视频解说子系统：原片与产物访问、预检、付费旁白与本地草稿交付证据。"
---

# 视频解说

[English](video-recap.md) | 中文

## 概要

`video-recap` Agent preset 通过作用域内的 `/agent` 入口拥有模型能力。Host 路由和设置保持全局注册。侧栏入口跟随所选会话的投影；隐藏工作台保留原有存储。模式选择不迁移历史，也不授予文件系统权限。

制作视频解说与配音，查看原片并检查交付产物。本地草稿明确记录降级阶段，交付度量记录实际产物的属性。本文说明工作台、生产脚本与共用凭据之间的边界。

## 目录

- [包与媒体访问](#ownership)
- [执行与证据](#production)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与媒体访问

[视频解说包](../../packages/creative/video-recap/README.zh.md)拥有技能、工具、`/video-recap` API 与侧栏，安装时带入[生产设置](production-settings.zh.md)。DSH 拥有 Session、权限、文件系统访问、shell 执行与作业；该子系统不要求安装其他创作插件。

路由将列表与读取限定在本领域，检查可信主机、解析后路径包含关系和文件预算，并支持分段媒体读取。可编辑文本使用已观察的文件版本。视频预检探测运行环境与提供方可用条件；凭据存在本身不能证明连接成功，也不授权生产。

<a id="production"></a>
## 执行与证据

`video_produce_run` 通过 Session shell 调度包内的配音、解说与诊断脚本，后台执行归 DSH 作业所有。`video_recap_produce_status` 报告语音凭据是否存在。执行时解析共用生产配置，只向子进程传入视频工具所需的凭据。

技能要求在付费生成前获得创作者确认。视频执行不消耗短剧确认回执，也不写短剧生产档案。草稿保留降级阶段记录，交付度量覆盖原片复用、旁白、授权声明与画幅。这些记录是产物证据，不是对内容权利的独立证明。

跨领域改编交换项目文件，例如将短剧产物复制到视频素材目录。媒体辅助脚本随使用它们的包分发，并与维护源进行一致性检查。运行时导入不要求访问另一个创作插件的私有状态，也不要求安装它。

<a id="related"></a>
## 相关契约

[视频交付决策](../../.agents/notes/implemented/feature/2026-09-27-video-recap-delivery-and-compliance.zh.md)定义草稿与交付证据。[生产设置](production-settings.zh.md)拥有共用配置，[短剧](short-drama.zh.md)拥有已确认的剧集生产。

<a id="dev-note"></a>
## 开发备注

无。
