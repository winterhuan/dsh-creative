---
description: "Install and update the prebuilt dsh-superagent fork from GitHub in a dedicated profile, or link a local development build."
---

# Superagent installation and updates

English | [中文](superagent-installation.zh.md)

## Summary

Install the prebuilt [winterhuan fork](https://github.com/winterhuan/dsh-superagent-prototype) from the [plugin market](https://winterhuan.github.io/dsh-creative/index.json) or its fixed Git release into a dedicated `superagent` profile. Source development uses the `plugins/dsh-superagent-prototype` submodule; a `link:` installation reads that checkout's build and does not fetch GitHub updates. Accounts, models, policies and service management follow the fork's [setup guide](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/SETUP.md).

## Table of Contents

- [Install into a separate profile](#install)
- [Update a local installation](#update)
- [Remote installation](#remote)
- [Dev Note](#dev-note)

<a id="install"></a>
## Install into a separate profile

Use Node.js 24, pnpm 11.7.0 and a DSH host compatible with the prototype. The Host and panel run on Creative's DSH `0.2.2-rc.1`; real-model execution requires separate verification. Superagent has its own lockfile and remains a research prototype with `0.2.1-alpha.2` DSH dependencies. The source directory is `plugins/dsh-superagent-prototype` in this repository.

For local development, initialize the submodule from the parent repository root if needed. Build before linking because the package loads `lib/index.js` and `lib/client.js`. Run the profile-creation line only when `superagent` does not yet exist; it replaces an existing profile patch. The dedicated profile keeps the plugin's process-wide environment changes and restarts separate from your working profile.

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

The fork's `v0.1.0` Git release includes the Host and Client builds. Installation fetches that package directly from GitHub and requires no local checkout build. The market entry uses its fixed commit. On an existing `superagent` profile, run:

```sh
dsh plugin --profile superagent add "github:winterhuan/dsh-superagent-prototype#v0.1.0"
dsh --profile superagent --dump-config | rg '^# == dsh-superagent'
```

This replaces an existing local link or tarball dependency while retaining the profile patch and `stateDir`. Restart the dedicated service through its service script and hard-refresh the browser. **Plugins → Installed → Superagent → Source information** shows the GitHub repository and fixed revision.

To update a Git installation, install a newly published immutable ref and restart that profile. Rebuilding a local checkout does not update it. Before restarting, follow the same [upgrade and backup procedure](https://github.com/winterhuan/dsh-superagent-prototype/blob/main/docs/006-deployment.md#upgrade) as for a local installation.

<a id="dev-note"></a>
## Dev Note

None.
