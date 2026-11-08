---
description: "Antfarm 团队工作流归属、原生 DSH 组合与已接受结果恢复。"
---

# Antfarm

[English](antfarm.md) | 中文

## 摘要

Antfarm 运行可复用专业工作流，提供已接受检查点、所属工作区、工作流配置和原生 Run 控件。源码在 `plugins/dsh-antfarm` 子模块，面向 DSH `0.2.2-rc.1`。`0.2.0` 提供预构建固定 Git 发布包，并进入插件市场。

## 目录

- [归属](#ownership)
- [信任与恢复](#trust)
- [开发](#development)
- [开发备注](#dev-note)

-----

<a id="ownership"></a>
## 归属

[bundle](../../plugins/dsh-antfarm/cordis.patch.yml)提供运行时、工具、命令、六个 Agent Presets、会话侧栏和工作流看板。配置与用户操作归[包 README](../../plugins/dsh-antfarm/README.zh.md)管理。

| 归属 | 职责 |
|---|---|
| [工作流解析器](../../plugins/dsh-antfarm/src/workflow/loader.ts)与[管理器](../../plugins/dsh-antfarm/src/workflow/manager.ts) | 捕获已解析工作流快照；验证导入和修订约束可写覆盖。 |
| [运行时](../../plugins/dsh-antfarm/src/runtime/index.ts)与[执行器](../../plugins/dsh-antfarm/src/runtime/orchestrator.ts) | 准入 Session 所属工作，调度原生 DSH 尝试并提交已接受进度。 |
| [日志](../../plugins/dsh-antfarm/src/persistence/journal.ts)与[存储](../../plugins/dsh-antfarm/src/persistence/storage.ts) | 保留权威检查点；排除第二 Host 并重建查询投影。 |
| [Git 工作区](../../plugins/dsh-antfarm/src/workspace/git.ts)与[文件工作区](../../plugins/dsh-antfarm/src/workspace/files.ts) | 校验资源身份，保留成果并执行受限清理。 |
| [Studio Host](../../plugins/dsh-antfarm/src/studio-host/index.ts)与[Client](../../plugins/dsh-antfarm/src/client/mount.tsx) | 强制 Session 资源授权、修订约束控件和原生导航。 |

<a id="trust"></a>
## 信任与恢复

发起根会话拥有读取与控制权。Antfarm 工具对子会话隐藏，运行时准入也拒绝子会话。原生 DSH 管理模型执行、presets、权限和子进程。Antfarm 管理已接受业务状态与资源生命周期。健康与重启恢复使用原始原生 owner 权限；未结算尝试保持中断，要求检查和明确核对。

候选检查将实际执行绑定到未变化源码。GitHub 和视觉交付分别验证事实。检查点和 worktree 都不能保证外部效果恰好一次，也不隔离 shell/凭据。配置写入要求受限路径与匹配修订；profile 写入要求 Host owner。运行中工作保留快照。机制见 [DESIGN](../../plugins/dsh-antfarm/DESIGN.zh.md)，理由见[团队运行时决策](../../.agents/notes/implemented/architecture/2026-11-08-antfarm-team-workflow-runtime.zh.md)。

<a id="development"></a>
## 开发

路径、命令调度与当前验收证据见 [HANDOFF](../../HANDOFF.md#开发目录与源码归属)。根检查覆盖单包源码布局与 README/DESIGN/PARITY 双语对。构建不安装到日常 profile。开发使用带原生 Agent Preset 组合的隔离 Web profile；自定义 Headless 需要另行提供注册器与 parent preset。DSH `0.2.2-rc.1` 没有 TUI 应用入口。

[原版能力对照](../../plugins/dsh-antfarm/PARITY.zh.md)区分原生等价实现与原版命令拼写，记录平台、真实模型、GitHub、浏览器、webhook 和固定远程安装证据，以及这些代表性场景的验收限制。

-----

<a id="dev-note"></a>
## 开发备注

市场与日常 profile 使用固定远程发布；修改源码后需要重新构建、隔离验收并发布新版本。
