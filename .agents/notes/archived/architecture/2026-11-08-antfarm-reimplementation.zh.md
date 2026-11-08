# Agent Note: 基于当前 DSH 重新实现 Antfarm

Status: implemented
Archived: 2026-11-08

[English](2026-11-08-antfarm-reimplementation.md) | 中文

本文记录初期编码运行时范围。[团队运行时决策](2026-11-08-antfarm-team-workflow-runtime.zh.md)替代其只读界面与仅人工重启限制；检查点归属和工作区理由仍适用。

## 问题

重复编码团队需要强制 story 验证、有界重试、持久执行位置与显式阻塞恢复。依赖安装成功不能证明这些保证，也不能证明与当前 DSH 子会话/job 所有权 API 兼容。

无密钥复现发现拒绝输出进入恢复 context、规划成功在注册 stories 前推进、子会话释放期间取消后仍启动后续子会话，以及容量受限时并发恢复仍启动两个执行器。Studio 保存沿目录符号链接写入、覆盖外部编辑，并在共享临时文件名上冲突。环境复制覆盖已有目标，清理删除被修改副本。这些观察支持持久检查点与明确资源所有权；fixture 不能证明模型质量或外部服务安全。

## 决策

Antfarm 保持为 [plugins/dsh-antfarm](../../../../plugins/dsh-antfarm/README.zh.md) 中可独立安装的 DSH bundle，精确依赖 DSH `0.2.2-rc.1`。DSH 管理原生 activation、Agent Preset、jobs、权限、子进程与会话导航。Antfarm 管理编码流程与其日志，因为[原生 workflow](../../../../upstream/packages/workflow/workflow/src/runtime-types.ts)没有保存执行位置或恢复操作。

Version 2 YAML 选择部署提供的 preset 与相对 Markdown 指令；每次运行捕获解析后快照。使用 caller delivery 的全新 activation 接收原 parent、worktree cwd 和对象根结构化输出。这移除了空闲 coordinator、重复角色/工具策略、文本结果解析器与过时 invariant companion。父仓库包检查覆盖单包 `src` 布局，不要求第二份源码副本。

一个 owner 在异步准备前预留准入。启动与恢复共享容量和每次运行的准入；跨进程日志租约排除其他写入者。原生工具注册对 subagent 会话隐藏 Antfarm 控制，运行时准入也拒绝其启动/恢复请求；工作流子会话不能递归创建团队。取消在每次子会话启动前检查，组合运行取消与超时，等待子会话释放，不能结算为 completed。插件释放会等待已准入操作结束。

[日志与 fold](../../../../plugins/dsh-antfarm/src/persistence/fold.ts)管理实时查看和恢复的已接受状态。完整检查点一次接受输出、规划 stories 与下一位置。拒绝结果保留反馈和重试事实，不改变成功 context。子会话可能在检查点提交前产生效果；未配对尝试需要先检查并提供明确核对指导。恢复使用全新子会话，可能重复未提交效果。重启不自动启动模型。

### 工作区与查看

每次运行使用从捕获 HEAD 创建、身份已校验的分支/worktree，不包含基础检出的未提交修改与未跟踪/忽略文件。不提供共享目录执行和自动环境复制。清理校验规范路径、Git 身份、分支、继承关系与已跟踪/未跟踪/忽略内容，不强制移除，并保留分支和已修改输出。

只读 Runs 侧栏从与工具相同的有界所属会话投影派生内容。它提供进度、阻塞/不确定状态、保留输出与原生子会话导航，不增加独立日志扫描器或 Client 数据库。原生 workflow 卡片不会自动观察 Antfarm 日志。类型化生成 Remote 管理传输；DSH 支持 SRC remote，其本身不是兼容性问题。

不提供在线编辑。重新加入要求用户拥有的可写覆盖、真实路径限制、服务端校验 revision、按目标串行保存、唯一临时文件、可处理的旧草稿冲突，以及未保存草稿保护。包内工作流保持只读；启用覆盖意味着显式创建用户副本。

## 考虑过的替代方案

**只升级依赖版本。**这会保留不匹配的子会话/job API，以及已复现的检查点、取消、准入与写入失败。

**用长提示词或 Skill 替换 Antfarm。**指令不能强制独立验证、持久位置、重试预算、工作区所有权或阻塞恢复。Skill 仍可提供任务指导。

**将 YAML 编译成原生 workflow 脚本。**原生 workflow 工具会持久保存展示记录，但这些记录不保存业务执行位置，也不支持恢复。当前引擎还缺少 run cwd、角色 preset、启动前身份检查点与可等待检查点 binding。在现有执行器外包装 PTC run，会保留解释器职责并增加编译胶水。本范围内直接 activation 拥有更少实现；[原生收敛要求](../../proposed/architecture/2026-11-08-antfarm-native-orchestration.zh.md)定义替换条件。

**与 Superagent 合并。**Superagent 管理外部请求、策略、tickets 与 GitHub 或飞书回复。Antfarm 管理从 DSH 发起的编码流程。合并会增加外部消息与授权职责；明确授权的任务可以组合两者，无需合并所有权。

**保留现有 Studio 编辑器。**其路径、覆盖与并发失败会扩大首个替换版本范围。只读运行查看能提供有效输出而不承担这些写入义务。

## 影响

完整检查点、写入者准入和所属 worktree 保留显式恢复能力，防止静默接受失败输出。执行保持串行，逐 story 验证、修复与人工升级均有界。实现不保证外部效果恰好执行一次，也不提供自动重启、并行 DAG 或外部事件接入。

Version 2 改变角色与结果语法。能恢复 owner 身份的旧日志保持只读；没有将 version 1 当作新格式的隐式迁移。检查保留输出后启动全新运行属于人工恢复选择，不代表 resume 兼容。排除共享执行、环境复制与编辑会放弃这些能力，并移除对应资源/冲突义务。

Preset 写工具限制不会让 shell 或 skill 执行成为文件系统只读。委派权限与部署 sandbox 配置仍是依据。Web/TUI 提供原生 Agent Preset 组合；默认 headless 需要单独提供注册器与 parent preset。模型成本、编码质量与外部服务恢复需要配置 provider 后验收。

所属[测试](../../../../plugins/dsh-antfarm/tests/)覆盖输出拒绝、完整规划/story 检查点、不确定恢复、单执行器准入、取消/释放、安全 worktree 保留与只读 Client 生命周期。[DESIGN](../../../../plugins/dsh-antfarm/DESIGN.zh.md)管理实现细节，[HANDOFF](../../../../HANDOFF.md)管理当前验证状态。重新加入编辑器还需上述路径/revision/并发保存/草稿回归验证。

活跃笔记核对未发现其他需要取代的 Antfarm 决策。Writer 的技能挂载、不覆盖规则与重复脚本仍由独立记录拥有。
