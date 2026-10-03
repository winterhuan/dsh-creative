# Agent Note: One owner for fiction workflow rules

Status: implemented

English | [中文](2026-10-03-story-rule-ownership.zh.md)

## Problem

Fiction instructions could assign incompatible duties: a post-write hook demanded immediate tracking updates, the writer Role reserved checks for the parent, and the native workflow assigned checks to its writer and submission to a final child. Preparation and submission also parsed outline targets separately, allowing preparation to accept text that submission rejected. Copied UI code and a large query JSON protocol had no consumers.

## Decision

The selected Skill or workflow owns task order and assignments. Roles supply professional methods. A writer runs checks assigned by its task; the post-write hook requests fresh checks and review, then tracking updates by the assigned submitter through the chapter transaction. It does not direct a writer to edit tracking. The [native workflow](../feature/2026-10-03-story-native-workflow.md) keeps its preparation, independent review, bounded revisions and guarded submission.

Only the parent reads the invocation guide. Child prompts carry their stage duties and needed resources, including lightweight source-identity checks for review. `story-explorer` answers the requested question with facts, sources and gaps; benchmark selection belongs to the project-context reference. Style analysis supplies evidence-based guidance, not obsolete writing Gates or mandatory word-frequency quotas.

The Python outline checker uses `wordcount_core.py` for chapter paths and target parsing, as submission does. Preparation can report a proposed path for a missing outline, while ambiguous matches remain errors. Structural findings still block writing; a mechanically complete outline does not establish literary quality.

The fiction client retains file listing, editing, conflict protection and successful-mutation refresh. It removes unconsumed streaming projections, other-domain dictionaries and unused workspace metadata. Shared production settings, persisted tracking, author-memory journals and the direct tracking CLI retain their contracts.

## Alternatives considered

**Add a central rule registry or execution framework.** Another runtime would duplicate DSH and add a new source of ownership conflicts. Existing tasks, Roles and hooks suffice when their responsibilities agree.

**Keep both parsers and prove equivalence with tests.** That retains two maintenance owners for one format. Shared parsing makes preparation and submission agree by construction; regressions instead cover invalid targets and ambiguous paths.

**Remove all checks or the knowledge library.** Structural checks, real source identities, transactional tracking and selected professional references still protect useful behavior. Their presence does not justify a literary certificate, fixed query JSON or loading every reference into every child.

**Keep unused surfaces for future consumers.** Speculative callers do not justify current projection, schema and copy maintenance. A concrete consumer can introduce a bounded interface with its own tests when needed.

## Consequences

Agents receive fewer conflicting instructions and load less unrelated context. Callers of the removed JavaScript outline entry must use `check_outline_contract.py` with Python. The fiction workspace response omits `projects`, and explorer responses no longer promise a fixed JSON shape; there are no current product consumers of either removed contract. These are deliberate compatibility reductions, not persisted-data migrations.

Static token counts and current usage belong to the [package README](../../../../packages/creative/story/README.md#model-experience). Tests cover actual native writes with hooks, shared target parsing, missing and ambiguous outlines, tracking compatibility, successful mutation detection, file listing and editor conflicts. Scripted-model tests establish execution behavior, not literary improvement. Repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).

The [six-Skill](2026-09-30-story-skills-native-resources.md), [native specialist](../feature/2026-10-01-creative-role-agents.md), [reader-value](../feature/2026-09-22-novel-reader-value-generation.md), [four-domain](../architecture/2026-09-30-creative-four-domain-plugins.md) and [workbench](../feature/2026-09-03-creative-workbench.md) decisions retain distinct entry-point, collaboration, literary, installation and filesystem rationale. Together with the native workflow note they remain active; this change neither fully supersedes nor archives a triplet.
