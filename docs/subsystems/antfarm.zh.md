---
description: "原版 Antfarm agent 身份、SQL 业务状态与原生 DSH 执行归属。"
---

# Antfarm

[English](antfarm.md) | 中文

## 概述

Antfarm 运行原版专家团队，保留稳定人设并创建全新原生 Session。SQLite 管理业务进度，DSH 管理执行与原生会话记录。源码位于 `plugins/dsh-antfarm` 子模块；`0.3.3` 已在市场发布，并从固定 Git 提交安装到本地独立 `antfarm` profile。[HANDOFF](../../HANDOFF.md#5-在-dsh-中安装调试和移除)维护本机服务操作与数据位置。

## 目录

- [归属](#ownership)
- [信任与恢复](#trust)
- [开发](#development)
- [开发备注](#dev-note)

-----

<a id="ownership"></a>
## 归属

[组合包](../../plugins/dsh-antfarm/cordis.patch.yml)提供原生运行时、工具、命令、侧栏和看板，不注册角色 preset。[包 README](../../plugins/dsh-antfarm/README.zh.md)维护配置与用户操作。

| 归属 | 职责 |
|---|---|
| [工作流加载器](../../plugins/dsh-antfarm/src/workflow/loader.ts)与[管理器](../../plugins/dsh-antfarm/src/workflow/manager.ts) | 原版定义、人设资源和绑定修订的可写覆盖。 |
| [Agent 适配器](../../plugins/dsh-antfarm/src/runtime/agents.ts) | 稳定身份到原生 Session 的映射、人设与角色工具。 |
| [运行时](../../plugins/dsh-antfarm/src/runtime/index.ts) | 根归属、原生 Jobs、调度、取消与恢复。 |
| [数据库](../../plugins/dsh-antfarm/src/persistence/database.ts) | 原版权威 SQL 状态转换与原生关联。 |
| [历史读取器](../../plugins/dsh-antfarm/src/persistence/legacy.ts) | 可确认归属的只读快照，不重放或写入。 |
| [Studio Host](../../plugins/dsh-antfarm/src/studio-host/index.ts)与[客户端](../../plugins/dsh-antfarm/src/client/mount.tsx) | 授权查询／控制、语言与原生导航。 |

<a id="trust"></a>
## 信任与恢复

原根 Session 授权 Run 读取与控制。确切原生领取者身份拒绝过期结果，每个稳定 agent 只有一个活跃尝试。未匹配的中断效果在恢复前需要人工核对。历史日志保持在执行器之外。SQL 和角色工具屏蔽均不隔离 shell／凭据效果，也不保证外部操作恰好一次执行。

配置写入要求受限路径和匹配的源码修订。原生生命周期归属要求在确认取消前等待释放。业务成功沿用原版 worker 回复，事件／webhook 保持为观察记录。[DESIGN](../../plugins/dsh-antfarm/DESIGN.zh.md)维护机制；[原版 agent／存储决策](../../.agents/notes/implemented/architecture/2026-11-08-antfarm-original-agents-and-storage.zh.md)维护设计取舍。

<a id="development"></a>
## 开发

插件路径与命令分派见 [HANDOFF](../../HANDOFF.md#开发目录与源码归属)。根检查覆盖单包源码和双语文档。开发使用隔离 Web profile，重新构建、重启并硬刷新。当前对照和验证范围见 [PARITY](../../plugins/dsh-antfarm/PARITY.zh.md)。

-----

<a id="dev-note"></a>
## 开发备注

发布与远程安装证据位于 `~/.dsh/backups/antfarm-release-20261109-0.3.3/`；Antfarm 历史文件与发布前备份逐字节一致。
