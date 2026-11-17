# dsh-sre 本机管理命令

本目录保存 DSH 本机服务管理命令的版本副本，实际运行位置仍在本机：

- `dsh-sre` 安装在 `~/.local/bin/dsh-sre`，用于查看各 profile 状态并统一启停。
- `dsh-webctl`、`dsh-antfarm`、`dsh-media`、`dsh-student`、`dsh-superagent` 安装在 `~/.dsh/bin/`，是各 profile 的 launchd 服务控制器（服务与端口见 [HANDOFF 独立服务 profile](../../HANDOFF.md#独立服务-profile)）。

修改命令后，把更新后的副本提交回本目录，保持两边一致。命令脚本内含本机绝对路径，不在其他环境使用。
