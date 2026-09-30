---
description: "面向小说、短剧、互动游戏与视频解说生产的工作台插件。"
kind: "package-bundle"
---

# @winterhuan/dsh-creative

[English](README.md) | 中文

## 概述

Creative 一次安装小说、短剧、游戏和视频解说四个独立工作台，并保留旧生产工具与 HTTP 接口。右侧栏由四个领域插件提供；Creative 自身没有聚合页面或浏览器入口。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

---

<a id="use-this-package"></a>
## 使用本包

### 安装到 profile

`dsh plugin add` 把本 bundle 安装到 profile，其 [profile 补丁](cordis.patch.yml)挂载 `story`、`short-drama`、`novel-to-game`、`video-recap`、`creative`、`creative-produce` 设置命名空间和设置页。bundle 组合四个 Skill 提供方（`story`、`short-drama`、`novel-to-game`、`video-recap`）、`creative_role` 专家 Role 和生产工具。这些注册只需要技能、子代理和工具注册表；当 `webServer` 和 `typert` 也可用时，才注册 Session 级 `/creative` API。

```yaml
- id: creative
  name: '@winterhuan/dsh-creative'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `editorMaxBytes` | `2097152` | 工作台编辑器可编辑文本文件的最大字节数。 |
| `trustedHosts` | `[]` | 除回环地址外，允许访问工作台 API 的额外 `host[:port]`。 |
| `produce` | `{}` | 生产配置与凭据引用的初始值；`creative-produce` 设置命名空间提供用户覆盖。 |

### 打开工作台

在会话中选择项目工作区，然后从右侧栏分别打开小说、短剧、游戏或视频解说工作台。各页面使用独立状态。已保存的项目文件直接可用；旧聚合页面的未保存草稿不迁移。

### 章节评审

长篇章节提交前先检查细纲就绪、生成紧凑场景计划并完成读者价值评审。评审将原文引句绑定到最终正文哈希，追踪保留紧凑续写摘要。打包 Role 的 `agent_options` 可选择审查模型，不增加由调用方控制的工具参数；无效选项在加载时失败。AI 模式和朱雀结果仅作建议。项目标点默认保留；`设定/写作检查.json` 可选择 `normalize-narration`，归一叙述标点时保留引号内对话。参见[读者价值决策](../../../.agents/notes/implemented/feature/2026-09-22-novel-reader-value-generation.zh.md)和[章节工作流](../story/knowledge/story/skills/story-long-write/references/workflow-chapter.md)。

### 交付与验证

短剧生产通过 `episode-compose` adapter 合成已确认的片段、定时对白、音乐和字幕。工作台检查同一版本的整集文档，并用带哈希的生产清单关联已发布媒体。未保存或不合法的剧集文档会阻止准备。

游戏模板提供状态、保存/读取、重开与 QA hook。游戏插件的 `game_qa` 工具（保留兼容 `game-qa` 入口）在 Studio 预览限制下运行真实 Chrome，预览旁显示经过认证的结果。策略报告与独立盲玩报告仍是设计反馈。没有游戏项目时，游戏工作台显示空状态。

视频解说支持显式本地草稿，降级阶段记入 `draft_status.json`。草稿在界面中与最终成片区分。交付证据测量旁白覆盖、原片复用、声明的授权与画幅，不代表平台批准。

### 配置付费生产

生产设置保存的是凭据引用，不是密钥。自定义引用（例如 `AGNES_POOL`）仍然提供 adapter 的规范变量 `AGNES_API_KEY`；重命名引用不会改变子进程变量名。逗号分隔的引用和换行分隔的已存密钥组成轮换池（[执行策略](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.zh.md#production-and-credentials)）。

短剧生产要求任务已经用内置的 `production_tool.py` 准备并明确确认。把它的 `job_id`、匹配的 `adapter` 和项目 `workdir` 传给 `creative_produce_run`；执行器快照已确认的输入，在执行前消耗一次确认，校验并发布产出，然后记录这次运行。`stdin` 中替换的 job JSON 和额外的短剧参数都会被拒绝，`argv: ["--selftest"]` 是唯一的短剧诊断。任务输入改变后需要重新准备和确认；工作台请求或作业绑定永远不能代替确认。

未配置模型时，Agnes 视频使用免费的 `agnes-video-2.5-flash`；可以设置 `produce.agnesVideoModel`、对应的生产设置或 `AGNES_VIDEO_MODEL` 选择其他模型，其中 `agnes-video-2.5` 按秒计费。它的执行器在消耗确认之前校验模型、参数和参考输入，因此本地校验错误会报告原因，回执保持未使用。

---

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[安装补丁](cordis.patch.yml) 组合四个领域包及已有生产设置页。各领域包拥有技能、资源和浏览器入口。Creative 的 [Host 入口](src/index.ts) 只注册旧生产工具及 `/creative` 兼容接口；既不构建浏览器 bundle，也不保存合并页面状态。

安装时使用相同领域行 ID，避免与单独安装的插件重复注册。编辑器和生产界面的实现参见各领域包；已有磁盘项目无需迁移。

</details>

---

<a id="further-exploration"></a>
## 进一步探索

- [Creative 分组地图](../README.zh.md)：包家族概览。
- [Creative 子系统](../../../docs/subsystems/creative.zh.md)：四个接缝及其信任边界。
- [Creative 工作台决定](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.zh.md)：理由、替代方案和验证。
- [DeepSeek Harness 架构](../../../upstream/docs/architecture.md)：组合与扩展点。

---

<a id="model-experience"></a>
## 模型体验

### Creative 技能与 Role

#### 模型看到什么

技能通过 `ctx.skills` 发现，用 `skill` 加载。[四个 provider](src/skill-provider.ts) 从 `SKILL.md` 读取描述和完整正文，并在前面加上共享的调用说明和领域集成说明：工作流名称（包括 `$name` 和 `/name` 引用）指向 Skill；`creative_role` 只委派七个内置的小说专家；委派某个阶段时使用 `subagent`，并给出让子代理加载对应 Skill 的自包含任务。Role 通过 `creative_bundled_reference` 读取打包参考（[决策](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.zh.md#composition-and-knowledge)）。

#### Token 影响

发现阶段只提供简短描述；全部 37 个条目都在默认 500 字符的目录上限之内。`skill` 加载把正文作为工具结果加入，不替换目录消息，也不预加载其他正文；`creative_role` 在子轮次中加入所选 Role 的 persona。

#### KV Cache 影响

本包本身不直接影响提示词。`skill` 目录消息和工具结果是持久上下文；通过 `creative_role` 委派子代理会增加一个嵌套轮次，其 KV 条目只属于该子代理。

### 生产投影工具

#### 模型看到什么

`creative_production` 提供四种投影意图（`open_section`、`focus_target`、`set_sequence`、`track_job`），带经过校验的完整项目 `episode` 路径和 `targetId` 字段。`track_job` 要求当前 Session 已拥有的作业和生产请求身份；剧集合成通过已确认的 `episode-compose` adapter 在后台运行。`creative_produce_run` 只在显式后台模式下接受可选的生产上下文，并返回真实的作业绑定。前台结果保留 `exitCode`、`timedOut`、终止 `signal` 和有界的 stdout/stderr，退出码非零或未知都算失败。普通命令的 `completed` 状态只表示进程已经结束。两个工具的生产上下文都不授权付费媒体生成。

#### Token 影响

成功的生产结果会在工具历史中加入紧凑的请求、目标和作业引用 JSON；其他意图只移动浏览器工作台的焦点，不把文档内容加入模型上下文。

#### KV Cache 影响

投影意图是工具调用，结果携带确认信息；除 Session 的工具历史外，不增加持久上下文。

### 生产凭据状态

#### 模型看到什么

`creative_produce_status` 报告短剧 adapter（包括 `agnes-image` 和 `agnes-video`）、MiMo 与 Fish 视频提供方以及朱雀检测的凭据是否存在。它使用执行配置的凭据查找，不返回密钥，也不启动进程。普通 shell 环境检查看不到托管的凭据库；缺失的密钥应在 Creative 生产设置里配置，而不是在对话中提供。

#### Token 影响

每次调用加入一条简短的 JSON 状态结果。该工具不发起模型或媒体提供方请求。

#### KV Cache 影响

状态结果遵循普通的工具历史记录。每次新检查都解析当前凭据，不改动之前的消息；凭据存在不代表提供方可连通，也不授权生产。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **运行错误文本保持简体中文**：工作台界面通过 `creative` locale 命名空间渲染，而服务端错误正文、运行时诊断和抛出的错误在工作区路由提供稳定错误码之前保持简体中文。
- **知识库随包分发**：`knowledge/` 目录增大克隆和包体积；尚未实现按需获取。
- **浏览器自动化依赖外部程序**：`browser-cdp` 需要执行环境中有兼容的 `agent-browser` 和 Lightpanda，两者都不随包提供；不复用 Chrome 配置，游戏 QA 则另需 Chrome 与 Node 22+ 来提供截图和交互证据。
- **作业只存在于进程内**：Host 重启后，没有对应活动作业的绑定显示为不可用，且永远不会自动重启。没有真实绑定的历史 `track_job` 记录仍只是请求，不是执行证据。
- **预览运行时跟随独立标签挂载** — 重新打开游戏或视频工作台会重建预览，不恢复进程内运行状态。
- **远程执行需要挂载资源**：通过 provider 读取的媒体每个文件最多 256 MiB，远程 shell 需要把打包脚本挂载或复制到自己的文件系统。
- **视频生产的保护弱于短剧**：视频入口依靠 Skill 强制的创作者确认，而不是短剧执行器的一次性回执和档案，只在调用之间轮换密钥，并且只提供完整解说、配音和诊断，以及显式的短剧媒体复核。本地草稿需要 ffmpeg；本地转录和语音需要已安装的引擎，或者显式的转录豁免与时序占位音。
- **已被接受的短剧提交不会重试**：只有首次提交被拒绝并标记为 `submission_rejected` 时才轮换密钥；轮询、下载和结果不确定的失败都会结束这次运行。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>面向维护者的工作上下文：点击展开</summary>

无。

</details>
