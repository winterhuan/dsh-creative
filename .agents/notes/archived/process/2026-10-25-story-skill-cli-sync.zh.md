# Agent Note: Story Skills follow the CLI contract

Status: implemented
Archived: 2026-11-01

[English](2026-10-25-story-skill-cli-sync.md) | 中文

## 问题

六个小说 Skill 是会话学习章末收束的地方。Host 路由不裁判小说规则。Skill 若写出另一种缺键缺省、另一种追踪 schema，或一份没有账本缺口的 `project check`，会话会跟着那一页，而不是 `writingGates`。

## 决策

`story`、`story-write`、`story-review`、`story-analyze`、`story-polish` 和 `story-cover` 保持原名。每个 Skill 用相对自身目录的路径调用 `lib/cli.js`，并带上 `--workspace`、`--book` 和 `--json`。判断在 story core。Skill 不自创规则 ID，也不自创 CLI 旗标。

缺了 `rule_audit` 或 `facts_diff` 等于 `required`。写成 `off` 才不拦提交。旧书运行 `project migrate-gates --legacy-off`。

追踪 schema 6 只保存摘要链接。条目留在 `追踪/事实账本.json`。`project migrate` 升到 schema 6。`project migrate --to 5` 去掉链接，不删账本，也不改 `state_revision`。

章路径是：主张文件缺失时可选 `facts extract`，然后审稿和规则审稿，然后 `chapter finish`。`rule_audit` 为 `required` 时，finish 先跑 `audit-verify`，再比对主张、提交、入账，然后报告过期。章号是这本书间隔的倍数时，finish 结果含 `book_audit`。

`project gates` 只读。`project check` 报告 `facts` 缺口。`project lookup --reference` 只读，除非 `--record`。记入的命中 `kind` 为对标，不进入 `covered_chapters`。细纲出场 hint 和正文启发式人名都跑。`cast_body_names` 缺省为 `hint`。

`story-polish` 和 `story-cover` 不描述这些门禁。它们的方法保持原样。

[章末收束](../feature/2026-10-25-story-chapter-finish.zh.md) 负责 finish 的阶段。[事实账本](../feature/2026-10-19-story-fact-ledger.zh.md) 负责旁路文件和比对。[规则审稿](../feature/2026-10-18-story-rule-audit.zh.md) 负责逐条结论。本笔记负责六个 Skill 与这些命令一致。

## 考虑过的替代方案

**把缺键教成 `off`。** 会话会放行提交，并且不会运行 `project migrate` 和 `project migrate-gates --legacy-off`。

**合并或重命名六个 Skill。** 这些名字是加载键。这份说明保留全部六个。

**在 Host 路由里裁判门禁。** Host 路由不裁判小说规则。判断在 story core，Skill 调用 CLI。

## 影响

跟着 Skill 的会话得到与 `writingGates` 相同的缺键缺省。必须继续提交的旧书写成 `off`。Skill 仍然不自创规则 ID。这些页面未在真实 DSH 浏览器里验证，也未调用真实模型。

## 验证

`packages/creative/story/tests/gates.spec.ts` 要求缺文件时报告 `required`。`tests/project-check.spec.ts` 要求有 `facts` 缺口。`tests/chapter-workflow.spec.ts` 要求单章模板写到 `rule_audit`。包 README 对页写同一缺省。
