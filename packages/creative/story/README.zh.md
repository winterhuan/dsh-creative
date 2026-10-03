---
description: "小说工作台，可独立安装技能、工具与浏览器界面。"
kind: "package-bundle"
---

# @winterhuan/dsh-story

[English](README.md) | 中文

## 摘要

通过六个 Skill、七个专家 Role 和独立编辑器写作与审查小说。可选用原生 workflow 完成细纲准备、写作、独立审稿和带版本保护的章节提交。草稿保留在当前 DSH Session，保存使用已观察的文件版本。此 bundle 可以独立安装，也可以通过 Creative 安装。

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

小说工作台识别当前会话工作目录及其下一层子目录中的小说。例如打开 `shenji/`，会显示 `神机诸天录/正文/` 及该小说的其他标准目录；也可以直接打开 `神机诸天录/`。各小说的文件和编辑草稿保留完整路径。项目发现只向下扫描一层，`正文/`、`大纲/`、`设定/` 等已识别目录内部的分卷仍递归显示。两个项目层级都支持独立短篇文件。

六个入口分别是 `story`（工程准备、已有小说接入、选题与偏好）、`story-write`（长短篇写作）、`story-analyze`（拆解）、`story-review`（审稿）、`story-polish`（本地润色及明确请求的朱雀检测）和 `story-cover`（封面）。已有工程直接继续；原始文本接入不要求先拆全书。

<a id="specialist-agents"></a>
### 专业 Agent

需要独立专家时使用当前可见的原生 `subagent`，任务说明专业身份、Role 文件绝对路径和资源根，由实际子 Agent 用原生 `read` 读取指令。用户明确要求 Agent Teams 时使用 `spawn_teammate`，再以 `send_message` 复用成员。参见[委派说明](knowledge/story/references/project/delegation.md)。Role 不是额外工具或 Skill，调用方读取它也不构成独立评审。

### 原生单章 workflow

要求 `story-write` 用原生 workflow 写长篇新章，或声明后续章节采用这一偏好。父会话提供工程、章号和约束，再按[调用说明](knowledge/story/references/writing/long/native-workflow.md)读取模板。DSH 已有的 `workflow` 工具内，Prepare 在已授权规划内检查或补建本章细纲并生成场景计划，随后执行写作、独立审稿、最多两轮修订及追踪提交验证。已有可用细纲直接复用；除非用户要求确认，常规准备不再次索要批准。关键事实缺失或需要作者裁定时停止依赖工作。连续章串行执行，保留仍有未决问题的草稿。

审稿在此 workflow 内返回少量流程分支字段，普通审稿仍为自然语言。提交校验审稿对应的正文、细纲哈希和预期追踪修订号；文件变化后须重检重评审。追踪不增加审稿证明。原生运行完成可能包含未提交的章节结果，调用方须检查返回状态再推进。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[补丁](cordis.patch.yml)挂载领域行、`creative-produce` 配置行和已有设置页。重复配置行 ID 通过 DSH Loader 组合解析。`editorMaxBytes` 默认为 2097152；`trustedHosts` 扩展默认回环地址列表。`/story` API 将文档访问限定在本领域项目路径中。

写作守卫与专家 Role 属于此包。用户明确要求的朱雀检测会将选定章节发送到腾讯 EdgeOne Makers，只接收配置的 MAKERS_API_KEY。

此包不依赖 Creative 聚合包或其他领域插件。必需辅助脚本作为包资源分发。[聚合包](../creative/README.zh.md)保留兼容工具名和路由，自身没有聚合页面。

六个技能共用包内 `knowledge/story` 资源根目录。DSH 提供资源路径提示，技能与 Role 用原生 `read` 按需读取参考；脚本集中在该目录的 `scripts/`。Python 细纲检查器 `check_outline_contract.py` 通过 `wordcount_core.py` 与提交共用章文件路径和目标字数解析。小说工作区响应包含文件列表和截断状态。

</details>

<a id="model-experience"></a>
## 模型体验

### 领域技能与执行

#### 模型看到什么

领域目录列出六个 Skill，加载时向当前 Agent 提供指令和资源路径。所选 Skill 或 workflow 分配执行顺序和检查，Role 提供专业方法。写入 hook 要求重新检查和审稿，再由指定提交者通过章节事务更新追踪。只有父会话读取调用说明，子会话接收阶段职责和选定参考。Prepare 返回实际路径、场景计划和已检查的细纲身份；写手接收这些结果及完整检查命令。workflow 子会话以 `structured_output` 结束，缺少结果时提示父会话查看失败子会话。委派失败保留已有产物并报告诊断，模型服务认证或地址错误需修复提供商配置。前置委派须完成且产物检查通过后才推进。只读的 `story-explorer` 用自然语言交回事实、来源和缺口。`story_zhuque` 执行固定脚本，后台执行返回 DSH 作业 ID，供 `job_output` 与 `job_kill` 使用。

#### Token 影响

Skill 正文和专业指令按需加载，初始目录不增加专用 Role 工具 schema 或整套专家正文。以 `cl100k_base` 静态估算，延后加载的模板为 3808 token，仅父会话读取的说明为 2216，`story-explorer` 为 1464。读取再提交模板会保留两份源码，尚未计入工具格式。独立子 Agent 还会读取各自指令和原文，因此可能比直接委派更贵；这些数值不是提供商计费或端到端效率结论。

#### KV Cache 影响

插件使用 DSH 工具和 Skill 历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 原生 Team 工具需要显式启用团队组合和持久 Session。专业指令进入任务上下文，不由插件覆盖系统 persona。审稿输出普通意见；章节脚本校验机械条件，不认证文学质量或评审模型元数据。
- Python 脚本需要 Python 3.9+；章节检查还需要 Node。付费服务需要创作者授权和已配置凭据。独立侧边栏各自保存状态；旧聚合草稿不迁移。
- 原生单章模板需要 DSH 组合提供 `workflow` 和子 Agent 结构化输出。它处理长篇新章及其未提交稿；已提交章修改沿用现有修订路径。模板复用与审稿只读依靠指令，不是 Host 强制机制或单独审稿权限策略。取消保留产物，恢复核对真实文件和追踪，不恢复旧脚本栈。文件校验不隔离任意外部写入者。

<a id="dev-note"></a>
### 开发笔记

未引入独立公共运行时包。
