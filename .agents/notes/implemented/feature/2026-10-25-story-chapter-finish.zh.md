# Agent Note: Chapter finish beside the ledger

Status: implemented

[English](2026-10-25-story-chapter-finish.md) | 中文

## 问题

已提交的章和事实账本是两次写入。下一章开始时可以没有主张文件，于是没有稳定的东西可比对。[事实账本笔记](2026-10-19-story-fact-ledger.zh.md) 把条目留在 `追踪/事实账本.json`。追踪 schema 6 只保存摘要链接。

## 决策

`facts extract` 只扫描行首是七类事实 kind 的行。它写出 `草稿/事实/第NNN章.claims.json`（`story-facts-claims/v1`），同时有 `claims` 和 `entries`。前缀是 `VENUE-`、`INJ-`、`ACCT-`、`OBJ-`、`SKILL-`、`ERA-`、`ORD-`。手写 id 保持原样，包括回归夹具里的账目 id `ACC-`，直到对这条路径再跑一次抽取。同一 id 保留先出现的一行。空列表表示该章已覆盖。`--dry-run` 不写文件。扫描不是专名识别，也不读 `project lookup --reference`。`facts record` 仍要求该章已提交，且正文哈希一致。

`chapter finish` 和 `chapter commit --with-facts` 返回 `story-chapter-finish/v1`。`rule_audit` 为 `required` 时，它先校验默认审稿。主张文件存在时做 diff。然后提交。提交失败不入账。提交成功且主张可读时入账，再报告过期。入账失败留下这一章，并设置 `facts_error`。结果含 `phase`、`rules_sha256`、`claims_present` 和 `gates`。没有提供方字段。退出码 0 表示已提交，并且没有主张或主张已入账。退出码 1 表示未提交、主张在但未入账，或带有 `facts_error`。

`project gates` 回显 `rule_audit`、`facts_diff`、`style` 是否启用、`streak`、已覆盖章和过期摘要。缺键等于 `required`。写成 `off` 才不拦提交。`project migrate-gates --legacy-off` 给旧书写上 `off`。命令不写文件。工作台概览确认后可以把任一键写成 `required` 或 `off`。`project status` 的形状不变。`project check` 返回 `last_committed_chapter`、`state_revision` 和 `facts` 缺口。没有账本文件时，`facts stale` 的 `missing_chapters` 为空，`project check` 把有字数记录的章列入 `facts.missing_chapters`。追踪 schema 6 保存摘要链接。`project migrate` 升到 6。`project migrate --to 5` 去掉链接，不删账本，也不改 `state_revision`。

`project context --profile lite` 保留续写卡、事实上限、`rules_path`、前五条到期伏笔，以及最多四条规划或节奏信号。完整档的 `omitted` 仍是原来的七个计数。卷纲顶部没有「章节范围：」，或某个剧情单元块没有，是 hint。跨度计算不变。节奏卡匹配一小列精确标题别名，或使用 `--sections`。`cast check` 对细纲名单有、角色卡或别名没有的名字给 hint `outline-cast`，对正文里两到三字的启发式称呼给 hint `body-name`。`cast_body_names` 缺省为 `hint`。标定写在产物协议里，路径是 `草稿/审稿/_calibration.md`。`violate` 和 `unclear` 分开计数。缺了 `rule_audit` 等于 `required`。标定未通过时写成 `off`。文风漂移在连续 `streak` 章之前是 hint，默认 3 章。`forbid_blank_lines` 在当章 blocking。正文分布明显变化之后，再跑 `text style-baseline --apply`。

单章和修订模板只在主张文件不存在时抽取，提交走 `chapter finish`。选项表在 `src/cli/specs.ts`。路径检查和顶层分发留在 `src/cli/main.ts`。各命令族在 `src/cli/runners/`。[Skill 与 CLI 对齐](../process/2026-10-25-story-skill-cli-sync.zh.md) 负责六个 Skill 按这份契约教学。

## 考虑过的替代方案

**把账本条目整份放进追踪 schema 第 6 版。** schema 6 只保存摘要链接。条目留在旁路文件，Python 追踪对照因此不吸收账本行。提交和入账仍是两次写入。

**把缺键当成静默的 `off`。** 缺了 `rule_audit` 或 `facts_diff` 等于 `required`。没有主张文件或审稿未通过的书，下一次提交会失败。写成 `off`，或对旧书运行 `project migrate-gates --legacy-off`，这次提交才不被拦住。

**增加第三种取值。** 只有 `off` 和 `required`。概览在确认后写入二者之一。`project gates` 保持只读。

**调用模型点名，或把对标命中抄进主张。** `cast check` 用细纲名单、角色卡别名和正文启发式人名。`project lookup --reference` 只读，除非 `--record`。记入的命中 `kind` 为对标，不进入 `covered_chapters`。抽取不把这些命中抄进主张。

**把缺少卷级标签改成 blocking。** 顶部没写标签的旧书会开始通不过规划检查。这条发现是 hint，跨度规则不变。

**把路径检查拆进每个运行器。** 各命令族在 `src/cli/runners/`。选项表在 `src/cli/specs.ts`。路径检查和顶层分发留在 `src/cli/main.ts`。

## 影响

一次 finish 结果写明停在哪一步。写作者可以留下空主张文件，使后来的抽取不覆盖手改。没有 `设定/写作检查.json` 的书两个键都是 `required`，所以 finish 会停到审稿通过且主张文件存在，或这本书写成 `off`。概览可以写入任一值。这些命令未在真实 DSH 浏览器里验证，也未调用真实模型。[事实账本笔记](2026-10-19-story-fact-ledger.zh.md) 仍负责旁路 schema 和比对规则。

## 验证

`packages/creative/story/tests/facts.spec.ts` 覆盖带标签的抽取、稳定 id、空文件和 dry-run。`tests/chapter-finish.spec.ts` 覆盖入账的提交、失败提交不产生账本、入账失败留下该章、没有主张文件的 finish、`required` 的冲突不提交、`required` 的审稿先停下，以及 CLI finish 以 1 退出时 `project check` 仍返回 `facts`。`tests/gates.spec.ts` 要求缺文件时报告 `required`。`tests/context.spec.ts` 要求完整的 `omitted` 对象和 lite 档。`tests/plan.spec.ts`、`tests/rhythm-card.spec.ts`、`tests/cast.spec.ts` 和 `tests/book-audit.spec.ts` 覆盖 hint 类别。全书体检回归夹具的 warn id 仍是健康、角色卡、读者价值和作废条目。`tests/chapter-workflow.spec.ts` 和 `tests/revise-workflow.spec.ts` 要求模板里出现 `chapter finish` 和 `facts extract`。
