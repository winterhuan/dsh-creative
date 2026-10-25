# Agent Note: Chapter finish beside the ledger

Status: implemented

[English](2026-10-25-story-chapter-finish.md) | 中文

## 问题

已提交的章和事实账本是两次写入。下一章开始时可以没有主张文件，于是没有稳定的东西可比对。[事实账本笔记](2026-10-19-story-fact-ledger.zh.md) 已经把账本放在追踪 schema 第 5 版旁边。再加一个 schema 字段，或把门禁默认写成 `required`，要么升版本，要么让没有账本的书在下一次提交失败。

## 决策

`facts extract` 只扫描行首是七类事实 kind 的行。它写出 `草稿/事实/第NNN章.claims.json`（`story-facts-claims/v1`），同时有 `claims` 和 `entries`。前缀是 `VENUE-`、`INJ-`、`ACCT-`、`OBJ-`、`SKILL-`、`ERA-`、`ORD-`。手写 id 保持原样，包括回归夹具里的账目 id `ACC-`，直到对这条路径再跑一次抽取。同一 id 保留先出现的一行。空列表表示该章已覆盖。`--dry-run` 不写文件。扫描不是专名识别，也不读 `project lookup --reference`。`facts record` 仍要求该章已提交，且正文哈希一致。

`chapter finish` 和 `chapter commit --with-facts` 返回 `story-chapter-finish/v1`。`rule_audit` 为 `required` 时，它先校验默认审稿。主张文件存在时做 diff。然后提交。提交失败不入账。提交成功且主张可读时入账，再报告过期。入账失败留下这一章，并设置 `facts_error`。结果含 `phase`、`rules_sha256`、`claims_present` 和 `gates`。没有提供方字段。退出码 0 表示已提交，并且没有主张或主张已入账。退出码 1 表示未提交、主张在但未入账，或带有 `facts_error`。

`project gates` 回显 `rule_audit`、`facts_diff`、`style` 是否启用、`streak`、已覆盖章和过期摘要。缺键等于 `off`。命令不写文件。工作台没有把门禁改成 `required` 的控件。`project status` 的形状不变。`project check` 仍是 `{ last_committed_chapter, state_revision }`。追踪仍是 schema 第 5 版。

`project context --profile lite` 保留续写卡、事实上限、`rules_path`、前五条到期伏笔，以及最多四条规划或节奏信号。完整档的 `omitted` 仍是原来的七个计数。卷纲顶部没有「章节范围：」，或某个剧情单元块没有，是 hint。跨度计算不变。节奏卡匹配一小列精确标题别名，或使用 `--sections`。`cast check` 对细纲名单有、角色卡或别名没有的名字给 hint `outline-cast`。标定写在产物协议里，路径是 `草稿/审稿/_calibration.md`。`violate` 和 `unclear` 分开计数。标定通过之前，`rule_audit` 保持 `off`。文风漂移在连续 `streak` 章之前是 hint，默认 3 章。`forbid_blank_lines` 在当章 blocking。正文分布明显变化之后，再跑 `text style-baseline --apply`。

单章和修订模板只在主张文件不存在时抽取，提交走 `chapter finish`。选项表在 `src/cli/specs.ts`。命令分发仍在 `src/cli/main.ts`。

## 考虑过的替代方案

**把主张放进追踪 schema 第 6 版。** Python 追踪对照和 `project check` 都要改。旁路账本已经是为了避开这件事。

**把 `facts_diff` 和 `rule_audit` 默认写成 `required`。** 没有主张文件或没有标定的书会在下一次提交失败。两个门禁都保持 `off`，直到这本书写成 `required`。

**增加第三种门禁，或在工作台放一个改成 `required` 的按钮。** 只有 `off` 和 `required`。概览上的开关还要多读一个文件，并在真实 DSH 里验证。`project gates` 是只读入口。

**从正文识别名字，或把对标命中抄进账本。** 出场 hint 用细纲名单和角色卡别名。对标命中的 `source` 仍是 `reference`。

**把缺少卷级标签改成 blocking。** 顶部没写标签的旧书会开始通不过规划检查。这条发现是 hint，跨度规则不变。

**按命令家族把 `main.ts` 拆成多个运行器。** 变长的是选项表。路径检查和分发留在它们闭合的书路径旁边。

## 影响

一次 finish 结果写明停在哪一步。写作者可以留下空主张文件，使后来的抽取不覆盖手改。没有 `设定/写作检查.json` 的书仍能提交。工作台不显示门禁那一行。这些命令未在真实 DSH 浏览器里验证，也未调用真实模型。[事实账本笔记](2026-10-19-story-fact-ledger.zh.md) 仍负责旁路 schema 和比对规则。

## 验证

`packages/creative/story/tests/facts.spec.ts` 覆盖带标签的抽取、稳定 id、空文件和 dry-run。`tests/chapter-finish.spec.ts` 覆盖入账的提交、失败提交不产生账本、入账失败留下该章、没有主张文件的 finish、`required` 的冲突不提交、`required` 的审稿先停下，以及 CLI finish 以 1 退出时 `project check` 仍是两个字段。`tests/gates.spec.ts` 要求缺文件时报告 `off`。`tests/context.spec.ts` 要求完整的 `omitted` 对象和 lite 档。`tests/plan.spec.ts`、`tests/rhythm-card.spec.ts`、`tests/cast.spec.ts` 和 `tests/book-audit.spec.ts` 覆盖 hint 类别。全书体检回归夹具的 warn id 仍是健康、角色卡、读者价值和作废条目。`tests/chapter-workflow.spec.ts` 和 `tests/revise-workflow.spec.ts` 要求模板里出现 `chapter finish` 和 `facts extract`。
