# Agent Note: Fact ledger beside tracking

Status: implemented

[English](2026-10-19-story-fact-ledger.md) | 中文

## 问题

一章可以改掉场地、伤情、账目或能力，下一章仍按旧值写。追踪 schema 第 5 版已经有一处不随正文校验的读者价值哈希。再塞一个不校验的对象，要么升 schema，要么打断和 Python 追踪基准的对照。章节规则能禁止一句话，但不能区分后文主张和早先那一章当时为真的值。

## 决策

账本是 `追踪/事实账本.json`，模式 `story-facts/v1`。它不是追踪状态的字段。`kind` 为场地、伤情、账目、物件、能力、年代、指令。每条保存引入它的那一章的 `source.body_sha256`。后文对同一 id 的记录追加 `changes`，原 `attrs` 留在原地。`facts record` 要求该章已提交，且正文原始字节的哈希与 `wordcount_records` 一致。`facts diff` 在同 id、同属性、值不同、且没有本章 change 已记下该主张时报告冲突。未知 id 放进 `unmatched`，不算冲突。`facts stale` 列出来源章正文或字数哈希已变的条目，以及有字数记录但不在 `covered_chapters` 里的章。

`project check` 仍只返回 `last_committed_chapter` 和 `state_revision`。账本缺章是 `facts stale` 的一行，也是全书体检 `facts-stale` 的 hint。这样 `tests/ts-port-parity-tracking.spec.ts` 继续对着 Python 基准。`facts_diff` 与 `rule_audit` 相同：都是 `off`，除非 `设定/写作检查.json` 写成 `required`。试点书可以写成 `required`。其他书不写。

`project context` 在设定摘录之后、健康摘要之前加入最多 2 KiB 的 `facts`，然后是最多 1.5 KiB 的 `volume`。省略顺序是设定、事实、卷切片、健康、时间线、角色、到期伏笔。Prepare 运行 `project rhythm`，范围是第 N-8 章到第 N+2 章，并运行 `project plan check`。爽点、卖点或规划 blocking 在写正文前停下。新提交成功后，主张文件存在时单章模板运行 `facts record`，然后运行 `facts stale`。

`project rhythm` 的缺省是小爽点至少隔章一次（`max_no_payoff` 为 1），强度不低于 8 的高峰相隔 5 到 8 章。书可以在 `rhythm` 里改这些整数。`project plan check` 要求卷纲范围首尾相接。离卷末不超过 10 章时，下一卷文件必须存在，登记状态也不能仍含「扩卷前核实」。`OUT-NNN-PAY` 来自细纲「爽点」。`CANON-n` 和 `OWN-n` 来自卷纲「原著事实校正与改编边界」和「第一卷写作口径」，并且只在本章细纲或正文提到该条里的章号或两到四字专名时进入清单。`OWN-<单元ID>` 来自「兑现方式与归属」。这些标题缺失不产生 warning。

`project lookup --reference` 读 `拆文库/<主对标>/角色/`、`设定/` 和 `剧情/剧情单元_*.md`。它跳过 `原文/`、文件名含「章节摘要汇总」的文件，以及超过 512 KiB 的文件。命中的 `source` 是 `reference`，不是本书事实。`analysis rhythm-card` 在 `拆文库/<书>/节奏卡/` 下写出不超过 2 KiB 的卡片。卡片章范围盖住正在写的章时，`volume` 附上它。

境界和能力留在 `kind` 能力。`project cast check` 拿这些行对照 `设定/世界观/力量体系.md`，并拿卡片上的 `关系阶段：` 对照 `阶段序：`。没有角色卡的快照仍由体检的 `cast-cards` 报告。出场计数只统计至少两个字、且在三章及以上文件里出现的快照名或角色卡文件名。它不从正文里发明名字。`text style-baseline` 测量段长中位数、破折号、顶针（前句末 2 到 4 字等于后句开头）、固定比喻和空行。漂移先是 hint，同一指标连续 `streak` 章（默认 3）超限后变为 blocking。设置了 `forbid_blank_lines` 时空行当场 blocking。

`project legacy archive --reader-value` 把 `reader_value_records` 移到 `追踪/_legacy/reader_value_records.json`。只有该字段存在时才把 `state_revision` 加 1。`project context retire` 不随章节追加，按原文从当前上下文列表去掉一条，追加 `追踪/维护记录.md`，并把 `state_revision` 加 1。`mode=revision` 事务仍重交当前上下文，不在事务里退役。`workflows/revise.js` 的阶段是 Locate、Plan、Rewrite、Audit、Submit。方案仍要批准时 Plan 返回 `needs_input`。Submit 使用 `mode=revision`，然后运行 `facts stale`；主张文件存在时再 `facts record`。

全书体检保持 pass、warn、fail、skip，默认只读。`--issues` 把 `story-issues/v1` 写到 `草稿/问题单.json`。[全书体检笔记](2026-10-18-story-book-audit.zh.md) 仍负责这份报告。[章节规则笔记](2026-10-18-story-chapter-rules.zh.md) 仍负责默认提取。[规则审稿笔记](2026-10-18-story-rule-audit.zh.md) 仍负责逐条结论。本笔记不取代它们。

## 考虑过的替代方案

**把账本放进追踪 schema 第 6 版。** `requireKnownKeys`、派生视图和 Python 逐字节对照都要动。旁路文件让那份对照保持不变。代价是提交和记账是两次写入。缺口由 `facts stale` 点名。

**让 `project check` 报告账本缺章。** 检查结果是固定的一对字段。调用方和对照测试读的就是这两个字段。第三个字段会变成另一条命令。

**给每本书打开 `facts_diff`。** 没有账本的书会在下一次提交失败。这个门禁与 `rule_audit` 一样，保持关闭，直到该书写成 `required`。

**退役只放在下一次 append。** 作废行会留在 Prepare 里，直到以后某一章。`project context retire` 去掉它，同时不把退役谎报成旧章修订记录里的事。

**从正文里抽出每一个名字做人物检查。** 确定性检查只有快照和角色卡文件名。高光归谁仍交给 `OWN-<单元ID>` 的规则结论。

## 影响

写作者可以记录、查询、比对和检查事实过期，而不升 schema。上下文可以先省略事实行，再省略健康行。节奏和规划的发现是 hint，或规划上的 blocking，不改追踪。这些命令不会把对标命中存成本书事实。文风 blocking 在 `chapter check` 里是一条质量行。全书体检把它记在 `style`。体检里的章节检查不重复这一行。这些命令未在真实 DSH 浏览器里验证，也未调用真实模型。

## 验证

`packages/creative/story/tests/facts.spec.ts` 读取 `tests/fixtures/regression/R4.md`、`R5.md`、`R7.md`、`R8.md` 和 `R9.md`。这些文件是一行一项的合成字段，不是小说原文。R4、R7、R8、R9 是比对冲突。R5 是早于 `since` 的能力词，`chapter rules` 以 kind `skill` 看到它。同一文件还覆盖追加的 change、未知 id、正文变旧，以及 CLI 的 record 退出码 0、diff 退出码 1。`tests/rhythm.spec.ts`、`tests/plan.spec.ts`、`tests/reference-lookup.spec.ts`、`tests/rhythm-card.spec.ts`、`tests/cast.spec.ts`、`tests/style-drift.spec.ts`、`tests/legacy.spec.ts` 和 `tests/revise-workflow.spec.ts` 覆盖其余命令。`tests/book-audit.spec.ts` 仍要求回归夹具在健康、角色卡、读者价值和作废条目上为 warn，新检查为 skip。`tests/context.spec.ts` 要求 `omitted.facts` 和 `omitted.volume`。
