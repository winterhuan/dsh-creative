# dsh-sre local service commands

English | [中文](README.zh.md)

This directory maintains the same DSH service commands on Windows, macOS, Linux and WSL. Windows starts native Node.js processes without a visible console; Linux and WSL use existing systemd user services named `dsh@<profile>.service`; macOS uses the existing controllers under `~/.dsh/installations/`.

- `dsh-sre` installs to `~/.local/bin/` and lists, inspects, starts, stops, and restarts profiles. Windows uses `.cmd` launchers in this directory and `~/.dsh/bin/`; add `~/.local/bin/` to your user PATH if it is absent.
- `dsh-webctl`, `dsh-antfarm`, `dsh-media`, `dsh-student`, and `dsh-superagent` install to `~/.dsh/bin/`. Windows and Linux call the shared `dsh-service` controller (see [HANDOFF independent service profiles](../../HANDOFF.md#independent-service-profiles) for services and ports). `dsh-web` aliases `dsh-webctl`.
- `dsh-writer` manages the `writer` profile on port 3086. `dsh-story` manages the `story` profile on port 3081. `dsh-sre` lists each of these services only when its profile is installed; `all` skips either missing profile. See [HANDOFF](../../HANDOFF.md#independent-service-profiles) for the plugins assigned to each profile.
- Windows also exposes `dsh-blog` on port 4173 when this checkout has built blog output and its Vite dependency; `dsh-sre` includes it in `all` unless a daily group selects other services.

Install from the repository root with Python 3 available. Windows requires native Node.js and a globally installed DSH CLI; macOS and Linux require `lsof`, and Linux also requires working systemd user services:

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

The installer backs up existing scripts and symlinks to `~/.dsh/backups/dsh-sre-install-*/`, replaces the commands, and adds entry points in `~/.local/bin/`. Installation does not create services, restart processes, or change profile configuration. On Windows it backs up and removes the temporary `dsh-windows.ps1` entry. Edit the sources here and rerun the installer to keep the repository and installed scripts identical.

`dsh-sre` supports `list`, `status`, `start`, `stop`, and `restart`; omitting the action shows all statuses. Starting, stopping, and restarting require one profile or `all`. Status reads login links from the running process's output log, so its output contains login tokens. On Windows and Linux, individual profile commands also support `url` and following `logs`; for example, `dsh-media url` and `dsh-media logs`. Windows additionally supports `dsh-sre url` for all managed services or `dsh-sre url student` for one.

The Windows and Linux controller checks readiness through an authenticated page and also checks the Media Desk backend and Superagent setup. A profile status returns 0 when ready, 1 when unavailable, 2 for component errors, and 3 for pending setup; `dsh-sre` reports any nonzero status as 1. `stop` creates a manual stop marker; `start` and `restart` clear it. Linux's companion unit must honor that marker with `ConditionPathExists=!%h/.dsh/services/%i.stopped`.

Windows `start` and `restart` wait up to 45 seconds for readiness. A slower cold start returns 1 and leaves the launched process running; check `dsh-sre status` and the profile logs before retrying.

Windows lists only installed profiles. An optional `dailyProfiles` array in `~/.dsh/services/windows-config.json` limits the default status, default `url`, and every explicit `all` action to that group; for example, `["web", "student"]`. Each name must identify a unique installed managed profile. `list` still shows all installed services and marks daily and on-demand entries. Target an on-demand service by name, such as `dsh-sre start superagent`. Reinstalling the commands preserves the group.

Windows records the installed Node executable, DSH CLI and checkout in `~/.dsh/services/windows-config.json`. The installer discovers them by default; use `--node`, `--dsh-cli`, or `--repository` when their locations differ. Reinstall after changing the Node installation. Runtime records in `windows-<profile>.json` identify the executable, arguments and creation time before status or stop accepts a PID; records from the temporary controller are accepted only when the executable and arguments match. Starting an already managed process is idempotent, and an occupied port fails before logs are replaced. Windows stops the managed process tree and writes `windows-<profile>.log` and `windows-<profile>.error.log` under `~/.dsh/logs/`; stopped services never return a login token from old logs. Startup is manual; the installer creates no login task or Windows service.
