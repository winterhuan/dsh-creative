# Agent Note: 小说工作流规则各有唯一归属

Status: implemented

[English](2026-10-03-story-rule-ownership.md) | 中文

## Problem

小说指令可能分配冲突职责：写入 hook 要求立即更新追踪，写手 Role 把检查留给父流程，原生 workflow 却让写手检查、最后的子会话提交。准备和提交还分别解析细纲目标，导致准备接受了提交不接受的文本。复制的界面代码和庞大的查询 JSON 协议没有消费者。

## Decision

所选 Skill 或 workflow 负责执行顺序和任务分配，Role 提供专业方法。写手执行任务分配的检查；写入 hook 要求重新检查和审稿，再由指定提交者通过章节事务更新追踪，不指示写手修改追踪。[原生 workflow](../feature/2026-10-03-story-native-workflow.zh.md)保留准备、独立审稿、有上限的修订和带保护的提交。

只有父会话读取调用说明。子会话提示词包含本阶段职责和必要资源，包括审稿的轻量来源身份检查。`story-explorer` 以事实、来源和缺口回答本次问题，对标选择由工程上下文参考负责。文风分析提供有证据的指导，不施加过时的写作 Gate 或强制词频配额。

Python 细纲检查器与提交一样，使用 `wordcount_core.py` 解析章文件路径和目标字数。准备可以报告缺失细纲的拟建路径，多候选仍报错。结构问题仍阻断写作；机械完整的细纲不代表文学质量成立。

小说客户端保留文件列表、编辑、冲突保护和成功变更后的刷新，移除无人使用的流式投影、其他领域词典和未使用的工作区元数据。共享生产设置、持久追踪、作者记忆日志及直接追踪 CLI 保留原有规则。

## Alternatives considered

**增加统一规则注册表或执行框架。** 新运行时会重复 DSH，并增加职责冲突来源。现有任务、Role 和 hook 的责任一致即可满足需要。

**保留两份解析器并用测试证明等价。** 这仍为同一格式保留两个维护者。共用解析直接保证准备和提交一致，回归转而覆盖无效目标和歧义路径。

**删除全部检查或知识库。** 结构检查、真实来源身份、事务追踪和选用的专业参考仍保护有效行为。它们的价值不能证明文学证书、固定查询 JSON 或每个子会话全量加载参考的必要性。

**为未来消费者保留未使用接口。** 假想调用方不足以支撑当前投影、schema 和文案维护。确有消费者时，再引入有明确范围及测试的接口。

## Consequences

Agent 接收到的冲突指令减少，加载的无关上下文也减少。已删除的 JavaScript 细纲入口调用方须改用 Python 执行 `check_outline_contract.py`。小说工作区响应省略 `projects`，查询员不再承诺固定 JSON 结构；这两项移除的规则没有当前产品消费者。这些是有意缩减的兼容接口，不涉及持久数据迁移。

静态 token 数和当前用法归[包说明](../../../../packages/creative/story/README.zh.md#model-experience)所有。测试覆盖实际原生写入及 hook、共用目标解析、缺失与歧义细纲、追踪兼容、成功变更识别、文件列表及编辑冲突。脚本化模型测试验证执行行为，不证明文学质量提升。仓库和真实 DSH 验证归 [HANDOFF.md](../../../../HANDOFF.md)所有。

[六技能](2026-09-30-story-skills-native-resources.zh.md)、[原生专家](../feature/2026-10-01-creative-role-agents.zh.md)、[读者价值](../feature/2026-09-22-novel-reader-value-generation.zh.md)、[四领域](../architecture/2026-09-30-creative-four-domain-plugins.zh.md)和[工作台](../feature/2026-09-03-creative-workbench.zh.md)决策分别保留入口、协作、文学、安装及文件系统方面的独立理由，与原生 workflow 记录一并保持 active。本次没有完全被取代或需要归档的三件套。
