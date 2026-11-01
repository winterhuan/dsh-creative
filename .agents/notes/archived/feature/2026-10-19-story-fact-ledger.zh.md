# Agent Note: Fact ledger beside tracking

Status: implemented
Archived: 2026-11-01

[English](2026-10-19-story-fact-ledger.md) | 中文

## 问题

一章可以改掉场地、伤情、账目或能力，下一章仍按旧值写。追踪里保存着不随正文校验的读者价值哈希。把账本行放进那份文件，会带动 `requireKnownKeys`、派生视图和 Python 逐字节对照。章节规则能禁止一句话，但不能区分后文主张和早先那一章当时为真的值。

## 决策

账本是 `追踪/事实账本.json`，模式 `story-facts/v1`。它不是追踪状态的字段。`kind` 为场地、伤情、账目、物件、能力、年代、指令。每条保存引入它的那一章的 `source.body_sha256`。后文对同一 id 的记录追加 `changes`，原 `attrs` 留在原地。`facts record` 要求该章已提交，且正文原始字节的哈希与 `wordcount_records` 一致。`facts diff` 在同 id、同属性、值不同、且没有本章 change 已记下该主张时报告冲突。未知 id 放进 `unmatched`，不算冲突。`facts stale` 列出来源章正文或字数哈希已变的条目，以及有字数记录但不在 `covered_chapters` 里的章。

`project check` 返回 `last_committed_chapter`、`state_revision` 和 `facts` 缺口。账本缺章也是 `facts stale` 的一行，也是全书体检 `facts-stale` 的 hint。没有账本文件时，`facts stale` 的 `missing_chapters` 为空，`project check` 把有字数记录的章列入 `facts.missing_chapters`。这样 `tests/ts-port-parity-tracking.spec.ts` 继续对着 Python 基准核对追踪文件。`facts_diff` 与 `rule_audit` 相同：缺键为 `required`。写成 `off`，或对旧书运行 `project migrate-gates --legacy-off`，提交才不被拦住。追踪 schema 6 只保存摘要链接。条目留在旁路文件。[Skill 与 CLI 对齐](../process/2026-10-25-story-skill-cli-sync.zh.md) 负责六个 Skill 按这份契约教学。

`project context` 在设定摘录之后、健康摘要之前加入最多 2 KiB 的 `facts`，然后是最多 1.5 KiB 的 `volume`。省略顺序是设定、事实、卷切片、健康、时间线、角色、到期伏笔。Prepare 运行 `project rhythm`，范围是第 N-8 章到第 N+2 章，并运行 `project plan check`。爽点、卖点或规划 blocking 在写正文前停下。新提交成功后，单章模板运行 `chapter finish`。主张文件存在时该命令入账，然后报告过期。抽取、收束顺序和只读门禁回显见[章末收束](2026-10-25-story-chapter-finish.zh.md)。

`project rhythm` 的缺省是小爽点至少隔章一次（`max_no_payoff` 为 1），强度不低于 8 的高峰相隔 5 到 8 章。书可以在 `rhythm` 里改这些整数。`project plan check` 要求卷纲范围首尾相接。离卷末不超过 10 章时，下一卷文件必须存在，登记状态也不能仍含「扩卷前核实」。`OUT-NNN-PAY` 来自细纲「爽点」。`CANON-n` 和 `OWN-n` 来自卷纲「原著事实校正与改编边界」和「第一卷写作口径」，并且只在本章细纲或正文提到该条里的章号或两到四字专名时进入清单。`OWN-<单元ID>` 来自「兑现方式与归属」。这些标题缺失不产生 warning。

`project lookup --reference` 读 `拆文库/<主对标>/角色/`、`设定/` 和 `剧情/剧情单元_*.md`。它跳过 `原文/`、文件名含「章节摘要汇总」的文件，以及超过 512 KiB 的文件。命中的 `source` 是 `reference`，不是本书事实。检索只读，除非 `--record`。记入的命中 `kind` 为对标，不进入 `covered_chapters`。`analysis rhythm-card` 在 `拆文库/<书>/节奏卡/` 下写出不超过 2 KiB 的卡片。默认三节匹配一小列精确标题别名。卡片章范围盖住正在写的章时，`volume` 附上它。

