# dsh-sre 本机管理命令

[English](README.md) | 中文

本目录维护 DSH 本机服务管理命令。Linux／WSL 使用已有的 systemd 用户服务 `dsh@<profile>.service`；macOS 分支保留原有 launchd 控制器与 `/Users/winter` 路径，本次未验证 macOS 运行。

- `dsh-sre` 安装在 `~/.local/bin/dsh-sre`，用于查看各 profile 状态并统一启停。
- `dsh-webctl`、`dsh-antfarm`、`dsh-media`、`dsh-student`、`dsh-superagent` 安装在 `~/.dsh/bin/`，Linux 分支调用同目录的 `dsh-service`（服务与端口见 [HANDOFF 独立服务 profile](../../HANDOFF.md#independent-service-profiles)）。`dsh-web` 是 `dsh-webctl` 的别名。
- Linux 另安装 `dsh-writer`，管理端口 3086 的独立 Writer 服务。macOS 安装时保留已有的 Writer 控制器，`dsh-sre` 调用该控制器。

在仓库根目录安装，需 Python 3、`lsof`，Linux 还需可用的 systemd 用户服务：

```sh
python3 ops/dsh-sre/install.py
dsh-sre list
dsh-sre status
dsh-sre restart media
dsh-sre stop media
dsh-sre start media
```

安装器先将原脚本与符号链接备份到 `~/.dsh/backups/dsh-sre-install-*/`，再替换命令并建立 `~/.local/bin/` 入口；安装不创建服务、不重启进程、不修改 profile 配置。后续修改本目录源码后重新运行安装器，保持仓库与运行脚本一致。

`dsh-sre` 支持 `list`、`status`、`start`、`stop`、`restart`；省略动作时查看全部状态。启停与重启必须指定一个 profile 或 `all`。状态页从运行进程的输出日志读取登录链接，输出含登录令牌。Linux 单 profile 命令另支持 `url` 和持续跟踪的 `logs`；例如 `dsh-media url`、`dsh-media logs`。

Linux 控制器通过认证页面检查就绪状态，并检查 Media Desk 后端与 Superagent 业务配置。单 profile 状态返回 0 表示就绪，1 表示不可用，2 表示组件异常，3 表示业务配置待完成；`dsh-sre` 汇总任一非零状态为 1。`stop` 写入手动停止标记，`start`／`restart` 清除标记；需配套单元通过 `ConditionPathExists=!%h/.dsh/services/%i.stopped` 尊重该标记。
