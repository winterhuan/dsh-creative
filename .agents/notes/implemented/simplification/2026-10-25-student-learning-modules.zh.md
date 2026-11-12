# Agent Note: 学习核心拆分为模块与动作元数据

Status: implemented

[English](2026-10-25-student-learning-modules.md) | 中文

## Problem

`src/learning.ts` 以 1541 行承担七类职责：时间与文本工具、复习排期、时段状态、二十六个动作的执行开关、掌握度洞察、地图投影与出题计划，是 Host 面六成的代码；配套的 `tests/learning.spec.ts` 同步膨胀到一千余行。新增一个动作要同时改 schema、执行开关、工具描述、路由白名单与客户端文案五处，路由白名单是手抄的动作名集合，与 schema 没有编译期联系。

## Decision

`src/learning/` 按职责区分时间/文本/范围工具、复习重放、状态、掌握、视图、归一证据与只读查询。`update/{context,profile,session,mistakes,paper,index}.ts` 处理器族保留共享领域变换的类型安全穷尽调度。`rawApply` 负责克隆、分发、修订号变化与再校验；无变化的处理器返回原状态。正式文件 schema、一致读取、校验、带版本保护的手动保存与恢复描述归 `src/files/` 所有。工具与面板共用证据与查询规则，不各自重建。

手动保存权限归 `src/files/manual.ts` 的封闭类型化意图联合所有；Remote 在执行前检查已注册主会话访问。兼容 HTTP 路由不接受修改，因此不需要生成动作白名单。处理器族的归属留在 update 模块中，不另建处理器注册表或消费者分组标签。客户端文案字典保持单文件，测试沿领域所有者拆分。

## Alternatives considered

**保留 learning.ts 作为桶文件再导出。** 引用方零改动，但巨石继续存在，后续功能仍会长在上面。

**处理器注册表驱动调度。** 映射类型分发需要 `as` 断言（仓库门禁禁止新增），改用穷尽 switch 委托，编译器保证不漏动作。

**同步拆分 locales 为多文件。** 命名空间合并需要四处模块扩充，收益低于成本，分组注释已满足导航。

## Consequences

原模块拆分保留了 11 个文件中的 129 项测试与 4.61 MB 客户端 bundle；这些测量不描述后续正式文件和传输扩展。读路径缓存与掌握度统一的决策见[读路径决策](2026-10-25-student-read-path.zh.md)，练习单网页化见[同名决策](2026-10-25-student-worksheet-html.zh.md)；仓库与真实 DSH 验证归 [HANDOFF.md](../../../../HANDOFF.md) 所有。
