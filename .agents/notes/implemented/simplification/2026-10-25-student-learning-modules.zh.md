# Agent Note: 学习核心拆分为模块与动作元数据

Status: implemented

[English](2026-10-25-student-learning-modules.md) | 中文

## Problem

`src/learning.ts` 以 1541 行承担七类职责：时间与文本工具、复习排期、时段状态、二十六个动作的执行开关、掌握度洞察、地图投影与出题计划，是 Host 面六成的代码；配套的 `tests/learning.spec.ts` 同步膨胀到一千余行。新增一个动作要同时改 schema、执行开关、工具描述、路由白名单与客户端文案五处，路由白名单是手抄的动作名集合，与 schema 没有编译期联系。

## Decision

按职责拆为 `src/learning/` 六个模块加 `update/` 处理器族：`shared.ts`（时间/文本工具与范围判定）、`schedule.ts`（复习排期重放）、`status.ts`（时段状态与今日摘要）、`mastery.ts`（单一掌握度规则、洞察与摸底计划）、`view.ts`（目标解析、出题要素、巩固卷计划与地图投影）、`update/{context,profile,session,mistakes,paper,index}.ts`（按动作族拆分的处理器与类型安全的调度开关）。调度由 `rawApply` 统一做克隆、分发与收尾（修订号、重放、再校验），处理器返回原状态表示无变化、返回克隆表示已变更；复合动作 configure-course 经 `rawApply` 组合两个子动作后单次递增修订号。十四个引用方改为显式新路径导入，不留桶文件。

动作元数据声明化：新增 `src/actions.ts`，以 `Record<Command['action'], { panel, group }>` 穷尽声明每个动作的可提交面与所属处理器族，路由白名单由 `panel: true` 生成，与 schema 的二十六个动作保持编译期一致。新增动作现在只需 schema、处理器与元数据三处。`locales.ts` 保持单文件，按视图补了分组注释；测试按同一边界拆为 update/schedule/insight/view 四个 spec。

## Alternatives considered

**保留 learning.ts 作为桶文件再导出。** 引用方零改动，但巨石继续存在，后续功能仍会长在上面。

**处理器注册表驱动调度。** 映射类型分发需要 `as` 断言（仓库门禁禁止新增），改用穷尽 switch 委托，编译器保证不漏动作。

**同步拆分 locales 为多文件。** 命名空间合并需要四处模块扩充，收益低于成本，分组注释已满足导航。

## Consequences

纯重构，129 项测试数量与内容不变地重分布到 11 个文件并通过；客户端 bundle 体积基本不变（4.61 MB）。读路径缓存与掌握度统一的决策见[读路径决策](2026-10-25-student-read-path.zh.md)，练习单网页化见[同名决策](2026-10-25-student-worksheet-html.zh.md)；仓库与真实 DSH 验证归 [HANDOFF.md](../../../../HANDOFF.md) 所有。
