---
description: "项目默认模式子系统：按 Workspace 键入的 preset 规则、会话创建时的应用及其信任边界。"
---

# 项目默认模式

[English](project-default-mode.md) | 中文

## 概要

为每个已注册 Workspace 指定自己的默认 Agent 模式。一条规则把一个 Workspace 身份映射到一个 agent preset；该 Workspace 下新建的空白会话组合规则指定的 preset，而不是全局默认。插件只拥有这一创建时覆盖及其编辑界面；DSH 保留 preset 组合、会话日志和全局默认。

## 目录

- [包与集成](#ownership)
- [规则应用边界](#application)
- [相关契约](#related)
- [开发备注](#dev-note)

<a id="ownership"></a>
## 包与集成

[project-default-mode bundle](../../packages/preset/project-default-mode/README.zh.md)独立安装，只增加一行 Host 记录，拥有 volatile 的 `rules` 命名空间；没有 profile 默认包含它。浏览器半边增加会话菜单行和覆盖层对话框，两者仅在 Host 命名空间被服务时注册。规则通过共享设置表单编辑，因此持久化、revision 栅栏与恢复归 DSH 的设置域所有，而不属于本插件。

Host 通过 preset 注册表自己的 `select` 应用规则，这与新建会话 hero chip 执行的操作相同，因此切换会追加标准的 `agent-preset/selected` Session 事件并挂载所记录的 preset 修订。插件不声明自己的 preset、工具或提示词，也不授予超出「选择 DSH 已提供的组合」之外的能力。

<a id="application"></a>
## 规则应用边界

规则匹配 Workspace 身份，由会话 `cwd` 经 Workspace 注册表解析得到；未注册为 Workspace 的目录没有规则。只有全新的普通创建会被重定向：恢复、清除或压缩的会话保留日志已固定的组合，fork 或 subagent 子会话保留父会话的组合。已经组合规则 preset 的会话不被触碰，因此不会记录多余事件。

覆盖是默认值而非锁定：创建请求指名全局默认以外 preset 时以该选择为准，新建会话界面选择的模式仍会对那一个会话覆盖项目默认。`agent/created` 是串行、被等待的事件，监听器抛错会否决创建，因此这里包容并记录每个失败；切换失败的会话保留全局默认组合，而不是启动失败。全局默认仍只能在「设置 → Agent presets」中编辑。

<a id="related"></a>
## 相关契约

[包 README](../../packages/preset/project-default-mode/README.zh.md)说明安装步骤、编辑流程与限制。上游拥有 [agent preset 注册表](../../upstream/packages/preset/agent-preset-registry/README.md)与 [Workspace 注册表](../../upstream/packages/workspace/workspace/README.md)。

<a id="dev-note"></a>
## 开发备注

无。
