---
description: "小说创作模式，提供按需写作技能和会话专属工作台。"
kind: "package-bundle"
---

# @winterhuan/dsh-story

[English](README.md) | 中文

## 摘要

选择小说创作模式，通过六个 Skill、七个专家 Role 和独立编辑器写作与审查小说。只读概览展示长篇进度、角色、伏笔和双时间线。可选用原生 workflow 完成细纲准备、写作、独立审稿和带版本保护的章节提交。草稿保留在当前 DSH Session，保存使用已观察的文件版本。此 bundle 独立安装。

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

在新会话或空白会话选择**小说创作**，再从右侧栏打开**小说工作台**。工作台入口与小说文件跳转只在小说会话中提供。切换会话保留各小说会话的作品、文件和未保存草稿。小说设置全局可用，朱雀密钥保留在 DSH 凭据库。

长篇和短篇统一使用 `{工作区}/{作品名称}/`。打开 `shenji/` 后，概览列出 `神机诸天录`；长篇正文放在 `神机诸天录/正文/`，短篇可使用 `另一作品/正文.md`。工作区本身不是作品，`长篇/作品/` 或 `短篇/作品/` 不作为额外分类层；若直接打开了作品目录，应切回其父工作区。作品内部的分卷继续递归显示，文件和草稿保留完整路径。工作区级 `拆文库/` 在文件页可见，不进入作品选择框。

六个入口分别是 `story`（工程准备、已有小说接入、选题与偏好）、`story-write`（长短篇写作）、`story-analyze`（拆解）、`story-review`（审稿）、`story-polish`（本地润色及明确请求的朱雀检测）和 `story-cover`（封面）。已有工程直接继续；原始文本接入不要求先拆全书。

### 包内 CLI

在 DSH 中使用已安装包的 `lib/cli.js` 绝对路径。本地仓库的入口是：

```sh
node /Users/winter/dsh-creative/packages/creative/story/lib/cli.js --help
node /Users/winter/dsh-creative/packages/creative/story/lib/cli.js project status \
  --workspace /Users/winter/workspace/shenji --book 神机诸天录 --json
```

安装环境将 `dsh-story` 放入 PATH 时，两种调用等价。`--help` 列出工程、细纲、章节、短篇、文本、记忆、拆文、导出、谱系和检测操作。作品操作须明确工作区和直属作品名称。JSON 结果提供检查发现与错误；标点归一仅在 `--apply` 时写入。启动入口转发输入、输出和取消，不调用模型；CLI 为纯 TypeScript 实现，不依赖 Python。

### 连续性概览与查询

工作台的“概览”显示已提交章节、当前位置、下一章承诺、风险与近三章速记。「风险」卡片列出逾期未回收的伏笔、埋设已久且未定回收章的伏笔、时间线久未触及的核心角色，以及长期未收的线索；每条使用既有的来源按钮。角色可展开查看状态和已知信息；伏笔可按到期、逾期、未定回收章或已回收筛选；时间线分别展示作者真相与读者已知。分类支持搜索与分页，来源入口切换到“文件”视图。概览不会写入小说文件，切换视图保留编辑草稿。

首次打开显示概览，已有编辑会话保留文件视图。没有作品时显示创建／打开工作区的提示，不用工作区名代替作品。多本书通过小说选择框切换；刷新、窗口重新获得焦点和可识别的章节提交会重读状态。读取失败保留同一本书的上次内容并提示陈旧，状态缺失显示接入提示，格式损坏显示错误。进度来自已提交追踪，不把未提交稿、文件检查或旧审稿记录当成当前文学质量批准。

