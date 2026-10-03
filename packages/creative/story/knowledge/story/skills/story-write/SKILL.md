---
name: story-write
description: "创作长篇或短篇小说：设定、卷纲、细纲、小节规划、正文、续写和重写。用于开书、写大纲、写第 N 章、日更、写短篇；已有原始文本接入用 story，审稿用 story-review，文字润色用 story-polish。"
---
# story-write：小说创作

先确定本次要交付的设定、大纲或正文，以及长篇/短篇和文件范围；能从请求与项目判断时直接执行。裸调用只诊断当前项目和下一步，不自动写正文。开书、补纲请求完成所需规划即停；明确要求正文时才写。

参考资料与脚本路径相对于 DSH 提供的资源基目录，用原生 `read` 按任务读取。只加载本次工作流和必要项目材料，已读且未变化的参考不反复整份读取。

| 当前任务 | 读取资料 | 交付 |
|---|---|---|
| 长篇开书、设定、卷纲、补细纲 | 长篇规划（`references/writing/long/workflow-setup.md`） | 已确认范围的设定、大纲与细纲 |
| 长篇单章正文 | 单章流程（`references/writing/long/workflow-chapter.md`） | 正文、检查、审稿及逐章事务 |
| 长篇日更、连续续写 | 串行续写（`references/writing/long/workflow-daily.md`） | 按用户范围逐章完成；每章提交后才进下一章 |
| 修改已写长篇章节 | 修订流程（`references/writing/long/workflow-revision.md`） | 修订正文、重评审及必要的后续影响 |
| 短篇构思、规划、正文与交付 | 短篇流程（`references/writing/short/writing-workflow.md`） | 设定、小节大纲或完整短篇，按请求停靠 |

## 写作约束

用户明确选择原生 workflow 或已有持续偏好时，按 `references/writing/long/native-workflow.md` 提供工程、章号与约束，读取 `workflows/chapter.js` 后顶层调用原生 `workflow`。模板内部完成细纲检查与必要补建、场景计划、写作、独立审稿、最多两轮修订及提交；父会话不预先重复准备。连续章仍串行；普通任务保留上表路径。模板仅在选用时加载。

- 正式长篇正文先通过细纲就绪检查；七项语义必须具体：读者期待、主角目标、主要阻碍、关键选择、代价或后果、局部兑现、章尾问题。缺项先修纲，不让正文杜撰独立剧情。探索性试写放 `草稿/`，不推进追踪，转正仍需完整验收。
- 尊重用户字数范围、已确认设定、必发生/禁止发生事项和停笔点。正文可调整场景组织并补战术与潜台词，不为凑字新增主线、角色、承诺或提前泄露后期信息。
- 连续性、主角能动性、信息归属、可读性及用户约束是验收依据。事件密度、百分比、道具次数、句式、标点与情绪词频是可选技巧，不能覆盖正文证据或成为通用配额。
- 原创作品不需要对标书。本书文本与外部对标分开；只在明确使用对标时加载相关分析，不将本书分析当作外部参照。项目材料与资源的分工见 项目与对标（`references/writing/long/project-context.md`）。
- 正式长篇交付按 `storyctl.py chapter check` → `story-review` 审稿与必要修订 → `chapter commit` 执行；检查失败或工具不可用不算通过。文本变更后重检与重评审，未变更不重复整套检查。
- `追踪/_tracking-state.json` 是唯一事实状态，Markdown 视图由 `scripts/tracking_commit.py` 生成；不手写追踪，不把未来计划写成已发生事实。提交带最新 `expected_state_revision`，字数记录与当前正文绑定；详情见 追踪事务（`references/writing/long/tracking-transaction.md`）。

作者记忆已存在时，按 作者习惯（`references/project/author-memory.md`） 查询相关 active 条目，传给实际写手；当前请求、本书设定和质量要求优先，不自动学习审查告警。

复杂任务确需独立专家时按 `references/project/delegation.md` 使用原生委派；简单工作直接完成。委派包含专业身份、Role 与资源绝对路径、项目材料、产物路径和成功条件。Team 中复用已有成员，按写作、审稿、修订和提交的依赖推进。写手不直接改追踪；提交前处理重要审稿问题，同一 Agent 换 Role 不算独立评审。

要市场选题或接入已有文本用 `story`；要深度拆解用 `story-analyze`；要审稿用 `story-review`；要文字修改用 `story-polish`。用户只要求规划时不串联后续阶段。
