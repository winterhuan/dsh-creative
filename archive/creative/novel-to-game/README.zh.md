---
description: "将小说改编为可试玩的浏览器游戏，提供独立工作台和签名 QA。"
kind: "package-bundle"
---

# @winterhuan/dsh-novel-to-game

[English](README.md) | 中文

## 摘要

通过四个按任务划分的 Skill、Chrome QA 和独立游戏工作台侧边栏，将小说改编为可试玩的浏览器游戏。此 bundle 独立安装。插件使用当前 DSH Session、工作区和权限；QA 需要 Chrome 与 Python。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发笔记](#dev-note)

<a id="use-this-package"></a>
## 使用此包

在新建或空白会话的原生模式菜单中选择**游戏创作**，再从右侧栏打开对应工作台。工作台及领域技能、工具只在该模式中可用。已有会话保留原模式；要继续已有项目文件，请在该模式中新建会话。会话状态和项目文件不迁移。全局设置仍可使用。

构建本仓库后，将本地 bundle 安装到 web profile：

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/novel-to-game
```

在右侧栏打开**游戏工作台**。通过 `/novel-to-game quick` 开始；项目位于 `game-adaptations/<project>/`，浏览器入口为 `build/app/index.html`。`game_qa` 的 `project` 参数接受该相对项目根路径，在当前 Session 工作区执行。后台运行返回 DSH 作业 ID，可通过 `job_output` 和 `job_kill` 查看或停止。

| 请求 | 技能 |
|---|---|
| 接入原著、来源取证或编排改编 | `novel-to-game` |
| 玩法、系统、关卡、叙事或美术方向 | `game-design` |
| 实现设计或用白盒验证具体风险 | `game-build` |
| 独立验证实际浏览器构建 | `game-qa` |

此 bundle 挂载 `novel-to-game` Host 行和 `preset-novel-to-game` 模式行。可选配置 `editorMaxBytes` 默认为 2097152；`trustedHosts` 默认为空列表，用于扩展默认仅允许回环地址的 API 主机列表。它不安装小说、短剧或视频工具。

<a id="understand-the-implementation"></a>
## 理解实现

职责与信任边界见[小说转游戏子系统](../../../docs/subsystems/novel-to-game.zh.md)。

在仓库根目录运行 `pnpm --filter @winterhuan/dsh-novel-to-game build` 可单独构建，运行 `pnpm --filter @winterhuan/dsh-novel-to-game test` 可验证此包。

Host 入口负责工作区路由和配置。`./agent` 导出在 `novel-to-game` preset 及继承它的原生子 Agent 组合内注册领域技能和工具。preset 提供任务专属 persona 和显式原生工具组合，不改变默认模式。

<details>
<summary>实现细节 — 点击展开</summary>

[Profile 补丁](cordis.patch.yml)加载 [Host 插件](src/index.ts)。作用域内的 Agent 入口拥有 Skill 资源与 `game_qa`；Host 拥有 `/novel-to-game/workspace`、`/novel-to-game/file` 和隔离预览路由。QA 通过 DSH shell 和 jobs 运行，无需生产凭据。预览证据由当前 Host 进程签名，并核对当前构建和证据字节。

[浏览器入口](src/client/index.ts)注册仅含游戏的侧边栏，拥有独立 Session 状态。原著导出、谱系与索引辅助脚本随 `knowledge/source-tools` 分发；测试核对这些副本与维护源的一致性。

</details>

<a id="further-exploration"></a>
## 进一步阅读

- [四插件提案](../../../.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.zh.md)

<a id="model-experience"></a>
## 模型体验

### 技能与 QA

#### 模型看到什么

所选模式加入领域 persona 与原生工具 schema。稳定 persona 记录在[提示词快照](../../../tests/fixtures/novel-to-game-persona.txt)中；标准模式和其他领域模式不包含本领域能力。前缀与 schema 在按需加载技能之前占用上下文，原生压缩管理累积历史。 DSH 目录展示四个 Skill 描述。加载 Skill 时提供随包指令、供原生 read 读取任务资料的 DSH 资源目录，以及本地辅助脚本路径。`game_qa` 接受项目路径、可选后台执行和超时参数，返回进程输出或作业 ID。加载后的技能要求前置阶段采用前台委派，并在进入下一阶段前核对子 Agent 的最终结果和产物。委派失败时报告具体诊断并保留已有产物；DSH 模型服务的认证和地址错误需修复提供商配置。

#### Token 影响

Skill 正文按需加载。QA 输出成为普通工具结果；浏览器预览内容不会自动进入提示词。

#### KV Cache 影响

插件使用普通 DSH Skill 和工具历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- QA 需要本地 Chrome、Node 22+ 和 Python 3.9+。预览支持浏览器构建；原生可执行程序需要单独交付。PASS 认证执行检查，不代表主观可玩性。Host 重启会使此前进程签名失效。此包不生成付费资产，也不授予原著使用权。

<a id="dev-note"></a>
### 开发笔记

四个领域插件分别开发、构建、测试和安装。
