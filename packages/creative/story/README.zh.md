---
description: "小说工作台，可独立安装技能、工具与浏览器界面。"
kind: "package-bundle"
---

# @winterhuan/dsh-story

[English](README.md) | 中文

## 摘要

通过六个 Skill、七个专家 Role 和独立编辑器写作与审查小说。只读概览展示长篇进度、角色、伏笔和双时间线。可选用原生 workflow 完成细纲准备、写作、独立审稿和带版本保护的章节提交。草稿保留在当前 DSH Session，保存使用已观察的文件版本。此 bundle 可以独立安装，也可以通过 Creative 安装。

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

从右侧栏打开**小说工作台**。插件使用当前 DSH Session、文件系统、模型和权限。在小说设置页配置朱雀，密钥保留在 DSH 凭据库。

长篇和短篇统一使用 `{工作区}/{作品名称}/`。打开 `shenji/` 后，概览列出 `神机诸天录`；长篇正文放在 `神机诸天录/正文/`，短篇可使用 `另一作品/正文.md`。工作区本身不是作品，`长篇/作品/` 或 `短篇/作品/` 不作为额外分类层；若直接打开了作品目录，应切回其父工作区。作品内部的分卷继续递归显示，文件和草稿保留完整路径。工作区级 `拆文库/` 在文件页可见，不进入作品选择框。

六个入口分别是 `story`（工程准备、已有小说接入、选题与偏好）、`story-write`（长短篇写作）、`story-analyze`（拆解）、`story-review`（审稿）、`story-polish`（本地润色及明确请求的朱雀检测）和 `story-cover`（封面）。已有工程直接继续；原始文本接入不要求先拆全书。

### 包内 CLI

在 DSH 中使用已安装包的 `lib/cli.js` 绝对路径。本地仓库的入口是：

```sh
node /Users/winter/dsh-creative/packages/creative/story/lib/cli.js --help
node /Users/winter/dsh-creative/packages/creative/story/lib/cli.js project status \
  --workspace /Users/winter/workspace/shenji --book 神机诸天录 --json
```

安装环境将 `dsh-story` 放入 PATH 时，两种调用等价。`--help` 列出工程、细纲、章节、短篇、文本、记忆、拆文、导出、谱系和检测操作。作品操作须明确工作区和直属作品名称。JSON 结果提供检查发现与错误；标点归一仅在 `--apply` 时写入。启动入口转发输入、输出和取消，不调用模型；缺少 Python 时返回结构化错误。

### 连续性概览与查询

工作台的“概览”显示已提交章节、当前位置、下一章承诺、风险与近三章速记。角色可展开查看状态和已知信息；伏笔可按到期、逾期、未定回收章或已回收筛选；时间线分别展示作者真相与读者已知。分类支持搜索与分页，来源入口切换到“文件”视图。概览不会写入小说文件，切换视图保留编辑草稿。

首次打开显示概览，已有编辑会话保留文件视图。没有作品时显示创建／打开工作区的提示，不用工作区名代替作品。多本书通过小说选择框切换；刷新、窗口重新获得焦点和可识别的章节提交会重读状态。读取失败保留同一本书的上次内容并提示陈旧，状态缺失显示接入提示，格式损坏显示错误。进度来自已提交追踪，不把未提交稿、文件检查或旧审稿记录当成当前文学质量批准。

在对话中通过 `story` 查询状态、角色、伏笔或历史记录；CLI 入口是 `dsh-story project status` 与 `project query`。查询带来源与修订号，每次最多 50 条且不超过 16 KiB，分页可用 `--revision` 拒绝混合版本。写前准备单独查询全部到期伏笔，覆盖续写状态卡最多 8 条之外的项；日期提醒由作者和写作流程结合卷纲处理，不自动延期或回收。具体命令见[连续性查询](knowledge/story/skills/story/references/project/continuity-query.md)。

“记住本书的写法”使用既有 book 范围作者记忆与确认回执；角色、伏笔和事件经章节事务保存。记忆的候选确认、替换、撤回与优先级见[作者记忆](knowledge/story/skills/story/references/project/author-memory.md)。

<a id="specialist-agents"></a>
### 专业 Agent

需要独立专家时使用当前可见的原生 `subagent`，任务说明专业身份、Role 文件绝对路径和资源根，由实际子 Agent 用原生 `read` 读取指令。用户明确要求 Agent Teams 时使用 `spawn_teammate`，再以 `send_message` 复用成员。参见[委派说明](knowledge/story/skills/story-write/references/delegation.md)。Role 不是额外工具或 Skill，调用方读取它也不构成独立评审。

### 原生单章 workflow

要求 `story-write` 用原生 workflow 写长篇新章，或声明后续章节采用这一偏好。父会话提供工程、章号和约束，再按[调用说明](knowledge/story/skills/story-write/references/long/native-workflow.md)读取模板。DSH 已有的 `workflow` 工具内，Prepare 在已授权规划内检查或补建本章细纲并生成场景计划，随后执行写作、独立审稿、最多两轮修订及追踪提交验证。已有可用细纲直接复用；除非用户要求确认，常规准备不再次索要批准。关键事实缺失或需要作者裁定时停止依赖工作。连续章串行执行，保留仍有未决问题的草稿。

审稿在此 workflow 内返回少量流程分支字段，普通审稿仍为自然语言。提交校验审稿对应的正文、细纲哈希和预期追踪修订号；文件变化后须重检重评审。追踪不增加审稿证明。原生运行完成可能包含未提交的章节结果，调用方须检查返回状态再推进。

### 多章拆解

