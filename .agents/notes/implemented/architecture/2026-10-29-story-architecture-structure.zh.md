# Agent Note: Story module boundaries

Status: implemented

[English](2026-10-29-story-architecture-structure.md) | 中文

## 问题

小说命令是一块一块加上去的。符号链接解析、章号补零和 Markdown 表格读取各写了一份。全书体检的检查项、排序和 Markdown 报告在同一个文件里。之后的修改看不出一条规则、一条路径或一份 JSON 归哪个模块。

## 决策

六个 Skill 名仍是 `story`、`story-write`、`story-review`、`story-analyze`、`story-polish`、`story-cover`。每个 Skill 用相对自身目录的路径调用 `lib/cli.js`，并带上 `--workspace`、`--book` 和 `--json`。命令名和 JSON 文档保持原样。Host 路由不裁判小说规则。判断在 story core。Skill 调用 CLI。[Skill 与 CLI 对齐](../process/2026-10-25-story-skill-cli-sync.zh.md) 负责这份契约。[四个领域插件](2026-09-30-creative-four-domain-plugins.zh.md) 负责包边界。

`looseRealpath` 在 `packages/creative/story/src/core/fs-path.ts`。CLI 路径守卫再导出它。`paddedChapterNumber` 在 `chapter-names.ts`，是主张、规则审稿、追踪记录、缺失章节文件、拆文卡片和逐章记录标题里 `第NNN章` 的数字段。规则提取通过 `markdown-scan.ts` 读标题、行和表格单元格。它自己的小节读取仍把仅有加粗的一行当成标题。全书体检的检查项在 `audit-checks.ts`。`audit.ts` 排序、整理发现并渲染 Markdown。`auditBook` 和 `BOOK_AUDIT_CHECKS` 仍从 `audit.ts` 导出。章节和事实命令用 `positiveChapter` 读取 `--chapter`，用 `withFindings` 在有发现时返回退出码 1。只需要空追踪初始化的测试夹具使用 `tests/support/tracking-input.ts`。

缺了 `rule_audit` 或 `facts_diff` 仍是 `required`。schema 6 仍只保存账本链接。[章末收束](../feature/2026-10-25-story-chapter-finish.zh.md) 负责 finish 的阶段。[事实账本](../feature/2026-10-19-story-fact-ledger.zh.md) 负责旁路文件。

## 分层

| 层 | 路径 | 职责 |
|---|---|---|
| Skill | `knowledge/story/skills/{story,story-write,story-review,story-analyze,story-polish,story-cover}` | 任务说明。workflow 脚本：`story-write/workflows/chapter.js`、`revise.js`、`story-analyze/workflows/analyze-batch.js`。 |
| CLI | `src/cli.ts`、`src/cli/main.ts`、`src/cli/runners/` | 参数、路径守卫、stdout 上一份 JSON。退出码 0 成功，1 有发现，2 输入无效，3 执行失败。`detect zhuque` 另用 4。 |
| Core | `src/core/` | 确定性读写：章节、finish、事实、门禁、规则、体检、追踪、检索、出场、上下文、作者记忆。 |
| Host | `src/index.ts`、`src/agent.ts`、`src/workspace-route.ts`、`src/native-hooks.ts` | `/story` 文件、预设 Skill、写入 hook。不决定能否提交。 |
| Client | `src/client/`、`packages/client/ui-settings-story` | 工作台和朱雀凭据引用。 |

## 调用链

长篇写章走 `workflows/chapter.js`。准备阶段运行 `project check`、`outline check`、`project context`，设定被省略时运行 `project lookup`，健康和到期伏笔运行 `project query`，然后是 `chapter rules`、`project rhythm`、`project plan check` 和 `chapter snapshot`。写作阶段运行 `chapter check`，默认主张文件不存在时再运行 `facts extract`。审稿阶段运行 `chapter snapshot` 和 `chapter audit-verify`。提交阶段运行 `chapter finish`。

`chapter finish` 读取 `writingGates`。`rule_audit` 为 `required` 时校验默认规则审稿。主张文件存在时比对。然后提交。提交成功才入账，再报告过期事实。章号落在这本书的间隔上时附上 `book audit`。提交失败不写账本。入账失败留下已提交的章。

`chapter check` 报告细纲就绪和质量。质量包含 `scanChapterQuality`。`project gates` 回显 `writingGates`、账本覆盖和过期摘要。`project check` 报告已提交章号、修订号和 `facts` 缺口。

## 仍在的结构

`rules.ts` 仍在一个文件里提取规则并扫描正文。`checks/ai-patterns.ts`、`settings-lookup.ts`、`memory.ts` 和 `tracking/schema.ts` 各自把第二项工作和第一项放在一起。三个 workflow 脚本重复 shell 引号和 `off` / `required` 的读取。每个脚本整段提交给会话，抽成共享模块会改变会话执行的文本。`src/client/activity.ts` 仍识别 `storyctl.py` 和 `tracking_commit.py`，让旧工具记录刷新列表。章节和事实以外的 runner 仍在调用点直接返回退出码。领域错误的类名保持分开，因为 CLI 按 `error.name` 选择退出码 2。

## 考虑过的替代方案

**这次拆开 `rules.ts` 和 `ai-patterns.ts`。** 提取和正文扫描共用文件读取和写作检查配置。模式文件是一套匹配。没有新的内部类型模块就拆，导入会循环，或者得改匹配本身。两个文件留在原地。

**把 workflow 脚本收成一个 helper。** 这个 helper 会改变会话提交的脚本正文。六个 Skill 名和 `lib/cli.js` 调用保持原样。

**所有领域失败共用一个错误类。** 退出码 2 按 `error.name` 选择。改名会让同一次失败走出另一个退出码。

**把小说规则检查放进 Host 路由。** 路由就会开始裁判章节。判断留在 story core。

## 影响

`dsh-story` 的调用方看到的命令、文档和退出码不变。缺键的门禁仍是 `required`。旧书仍用 `project migrate-gates --legacy-off` 写成 `off`。维护者改章号数字段或符号链接解析时只改一个文件。新的全书体检检查加在 `audit-checks.ts`，并列入 `BOOK_AUDIT_CHECKS`。设置界面的包没有改。这些命令未在真实 DSH 浏览器里验证，也未调用真实模型。

## 验证

`pnpm --filter @winterhuan/dsh-story build` 和 `pnpm --filter @winterhuan/dsh-story test` 覆盖 CLI、finish、门禁、主张路径和全书体检。`pnpm run doc-sync` 覆盖本笔记和子系统链接。
