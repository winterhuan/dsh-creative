# Agent Note: Antfarm team workflow runtime

Status: implemented
Archived: 2026-11-08

English | [中文](2026-11-08-antfarm-team-workflow-runtime.zh.md)

## Problem

Reusable teams need durable execution and explicit acceptance, with configuration and controls that users can operate. Original Antfarm polling workers and OpenClaw provisioning cannot supply native DSH ownership. A previous passing test cannot approve a candidate changed by a later repair, and an interrupted child does not prove its effects never happened.

The [initial coding-runtime decision](2026-11-08-antfarm-reimplementation.md) establishes checkpoint and workspace ownership. This decision replaces its coding-only, read-only interface and manual-only restart scope, while retaining its independent business journal, native child execution and resource protections. The [team workflow proposal](../../proposed/architecture/2026-11-08-antfarm-team-workflow-plan.md) retains external acceptance requirements that local implementation evidence does not satisfy.

## Decision

DSH owns presets, model calls, jobs, permissions, subprocesses and Session transcripts. Antfarm owns reusable workflows, accepted results, retries, resources and recovery. A single Host executor admits work durably and rotates attempt capacity across owners. An OS-backed SQLite lock excludes another Host for the same root; version 3 JSONL checkpoints remain authoritative and the SQLite query index is rebuildable.

Original owner recovery reconstructs native root authority without a model turn. Startup dispatches saved safe work. Open attempts remain interrupted until the owner inspects effects and supplies reconciliation guidance. Failed Runs require explicit additional retry budgets. No timeout or diagnostic can turn uncertainty into acceptance.

A candidate identifies the source commit and content. Required checks cite captured successful foreground shell execution in the owned cwd on that unchanged candidate. Repair invalidates earlier final checks. Declared GitHub delivery verifies the candidate PR head and distinct approving reviewer; frontend acceptance can require browser execution and retained images. Native tool operations perform effects, while Host queries validate resulting facts.

Project, configured user and bundled workflows form explicit precedence. Editing saves writable copies with canonical paths, matching revisions, serialization and unique temporary writes. Bundled definitions remain immutable. Running work retains its resolved snapshot; enablement affects new admission. Dirty drafts survive navigation and stale saves preserve the draft for correction.

Git workflows retain identity-validated worktrees and branches. File workflows snapshot explicit inputs, use separate owned directories and retain outputs by digest. Private artifact storage permits download after workspace cleanup. Native Session panels and an authorized multi-Session board read the same runtime projection; controls bind to the original owner and expected Run revision.

Owner notices persist delivery state and await native Session flush. Explicit webhooks use credential references and bounded delivery; unknown outcomes remain uncertain. Model-free health checks diagnose inactive or overdue work and dispatch safe work only through the sole executor.

## Alternatives considered

**Copy OpenClaw workers and polling cron.** This introduces another scheduler and model context into DSH. Native capacity and owner recovery provide the same autonomous progression with one execution authority.

**Keep configuration and Runs read-only.** This excludes requested configuration management and operational recovery. Revision and path protections make bounded editing and controls reviewable without granting arbitrary filesystem writes.

**Trust model-reported tests or PR links.** A claim can describe an earlier candidate or an effect that never completed. Captured commands and remote fact queries tie acceptance to current output.

**Automatically rerun all interrupted work.** A child may have acted before its checkpoint committed. Reconciliation remains necessary because neither a local journal nor a new child supplies exactly-once external effects.

**Mark every original capability verified from unit tests.** Original imports and local fixtures establish implementation behavior; real model, GitHub, browser, webhook, platform and installation acceptance require their own executed evidence.

## Consequences

The implementation covers the original teams and their native operational equivalents, plus research/writing, workflow editing and Run controls. Original polling/process-management command spelling changes; imported expectations do not automatically add native check, visual or delivery enforcement. The [capability mapping](../../../../plugins/dsh-antfarm/PARITY.md) owns those differences and verification scope.

Serial Run steps and fresh bounded attempts remain deliberate. Worktrees and presets do not isolate credentials, network or shell effects. Native Workflow/Agent Team remain separate until they provide the required durable cursor and acceptance bindings. [DESIGN](../../../../plugins/dsh-antfarm/DESIGN.md) owns mechanisms and [HANDOFF](../../../../HANDOFF.md) owns current repository acceptance status.

The scoped note audit retains and cross-links the initial runtime note because its rejected alternatives and workspace rationale still guide changes. Both proposals remain active for unmet external acceptance and native convergence conditions; no proposal is treated as fully delivered by source coverage alone.
