# Agent Note: DSH 上的原版 Antfarm Agent 与存储

Status: implemented

[English](2026-11-08-antfarm-original-agents-and-storage.md) | 中文

## 问题

Antfarm 用户需要在 DSH 中保留原版工作流方法、角色身份和可恢复执行。阶段名称相同并不等于保留了 Agent 指令、文本输出协议或 SQLite 恢复语义。DSH 能力 preset 也不能代表具有独立 persona 和外部记忆的身份。

## 决策

行为基线为 snarktank/antfarm 0.5.1。组合包逐字包含三个原版工作流及其 AGENTS.md、SOUL.md 和 IDENTITY.md 资源。Antfarm Agent 是按工作流限定的稳定身份，拥有独立 persona、角色策略、可选技能、模型和工作区。每次尝试通过共享 standard 组合创建全新的原生 DSH Session。组合包不注册 Antfarm 角色 preset。

系统提示扩展在激活前将 persona 关联到已预留的尝试 Session，采用 DS-Bot 将持久身份与运行 Session 分离的方式。可见工具与实际分派使用原生工具名执行原版角色策略。可用的声明技能进入 persona；不可用的可选技能向子 Agent 说明，遵循原版配置行为。身份被领取后才更新已安装的 persona 资源，冲突的本地编辑保持完整。对话历史保持全新；工作区文件与 Git progress 承载外部记忆。

原生回复使用明确的 `STATUS: done|retry|failed` 区分成功、验证拒绝与执行失败，成功还须包含步骤的 `expects` 文本。普通步骤的拒绝停止运行供修正后恢复，逐故事验证保留自动重试；执行失败和格式错误消耗既有预算。恢复指导与上次失败反馈进入后续输入，人设变量从领取上下文解析。模板未变时保留并加载本地学习；模板和工作区文件同时变化且内容不同时阻止覆盖。此适配保留原版资源与学习路径，不引入通用回退图。

原版 antfarm.db 的 runs、steps 和 stories 拥有业务状态。SQL 事务提交准入、领取、文本输出与上下文、故事验证、重试和恢复。DSH owner、尝试和宿主关联使用额外的集成表。精确领取者标识拒绝迟到结果；events.jsonl 仅作尽力观察，不重建 SQL 状态。单步骤失败指令保留为原版元数据，不扩展成通用重试图。

DSH Jobs 与无模型轮询拥有分派。每个身份跨运行只允许一个活动原生尝试。子会话成功退出后，原版角色期限才计入单步骤放弃或故事重试。第五次单步骤放弃使运行失败，恢复保留已消耗的故事重试次数。取消与停机等待精确激活退出；退出失败保留中断且不确定的尝试。启动不重放崩溃时未完成的工作，重复其效果前必须提供明确恢复说明。被引用的故事验证器与重试耗尽后的验证仍可达，修正原版前置阶段和恢复停滞。

原生管理界面直接投影这些记录。受修订号约束的项目／用户覆盖保留原版 YAML 和资源引用；已准入运行保留不可变定义。共享 Agent 工作区保持留存，完成的循环进度进入归档。历史 DSH JSONL 运行保留为可归属、完整前缀、仅供检查的记录；迁移、清理或重放均不会改变其字节。

[初始运行时](../../archived/architecture/2026-11-08-antfarm-reimplementation.md)与[团队运行时](../../archived/architecture/2026-11-08-antfarm-team-workflow-runtime.md)保留历史理由。其 preset 与日志权威决策已被替代。其所有权、取消、路径／修订号与历史数据约束由此适配器落实。过时的原生融合与扩展团队提案已移除；当前外部验证缺口由 [PARITY](../../../../plugins/dsh-antfarm/PARITY.zh.md)维护。

## 已考虑的替代方案

**每个角色一个 preset。** preset 配置 DSH harness，不能代表持久 Antfarm 身份。它会把内部角色暴露为用户模式，并失去原版 persona 组织。

**SQLite 后保留 JSONL 权威。** 这会留下恢复语义不同的第二套状态机。原版业务行和转移必须拥有进度；历史日志只作检查。

**使用原生 Workflow 或 Agent Team 作为业务状态。** 这些服务不实现原版 Antfarm 表与 worker 协议。包裹每次尝试会增加执行所有者，同时保留业务驱动器。DSH 提供执行能力而不替代方法。

**采用 DS-Bot 的完整产品。** 其身份与 Session 分离有用，但持久聊天、群组协作和 state.json 不同于 Antfarm 的全新尝试与 SQLite 执行。

**强制独立候选、GitHub 和产物验收。** 这些检查改变原版由 worker 报告完成的语义，需要独立产品契约。原版 persona 仍负责所声明的测试和 PR 操作；成功回复属于报告结果。

**自动重跑中断尝试。** 子 Agent 可能在 SQL 完成提交前产生效果。期限与全新 Session 均不能证明效果不存在；协调恢复保持明确。

## 后果

原版资源、SQL 转移、身份、重试与原生生命周期共用一条执行路径。自定义原版格式工作流使用相同加载器和管理保护。额外 research／writing 模板、结构化结果契约、重试额度授予、产物快照和按运行清理均不存在。稳定工作区保留原版外部记忆，同时放弃按运行隔离检出。

Shell 与技能访问仍受部署权限约束；直接工具限制不使其只读。明确恢复可能重复效果，因此 SQLite 与原生 Session 均不保证外部操作恰好执行一次。Webhook 尽力投递，与 SQL 接受分离。

[测试](../../../../plugins/dsh-antfarm/tests/)覆盖原版资源、SQL 状态、迟到结果、取消、超时／退出、persona 冲突、可选技能、进度和历史保留。隔离 DSH Web 验收使用确定性适配器，完成三个工作流及二十个独立原生 Session 和 Bash 调用。真实模型质量、在线 GitHub 交付、其他平台和发布需要单独证据；[PARITY](../../../../plugins/dsh-antfarm/PARITY.zh.md#acceptance-scope)维护该范围。
