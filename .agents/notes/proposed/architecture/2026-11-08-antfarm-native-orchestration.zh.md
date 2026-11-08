# Agent Note: Antfarm 原生执行与协作边界

Status: proposed

[English](2026-11-08-antfarm-native-orchestration.md) | 中文

[团队运行时决策](../../implemented/architecture/2026-11-08-antfarm-team-workflow-runtime.zh.md)记录已实现部分。本规划继续保留外部验收与原生收敛条件；[能力对照](../../../../plugins/dsh-antfarm/PARITY.zh.md)区分实现能力与已验证结果。

## 问题

Antfarm 需要强制独立验证、有界重试、可恢复业务进度和所属 worktree。原生 workflow 与 Agent Team 提供部分重叠的执行和展示机制，但根据组件名称替换实现，可能丢失这些保证或增加第二个执行器与任务板。[已实现决策](../../implemented/architecture/2026-11-08-antfarm-reimplementation.zh.md)拥有当前 v2 实现；本提案定义原生收敛与协作边界，不改变运行时行为。

本次对比依据 DSH `dsh-v0.2.2-rc.1` 源码与已有测试断言。这是设计评审，不是新的原生 workflow 或 Team 运行验收。

[团队工作流交付规划](2026-11-08-antfarm-team-workflow-plan.zh.md)负责产品范围、角色交接、候选验收与实施阶段。本文保留执行器、持久化与 Team 集成条件。

## 提案

Antfarm 继续负责一个编码 Run：解析后的流程、已接受业务检查点、验证与重试策略，以及 worktree 生命周期。DSH 继续负责子会话执行、jobs、会话记录、权限与子进程。Run 使用独立于发起会话 Team 的身份。保留一个权威业务状态和一个执行所有者。

### 原生能力边界

