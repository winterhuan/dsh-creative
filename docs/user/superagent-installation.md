---
description: "Install and update dsh-superagent through a local source checkout, and check whether a remote package is ready to install."
---

# Superagent installation and updates

English | [中文](superagent-installation.zh.md)

## Summary

Install Superagent from the `plugins/dsh-superagent-prototype` submodule, which tracks the maintained [winterhuan fork](https://github.com/winterhuan/dsh-superagent-prototype), and rebuild it when updating. A `link:` installation reads the local build; it does not fetch GitHub updates. Use a dedicated `superagent` profile; accounts, models, policies and service management follow the fork's [setup guide](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/SETUP.md).

## Table of Contents

- [Install into a separate profile](#install)
- [Update a local installation](#update)
- [Remote installation](#remote)
- [Dev Note](#dev-note)

<a id="install"></a>
## Install into a separate profile

Use Node.js 24, pnpm 11.7.0 and a DSH host compatible with the prototype. Creative targets `0.2.2-rc.1`; this fork has not been verified against that version. Superagent has its own lockfile and remains a research prototype with `0.2.1-alpha.2` DSH dependencies. The source directory is `plugins/dsh-superagent-prototype` in this repository.

From the parent repository root, initialize the submodule if needed. Build before linking because the package loads `lib/index.js` and `lib/client.js`. Run the profile-creation line only when `superagent` does not yet exist; it replaces an existing profile patch. The dedicated profile keeps the plugin's process-wide environment changes and restarts separate from your working profile.

```sh
git submodule update --init plugins/dsh-superagent-prototype
cd plugins/dsh-superagent-prototype
pnpm install --frozen-lockfile
pnpm build
dsh --profile superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
dsh --profile superagent --dump-config | rg '^# == dsh-superagent'
```

The last command should show Superagent's configuration layers. In **Plugins → Installed**, its source should point to the `plugins/dsh-superagent-prototype` checkout. Follow the setup guide to configure the plugin; successful installation alone does not configure accounts or authorize work.

For account and machine configuration, use the fork's [deployment guide](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#install). Do not rerun its profile-creation command on an existing profile: it replaces that profile's configuration patch.

<a id="update"></a>
## Update a local installation

Before upgrading, wait until no Executor is in the middle of a turn and back up the configured `stateDir`, including `orchestrator.sqlite`, as required by the fork's [upgrade guide](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#upgrade). Restarting ends running Assignments; the service resumes them with recovery notes. A database migrated by a newer version requires its pre-upgrade backup for rollback.

From the parent repository root, update the submodule pointer and rebuild:

```sh
git submodule update --remote -- plugins/dsh-superagent-prototype
pnpm --dir plugins/dsh-superagent-prototype install --frozen-lockfile
pnpm --dir plugins/dsh-superagent-prototype build
```

If Git reports local changes or diverged history, preserve those changes and resolve the branch before continuing. If installation or build fails, resolve that error before restarting. The existing `link:` remains valid; there is no need to add the package again.

From the submodule directory, restart the dedicated service:

```sh
scripts/dsh-superagent --profile superagent restart
```

Hard-refresh the browser, then check Superagent's source and component status in the plugin page. For service management, follow [Start and stop](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#start-and-stop); each running profile that links this checkout must reload the build through its own service restart.

<a id="remote"></a>
## Remote installation

DSH supports Git packages, but the Superagent fork currently supplies source code without an installable build. Its [package manifest](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/package.json) points at `lib/`; [.gitignore](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/.gitignore) excludes that directory, and the manifest has no installation preparation script. The fork also has no prebuilt [Release](https://github.com/winterhuan/dsh-superagent-prototype/releases). A Git URL alone therefore does not supply the runtime entry files.

Keep the local link until the fork provides a package containing the build or an installation process that builds it. Before switching, verify the package contents and compatibility with the installed DSH; the prototype still declares dependencies from the `0.2.1-alpha.2` series. The remote source must replace the existing `dsh-superagent` dependency in each target profile.

<a id="dev-note"></a>
## Dev Note

None.