开头、单章或局部问题由 `story-analyze` 直接读原文并回答，只在用户要求保存时写入对应文件。多章或全书时，父会话先在 `拆文库/<书名>/_progress.md` 确认一份章节边界表，用 `analysis inspect` 取得来源身份和已有卡片，再按[批次调用说明](knowledge/story/skills/story-analyze/references/long/native-workflow.md)读取 Skill 本地模板。每次原生 workflow 最多提取四章卡片，并报告失败或跳过章节。父会话将结果交给 `analysis write-cards`，由它核验来源身份与章内证据、渲染 Markdown 并保存。覆盖已有卡片需要明确指定替换；来源变化会拒绝旧提取结果，重试保留成功卡片。卡片齐了之后，父会话按至多十个卷段写 `剧情/节奏.md`、`剧情/情绪模块.md`、`文风.md` 和 `拆文报告.md`，卷段读原文和短卡片。短篇拆解不使用这个模板。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

[补丁](cordis.patch.yml)挂载领域行和小说设置页。朱雀密钥写在 `story` 设置命名空间，默认凭据引用是 `MAKERS_API_KEY`。`editorMaxBytes` 默认为 2097152；`trustedHosts` 扩展默认回环地址列表。`/story` API 将文档访问限定在本领域项目路径中。

写作守卫与专家 Role 属于此包。用户明确要求的朱雀检测会将选定章节发送到腾讯 EdgeOne Makers，只接收配置的 MAKERS_API_KEY。

此包不依赖 Creative 聚合包或其他领域插件。必需辅助脚本作为包资源分发。[聚合包](../creative/README.zh.md)保留兼容工具名和路由，自身没有聚合页面。

每个 Skill 拥有自己的 `references/`，专业 Role 放在所属 Skill 的 `references/roles/`。`story-write` 与 `story-analyze` 各自拥有 workflow 模板，Skill Viewer 直接发现并预览本地参考。包内 `lib/cli.js` 启动 `runtime/` 中的 Python 调度器，并向进程组转发取消信号。内部 Python 与 JavaScript 模块保留既有追踪事务、共用章文件路径和目标字数解析。小说工作区响应包含独立作品列表、上限为 1,000 项的文件列表及文件截断状态。作品发现检查直属子目录中的标准目录或独立文档，达到文件上限后仍继续；概览直接读取所选作品的追踪。运行中的 Host 未提供作品列表时，客户端从文件列表识别作品，直到 Host 重启。事务写入使用进程退出时释放的操作系统文件锁；锁文件常驻磁盘，不应删除。写入中断后，先重试原事务，再检查派生视图。

</details>

<a id="model-experience"></a>
## 模型体验

### 领域技能与执行

#### 模型看到什么

领域目录列出六个 Skill，加载时向当前 Agent 提供指令和资源路径。所选 Skill 或 workflow 分配执行顺序和检查，Role 提供专业方法。写入 hook 要求重新检查和审稿，再由指定提交者通过章节事务更新追踪。只有父会话读取调用说明，子会话接收阶段职责和选定参考。Prepare 返回实际路径、场景计划和已检查的细纲身份；写手接收这些结果及完整检查命令。workflow 子会话以 `structured_output` 结束，缺少结果时提示父会话查看失败子会话。委派失败保留已有产物并报告诊断，模型服务认证或地址错误需修复提供商配置。前置委派须完成且产物检查通过后才推进。只读的 `story-explorer` 用自然语言交回事实、来源和缺口。`story_zhuque` 调用包内检测 CLI，后台执行返回 DSH 作业 ID，供 `job_output` 与 `job_kill` 使用。

#### Token 影响

Skill 正文和专业指令按需加载，初始目录不增加专用 Role 工具 schema 或整套专家正文。连续性查询每次最多 16 KiB，超过条数或字节预算会返回下一页位置；写前到期伏笔较多时需要额外分页，不能静默省略。读取再提交 workflow 模板会保留两份源码，独立子 Agent 还会读取各自指令和原文，因此可能比直接委派更贵；查询容量不等于提供商 token 计费或端到端效率承诺。

#### KV Cache 影响

插件使用 DSH 工具和 Skill 历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 原生 Team 工具需要显式启用团队组合和持久 Session。专业指令进入任务上下文，不由插件覆盖系统 persona。审稿输出普通意见；章节脚本校验机械条件，不认证文学质量或评审模型元数据。
- CLI 需要 Node 和 Python 3.9+。付费服务需要创作者授权和已配置凭据。独立侧边栏各自保存状态；旧聚合草稿不迁移。
- 原生单章模板需要 DSH 组合提供 `workflow` 和子 Agent 结构化输出。它处理长篇新章及其未提交稿；已提交章修改沿用现有修订路径。模板复用与审稿只读依靠指令，不是 Host 强制机制或单独审稿权限策略。取消保留产物，恢复核对真实文件和追踪，不恢复旧脚本栈。文件校验不隔离任意外部写入者。
- 概览通过现有文件 API 读取状态，受 `editorMaxBytes` 限制；大列表在界面分页，不新增数据库或服务器。它校验展示字段，完整追踪体检仍使用 `dsh-story project check`。历史查询提供已有逐章记录，不重建任意章的完整世界状态；原文和缺失记录需定点核查。

<a id="dev-note"></a>
### 开发笔记

按 DSH token-meter 的固定密度估算，`story_zhuque` 输入 schema 为 249 token，引入作品和文件参数前为 226；首轮其他内容相同时估算增加 23 token。这是 schema 估算，不是提供商分词结果。未引入独立公共运行时包。
