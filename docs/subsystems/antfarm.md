---
description: "Antfarm team workflow ownership, native DSH composition and accepted-result recovery."
---

# Antfarm

English | [中文](antfarm.zh.md)

## Summary

Antfarm runs reusable specialist workflows with accepted checkpoints, owned workspaces, workflow configuration and native Run controls. Its source is the `plugins/dsh-antfarm` submodule, targeting DSH `0.2.2-rc.1`. Version `0.2.0` is available as a prebuilt fixed Git package and through the plugin market.

## Table of Contents

- [Ownership](#ownership)
- [Trust and recovery](#trust)
- [Development](#development)
- [Dev Note](#dev-note)

-----

<a id="ownership"></a>
## Ownership

The [bundle](../../plugins/dsh-antfarm/cordis.patch.yml) supplies runtime, tools, commands, six Agent Presets, a Session sidebar and a workflow board. Configuration and user actions belong to the [package README](../../plugins/dsh-antfarm/README.md).

| Owner | Responsibility |
|---|---|
| [Workflow resolver](../../plugins/dsh-antfarm/src/workflow/loader.ts) and [manager](../../plugins/dsh-antfarm/src/workflow/manager.ts) | Capture resolved workflow snapshots; validate imports and revision-bound writable overrides. |
| [Runtime](../../plugins/dsh-antfarm/src/runtime/index.ts) and [driver](../../plugins/dsh-antfarm/src/runtime/orchestrator.ts) | Admit Session-owned work, schedule native DSH attempts and commit accepted progress. |
| [Journal](../../plugins/dsh-antfarm/src/persistence/journal.ts) and [storage](../../plugins/dsh-antfarm/src/persistence/storage.ts) | Preserve authoritative checkpoints; exclude another Host and rebuild query projections. |
| [Git workspace](../../plugins/dsh-antfarm/src/workspace/git.ts) and [file workspace](../../plugins/dsh-antfarm/src/workspace/files.ts) | Validate resource identity, retain artifacts and perform confined cleanup. |
| [Studio Host](../../plugins/dsh-antfarm/src/studio-host/index.ts) and [Client](../../plugins/dsh-antfarm/src/client/mount.tsx) | Enforce Session resources, revision-bound controls and native navigation. |

<a id="trust"></a>
## Trust and recovery

The initiating root Session owns reads and control. Antfarm tools are hidden from subagents, and runtime admission also rejects them. Native DSH owns model execution, presets, permissions and subprocesses. Antfarm owns accepted business state and resource lifecycle. Health and restart recovery use the original native owner authority; an unfinished attempt remains interrupted for inspection and explicit reconciliation.

Candidate checks bind actual execution to unchanged source. GitHub and visual delivery have separate fact validation. Neither checkpoints nor worktrees supply exactly-once external effects or isolate shell/credentials. Configuration writes require confined paths and matching revisions; profile writes require the Host owner. Running work retains its snapshot. See [DESIGN](../../plugins/dsh-antfarm/DESIGN.md) for mechanisms and the [team runtime decision](../../.agents/notes/implemented/architecture/2026-11-08-antfarm-team-workflow-runtime.md) for rationale.

<a id="development"></a>
## Development

Use [HANDOFF](../../HANDOFF.md#开发目录与源码归属) for paths, dispatch and current acceptance evidence. Root checks cover the single-package source layout and README/DESIGN/PARITY pairs. Builds do not install into daily profiles. Development uses an isolated Web profile with native Agent Preset composition; custom Headless needs its registry and parent preset supplied separately. DSH `0.2.2-rc.1` has no TUI application entry.

The [original capability comparison](../../plugins/dsh-antfarm/PARITY.md) separates native equivalents from original command spelling and records platform, real-model, GitHub, browser, webhook and fixed remote installation evidence, with the limits of those representative scenarios.

-----

<a id="dev-note"></a>
## Dev Note

Market and daily profiles use fixed remote releases; source changes require rebuilding, isolated acceptance and a new publication.
