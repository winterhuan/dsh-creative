# Agent Note: 模型指引单一来源与结构化提示阶梯

Status: implemented

[English](2026-10-25-student-model-guidance.md) | 中文

## Problem

同一套教学规则写在三处：`study_update` 的 `change` 参数描述约 1300 字符、`study_status` 的 kind 描述约 700 字符，每个学习会话常驻上下文；`queryStudy` 五段 `more` 返回文再写一遍出题与批改规则；study 技能是第三份。三处人工同步，README 宣称的「工具描述只保留调用契约」并不成立。提示内容同时全靠模型即兴：`hintLevel` 只是计数器，技能规则只有一句「第一次提示只帮孩子看条件或画图」，而知识地图里每个目标登记的常见错法只用于出题，没用于提示。

## Decision

教学与批改规则由 study 技能单点维护。常驻 `study_status` 描述限定有界查询、选择参数与资源指针；原生文件工具编辑正式记录，随包只读 CLI 负责校验。文件 schema 和示例按需读取，与业务校验器共用定义。`objectiveElements` 派生三层 `hintLadder`：第一层按学习方法指向条件或画图，第二层让学生核对首条已登记常见错法，第三层提供已登记出题要点作步骤。`kind=elements` 返回阶梯，技能按层提示而不提供算式或答案。阶梯使用既有地图方法、错法与出题要点，不另维护一份提示数据。

## Alternatives considered

**保留描述里的规则当作「双保险」。** 三处同步成本与漂移风险高于收益；schema 强制的规则由校验兜底，行为规则由技能单点维护。

**提示阶梯写入知识地图 JSON。** 每个目标手工维护三句提示的数据成本高；从既有方法、错法、出题要点派生即可，改地图时阶梯自动跟随。

## Consequences

原生编辑包只公布一个只读 Student 工具，实际登记参数 JSON 为 2,078 个 UTF-16 字符，双工具基线为 61,268 字符；重复请求历史、schema 读取和 CLI 结果仍会增加上下文成本。这些数值不衡量提供方 token，也不证明总成本下降。提示质量仍依赖真实模型按阶梯执行，阶梯推导和 elements 输出回归不能证明教学质量。教学规则决策仍归[学习系统决策](../feature/2026-10-05-student-learning.zh.md)；仓库与真实 DSH 验证归 [HANDOFF.md](../../../../HANDOFF.md) 所有。
