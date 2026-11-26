# dsh-sre 本机管理命令

[English](README.md) | 中文

本目录为 Windows、macOS、Linux 和 WSL 维护相同的 DSH 服务管理命令。Windows 启动无可见控制台的原生 Node.js 进程；Linux／WSL 使用已有的 systemd 用户服务 `dsh@<profile>.service`；macOS 使用 `~/.dsh/installations/` 下已有的控制器。

- `dsh-sre` 安装在 `~/.local/bin/`，用于查看各 profile 状态并统一启停。Windows 在此目录和 `~/.dsh/bin/` 生成 `.cmd` 入口；用户 PATH 中缺少 `~/.local/bin/` 时需补上。
- `dsh-webctl`、`dsh-antfarm`、`dsh-media`、`dsh-student`、`dsh-superagent` 安装在 `~/.dsh/bin/`，Windows 和 Linux 调用共用的 `dsh-service` 控制器（服务与端口见 [HANDOFF 独立服务 profile](../../HANDOFF.md#independent-service-profiles)）。`dsh-web` 是 `dsh-webctl` 的别名。
- `dsh-writer` 管理端口 3086 的 `writer` profile，`dsh-story` 管理端口 3081 的 `story` profile。`dsh-sre` 仅在对应 profile 已安装时列出这两个服务；`all` 跳过其中未安装的 profile。各 profile 安装的插件见 [HANDOFF](../../HANDOFF.md#independent-service-profiles)。
- Windows 在当前检出包含博客构建产物和 Vite 依赖时另提供端口 4173 的 `dsh-blog`；日常组未另行选择服务时，`dsh-sre` 将它纳入 `all`。

在仓库根目录安装，需 Python 3。Windows 需原生 Node.js 和全局安装的 DSH CLI；macOS 和 Linux 需 `lsof`，Linux 还需可用的 systemd 用户服务：

```sh
python3 ops/dsh-sre/install.py
dsh-sre list
dsh-sre status
dsh-sre status story
dsh-sre start story
dsh-sre restart media
dsh-sre stop media
dsh-sre start media
```

安装器先将原脚本与符号链接备份到 `~/.dsh/backups/dsh-sre-install-*/`，再替换命令并建立 `~/.local/bin/` 入口；安装不创建服务、不重启进程、不修改 profile 配置。Windows 同时备份并移除临时入口 `dsh-windows.ps1`。后续修改本目录源码后重新运行安装器，保持仓库与运行脚本一致。

`dsh-sre` 支持 `list`、`status`、`start`、`stop`、`restart`；省略动作时查看全部状态。启停与重启必须指定一个 profile 或 `all`。状态页从运行进程的输出日志读取登录链接，输出含登录令牌。Windows 和 Linux 单 profile 命令另支持 `url` 和持续跟踪的 `logs`；例如 `dsh-media url`、`dsh-media logs`。Windows 另支持 `dsh-sre url` 查看全部受管服务的入口，或 `dsh-sre url student` 查看一个。

Windows 和 Linux 控制器通过认证页面检查就绪状态，并检查 Media Desk 后端与 Superagent 业务配置。单 profile 状态返回 0 表示就绪，1 表示不可用，2 表示组件异常，3 表示业务配置待完成；`dsh-sre` 汇总任一非零状态为 1。`stop` 写入手动停止标记，`start`／`restart` 清除标记；Linux 的配套单元需通过 `ConditionPathExists=!%h/.dsh/services/%i.stopped` 尊重该标记。

Windows 的 `start` 和 `restart` 最多等待 45 秒就绪。较慢的冷启动会返回 1，并保留已启动的进程；重试前先查看 `dsh-sre status` 和对应 profile 的日志。

Windows 仅列出已安装的 profile。可在 `~/.dsh/services/windows-config.json` 中通过可选的 `dailyProfiles` 数组，将默认状态、默认 `url` 和所有显式 `all` 操作限制到日常组，例如 `["web", "student"]`。每个名称必须指向已安装的受管 profile，且不能重复。`list` 仍显示全部已安装服务，并标明日常或按需入口；按需服务可指定名称操作，例如 `dsh-sre start superagent`。重新安装命令会保留日常组。

Windows 在 `~/.dsh/services/windows-config.json` 记录已安装的 Node 可执行文件、DSH CLI 和仓库检出。安装器默认自动发现这些路径，位置不同时可传入 `--node`、`--dsh-cli` 或 `--repository`；更换 Node 安装后需重新安装命令。运行记录 `windows-<profile>.json` 在状态查询或停止前核对可执行文件、参数和进程创建时间；临时控制器的旧记录仅在可执行文件和参数匹配时接受。重复启动已有受管进程不会另启进程，端口被占用时在替换日志前失败。Windows 停止受管进程树，日志写入 `~/.dsh/logs/` 下的 `windows-<profile>.log` 和 `windows-<profile>.error.log`；已停止的服务不会从旧日志返回登录令牌。服务手动启动，安装器不创建登录任务或 Windows 服务。
