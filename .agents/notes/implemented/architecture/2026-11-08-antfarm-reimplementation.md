# Agent Note: Reimplement Antfarm on current DSH

Status: implemented

English | [中文](2026-11-08-antfarm-reimplementation.zh.md)

This note records the initial coding-runtime scope. The [team runtime decision](2026-11-08-antfarm-team-workflow-runtime.md) replaces its read-only interface and manual-only restart restrictions; its checkpoint ownership and workspace rationale remain applicable.

## Problem

Repeatable coding teams need enforced story verification, bounded retries, durable execution position, and explicit blocked recovery. A successful dependency install does not establish those guarantees or compatibility with DSH's current child/job ownership APIs.

Keyless reproductions exposed failures with rejected output entering recovered context, planner success advancing before story registration, cancellation during child disposal allowing another child, and concurrent resume starting two drivers despite capacity limits. Studio saves followed directory symlinks, overwrote external edits, and collided on a shared temporary name. Environment copying overwrote existing targets and cleanup deleted modified copies. Those observations motivate durable checkpoints and narrow resource ownership; the fixtures do not establish model quality or external-service safety.

## Decision

Antfarm remains one independently installable DSH bundle in [plugins/dsh-antfarm](../../../../plugins/dsh-antfarm/README.md), with exact DSH `0.2.2-rc.1` dependencies. DSH owns native activation, Agent Presets, jobs, permissions, subprocesses, and session navigation. Antfarm owns the coding procedure and its journal because the [native workflow](../../../../upstream/packages/workflow/workflow/src/runtime-types.ts) has no saved execution position or resume operation.

Version 2 YAML selects deployment-owned presets and relative Markdown instructions; each run captures its resolved snapshot. Fresh caller-delivered activations receive the original parent, worktree cwd, and object-root structured output. This removes the idle coordinator, duplicate role/tool policy, text result parser, and obsolete invariant companion. Parent package checks cover the single-package `src` layout instead of requiring a second source copy.

One owner reserves admission before asynchronous preparation. Start and resume share capacity and per-run admission; a cross-process journal lease excludes another writer. Native tool registration hides Antfarm controls from subagent Sessions, and runtime admission rejects their start/resume requests; workflow children cannot recursively create teams. Cancellation checks before each child start, combines run cancellation with deadlines, awaits child disposal, and cannot settle as completed. Plugin disposal waits for admitted operations to finish.

The [journal and fold](../../../../plugins/dsh-antfarm/src/persistence/fold.ts) own accepted state for live inspection and recovery. Complete checkpoints accept output, planner stories, and next position together. Rejected results preserve feedback and retry facts without changing successful context. A child can perform effects before its checkpoint commits; unmatched attempts require inspection and explicit reconciliation guidance. Resume uses a fresh child and can repeat uncommitted effects. Restart never automatically starts a model.

### Workspace and inspection

Every run uses an identity-validated branch/worktree from captured HEAD, excluding base uncommitted changes and untracked/ignored files. Shared-directory execution and automatic environment copying are absent. Cleanup checks canonical paths, Git identity, branch, ancestry, and tracked/untracked/ignored content, never forces removal, and preserves branches and changed output.

The read-only Runs sidebar derives the same bounded Session-owned projection as the tools. It exposes progress, blocked/uncertain state, retained output, and native child navigation, without a separate journal scanner or Client database. Native workflow cards do not observe Antfarm journals automatically. Typed generated Remotes own transport; SRC remotes are supported by DSH and are not themselves an incompatibility.

Online editing is excluded. Its reintroduction requires user-owned writable overrides, real-path confinement, server-checked revision, per-target serialization, unique temporary files, actionable stale-draft conflicts, and unsaved-draft protection. Bundled workflows remain read-only; enabling an override means explicitly creating the user's copy.

## Alternatives considered

**Only upgrade dependency versions.** This leaves mismatched child/job APIs and the reproduced checkpoint, cancellation, admission, and write failures intact.

**Replace Antfarm with a long prompt or Skill.** Instructions do not enforce independent verification, durable position, retry budgets, workspace ownership, or blocked recovery. Skills remain useful task guidance.

**Compile YAML into native workflow scripts.** Native workflow tools persist display records, but those records do not save business execution position or support resume. The current engine also lacks per-run cwd, role presets, pre-start identity checkpoints, and an awaitable checkpoint binding. Adding a PTC run around the existing driver retains interpreter responsibilities plus compiler glue. Direct activation has fewer owners for this scope; [native convergence requirements](../../proposed/architecture/2026-11-08-antfarm-native-orchestration.md) define the conditions for replacement.

**Merge with Superagent.** Superagent owns external requests, policy, tickets, and replies to GitHub or Feishu. Antfarm owns a coding procedure initiated in DSH. Combining them adds external-message and authorization responsibilities; an explicitly authorized task can compose the two without merging their ownership.

**Retain the existing Studio editor.** Its path, overwrite, and concurrency failures widen the initial replacement scope. Read-only run inspection provides useful output without those write obligations.

## Consequences

Atomic checkpoints, writer admission, and owned worktrees preserve explicit recovery and prevent silent acceptance of failed output. Execution remains serial, with bounded per-story verification, repair, and human escalation. The implementation provides neither exactly-once external effects nor automatic restart, parallel DAG execution, or external event intake.

Version 2 changes role and result syntax. Legacy journals remain read-only when owner identity can be recovered; no implicit migration reinterprets version 1. Starting a fresh run after inspecting retained output is a manual recovery choice, not resume compatibility. Excluding shared execution, environment copying, and editing gives up those capabilities and removes their resource/conflict obligations.

Preset write-tool restrictions do not make shell or skill execution filesystem read-only. Delegated permissions and deployment sandbox settings remain authoritative. Web/TUI supplies native Agent Preset composition; default headless needs its registry and parent preset supplied separately. Model cost, coding quality, and external-service recovery need provider-backed acceptance.

The owning [tests](../../../../plugins/dsh-antfarm/tests/) cover output rejection, atomic planner/story checkpoints, uncertain resume, single-driver admission, cancellation/teardown, safe worktree retention, and read-only Client lifetimes. [DESIGN](../../../../plugins/dsh-antfarm/DESIGN.md) owns implementation detail and [HANDOFF](../../../../HANDOFF.md) owns current verification status. Editor reintroduction additionally requires the path/revision/concurrent-save/draft regressions stated above.

The active-note audit finds no other Antfarm decision to supersede. Writer's skill mounting, no-overwrite rules, and duplicated scripts remain independently owned.
