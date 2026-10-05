---
description: "Short-drama subsystem: episode revisions, production intent, confirmation receipts and verified media delivery."
---

# Short drama

English | [中文](short-drama.zh.md)

## Summary

Develop episodes, inspect their documents and follow confirmed media production in the workbench. Project documents and verified outputs are durable files; the workbench reconstructs production state from DSH results. This page separates document editing, production intent and paid execution.

## Table of Contents

- [Packages and project boundary](#ownership)
- [Intent, execution and delivery](#production)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Packages and project boundary

The `short-drama` Agent preset owns model capabilities through the scoped `/agent` entry. Host routes and settings remain global. Sidebar discovery follows the selected Session projection; hidden workbenches retain their existing stores. Mode selection does not migrate history or grant filesystem permissions.

The [short-drama package](../../packages/creative/short-drama/README.md) owns its Skills, tools, `/short-drama` routes and sidebar. Its bundle includes [production settings](production-settings.md); the other creative plugins are independent. DSH owns Session identity, filesystem authorization, shell execution and jobs.

Full project and episode paths identify documents and targets; repeated names such as `EP001` or `SHOT-001` are not global identities. The Host reads five episode documents as one checked revision. Routes enforce trusted hosts, allowed paths, resolved containment and file budgets; editor writes use `FsVersion` compare-and-swap and retain conflicting drafts. Media supports ranged reads, and stopping production verifies the job owner.

<a id="production"></a>
## Intent, execution and delivery

`creative_production` records workbench intents in the Session log. Replaying those results updates the production views without editing creator documents or authorizing payment. Pending input belongs to the Session inbox, production results to the Conversation projection, and presentation drafts to the workbench. UI production actions submit chat prompts through DSH.

For production, `drama_produce_run` requires a prepared, explicitly confirmed job and its matching adapter. Offline diagnostics do not consume a job confirmation. The runner consumes a single-use receipt, checks the confirmed inputs, validates outputs and records delivery. Bounded credential rotation applies only to explicit rejection before request acceptance. `drama_produce_status` reports credential presence without running production.

The Python creator checker owns structural diagnostics. Hashed production manifests associate verified media with targets and requests. The `episode-compose` adapter uses packaged copies of the video speech, mixing and subtitle runtime; it does not require the video plugin to be installed.

<a id="related"></a>
## Related contracts

The [finished-episode decision](../../.agents/notes/implemented/feature/2026-09-27-short-drama-finished-episode.md) owns delivery evidence. See [production settings](production-settings.md) for the shared credential namespace and [video recap](video-recap.md) for adaptation through project files.

<a id="dev-note"></a>
## Dev Note

None.
