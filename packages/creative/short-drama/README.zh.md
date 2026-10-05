---
description: "短剧工作台，可独立安装技能、工具与浏览器界面。"
kind: "package-bundle"
---

# @winterhuan/dsh-short-drama

[English](README.md) | 中文

## 摘要

通过五个 Skill、剧集编辑器和生产看板创作短剧。确认后的作业通过 DSH 工具生产媒体与合成剧集。此 bundle 独立安装。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发笔记](#dev-note)

<a id="use-this-package"></a>
## 使用本包

在新建或空白会话的原生模式菜单中选择**短剧创作**，再从右侧栏打开对应工作台。工作台及领域技能、工具只在该模式中可用。已有会话保留原模式；要继续已有项目文件，请在该模式中新建会话。会话状态和项目文件不迁移。全局设置仍可使用。

构建仓库后，将本地 bundle 安装到 web profile：

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/short-drama
```

从右侧栏打开**短剧工作台**。插件使用当前 DSH Session、文件系统、模型和权限。生产设置仍位于已有的 Creative 生产设置页；密钥保留在 DSH 凭据库。

<a id="understand-the-implementation"></a>
## 理解实现

职责与信任边界见[短剧子系统](../../../docs/subsystems/short-drama.zh.md)。

在仓库根目录运行 `pnpm --filter @winterhuan/dsh-short-drama build` 可单独构建，运行 `pnpm --filter @winterhuan/dsh-short-drama test` 可验证此包。

Host 入口负责工作区路由和配置。`./agent` 导出在 `short-drama` preset 及继承它的原生子 Agent 组合内注册领域技能和工具。preset 提供任务专属 persona 和显式原生工具组合，不改变默认模式。

<details>
<summary>实现细节 — 点击展开</summary>

[补丁](cordis.patch.yml)挂载领域 Host 行、`preset-short-drama` 模式行、`creative-produce` 配置行和已有设置页。重复配置行 ID 通过 DSH Loader 组合解析。`editorMaxBytes` 默认为 2097152；`trustedHosts` 扩展默认回环地址列表。`/short-drama` API 将文档与媒体访问限定在本领域项目路径中。

生产只消费一次已准备作业的确认。此包携带成片与媒体审查所需的视频运行脚本，不安装视频工作流插件。

此包独立开发、构建和安装，不依赖其他领域插件；必需辅助脚本作为包资源分发。

</details>

<a id="model-experience"></a>
## 模型体验

### 领域技能与执行

#### 模型看到什么

所选模式加入领域 persona 与原生工具 schema。稳定 persona 记录在[提示词快照](../../../tests/fixtures/short-drama-persona.txt)中；标准模式和其他领域模式不包含本领域能力。前缀与 schema 在按需加载技能之前占用上下文，原生压缩管理累积历史。 领域目录只展示自己的 Skill 描述。五个入口为 `short-drama`（项目、开发与按需原著分析）、`short-drama-write`、`short-drama-visual`（视觉设定、图片提示词、分镜与视频提示词）、`short-drama-produce` 和 `short-drama-review`。加载入口时提供任务指令与 `knowledge/drama` 原生资源基目录，通过普通 `read` 按需读取参考。脚本和模板目录保留为随包资源，不额外注册 Skill。`drama_produce_run` 执行固定领域脚本；后台执行返回 DSH 作业 ID，供 `job_output` 与 `job_kill` 使用。加载后的技能要求前置阶段采用前台委派，并在进入下一阶段前核对子 Agent 的最终结果和产物。委派失败时报告具体诊断并保留已有产物；DSH 模型服务的认证和地址错误需修复提供商配置。

#### Token 影响

Skill 正文按需加载。执行添加普通工具结果，不加载无关领域目录。

#### KV Cache 影响

插件使用 DSH 工具和 Skill 历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- Python 脚本需要 Python 3.9+；媒体操作还需要 ffmpeg 与 ffprobe。付费服务需要创作者授权和已配置凭据。独立侧边栏各自保存状态；旧聚合草稿不迁移。

<a id="dev-note"></a>
### 开发笔记

未引入独立公共运行时包。