境界和能力留在 `kind` 能力。`project cast check` 拿这些行对照 `设定/世界观/力量体系.md`，并拿卡片上的 `关系阶段：` 对照 `阶段序：`。没有角色卡的快照仍由体检的 `cast-cards` 报告。出场计数只统计至少两个字、且在三章及以上文件里出现的快照名或角色卡文件名。细纲名单有、卡或别名没有，是 hint `outline-cast`。正文里两到三字的启发式称呼是 hint `body-name`。`cast_body_names` 缺省为 `hint`，可写成 `off` 或 `blocking`。单字名和单独的「道」不抽。`text style-baseline` 测量段长中位数、破折号、顶针（前句末 2 到 4 字等于后句开头）、固定比喻和空行。漂移先是 hint，同一指标连续 `streak` 章（默认 3）超限后变为 blocking。设置了 `forbid_blank_lines` 时空行当场 blocking。

`project legacy archive --reader-value` 把 `reader_value_records` 移到 `追踪/_legacy/reader_value_records.json`。只有该字段存在时才把 `state_revision` 加 1。`project context retire` 不随章节追加，按原文从当前上下文列表去掉一条，追加 `追踪/维护记录.md`，并把 `state_revision` 加 1。`mode=revision` 事务仍重交当前上下文，不在事务里退役。`workflows/revise.js` 的阶段是 Locate、Plan、Rewrite、Audit、Submit。方案仍要批准时 Plan 返回 `needs_input`。Submit 使用 `mode=revision` 和 `chapter finish`。该命令报告过期，主张文件存在时入账。顺序见[章末收束](2026-10-25-story-chapter-finish.zh.md)。

全书体检保持 pass、warn、fail、skip，默认只读。`--issues` 把 `story-issues/v1` 写到 `草稿/问题单.json`。[全书体检笔记](2026-10-18-story-book-audit.zh.md) 仍负责这份报告。[章节规则笔记](2026-10-18-story-chapter-rules.zh.md) 仍负责默认提取。[规则审稿笔记](2026-10-18-story-rule-audit.zh.md) 仍负责逐条结论。本笔记不取代它们。

## 考虑过的替代方案

**把账本条目整份放进追踪 schema 第 6 版。** schema 6 只保存摘要链接。条目留在旁路文件，所以账本行上的 `requireKnownKeys`、派生视图和 Python 逐字节对照都不进那份追踪文件。代价是提交和记账是两次写入。缺口由 `facts stale` 和 `project check` 的 `facts` 点名。

**用账本报告替换 `project check`。** 调用方仍读 `last_committed_chapter` 和 `state_revision`。`facts` 是附加对象。没有账本文件时 `facts stale` 仍给出空缺口，追踪对照因此不必多一个进度字段。

**把 `facts_diff` 留到每本书自己打开。** 缺键为 `required`。没有主张文件的书，下一次提交会失败。写成 `off`，或对旧书运行 `project migrate-gates --legacy-off`。

**退役只放在下一次 append。** 作废行会留在 Prepare 里，直到以后某一章。`project context retire` 去掉它，同时不把退役谎报成旧章修订记录里的事。

**从正文里抽出每一个词做人物检查。** 确定性检查用快照名、角色卡文件名、细纲出场名单，以及两到三字的启发式。它不调用模型。高光归谁仍交给 `OWN-<单元ID>` 的规则结论。

## 影响

写作者可以记录、查询、比对和检查事实过期，账本行仍不进追踪文件。上下文可以先省略事实行，再省略健康行。节奏和规划的发现是 hint，或规划上的 blocking，不改追踪。对标命中不进账本，除非运行 `project lookup --reference --record`，而且这些行不覆盖章节。文风 blocking 在 `chapter check` 里是一条质量行。全书体检把它记在 `style`。体检里的章节检查不重复这一行。这些命令未在真实 DSH 浏览器里验证，也未调用真实模型。

## 验证

`packages/creative/story/tests/facts.spec.ts` 读取 `tests/fixtures/regression/R4.md`、`R5.md`、`R7.md`、`R8.md` 和 `R9.md`。这些文件是一行一项的合成字段，不是小说原文。R4、R7、R8、R9 是比对冲突。R5 是早于 `since` 的能力词，`chapter rules` 以 kind `skill` 看到它。同一文件还覆盖追加的 change、未知 id、正文变旧，以及 CLI 的 record 退出码 0、diff 退出码 1。`tests/rhythm.spec.ts`、`tests/plan.spec.ts`、`tests/reference-lookup.spec.ts`、`tests/rhythm-card.spec.ts`、`tests/cast.spec.ts`、`tests/style-drift.spec.ts`、`tests/legacy.spec.ts` 和 `tests/revise-workflow.spec.ts` 覆盖其余命令。`tests/book-audit.spec.ts` 仍要求回归夹具在健康、角色卡、读者价值和作废条目上为 warn，新检查为 skip。`tests/context.spec.ts` 要求 `omitted.facts` 和 `omitted.volume`。
