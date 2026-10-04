---
name: story-write
description: "创作长篇或短篇小说：设定、卷纲、细纲、小节规划、正文、续写和重写。用于开书、写大纲、写第 N 章、日更、写短篇；已有原始文本接入用 story，审稿用 story-review，文字润色用 story-polish。"
---

# story-write — 小说创作

先确定本次交付设定、大纲还是正文，以及长短篇和文件范围。裸调用只诊断下一步；开书、补纲请求完成规划即停，明确要求正文才写。

长篇和短篇都使用 `{工作区}/{作品名}/` 直接子目录。Session 工作区保持在其父级；工作区、`拆文库/` 和长短篇分类容器不是作品。无法从请求确定目标时先确认作品，不按修改时间跨书选择，也不自动迁移文件。

本 Skill 的参考路径相对 `SKILL.md`；只按当前问题读取 `references/`，不加载其他 Skill 的私有参考。跨任务用 `skill` 加载准确名称。`{CLI}` 是从本 Skill 目录向上四级解析的 `lib/cli.js` 绝对路径；运行 `node {CLI} <命令> --help` 查参数，实际结果以 `--json` 返回为准。作品命令显式传 `--workspace {工作区} --book {作品名}`；不依赖工作区 PATH，不直接运行包内私有脚本。

| 当前任务 | 读取 |
|---|---|
| 长篇开书、设定、卷纲、补细纲 | [规划](references/long/workflow-setup.md) |
| 长篇单章正文 | [章节流程](references/long/workflow-chapter.md) |
| 长篇日更、连续续写 | [串行续写](references/long/workflow-daily.md) |
| 修改已写长篇章节 | [修订](references/long/workflow-revision.md) |
| 短篇构思、规划、正文和交付 | [短篇流程](references/short/writing-workflow.md) |
| 缺少具体写作方法 | [方法索引](references/methods/agent-reference-profiles.md)，只取相应体裁与问题 |

用户明确选择原生 workflow 或已有持续偏好时，父会话按 [原生章节 workflow](references/long/native-workflow.md) 读取本 Skill 的 `workflows/chapter.js` 并顶层调用。模板内完成准备、写作、独立审稿、有限修订和提交；父会话不重复准备。子阶段加载自己的 Skill，只执行分配阶段，不再读取或启动模板。

## 写作约束

- 正式长篇正文前运行 `outline check`，核对读者期待、主角目标、阻碍、关键选择、后果、局部兑现和章尾问题。缺细纲时在已确认卷纲内补建；未知关键事实不能用占位符凑齐。探索稿放本书 `草稿/`，不推进追踪。
- 按 [写前事实](references/long/continuity-context.md) 查询全部到期伏笔；不能只依赖状态卡的 8 条。角色当前状态、读者已知和未来计划分别核实。
- 尊重用户字数、设定、必须/禁止事项及停笔点。可调整场景组织、补动作和潜台词，不为凑数新增主线、角色或提前泄露信息。
- 验收看连续性、主角能动性、信息归属、可读性与用户约束。技法、密度、百分比、道具次数、句式和标点不作为通用配额。
- 对标可选；只使用明确选定的外部来源。资料分工见 [项目材料](references/long/project-context.md)，多书使用见 [跨书召回](references/cross-book-recall.md)。需要补分析时加载 `story-analyze`，不把本书分析当外部样本。
- 正式长篇依次 `chapter check` → 加载 `story-review` → 必要修订和重检 → `chapter commit`。检查失败或不可用不算通过；正文变化后旧审稿不能批准新版本。
- `追踪/_tracking-state.json` 是唯一事实状态，派生 Markdown 不手写。提交携带最新修订号，准确正文和细纲哈希按 [追踪事务](references/long/tracking-transaction.md) 校验；不把未来计划沉淀为既成事实。

已有作者记忆时直接运行 `memory query --workspace {工作区} --book {作品名} --json`，仅把匹配的 active 写法交给实际写手；当前请求、本书设定和质量要求优先，不自动学习审稿告警。保存或忘掉偏好加载 `story`。

独立专业任务按 [委派](references/delegation.md) 使用本地 Role；简单任务当前会话完成。前置阶段等待终态，互不依赖时才可并行；Team 仅在用户明确要求时使用。写手不直接改追踪，同一 Agent 换 Role 不算独立审稿。需要审稿、文字润色或接入原文时分别加载 `story-review`、`story-polish`、`story`。
