---
description: "Fiction subsystem: book identity, chapter continuity, native workflows and Zhuque credential ownership."
---

# Story

English | [中文](story.zh.md)

## Summary

Write and review long or short fiction while keeping outlines, chapter text and tracking tied to one named book. The overview reads progress and continuity data; the editor saves versioned documents. This page covers ownership and trust boundaries; the package README owns installation and commands.

## Table of Contents

- [Packages and execution](#ownership)
- [Book identity and continuity](#continuity)
- [Settings and detection](#detection)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Packages and execution

The [story package](../../packages/creative/story/README.md) owns Skills, hooks, the CLI and the workbench. Its bundle includes the [story settings client](../../packages/client/ui-settings-story/README.md). DSH owns the Session, model, filesystem authorization, shell and jobs. No other creative plugin is required. The `story` preset owns model-facing contributions; Host routes and settings outlive individual preset revisions. The browser gates workbench discovery and file redirects by the Session preset projection, while editor buffers remain Session-owned.

Each Skill owns its references and specialist Roles. Roles supply professional instructions to native subagents; the selected Skill or native workflow assigns work and ordering. Deterministic operations use the packaged `dsh-story` CLI. Chapter and analysis workflows belong to their Skills; the parent validates and saves extracted analysis cards.

<a id="continuity"></a>
## Book identity and continuity

Both long and short fiction use `{workspace}/{book name}/`. Discovery, file routes, redirects and writing instructions use that boundary; the workspace itself is not a book. The workspace-level analysis library has a separate identity. Book discovery continues independently of the bounded file listing, so a truncated listing does not hide books from Overview.

The `/story` API resolves the calling Session and checks trusted hosts, allowed paths, resolved containment and file budgets. Editor writes use the observed `FsVersion`; conflicting saves preserve the draft. Chapter submission checks hashes and tracking revisions before committing the transaction. Post-write hooks direct review and defer tracking changes to the assigned submitter; the overview does not advance tracking.

<a id="detection"></a>
## Settings and detection

The `story` namespace holds the Zhuque credential reference. The settings client writes secrets through DSH credentials; blank drafts keep the stored key. A startup-environment key takes precedence and makes that reference read-only in the UI. `story_zhuque` passes only the required `MAKERS_API_KEY` to its CLI subprocess. Skills require an explicit detection request; ordinary polishing does not send chapter text to Zhuque.

<a id="related"></a>
## Related contracts

See the [native workflow decision](../../.agents/notes/implemented/feature/2026-10-03-story-native-workflow.md) for chapter handoffs and the [rule ownership decision](../../.agents/notes/implemented/simplification/2026-10-03-story-rule-ownership.md) for deterministic checks. Human inspection of Skills belongs to [Skill Viewer](skill-viewer.md).

<a id="dev-note"></a>
## Dev Note

None.
