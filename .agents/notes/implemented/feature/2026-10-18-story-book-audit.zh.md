# Agent Note: Book audit over a chapter range

Status: implemented

[English](2026-10-18-story-book-audit.md) | 中文

## 问题

写手可以让每一章的单独检查都通过，却把过期的读者价值哈希、没有角色卡的快照，或一条已作废的约束带进后面十章。`chapter check` 和 `project query --kind health` 各回答一个问题。没有命令把这些结果按选定范围列在一起，也没有东西在整十章刚落地时告诉父会话。

## 决策

`book audit` 对一段连续章号返回 `story-book-audit/v1`。不加 `--write` 时只读。`--write` 在书内保存一份 Markdown，默认路径是 `草稿/体检_第A-B章.md`，并拒绝越出书目录、进入 `追踪/` 或使用软链接的路径。没有 blocking 时退出码为 0，有则为 1，参数错误或追踪、写作检查文件非法时为 2。同一输入的排序不变。

检查实现同一接口，按 `BOOK_AUDIT_CHECKS` 运行。第一批五项是 `chapter`、`health`、`cast-cards`、`reader-value-stale` 和 `void-entries`。`chapter` 对每份正文调用 `checkBlockingQuality`，并去掉作废词行，由 `void-entries` 报告一次。正文缺失是 hint。没有细纲时跳过照搬比对。`health` 以 `--to` 为截止章、用默认阈值调用 `assessHealth`；这些行保持 hint。`cast-cards` 把快照名对上 `设定/角色/` 的文件名或已声明别名。`reader-value-stale` 把记录里的 `body_sha256` 与当前正文原始字节的 SHA-256，以及 `wordcount_records` 对照。`void-entries` 沿用[章节规则](2026-10-18-story-chapter-rules.zh.md)的 `void:<字段>[下标]:词`，并报告状态已是「放弃」或「作废」的伏笔。追踪 schema 保持第 5 版。`reader_value_records` 仍是不验证的历史字段。

新提交成功后，原生单章模板在章号是 10 的倍数时加上 `book_audit_hint`。提示点名 `book audit --from N-9 --to N`。模板不运行该命令。已提交章只做验证时省略这个字段。

[章节规则决策](2026-10-18-story-chapter-rules.zh.md) 仍负责提取、扫描分级和 `also` 字段。[读者价值决策](2026-09-22-novel-reader-value-generation.zh.md) 仍负责该字段为何是历史数据。[原生 workflow 决策](2026-10-03-story-native-workflow.zh.md) 仍负责阶段顺序。这三份记录都没有被整份取代。

## 考虑过的替代方案

**在 workflow 里直接跑体检。** 父会话决定这段扫描值不值得读那些文件。模板只点名命令。

**把全书检查折进每一次 `chapter check`。** 缺角色卡、留下的作废条目和过期哈希是书级问题。每章重复一次会把范围藏起来。

**把 `also` 留在 `text` 里。** 交给写手的一行仍可以显示其余 ID。`text` 必须保持来源原句。`rules_sha256` 仍按接上之后的文本计算。

**把报告写进追踪 schema。** 报告不是状态。schema 保持第 5 版，`--write` 只写一份 Markdown。

## 影响

父会话可以在不改状态的情况下体检一段章号。hint 不使命令失败，所以退出码为 0 时仍可能列出过期哈希和缺卡。事实账本、节奏、人物弧线和文风检查不在第一批列表里；它们以后加入 `BOOK_AUDIT_CHECKS`。错误的 `--write` 路径在体检运行前以 2 退出。此命令未在真实 DSH 浏览器里验证，也未调用真实模型。

## 验证

`packages/creative/story/tests/fixtures/regression/book-audit/` 的合成夹具覆盖缺卡、过期的读者价值哈希、作废词、已放弃的伏笔、缺失正文、只读时目录哈希不变、`--write` 路径限制、退出码和稳定输出。设置 `SHENJI_BOOK` 时对第 1 章到第 12 章做只读冒烟，未设置则跳过。夹具不含小说原文。仓库 typecheck、build、全量测试和文档检查覆盖这个包。
