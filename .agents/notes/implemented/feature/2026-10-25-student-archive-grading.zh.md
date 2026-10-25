# Agent Note: 批量抽查批改、派生字段出文件与学期归档

Status: implemented

[English](2026-10-25-student-archive-grading.md) | 中文

## Problem

纸面闭环的家长摩擦足以让主通道荒废：照片转录后必须逐题核对才入库。复习派生字段（stage、independentDays、dueAt）每次读取都从证据重放，却仍写回状态文件——双份真相加写放大。学期结束只有「换工作区」一条路，证据留在原文件里没有归档出口。

## Decision

批改采用批量抽查制（家长选定）：`paper-draft` 增加可选 `confidence`（high/low，缺省按 low 处理），技能要求转录清晰且判读无疑的题标 high、有疑问的标 low 并写 uncertainties；工作台对高置信题提供一键批量确认（仍是一次家长动作，等价于既有 `confirm-paper` 的一次多题提交），低置信与答错题保持逐题核对。入库边界从「逐题核对」改为「高置信批量确认＋低置信逐题」，家长仍是一次性把关人。

派生字段出文件：`stage`/`independentDays` 改为 schema 默认值（输入可缺、输出必有，消费方零改动），`dueAt` 可选；写入前按条剥离这三个字段，读取时经缓存重放在内存补全。旧文件带着这些字段照常读取。状态文件更小、事实单源。

学期归档：新命令 `archive-term`（家长确认，学习段进行中拒绝），存储层先导出全部证据到 `.study/archive-<学年>-<学期>.json`（已存在即拒绝，防误覆盖），再把档案清空为带 `archivedAt` 的最小状态；读取层把带 `archivedAt` 的文件视为不存在，同一工作区可直接为新学期重新 `setup`。工作台家长设置提供归档按钮（含确认对话），动作元数据声明为面板可提交。

## Alternatives considered

**模型自动入库高置信题。** 把「未经家长动作不入库」改成模型裁量，超出本包的信任边界；批量确认保留家长把关。

**归档即删除状态文件。** 文件系统服务未必提供删除；带 `archivedAt` 的最小文件达到同样的「读作不存在」，且 schema 显式可见。

## Consequences

家长核对从逐题降为「一次批量＋少数抽查」；状态文件不再携带派生字段，读路径重放成为唯一事实源；学期切换在同一工作区内闭环，证据导出可长期留存。真实使用中的批量确认与归档操作需家长各走一遍验证（HANDOFF 记录归属）。批改与归档边界见本记录；练习单与读路径见[同名决策](../simplification/2026-10-25-student-worksheet-html.zh.md)与[读路径决策](../simplification/2026-10-25-student-read-path.zh.md)；仓库与真实 DSH 验证归 [HANDOFF.md](../../../../HANDOFF.md) 所有。
