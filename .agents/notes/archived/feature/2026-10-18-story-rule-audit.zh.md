# Agent Note: 独立规则审稿与提交门禁

Status: implemented
Archived: 2026-11-01

[English](2026-10-18-story-rule-audit.md) | 中文

## Problem

`chapter rules` 可以把一份稳定清单交给写手，原生模板仍可能在整体审稿从未逐条判断这些 ID 时提交。作者想保留的 violate 没有落点，除非写进追踪状态；审稿者编造的引文也会看起来像证据。整体审稿和这次逐条审稿必须共用同一份修订预算。

## Decision

Write 之后，单章模板在同一个 `phase('Review')` 里用 `Promise.all` 启动 Review 和 Audit。rc.2 的 `@deepseek-ai/dsh-workflow-ptc` 里，`agent()` 先占一个槽再启动子会话。默认上限是 `min(16, max(1, availableParallelism() - 2))`。上限至少为 2 时两个子会话重叠。上限为 1 时它们排队，两步仍都会跑完。模板不另写一条串行退路。

审稿者加载 `story-review` 并阅读 `references/roles/rule-auditor.md`。它只判断 `chapter rules` 返回的 `rules` 数组里的 ID，不自创 ID，也不代替作者接受例外。`also` 里的 ID 不另给结论。被 16 KiB 截掉的规则不审。文件是 `story-rule-audit/v1`，路径为 `草稿/审稿/第NNN章.rules.json`。每条结论是 `pass`、`violate`、`not_applicable` 或 `unclear`。`violate` 至少带一处 `{ line, quote }`。判定口径在同一份角色说明里：`CORE` 与 `VOL-OLD` 出现反模式的任一段即 violate，后文补救不抵消；以「禁止」开头的规则只查被禁行为是否出现；`OUT-P` 合成句缺情节点或越界都是 violate；`OUT-GOAL` 与目标矛盾是 violate，目标未推进且未用 `not_applicable` 说明时是 unclear。证据只取本章正文。称谓或外号能对应到同一人即适用。存疑是 unclear。

`chapter audit-verify` 不调用模型。当前每条规则恰好一个结论，每个结论 ID 都必须在这份清单里。`normalizeRuleSentence` 去掉 `**`、空白和句末标点。引文随后必须出现在该 1 起行号的正文行上。句中标点保留，因此删掉逗号会失败。`body_sha256` 是当前正文原始字节的 SHA-256。`rules_sha256` 是当前章节规则摘要。通过时退出码为 0，并列出 violate 与 unclear 的 ID。失败时退出码为 1，列出全部原因，缺文件也算失败。离开本书的路径以 2 退出。写作检查文件非法时以 2 退出。

`设定/写作检查.json` 可以把 `rule_audit` 设为 `off` 或 `required`。缺文件或缺这个键等于 `required`。写成 `off` 时，`chapter commit` 和 `chapter finish` 不要求审稿文件。`project migrate-gates --legacy-off` 给旧书写上 `off`。`required` 要求默认路径上的文件已通过校验，并且每条 violate 的 ID 都在 `accepted_findings` 里。`unclear` 和扫描 hint 进入修改意见，不拦提交。第 001–012 章的标定用来决定这本书是否保持 `required`：R1–R3 必须命中，已知干净章的误报 violate 不超过 1 条。标定未通过时写成 `off`。[Skill 与 CLI 对齐](../process/2026-10-25-story-skill-cli-sync.zh.md) 负责六个 Skill 按这个缺省教学。

`accepted_findings` 是事务的可选数组，每项为 `{ rule_id, reason }`，最多 12 条，ID 不重复。非空时写入该章逐章记录的 `## 接受的规则例外`。它不进入追踪状态。追踪 schema 6 保存的是事实账本摘要链接，不是这份清单。空数组或不写这个键时，逐章记录与省略该字段的事务相同。

未接受的 violate 与现有修订共用两轮上限。到上限时模板返回 `revision_limit`，列出 `unresolved_rule_ids`，并给出三选一：接受例外、改规则来源，或改细纲。

[章节规则决策](2026-10-18-story-chapter-rules.zh.md) 仍负责提取和 `rules_sha256`。[全书体检决策](2026-10-18-story-book-audit.zh.md) 仍负责区间报告。[原生 workflow 决策](2026-10-03-story-native-workflow.zh.md) 仍负责其余阶段。这些记录都没有被完全取代。

## Alternatives considered

**等 Review 返回 ready 再跑 Audit。** 那时才发现的 violate 会花掉整体审稿已经用过的一轮。同一阶段启动两者，计数器仍然只有一个。

**在脚本里先 Audit 再 Review。** rc.2 在上限为 1 时已经会把 `agent()` 排队，再写一套调度只会把这个上限藏起来。`Promise.all` 用的是引擎自己的限制。

**把接受的例外写进追踪状态。** 例外是对一章正文的决定。逐章记录可以展示它。schema 6 的 `facts` 链接是账本摘要，不是这份清单。

**让 `unclear` 拦住提交。** 缺一章邻章不是违反规则。只有未接受的 `violate` 会拦住，而且只在门禁为 `required` 时。

## Consequences

缺了 `rule_audit` 等于 `required`。第 001–012 章尚未标定时写成 `off`。值为 `required` 时，过期哈希或伪造引文会拒绝提交。作者接受 violate 时，理由出现在逐章 Markdown 里，之后阅读状态 JSON 的人看不到这个字段。审稿者仍可能漏掉被 16 KiB 截掉的规则。整体审稿可以是 ready，同时一条 violate 仍要求再改一轮。

## Verification

合成夹具拒绝伪造引文、清单外的规则 ID、缺结论、正文或规则哈希不匹配，以及离开本书的路径。写成 `off` 时可以提交；值为 `required` 时，文件通过校验之前拒绝提交；`accepted_findings` 可以放行，并且该字段不进入状态 JSON。`tests/gates.spec.ts` 要求缺键报告 `required`。脚本化 workflow 覆盖未接受的 violate、已接受的 ID 和 unclear。原生组合在审稿旁边运行规则审稿，violate 仍在时停在 `revision_limit`。设置了 `SHENJI_BOOK` 时做只读冒烟，未设置则跳过。夹具不含小说原文。仓库的 typecheck、build、全量测试和文档检查覆盖这个包。没有真实 DSH 浏览器会话，也没有真实模型调用跑过这条命令。
