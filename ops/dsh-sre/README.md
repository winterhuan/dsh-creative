# dsh-sre local service commands

English | [中文](README.zh.md)

This directory maintains the same DSH service commands on macOS, Linux and WSL. Linux and WSL use existing systemd user services named `dsh@<profile>.service`; macOS uses the existing controllers under `~/.dsh/installations/`.

- `dsh-sre` installs to `~/.local/bin/dsh-sre` and lists, inspects, starts, stops, and restarts profiles.
- `dsh-webctl`, `dsh-antfarm`, `dsh-media`, `dsh-student`, and `dsh-superagent` install to `~/.dsh/bin/`. Their Linux branches call `dsh-service` in the same directory (see [HANDOFF independent service profiles](../../HANDOFF.md#independent-service-profiles) for services and ports). `dsh-web` aliases `dsh-webctl`.
- `dsh-writer` manages the `writer` profile on port 3086. `dsh-story` manages the `story` profile on port 3081. `dsh-sre` lists Story once its profile is installed. See [HANDOFF](../../HANDOFF.md#independent-service-profiles) for the plugins assigned to each profile.

Install from the repository root with Python 3 and `lsof` available. Linux also requires working systemd user services:

```sh
python3 ops/dsh-sre/install.py
dsh-sre list
dsh-sre status
dsh-sre status writer
dsh-sre start writer
dsh-sre restart media
dsh-sre stop media
dsh-sre start media
```

The installer backs up existing scripts and symlinks to `~/.dsh/backups/dsh-sre-install-*/`, replaces the commands, and adds entry points in `~/.local/bin/`. Installation does not create services, restart processes, or change profile configuration. Edit the sources here and rerun the installer to keep the repository and installed scripts identical.

`dsh-sre` supports `list`, `status`, `start`, `stop`, and `restart`; omitting the action shows all statuses. Starting, stopping, and restarting require one profile or `all`. Status reads login links from the running process's output log, so its output contains login tokens. On Linux, individual profile commands also support `url` and following `logs`; for example, `dsh-media url` and `dsh-media logs`.

The Linux controller checks readiness through an authenticated page and also checks the Media Desk backend and Superagent setup. A profile status returns 0 when ready, 1 when unavailable, 2 for component errors, and 3 for pending setup; `dsh-sre` reports any nonzero status as 1. `stop` creates a manual stop marker; `start` and `restart` clear it. The companion unit must honor that marker with `ConditionPathExists=!%h/.dsh/services/%i.stopped`.
