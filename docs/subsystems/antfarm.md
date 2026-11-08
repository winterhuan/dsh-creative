---
description: "Original Antfarm agent identities, SQL business state and native DSH execution ownership."
---

# Antfarm

English | [中文](antfarm.zh.md)

## Summary

Antfarm runs original specialist teams with stable personas and fresh native Sessions. SQLite owns their business progress, while DSH owns execution and native transcripts. Source lives in the `plugins/dsh-antfarm` submodule; release `0.3.0` is available in the market and installed from a fixed Git commit in the local `web` profile.

## Table of Contents

- [Ownership](#ownership)
- [Trust and recovery](#trust)
- [Development](#development)
- [Dev Note](#dev-note)

-----

<a id="ownership"></a>
## Ownership

The [bundle](../../plugins/dsh-antfarm/cordis.patch.yml) supplies native runtime, tools, commands, sidebar and board. It registers no role presets. The [package README](../../plugins/dsh-antfarm/README.md) owns configuration and user operations.

| Owner | Responsibility |
|---|---|
| [Workflow loader](../../plugins/dsh-antfarm/src/workflow/loader.ts) and [manager](../../plugins/dsh-antfarm/src/workflow/manager.ts) | Original definitions, persona resources and revision-bound writable overrides. |
| [Agent adapter](../../plugins/dsh-antfarm/src/runtime/agents.ts) | Stable identity to native Session mapping, persona and role tools. |
| [Runtime](../../plugins/dsh-antfarm/src/runtime/index.ts) | Root ownership, native jobs, scheduling, cancellation and recovery. |
| [Database](../../plugins/dsh-antfarm/src/persistence/database.ts) | Original authoritative SQL transitions and native associations. |
| [Historical reader](../../plugins/dsh-antfarm/src/persistence/legacy.ts) | Attributable read-only snapshots with no replay or writes. |
| [Studio Host](../../plugins/dsh-antfarm/src/studio-host/index.ts) and [Client](../../plugins/dsh-antfarm/src/client/mount.tsx) | Authorized queries/controls, locale and native navigation. |

<a id="trust"></a>
## Trust and recovery

The original root Session authorizes Run reads and controls. Exact native claimant identities reject stale results, and each stable agent has one active attempt. Unmatched interrupted effects require human reconciliation before resumption. Historical journals remain outside the executor. Neither SQL nor role tool masks isolate shell/credential effects or guarantee exactly-once external actions.

Configuration writes require confined paths and matching source revisions. Native lifecycle ownership requires awaited teardown before cancellation is confirmed. Business success follows original worker replies, and events/webhooks remain observations. [DESIGN](../../plugins/dsh-antfarm/DESIGN.md) owns mechanisms; the [original agents/storage decision](../../.agents/notes/implemented/architecture/2026-11-08-antfarm-original-agents-and-storage.md) owns the design rationale.

<a id="development"></a>
## Development

Use [HANDOFF](../../HANDOFF.md#开发目录与源码归属) for plugin paths and command dispatch. Root checks cover the single-package source and bilingual documentation. Development uses an isolated Web profile, rebuild/restart and hard refresh. Current comparison and verification limits live in [PARITY](../../plugins/dsh-antfarm/PARITY.md).

-----

<a id="dev-note"></a>
## Dev Note

Release and remote installation evidence lives in `~/.dsh/backups/antfarm-release-20261109-0.3.0/`; historical Antfarm files match the pre-release backup byte for byte.
