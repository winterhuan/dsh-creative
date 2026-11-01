---
description: "生产设置子系统：短剧与视频共用配置、凭据引用与浏览器写入边界。"
---

# 生产设置

[English](production-settings.md) | 中文

## 概要

配置短剧与视频生产使用的提供方凭据和运行选项。两个插件共用设置页与配置，修改会影响两方使用者。保存配置不会启动生产，也不授权付费作业。

## 目录

- [包与命名空间](#ownership)
- [凭据与执行](#credentials)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与命名空间

[生产设置客户端](../../packages/client/ui-settings-creative-produce/README.zh.md)随[短剧](short-drama.zh.md)和[视频解说](video-recap.zh.md) bundle 安装。两者的 `/produce` 入口提供 `creative-produce` 命名空间，客户端在该命名空间被提供时挂载设置页。该客户端没有 bundle patch，也不安装业务插件。

两个 bundle patch 使用相同的生产设置行 ID。移除一个领域后，剩余领域仍提供设置。共用配置不会合并各领域的技能、工具或项目状态。朱雀引用归独立的[小说](story.zh.md)设置命名空间所有。

<a id="credentials"></a>
## 凭据与执行

配置保存六个提供方的凭据引用与非敏感运行字段。密钥明文保留在 DSH 凭据库，页面读取存在状态并通过凭据服务写入密钥。空密钥草稿保留已存值，提供方引用变化后不能发布旧引用的存在状态。

生产工具在调用时解析引用，通过显式子进程环境传入所需密钥；短剧执行器还可使用私有的密钥池输入。密钥不作为模型参数或命令文本。凭据存在不能证明连接成功，修改设置不能替代所属工具的确认规则。

<a id="related"></a>
## 相关契约

[客户端 README](../../packages/client/ui-settings-creative-produce/README.zh.md)说明表单字段与保存行为。[短剧](short-drama.zh.md)拥有基于回执的执行，[视频解说](video-recap.zh.md)拥有由技能要求的付费生成确认。

<a id="dev-note"></a>
## 开发备注

无。