| 原生能力 | 对 Antfarm 的影响 |
|---|---|
| [Workflow 脚本执行](../../../../upstream/packages/workflow/workflow-ptc/src/runtime.ts)支持 `agent`、`parallel` 和逐 item 的 `pipeline`。 | 可信脚本可以表达重试和验证。`passed: false` 是业务数据，stage 返回 `null` 不会停止后续 stage；必须明确接受条件。 |
| [Workflow Host](../../../../upstream/packages/workflow/workflow-ptc/src/host.ts)管理 PTC 进程与子会话清理。 | 当前请求捕获 parent cwd，不提供角色 preset、预分配 child 身份或可等待检查点 binding，不能原样执行当前 Run 契约。 |
| [Workflow 工具记录](../../../../upstream/packages/workflow/tool-workflow/src/types.ts)持久保存展示事实。 | 运行与子会话历史可以跨重启保留；这些记录不能恢复脚本状态、已接受输出、重试和修复位置。 |
| [Team 服务](../../../../upstream/packages/experimental/agent-team/src/types.ts)管理可持续成员、直接消息与共享任务。 | 用于真实同伴协作。Team 成员身份、任务完成与消息接受不能证明 Antfarm 检查点。 |
| [Team 任务转换](../../../../upstream/packages/experimental/agent-team/src/task-board.ts)提供 CAS 与依赖校验。 | 实现、验证与最终接受具有不同含义。已认领任务可由 owner 完成；原生任务板不强制独立验证。 |
| [Session 事件兼容性](../../../../upstream/packages/core/session/src/known-event-types.ts)使用固定必需事件集合。 | 外部 Antfarm 插件不能通过声明合并引入必需检查点事件。[插件记录](../../../../upstream/packages/core/session/README.md#write-experimental-plugin-records)禁止外部调用者，迁移只承诺尽力保留。 |

### 当前版本的组合

在缺少公共契约时，保留当前直接调用原生 `subagents.startActivation`、完整检查点日志与只读 Runs 传输。不要为每个尝试增加 PTC workflow、用 YAML 专用实现替换通用 WorkflowEngine，或伪造原生 workflow 事件。这些方案保留业务执行器，同时增加执行所有者。

Team 协作归部署 profile 中显式启用的原生 Team 层；Antfarm 不要求 Team 依赖。根 Lead 可以发起 Antfarm Run 并等待结果。少量固定队员通过原生消息与任务开展调研或其他独立分工。Antfarm 尝试子会话继续使用全新会话、角色 preset 与结构化输出，不加入 Team roster，也不能启动 Run。原生队员工具继承 Lead 的 cwd 和组合；任务描述不会改变 cwd 或角色组合，也不会建立文件系统隔离。部署权限与 sandbox 配置决定实际检出访问权限。

原生 Team UI 管理成员与协作任务，Antfarm Runs UI 管理已验证进度、恢复与输出处置。不要将每个 story 或检查点镜像为 Team 任务。同一根会话的全部 Run 共享原生 Team 名称和成员上限，因此为每次尝试创建队员会消耗永久 roster 项。与 Run 关联的 Team 任务仍是普通协作记录；Run 完成与 Team 任务更新分别提交，本提案不自动同步完成状态。

Headless 调用方必须等待 Run 完成，不能把 Job 回执当作完成。[Headless 退出](../../../../upstream/packages/bundle/headless/src/index.ts)等待 Agent 与 subagents，随后退出，不等待任意 jobs。Owner 取消必须在清理前停止并等待执行结束。

### Run 执行与权威状态

Lead 在所属 worktree 中启动流程。Run 执行器先持久记录每次尝试的身份，再启动原生 preset activation。开发者结果交由全新子会话独立验证；只有接受验证结果才推进 story 检查点。拒绝结果为有界修复提供反馈，预算耗尽时按流程记录失败或阻塞。恢复从最后已接受检查点开始，未配对尝试需要显式核对处理。Lead 等待最终 Run 结果后再报告完成，或另行更新 Team 任务。

### 替换执行器的条件

只有公共执行契约同时提供以下能力时，才评估用原生 WorkflowEngine 执行 Run：不改变发起会话的 run cwd；经过校验的角色 preset 选择与尝试超时；启动前可等待的 child 身份预留及持久记录；可信、可等待且失败会停止后续子会话的检查点操作。恢复必须接收保存的流程与已接受检查点，仅执行未接受工作。

Antfarm 保留业务校验与检查点策略，原生 workflow 管理脚本和子会话生命周期。这必须替换当前执行所有者。将删去的执行器机制与生成脚本逻辑、bindings、校验和释放成本一起比较；仅把同一业务循环搬进脚本不够。原生观察事件继续表示展示事实，不能作为持久屏障。

### 替换持久化与传输的条件

DSH 提供支持外部插件的状态契约，并保证必需保留、冷读取、版本处理与独立 fork 所有权后，才评估原生 Session 持久化和共享投影。补类型或在投影闭包中读取外部状态都不够。当前投影定义折叠 Session 事件，不能将独立日志推入共享 store。

新执行器必须等待有参与者的持久屏障，并在 flush 失败后停止。[Session flush](../../../../upstream/packages/core/session/src/index.ts)返回是否有持久监听器参与；没有监听器时成功返回也不够。投影在 append 时发布，早于 flush，因此实时 UI 不能在屏障完成前证明持久化。成功迁移可以移除独立文件写入者、目录校验、运行文件租约、扫描、轮询、专用只读 Remote 与生成器适配；不能保留第二份日志再同步。

## 考虑过的替代方案

**立即只使用原生 workflow 脚本与 presets。**可以移除 YAML 解释器，但会放弃当前角色组合、worktree 执行上下文、启动前身份检查点与重启恢复。接受这些损失时适合一次性流程，不是等价替换。

**将 Team 任务作为完整 Run 状态。**Team 不包含 Run worktree 或验证结论，完成/重新打开任务不实现检查点恢复，也不使已完成依赖任务失效。把检查点编码进任务描述会混淆独立权威记录。

**每个 Run 创建独立根 Team。**专用 root 可以拥有 worktree cwd 并隔离 roster，但新增根会话创建、冷恢复、导航与释放责任。Team 角色仍继承同一组合，原生创建请求不接受角色 preset 或结构化输出。只有 Run 内持久同伴协作成为产品需求时才评估。

**立即写自定义必需 Session 事件或实验插件记录。**未知必需事件破坏原生冷读取。实验记录写入者排除外部插件，也不提供必需检查点保留保证。保留独立业务日志。

**为每个 Antfarm 尝试包装原生 workflow。**外层仍负责检查点与修复，内层增加脚本编译、PTC 进程与取消所有权。复用必须移除一个执行器，不能仅包围它。

## 验收条件

- 在固定版本下，原生 Team Lead 组合可以调用一个 Antfarm Run；普通尝试子会话不获得 Team 成员身份或 Antfarm 控制。队员检出访问权限仍由部署权限与 sandbox 配置决定。
- 当前验证、重试、不确定恢复、单执行器准入和干净 worktree 清理测试继续有效。`completed` 表示 Run 检查通过，不是 Team 成员自报任务完成。
- Headless 验收明确等待最终 Run 结果，并证明退出前取消会等待子会话释放。Web 验收区分原生 Team 协作与 Run 验证，保留原生子会话导航。
- 原生执行器替换必须证明 preset/cwd/超时一致、启动前检查点、失败后不启动下一子会话、启动期间取消，以及子会话完成但检查点未接受时的重启恢复。最终仅保留一个执行器。
- 持久化替换必须在删除独立日志和读取传输前证明冷回放、flush 失败、拒绝零监听器、外部所有权、普通 fork、并发写入者与版本兼容性。
- 本提案不修改 `upstream/` 源码。新增上游契约和依赖升级需要独立实现与版本验证。

## 风险

原生 Team 是实验能力，共享检出需要显式协调；write scopes 仅供提示。默认组合全部服务会增加策略与提示成本，却不增加 Run 保证。必需上游契约可能不被接受，因此不能在 Antfarm 中按收敛条件预建第二套框架。

从检查点恢复可能重复最后已接受状态之后的效果。Team 消息和原生 workflow 都不改变此限制。持久化和执行器替换必须保留明确不确定性，不能静默承诺恰好执行一次。