在对话中通过 `story` 查询状态、角色、伏笔或历史记录；CLI 入口是 `dsh-story project status`、`project query`、一次取齐写前上下文的 `project context`，以及只读检索 `设定/` 的 `project lookup`。查询带来源与修订号，每次最多 50 条且不超过 16 KiB，分页可用 `--revision` 拒绝混合版本。`project query --kind health` 用同一套分页列出「风险」卡片的四类条目。默认阈值是未定回收伏笔埋设 30 章、角色自最近一次时间线接触起 20 章、未揭示事实或未收线索 40 章；`--stale-planted`、`--stale-character`、`--stale-thread` 可改。`project context` 在同一 16 KiB 内最多保留 8 条健康摘要，省略条目时仍保留计数，并最多附上 4 条与细纲或草稿命中的设定摘录；放不下时先省略设定摘录。写前准备先看这份摘要，再单独查询全部到期伏笔，覆盖续写状态卡最多 8 条之外的项。设定摘录被省略，或要核对另一段原文时，用 `project lookup`：`--file` 指向细纲或草稿，`--text` 传入字面量。精确名称和别名优先，其余按关键词打分。别名写在设定文件头部。日期提醒由作者和写作流程结合卷纲处理，不自动延期或回收。具体命令见[连续性查询](knowledge/story/skills/story/references/project/continuity-query.md)。

`dsh-story chapter rules` 在正文出现之前列出本章适用的规则。每条规则有稳定 ID、原文，以及来源路径和行号。一次结果不超过 16 KiB。放不下的规则、扫描行和 warning 计入 `omitted`，`rules_sha256` 覆盖完整列表。缺文件或缺标题是 warning，命令仍成功。一本书可以在 `设定/写作检查.json` 里换掉默认来源，并加上 `forbidden`、`era` 和 `void_terms`。同一句话把最先的 ID 留在 `text`，其余 ID 放进 `also`。字段和 ID 见[产物协议](knowledge/story/skills/story-write/references/long/artifact-protocols.md)。

