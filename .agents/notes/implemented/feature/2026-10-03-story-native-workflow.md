# Agent Note: Novel chapters through the native workflow tool

Status: implemented

English | [中文](2026-10-03-story-native-workflow.zh.md)

## Problem

Formal chapters require preparation, writing, checks, review, revision and a tracking transaction. Skill instructions coordinate these steps, but the submission script does not verify that substantive review happened. Repeated ad hoc delegation makes missed handoffs and failure handling harder to inspect. A second execution engine, expert wrapper or progress database would duplicate DSH capabilities.

## Decision

The story package supplies a [chapter template](../../../../packages/creative/story/knowledge/story/workflows/chapter.js) for the existing native `workflow` tool, with deferred [invocation guidance](../../../../packages/creative/story/knowledge/story/references/writing/long/native-workflow.md). The six Skills remain the public entry points. `story-write` selects this path only for an explicit task choice or an established user preference. Ordinary writing and review retain their direct paths.

The parent supplies the project, chapter and current user constraints, with optional known context. It reads the template and submits the unchanged JavaScript body in a top-level native tool call. DSH owns execution, child sessions, cancellation, background jobs and run presentation. There is no story executor, direct engine consumer, custom dashboard or second job registry. Missing capabilities produce a concrete diagnostic without silently substituting another mode.

Each invocation handles one new formal long-form chapter and local revisions of its uncommitted draft. Prepare locates actual files, checks tracking, reuses a ready outline or creates a missing one within the confirmed plan, and forms a bounded scene plan. Missing facts or conflicting plans stop dependent work. Its checked outline digest and tracking revision accompany the resolved paths and scene plan; explicit caller paths and revision remain constraints. The writer reads its Role, Skill and prepared sources, writes within scope and runs the existing checks. A changed outline or revision stops the handoff to review. A separate reviewer reads the review Skill and actual files. At most two revision passes follow the initial draft, each followed by fresh review. A final child constructs and verifies the guarded append transaction. Continuous writing invokes the template serially and advances only after verified submission; native `pipeline` is unsuitable because it runs different items concurrently.

## Review routing and source identity

The workflow reviewer returns `recommendation: ready | revise | needs_input` and readable `review` text. `ready` is the condition for entering submission in this template; it is a fallible model recommendation, not objective proof of literary quality. The response has no scores, quote quotas or model metadata. Ordinary `story-review` stays prose. No new review record, tracking schema or historical-data migration is introduced; native Session history retains normal responses.

`chapter check` returns body and outline SHA-256 digests computed from the inspected bytes, bound to the tracking revision. Source collection and the completed check reject observed file or state changes. Reviewers compare lightweight source identities before and after reading. The existing transaction accepts optional `expected_body_sha256` and `expected_outline_sha256`; submission checks them and `expected_state_revision` under the project write lock and checks sources again before writing. The ordinary `storyctl` path also binds its own fresh checks to that transaction. Direct transactions without the optional guards remain supported.

Changed body or outline bytes require new checks and review. Changed tracking requires reloading facts and rebuilding the task or transaction, never silently updating an expected value. The final child verifies actual chapter progress, persisted wordcount and source hashes. The lock does not span model waits, and these checks do not claim isolation from arbitrary external filesystem writers.

An underlength draft is not padded. An overlength draft has at most one compression pass across the invocation and resumed work. Pending natural-length acceptance returns to the author; explicit acceptance identifies the exact body and outline hashes and expires when either changes. A reviewer's `ready` cannot supply that authorization.

## Outcomes and recovery

`committed` requires successful submission and artifact verification. `already_committed` verifies an existing result without regeneration or duplicate submission. `needs_input` and `revision_limit` retain the draft and relevant findings; a completed native run with either status is not a committed chapter. Null children, invalid responses and failed checks stop dependent work. Uncertain submission returns `uncertain` for artifact inspection before any retry.

Cancellation preserves actual files and completed transactions, without rollback. A new invocation rechecks and reviews the existing uncommitted draft; it does not resume a JavaScript stack. Changed user scope requires cancellation, artifact reconciliation and a new invocation with updated inputs. Parent messages do not automatically update a running child. Explicit background execution reuses native jobs and still requires a terminal result before the next chapter.

## Alternatives considered

**Prose-only coordination.** It remains useful for small tasks, but provides no maintained transitions or bounded revision loop for repeated chapter production.

**A new story tool, Role executor or direct workflow-engine call.** These add another owner and can bypass native tool recording and background integration. A Host-owned entry becomes relevant only if immutable template enforcement becomes a requirement.

**A mandatory review certificate for every submission.** Fixed evidence counts and model metadata do not establish literary quality. A workflow-local routing response provides the needed transition without restoring permanent quality certificates or changing ordinary review.

**Prepare only in the parent.** This leaves missing outlines and scene planning outside the selected workflow and repeats prerequisite work at its entry. A native Prepare stage keeps that work visible and passes checked inputs to the writer; only actual missing decisions return to the author.

**Return every review to the parent.** This avoids structured handoffs but breaks the selected end-to-end workflow. The template instead escalates missing facts, required author decisions and exhausted revision while handling authorized local work internally.

**Concurrent chapters or revision until approval.** Dependent chapters can read stale predecessor facts, and unlimited rewriting can oscillate or change the story merely to satisfy a reviewer. The implementation serializes chapters and preserves unresolved findings at the revision limit.

## Consequences

The author gains inspectable stage ownership and bounded stopping behavior. Structured validation checks fields and transitions; separate sessions establish separate execution, not different models or independent biases. Review can still be mistaken. Template reuse and review-only duties are instructions, not Host enforcement or a per-reviewer tool ACL.

The catalog stays unchanged; the template and guide load only when selected. Their source and independent child reads add tokens and model calls. The [package README](../../../../packages/creative/story/README.md#model-experience) records static token estimates and their limits. No end-to-end efficiency or literary-improvement claim follows from scripted-model tests.

Committed-chapter revisions with downstream impact, short stories, intake, full-book analysis, Team orchestration, new buttons, version history and automatic crash continuation remain outside this template. There is no separate daily script: the parent serially reuses the single-chapter resource.

The [native specialist decision](2026-10-01-creative-role-agents.md) remains active with this narrow exception for structured workflow routing. The [six-Skill decision](../simplification/2026-09-30-story-skills-native-resources.md), [reader-value decision](2026-09-22-novel-reader-value-generation.md) and [independent-domain decision](../architecture/2026-09-30-creative-four-domain-plugins.md) retain their other responsibilities. No active triplet is fully superseded or archived.

## Testing

Python regressions reject stale bytes, tracking revisions and deterministic changes during checks and transaction validation, and retain direct submissions and historical records. Template tests cover preparation handoffs, optional caller constraints, changed outlines, routing, two-pass exhaustion, length decisions, invalid and null responses, verified identities and recovery results. Native-composition tests use the real model loop, top-level tool runtime, worker, separate child sessions, file reads, checks, guarded submission and persisted lifecycle events; they also verify outline creation inside Prepare, existing-outline reuse, missing planning facts, preserved prose without its approved outline, decision returns, invalid structured review and cancellation cleanup. Scripted models exercise execution, not literary judgment.

Repository typecheck, build, full tests and documentation checks cover the delivered resources and contracts. Isolated DSH verification and packed-resource checks are recorded in [HANDOFF.md](../../../../HANDOFF.md); user profiles and paid models are outside this verification.
