---
description: "Install and update dsh-superagent through a local source checkout, and check whether a remote package is ready to install."
---

# Superagent installation and updates

English | [中文](superagent-installation.zh.md)

## Summary

Install Superagent from its [source repository](https://github.com/deepseek-ai/dsh-superagent-prototype) and rebuild that checkout when updating. A `link:` installation reads the local build; it does not fetch GitHub updates. This guide covers the existing Web profile on this machine; accounts, models, policies and a separate Superagent service follow the repository's [setup guide](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/SETUP.md).

## Table of Contents

- [Install into Web](#install)
- [Update a local installation](#update)
- [Remote installation](#remote)
- [Dev Note](#dev-note)

<a id="install"></a>
## Install into Web

Use Node.js 24, pnpm 11.7.0 and the installed DSH `0.2.2-rc.1`. Superagent has its own repository and lockfile; the parent repository's plugin commands do not build it. The source directory on this machine is `/Users/winter/dsh-superagent`.

Run the following from the directory where you keep repositories. If `dsh-superagent` already exists, skip the clone and enter that checkout. Build before linking because the package loads `lib/index.js` and `lib/client.js`.

```sh
git clone https://github.com/deepseek-ai/dsh-superagent-prototype.git dsh-superagent
cd dsh-superagent
pnpm install --frozen-lockfile
pnpm build
dsh plugin --profile web add "link:$PWD"
dsh --profile web --dump-config | rg '^# == dsh-superagent'
```

The last command should show Superagent's configuration layers. In **Plugins → Installed**, its source should be `link:/Users/winter/dsh-superagent` on this machine. Follow the setup guide to configure the plugin; successful installation alone does not configure accounts or authorize work.

For a first installation into a separate `superagent` profile, use the [deployment guide](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md#install). Do not rerun its profile-creation command on an existing profile: it replaces that profile's configuration patch.

<a id="update"></a>
## Update a local installation

Before upgrading, wait until no Executor is in the middle of a turn and back up the configured `stateDir`, including `orchestrator.sqlite`, as required by the [upgrade guide](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md#upgrade). Restarting ends running Assignments; the service resumes them with recovery notes. A database migrated by a newer version requires its pre-upgrade backup for rollback.

From the source directory, fetch the update and rebuild:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm build
```

If Git reports local changes or diverged history, preserve those changes and resolve the branch before continuing. If installation or build fails, resolve that error before restarting. The existing `link:` remains valid; there is no need to add the package again.

Restart the Web service managed on this machine:

```sh
~/.dsh/bin/dsh-webctl restart
```

Hard-refresh the browser, then check Superagent's source and component status in the plugin page. For the separate `superagent` service, follow [Start and stop](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/docs/006-deployment.md#start-and-stop); each running profile that links this checkout must reload the build through its own service restart.

<a id="remote"></a>
## Remote installation

DSH supports Git packages, but this repository currently supplies source code without an installable build. Its [package manifest](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/package.json) points at `lib/`; [.gitignore](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/main/.gitignore) excludes that directory, and the manifest has no installation preparation script. The repository also has no prebuilt [Release](https://github.com/deepseek-ai/dsh-superagent-prototype/releases). A Git URL alone therefore does not supply the runtime entry files.

Keep the local link until the repository provides a package containing the build or an installation process that builds it. Before switching, verify the package contents and compatibility with the installed DSH: Superagent's manifest still declares dependencies from the `0.2.1-alpha.2` series. The remote source must replace the existing `dsh-superagent` dependency in each target profile.

<a id="dev-note"></a>
## Dev Note

None.