`dsh-story book audit` 读取一段连续章号，返回 `story-book-audit/v1`。不加 `--write` 时不创建文件、不改追踪。`--write` 在书内保存一份 Markdown；默认路径是 `草稿/体检_第A-B章.md`。路径必须是书目录内、`追踪/` 之外的 `.md`，软链接会被拒绝。没有 blocking 时退出码为 0。只有 hint 时该项为 `warn`，`warn` 仍以 0 退出。有 blocking 时为 1，参数或配置错误为 2。`--write` 在 JSON 里加上 `report_path`。检查包括章节质量、健康查询、角色卡、读者价值哈希、仍留着的作废条目、事实账本过期、节奏、卷纲规划、力量与关系上限，以及文风。`--issues` 才写 `草稿/问题单.json`。字段见[产物协议](knowledge/story/skills/story-write/references/long/artifact-protocols.md#全书体检)。

`dsh-story facts record`、`facts query`、`facts diff` 和 `facts stale` 维护 `追踪/事实账本.json`（`story-facts/v1`）。它在追踪 schema 第 5 版旁边，不升版本。`kind` 为场地、伤情、账目、物件、能力、年代、指令。修改追加 `changes`，原 `attrs` 保留。每条保存 `source.body_sha256`。写入走追踪锁。`project context` 在设定摘录之后、健康摘要之前加入最多 2 KiB 的 `facts`，以及最多 1.5 KiB 的 `volume`。`facts_diff` 缺省为 `off`，只有这本书写成 `required` 才拦提交。账本缺章由 `facts stale` 和体检的 `facts-stale` 报告，不由 `project check` 报告。`project rhythm`、`project plan check` 和 `project cast check` 读细纲、卷纲和账本。`project lookup --reference` 只读登记表指向的拆文库，命中标 `source: reference`。`analysis rhythm-card` 写出不超过 2 KiB 的节奏卡。`text style-baseline` 测量段长、破折号、顶针、固定比喻和空行；配置了 `style` 时，同一指标连续三章超限变为 blocking。`project legacy archive --reader-value` 把 `reader_value_records` 移到 `追踪/_legacy/`。`project context retire` 去掉一条上下文并追加 `追踪/维护记录.md`。已提交章改稿使用 `workflows/revise.js`。字段见[产物协议](knowledge/story/skills/story-write/references/long/artifact-protocols.md#事实账本与规划检查)。

`dsh-story chapter audit-verify` 校验一份 `story-rule-audit/v1`。默认路径是 `草稿/审稿/第NNN章.rules.json`。`--input` 改读本书内的另一条路径。当前 `chapter rules` 清单里的每个 ID 都要有一条结论，清单外的 ID 会使校验失败。`violate` 的引文经过与章节规则相同的归一化后，必须出现在所标正文行上。`body_sha256` 和 `rules_sha256` 必须对应当前正文原始字节和当前规则列表。退出码 0 返回已校验结果，并列出 violate 与 unclear 的 ID。退出码 1 列出全部原因，缺文件也算失败。离开本书的路径以 2 退出。`设定/写作检查.json` 可以把 `rule_audit` 设为 `off` 或 `required`。缺这个键等于 `off`，`off` 时 `chapter commit` 不要求这份文件。`required` 要求默认路径上的文件已通过校验，并且每条 violate 的 ID 都在事务的 `accepted_findings` 里。这些例外写入逐章记录，不写入追踪状态。`unclear` 不拦提交。门禁保持关闭，直到第 001–012 章完成标定：R1–R3 必须命中，已知干净章的误报 violate 不超过 1 条。字段见[产物协议](knowledge/story/skills/story-write/references/long/artifact-protocols.md#规则审稿)。

“记住本书的写法”使用既有 book 范围作者记忆与确认回执；角色、伏笔和事件经章节事务保存。记忆的候选确认、替换、撤回与优先级见[作者记忆](knowledge/story/skills/story/references/project/author-memory.md)。

<a id="specialist-agents"></a>
### 专业 Agent

需要独立专家时使用当前可见的原生 `subagent`，任务说明专业身份、Role 文件绝对路径和资源根，由实际子 Agent 用原生 `read` 读取指令。用户明确要求 Agent Teams 时使用 `spawn_teammate`，再以 `send_message` 复用成员。参见[委派说明](knowledge/story/skills/story-write/references/delegation.md)。Role 不是额外工具或 Skill，调用方读取它也不构成独立评审。

### 原生单章 workflow

要求 `story-write` 用原生 workflow 写长篇新章，或声明后续章节采用这一偏好。父会话提供工程、章号和约束，再按[调用说明](knowledge/story/skills/story-write/references/long/native-workflow.md)读取模板。DSH 已有的 `workflow` 工具内，Prepare 在已授权规划内检查或补建本章细纲，运行 `chapter rules`，并生成场景计划。写手收到每条 `id: text`。`also` 非空时，该行再接 ` also: ` 和其余 ID。写手逐条遵守，并在摘要里引用这些 ID。随后执行写作、独立审稿、同一轮的逐条规则审稿、最多两轮修订及追踪提交验证。未接受的 violate 共用这一上限。到上限时模板返回 `revision_limit` 和未解决的规则 ID。作者接受例外、改规则来源，或改细纲。已有可用细纲直接复用；除非用户要求确认，常规准备不再次索要批准。关键事实缺失或需要作者裁定时停止依赖工作。连续章串行执行，保留仍有未决问题的草稿。

审稿在此 workflow 内返回少量流程分支字段，普通审稿仍为自然语言。提交校验审稿对应的正文、细纲哈希和预期追踪修订号；文件变化后须重检重评审。追踪不增加审稿证明。原生运行完成可能包含未提交的章节结果，调用方须检查返回状态再推进。第 10、20 章及此后整十章新提交成功时，结果另含 `book_audit_hint`。模板不运行 `book audit`。

### 多章拆解

开头、单章或局部问题由 `story-analyze` 直接读原文并回答，只在用户要求保存时写入对应文件。多章或全书时，父会话先在 `拆文库/<书名>/_progress.md` 确认一份章节边界表，用 `analysis inspect` 取得来源身份和已有卡片，再按[批次调用说明](knowledge/story/skills/story-analyze/references/long/native-workflow.md)读取 Skill 本地模板。每次原生 workflow 最多提取四章卡片，并报告失败或跳过章节。父会话将结果交给 `analysis write-cards`，由它核验来源身份与章内证据、渲染 Markdown 并保存。覆盖已有卡片需要明确指定替换；来源变化会拒绝旧提取结果，重试保留成功卡片。卡片齐了之后，父会话按至多十个卷段写 `剧情/节奏.md`、`剧情/情绪模块.md`、`文风.md` 和 `拆文报告.md`，卷段读原文和短卡片。短篇拆解不使用这个模板。

<a id="understand-the-implementation"></a>
## 理解实现

职责与信任边界见[小说子系统](../../../docs/subsystems/story.zh.md)。

在仓库根目录运行 `pnpm --filter @winterhuan/dsh-story build` 可单独构建，运行 `pnpm --filter @winterhuan/dsh-story test` 可验证此包。

<details>
<summary>实现细节 — 点击展开</summary>

[补丁](cordis.patch.yml)注册 `story` 预设，不改变默认模式。其 `/agent` 入口负责作用域内的技能、工具和写作钩子。Host 入口负责文件 API 与凭据配置，客户端依据所选会话的预设投影显示。预设提供文件系统、Shell、搜索、作业、技能、原生委派和工作流工具，并隔离压缩与工作流服务。朱雀密钥写在 `story` 设置命名空间，默认凭据引用是 `MAKERS_API_KEY`。已存密钥组成密钥池，经标准输入交给检测进程：朱雀拒绝某把密钥时换下一把，其他失败直接结束检测，最多尝试 16 把。`editorMaxBytes` 默认为 2097152；`trustedHosts` 扩展默认回环地址列表。`/story` API 将文档访问限定在本领域项目路径中。

写作守卫与专家 Role 属于此包。用户明确要求的朱雀检测会将选定章节发送到腾讯 EdgeOne Makers，只接收配置的 MAKERS_API_KEY 密钥池。

此包独立开发、构建和安装，不依赖其他领域插件；必需辅助脚本作为包资源分发。

每个 Skill 拥有自己的 `references/`，专业 Role 放在所属 Skill 的 `references/roles/`。`story-write` 与 `story-analyze` 各自拥有 workflow 模板，Skill Viewer 直接发现并预览本地参考。包内 `lib/cli.js` 即 TypeScript CLI 本身（由 `src/cli/` 打包），`src/core/` 内部模块保留既有追踪事务、共用章文件路径和目标字数解析。小说工作区响应包含独立作品列表、上限为 1,000 项的文件列表及文件截断状态。作品发现检查直属子目录中的标准目录或独立文档，达到文件上限后仍继续；概览直接读取所选作品的追踪。运行中的 Host 未提供作品列表时，客户端从文件列表识别作品，直到 Host 重启。事务写入使用 `追踪/.tracking-commit.lock/` 目录锁：持有者写入 PID，提交完成后删除目录；死进程或超过一分钟的陈旧锁会被接管，等待十秒后报错。写入中断后，先重试原事务，再检查派生视图。

</details>

<a id="model-experience"></a>
## 模型体验

### 领域技能与执行

#### 模型看到什么

小说预设提供小说协作者身份，区分讨论、审稿和已授权正文工作。领域目录列出六个 Skill；其他预设不获得小说目录、工具或写作钩子。加载时向当前 Agent 提供指令和资源路径。所选 Skill 或 workflow 分配执行顺序和检查，Role 提供专业方法。写入 hook 要求重新检查和审稿，再由指定提交者通过章节事务更新追踪。只有父会话读取调用说明，子会话接收阶段职责和选定参考。Prepare 返回实际路径、场景计划、本章规则清单和已检查的细纲身份；写手接收这些结果及完整检查命令，并遵守每条规则 ID。workflow 子会话以 `structured_output` 结束，缺少结果时提示父会话查看失败子会话。委派失败保留已有产物并报告诊断，模型服务认证或地址错误需修复提供商配置。前置委派须完成且产物检查通过后才推进。只读的 `story-explorer` 用自然语言交回事实、来源和缺口。`story_zhuque` 调用包内检测 CLI，后台执行返回 DSH 作业 ID，供 `job_output` 与 `job_kill` 使用。

#### Token 影响

Skill 正文和专业指令按需加载，初始目录不增加专用 Role 工具 schema 或整套专家正文。连续性查询每次最多 16 KiB，超过条数或字节预算会返回下一页位置；健康摘要共用这一预算。设定检索另有一次最多 16 KiB 的调用。`chapter rules` 也是一次只读调用，上限相同。`chapter audit-verify` 只读一份审稿文件，不刷新工作台。原生模板在审稿的同一阶段启动它。`book audit` 读取一段章号；`--write` 多写一份 Markdown，默认单章路径不调用它。原生模板只在第 10、20 章及此后整十章提交成功后点名这条命令。写前上下文把最多 4 条设定摘录放进同一份 16 KiB，放不下时先省略这些摘录。写前到期伏笔较多时需要额外分页，不能静默省略。读取再提交 workflow 模板会保留两份源码，独立子 Agent 还会读取各自指令和原文，因此可能比直接委派更贵；查询容量不等于提供商 token 计费或端到端效率承诺。

#### KV Cache 影响

插件使用 DSH 工具和 Skill 历史，不重写此前消息，也不维护独立模型会话。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 已有对话保留原预设；可在新小说会话接续同一本书。已有非小说会话的草稿仍保留存储，但没有小说工作台入口。预设显式列出工具，升级 DSH 时须核对。
- 原生 Team 工具需要显式启用团队组合和持久 Session。专业指令进入任务上下文，不由插件覆盖系统 persona。审稿输出普通意见；章节脚本校验机械条件，不认证文学质量或评审模型元数据。
- CLI 只需要 Node。付费服务需要创作者授权和已配置凭据。独立侧边栏各自保存状态；旧聚合草稿不迁移。
- 小说预设为原生单章模板提供 `workflow` 和子 Agent 结构化输出。它处理长篇新章及其未提交稿；已提交章修改沿用现有修订路径。模板复用与审稿只读依靠指令，不是 Host 强制机制或单独审稿权限策略。取消保留产物，恢复核对真实文件和追踪，不恢复旧脚本栈。文件校验不隔离任意外部写入者。
- 概览通过现有文件 API 读取状态，受 `editorMaxBytes` 限制；大列表在界面分页，不新增数据库或服务器。它校验展示字段，完整追踪体检仍使用 `dsh-story project check`。历史查询提供已有逐章记录，不重建任意章的完整世界状态；原文和缺失记录需定点核查。
- 角色快照没有更新章。健康查询和「风险」卡片用点名该角色的时间线事件里最新的 `updated_chapter`，没有这类事件的角色不列入。健康检查只有 TypeScript 实现，不在 `tests/reference/` 的 Python 基准里。
- 设定检索通过 `project lookup` 只读 `设定/` 下的 Markdown。别名只认文件头 front matter，以及前 40 行里、第一个二级标题之前的「别名：」行。它不改追踪状态，也没有工作台入口。实现只有 TypeScript，不在 Python 基准里。
- `chapter rules` 只有 TypeScript 实现，不在 `tests/reference/` 的 Python 基准里。`tests/reference/normalize-punctuation.js` 仍然只接受 `punctuation`。通用模板没有部分默认标题，这些书会报 warning，直到补上标题或用 `rule_sources` 换掉默认来源。此命令未在真实 DSH 浏览器里验证，也未调用真实模型。
- `chapter audit-verify` 只有 TypeScript 实现，不在 `tests/reference/` 的 Python 基准里。`tests/reference/normalize-punctuation.js` 仍然只接受 `punctuation`，所以带 `rule_audit` 的文件不进入那份对照。提交门禁默认关闭。此命令未在真实 DSH 浏览器里验证，也未调用真实模型。
- `book audit`、事实账本、节奏、规划、人物力量、对标检索和文风检查只有 TypeScript 实现，不在 `tests/reference/` 的 Python 基准里。hint 不使命令失败。只有 hint 时该项为 `warn`。Markdown 报告会合并这些 hint，哈希只印前 8 位。`rule_audit` 和 `facts_diff` 保持关闭，除非这本书写成 `required`。出场计数只看至少两个字的快照名和角色卡文件名。这些命令未在真实 DSH 浏览器里验证，也未调用真实模型。
- 运行时已完成从 Python/JavaScript 到 TypeScript 的迁移：CLI 与全部确定性操作都是 TypeScript，包内不再分发 `runtime/`；原实现保留在 `tests/reference/` 仅作差分测试基准，`tests/ts-port-parity*.spec.ts` 在相同输入上比对两者输出，parity 仍是兼容性依据。

<a id="dev-note"></a>
### 开发笔记

按 DSH token-meter 的固定密度估算，`story_zhuque` 输入 schema 为 249 token，引入作品和文件参数前为 226；首轮其他内容相同时估算增加 23 token。这是 schema 估算，不是提供商分词结果。未引入独立公共运行时包。

按每四字符一个 token 估算，小说身份提示为 298 token，标准预设身份提示为 14 token，均为变量插值前的文本。这只比较身份提示；工具组合和已加载技能也影响首次请求。
