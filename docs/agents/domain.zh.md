# 领域文档

[English](domain.md) | 中文

## 摘要

父仓库采用单一上下文。提出术语或修改已有决策前，读取领域词汇及相关 Agent Notes。每个插件是独立仓库，遵循各自的指令。

## 目录

- [探索前读取](#read-before-exploring)
- [文档归属](#document-ownership)
- [术语与冲突](#vocabulary-and-conflicts)

<a id="read-before-exploring"></a>

## 探索前读取

先读 [HANDOFF.md](../../HANDOFF.md)，定位所属插件。根目录存在 `GLOSSARY.md` 时读取它；进入插件仓库后，同时读取该仓库的指令及相关领域文档。缺少词汇表时静默跳过，只有确实确定了术语才创建。

按 [Agent Note 规则](../../.agents/notes/README.zh.md)读取 `.agents/notes/` 中相关的现役决策与提案。implemented 笔记描述已交付决策；proposed 笔记描述计划中的工作。archived 笔记是冻结历史，不作为当前权威。

<a id="document-ownership"></a>

## 文档归属

采用 **single-context** 布局：可选的根目录 `GLOSSARY.md` 保存父仓库领域术语。已有[翻译术语表](../i18n/terminology.md)负责中英文用词，不负责领域定义。插件专属术语按需保存在所属仓库；setup 不创建空词汇表或跨插件词汇索引。

本仓库使用 `.agents/notes/{lifecycle}/{kind}/` 保存架构决策记录，不另建平行的 `docs/adr/` 目录。工程技能要求编写 ADR 时，使用现有 Agent Note 的创建条件、生命周期、命名与双语规则。适用时更新已有决策的所属笔记。插件内部决策遵循该插件自身的决策文档约定。

<a id="vocabulary-and-conflicts"></a>

## 术语与冲突

Issue、提案与测试使用词汇表已定义的术语。缺少术语时，先检查已有代码与文档，再引入新名称；需要时通过领域建模记录已经确定的领域术语。

提案与现役决策冲突时，指出对应笔记，并说明拟议修改及取舍。保留 proposed 与 implemented 行为的区别。冲突提案不能静默取代现有决策。
