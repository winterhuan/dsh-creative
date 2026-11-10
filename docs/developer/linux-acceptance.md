---
description: "Run dsh-creative Linux checks, verify the plugins in the cloud DSH preview, and record evidence for the tested checkout."
---

# Linux acceptance

English | [中文](linux-acceptance.zh.md)

## Summary

Check a fixed `dsh-creative` checkout on Linux, then verify its built plugins in a real DSH browser session. Complete the command checks before accepting the preview. Record the checkout, exit codes, browser observations and disk results together; a passing build alone does not establish usable client behavior. This tutorial uses the [existing Instabox preview](../user/cloud-dsh-preview.md).

## Table of Contents

- [Prepare the checkout](#prepare)
- [Run Linux checks](#checks)
- [Verify the real preview](#browser)
- [Record the result](#record)
- [Dev Note](#dev-note)

-----

<a id="prepare"></a>
## Prepare the checkout

Use an Instabox account with SSH access and the toolchain listed in the [preview reference](../user/cloud-dsh-preview.md#environment). All commands below run in the cloud shell unless marked as Mac commands. Read [HANDOFF.md](../../HANDOFF.md) before changing plugin source.

From the Mac, enter the existing machine. If it was manually suspended, resume it first.

```sh
instabox ssh dsh-creative-preview
```

In the cloud, inspect the checkout and its recursive submodule pointers before starting checks.

```sh
cd /data/workspace/dsh-creative
node --version
pnpm --version
python3 --version
git status --short
git rev-parse HEAD
git submodule status --recursive
```

Compare the parent commit and every submodule commit with the intended acceptance version. A submodule status beginning with `-`, `+` or `U` requires initialization or resolution. Build artifacts from a previous run can appear as modified `lib/` files; inspect those paths rather than treating every modification as disposable. Preserve source edits and user work.

Initialize missing submodules through HTTPS; the parent upstream URL uses SSH by default. The command-level rewrite does not change `.gitmodules`.

```sh
git -c url.https://github.com/.insteadOf=git@github.com: submodule update --init --recursive --depth 1 --filter=blob:none
```

The existing acceptance script checks only `/data/workspace/dsh-creative`; it does not fetch or switch commits. For another checkout, initialize dependencies and run the root commands there, then point the preview at that checkout's built packages using [HANDOFF section 5](../../HANDOFF.md#5-在-dsh-中安装调试和移除). Do not accept a new revision while the preview still loads another checkout.

<a id="checks"></a>
## Run Linux checks

Archive previous evidence outside `/data/workspace/acceptance` before reusing the script: it replaces the stage logs and `results.tsv`. Use SSH for the complete run; the installed Instabox `exec` has a command timeout.

```sh
/data/workspace/acceptance/run.sh
cat /data/workspace/acceptance/results.tsv
```

The script runs the following sequence with a frozen lockfile and stops on the first failure. The root commands dispatch into every plugin repository registered in the checkout and include the parent tools; use [HANDOFF](../../HANDOFF.md#4-开发命令与构建流程) to identify integration failures that need resolution before acceptance.

```sh
pnpm install --frozen-lockfile
pnpm run plugins:install
pnpm run typecheck
pnpm run build
pnpm test
pnpm run doc-sync
pnpm run hygiene
```

Each of the seven stages must appear in `results.tsv` with exit code `0`, and the script must print `Linux acceptance passed`. A stage that was not reached is unverified. Resolve failures before continuing; read the full failing log when the printed tail omits the cause.

Record test and test-file counts from the actual Vitest summaries. Use the current checkout's counts, not a fixed historical threshold. The runner does not refresh `commits.txt`, `report.md` or browser screenshots; update those records for the current run.

<a id="browser"></a>
## Verify the real preview

After all Linux checks pass, confirm that `cloud-preview` links the packages built from the tested checkout. Restart DSH and hard-refresh the browser through the [preview operations](../user/cloud-dsh-preview.md#operations). Obtain the current authenticated link after readiness.

Use synthetic data in the isolated preview workspace. The reviewer performs these checks in the real browser and records the observed outcome.

| Check | Pass condition |
|---|---|
| Connection and plugins | No persistent reconnect state; all five plugins are listed and enabled. |
| Modes | Writing and Student presets appear and can be selected. |
| Writer discovery | The library, project and scan tabs discover the matching synthetic directories. |
| Scan preview | Expanding `扫榜/20261108` opens `选题决策.md` in Markdown preview and preserves aggregate/raw files in the tree. |
| File save | Append a unique marker through the editor, click Save, confirm the saved state, and read the same marker from the cloud disk. |
| Skills Viewer | Open Skills, read the available catalog and one complete skill body; do not require a fixed catalog count. |
| HTTPS and access | Authenticated WebSocket upgrades succeed; foreign Origin and missing private-port credentials are rejected. |

The recorded preview uses status `101` for an authenticated WebSocket, `403` for a foreign Origin and `401` for missing private-port credentials. A loaded static page does not prove the WebSocket or save route works. The [proxy reference](../user/cloud-dsh-preview.md#proxy) explains the two hostname configurations needed by DSH and Writer.

Model calls and live ranking collection require separate verification with the configured provider and collection login. Without those credentials, mark these checks as not performed and name the reviewer who will complete them; do not count page acceptance as model acceptance.

<a id="record"></a>
## Record the result

Keep one evidence set per run outside Git. Record the following before reporting acceptance complete.

- Date, reviewer, machine and toolchain versions.
- Parent commit, recursive submodule commits and initial working-tree changes.
- Every command's exit code, logs and actual test counts.
- Installed preview package sources, synthesized configuration and browser screenshots.
- The editor's saved state and the marker read from the cloud file.
- HTTP/WebSocket observations and every unperformed check.

Inspect `git-status-after.txt` and `artifact-diff-after.txt` before classifying changes. Build output can vary with the absolute checkout path; source or lockfile changes need an explanation. Exclude authenticated URLs, cookies, provider keys and startup-log credentials from repository documents and shared evidence. Evidence locations are listed in the [preview reference](../user/cloud-dsh-preview.md#evidence).

-----

<a id="dev-note"></a>
## Dev Note

None.
