---
description: "为每个 DSH 项目指定自己的默认 Agent 模式：该项目新建的会话以所选模式开始，而不受唯一全局默认的限制。"
kind: "package-bundle"
---

# @winterhuan/dsh-project-default-mode

[English](README.md) | 中文

## 概要

DSH 只为新会话解析一个全局默认 Agent 模式（preset）。本可选 bundle 增加按项目的默认模式：为一个项目选定模式后，该项目 Workspace 下新建的每个空白会话都以它开始，其他项目仍使用全局默认。已经开始的会话保留各自模式；在新建会话界面手动选择的模式仍会对那一个会话覆盖项目默认。没有任何 profile 默认包含它；需要自行安装，并在每个会话的「…」菜单里配置。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 安装到 profile

先构建本仓库，再把本地 bundle 安装进已有的 DSH web profile。把 `project-default-mode` 换成你的 profile 名。

```text
dsh plugin --profile project-default-mode add /Users/winter/dsh-creative/packages/preset/project-default-mode
dsh plugin --profile project-default-mode remove @winterhuan/dsh-project-default-mode
```

安装后重启 DSH 并刷新浏览器。bundle 只插入一行 Host 插件 `project-default-mode`，它拥有规则命名空间；浏览器半边只在该 Host 命名空间被服务时注册菜单行和对话框。

### 设置项目默认模式

1. 打开侧栏中属于该项目的任一会话的「…」菜单。
2. 选择**设为本项目默认模式**。对话框显示项目名（Workspace 标题），列出部署提供的每个模式以及**跟随全局默认**，并标出项目当前使用的模式和部署的全局默认。
3. 选定模式并**保存**。该项目新建的空白会话从此以它开始。

要取消项目覆盖，重新打开对话框并选择**跟随全局默认**；这只移除该项目的规则，其他项目的规则保持不变。不属于任何已注册 Workspace 的会话可以打开对话框，但没有可保存的内容。

全局默认本身仍在**设置 → Agent presets** 中维护；本 bundle 从不修改它。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>Implementation internals — click to expand</summary>

[bundle 补丁](cordis.patch.yml)只插入一行：`@winterhuan/dsh-project-default-mode` 的 `project-default-mode`。包内含 Host 半边和浏览器半边；浏览器半边通过包的 `dsh.client` 清单提供服务，不需要第二行补丁。

Host 半边（[src/index.ts](src/index.ts)）声明 volatile 的 `rules` 配置——`{ workspaceId, agentPreset }` 列表——并监听 `agent/created`。对全新的普通创建（`source === 'startup'`、无 `parentSession`、非 subagent 子会话），它把会话 `cwd` 解析到 Workspace（`ctx.workspaceRegistry`），查找该 Workspace 的规则；当会话尚未组合规则指定的 preset 时，调用 `ctx.agentPresets.select(agent, preset)`。这与新建会话 hero chip 使用同一接缝，因此切换会追加 `agent-preset/selected` Session 事件并挂载日志随后记录的 preset 修订。`select` 只对已发布的 Agent 安全：它重绑作用域并触发 `tools/change`，而 `agent/created` 是串行派发、各 preset 作用域的监听器仍在按创建时的 preset 运行，所以切换推迟到派发结束之后、首个回合之前执行；所有失败只记录日志，不否决创建。可选服务通过 `ctx.get` 读取，插件在它们缺席时也能激活，只是在它们就绪前不做任何事。

浏览器半边注册一个 `sidebar.workspaces.session.menu.item` 行（order 500，位于内置 pin/rename/fork/archive 之后）和一个 `shell.overlay` 对话框，共享一个控制器（[src/client/controller.ts](src/client/controller.ts)）。打开时从 `ctx.workspaces` 解析该会话所属 Workspace，等设置表单取得首个已接受区段后暂存项目当前规则，再用 `ctx.remote.agentPresets.list()` 读取模式列表。保存通过 `ctx.configForms.get('project-default-mode').set('rules', …)` 整体写入 `rules` 字段：折叠保留其他项目的规则，表单没有已接受区段时拒绝写入（空镜像写回会丢掉其他项目的规则），设置表单携带命名空间 revision 栅栏并在拒绝后恢复镜像。两个界面都经 `configForms.whileServed` 注册，未安装 Host 半边的部署不显示任何痕迹。

测试覆盖哪些创建会采用项目默认、失败包容、规则解析与替换、模式列表加载与暂存、设置写入，以及菜单/对话框呈现。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [仓库构建与浏览器验证](../../../HANDOFF.md)
- [项目默认模式子系统](../../../docs/subsystems/project-default-mode.zh.md)
- [Agent preset 注册表](../../../upstream/packages/preset/agent-preset-registry/README.md)

-----

<a id="model-experience"></a>
## Model Experience

### Session composition

#### What the model sees

本插件不添加任何自有提示词或工具。它改变新建空白会话组合的 agent preset：规则项目下的会话以该项目的模式而非全局默认开始，模型看到的工具 schema 与提示词段落即所规则 preset 的内容。切换在第一个回合之前记录为 `agent-preset/selected` Session 事件，使恢复或 fork 的会话重建的组合与其实际运行的组合一致。

#### Token effect

插件不增加提示词 token。请求规模完全由所组合 preset 自己的 persona、工具和指令决定，与手动选择同一 preset 的会话相同。

#### KV Cache effect

切换只发生在创建时、任何回合之前，因此会话历史从第一个请求起就固定在所选组合之下。已经开始的会话不会被重定向，fork 或 subagent 子会话保留父组合，不存在中途重写导致的缓存失效。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- 规则按已注册 Workspace 的身份匹配，未注册为 Workspace 的项目目录没有项目默认。固定版本的运行时只解析一个全局默认，自身不提供按 Workspace 的默认；本 bundle 只在会话创建时覆盖它，因此**设置 → Agent presets** 显示的仍是全局默认而非某个项目的。只有 web 客户端携带菜单和对话框；headless 或 SDK 会话经由同一 Host 监听器采用规则，但没有编辑界面。创建请求显式指名全局默认时无法与省略区分，项目默认同样生效；指名其他 preset 则保留该选择。

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
