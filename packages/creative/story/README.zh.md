---
description: "小说工作台，可独立安装技能、工具与浏览器界面。"
kind: "package-bundle"
---

# @winterhuan/dsh-story

[English](README.md) | 中文

## 摘要

通过十四个 Skill、七个专家 Role 和独立编辑器写作与审查小说。草稿保留在当前 DSH Session，保存使用已观察的文件版本。此 bundle 可以独立安装，也可以通过 Creative 安装。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发笔记](#dev-note)

<a id="use-this-package"></a>
## 使用本包

构建仓库后，将本地 bundle 安装到 web profile：

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/story
```

从右侧栏打开**小说工作台**。插件使用当前 DSH Session、文件系统、模型和权限。生产设置仍位于已有的 Creative 生产设置页；密钥保留在 DSH 凭据库。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[补丁](cordis.patch.yml)挂载领域行、`creative-produce` 配置行和已有设置页。重复配置行 ID 通过 DSH Loader 组合解析。`editorMaxBytes` 默认为 2097152；`trustedHosts` 扩展默认回环地址列表。`/story` API 将文档访问限定在本领域项目路径中。

写作守卫与专家 Role 属于此包。朱雀检测会将选定章节发送到腾讯 EdgeOne Makers，只接收配置的 MAKERS_API_KEY。

此包不依赖 Creative 聚合包或其他领域插件。必需辅助脚本作为包资源分发。[聚合包](../creative/README.zh.md)保留兼容工具名和路由，自身没有聚合页面。

</details>

<a id="model-experience"></a>
## 模型体验

### 领域技能与执行

#### 模型看到什么

领域目录只展示自己的 Skill 描述。加载 Skill 时提供完整指令和随包辅助脚本路径。`story_zhuque` 执行固定领域脚本；后台执行返回 DSH 作业 ID，供 `job_output` 与 `job_kill` 使用。

#### Token 影响

Skill 正文按需加载。执行添加普通工具结果，不加载无关领域目录。

#### KV Cache 影响

插件使用 DSH 工具和 Skill 历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Python 脚本需要 Python 3.9+；章节检查还需要 Node。付费服务需要创作者授权和已配置凭据。独立侧边栏各自保存状态；旧聚合草稿不迁移。

<a id="dev-note"></a>
### 开发笔记

未引入独立公共运行时包。
