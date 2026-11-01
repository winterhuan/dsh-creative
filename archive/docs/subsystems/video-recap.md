---
description: "Video-recap subsystem: source and artifact access, preflight, paid narration and local-draft delivery evidence."
---

# Video recap

English | [中文](video-recap.zh.md)

## Summary

Create recaps and voiceovers, inspect source media and review delivered artifacts. Local drafts expose degraded stages, while delivery measurements record the properties of the actual output. This page covers the boundaries between the workbench, production scripts and shared credentials.

## Table of Contents

- [Packages and media access](#ownership)
- [Execution and evidence](#production)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Packages and media access

The `video-recap` Agent preset owns model capabilities through the scoped `/agent` entry. Host routes and settings remain global. Sidebar discovery follows the selected Session projection; hidden workbenches retain their existing stores. Mode selection does not migrate history or grant filesystem permissions.

The [video-recap package](../../packages/creative/video-recap/README.md) owns its Skills, tools, `/video-recap` API and sidebar. Its bundle includes [production settings](production-settings.md). DSH owns Sessions, permissions, filesystem access, shell execution and jobs; the other creative plugins are not required.

Routes restrict listings and reads to this domain, check trusted hosts and resolved containment, enforce file budgets, and support ranged media reads. Editable text uses observed file versions. Video preflight probes runtime dependencies and configured provider credentials; credential presence alone does not establish connectivity or authorize production.

<a id="production"></a>
## Execution and evidence

`video_produce_run` dispatches the packaged voiceover, recap and diagnostic scripts through the Session shell; background work belongs to DSH jobs. `video_recap_produce_status` reports speech credential presence. Execution resolves the shared production profile and forwards only the video tool’s required credentials to the subprocess.

Skills require creator confirmation before paid generation. Video execution does not consume the short-drama confirmation receipt or write its production ledger. Drafts retain degraded-stage records; delivery measurements cover source reuse, narration, rights declarations and framing. Those records are evidence about the output, not independent proof of content rights.

Cross-domain adaptation exchanges project files, such as copies from drama output into video sources. Media helpers are shipped in each consuming package and checked against their maintained sources. Runtime imports do not require another creative plugin’s private state or installation.

<a id="related"></a>
## Related contracts

The [video delivery decision](../../.agents/notes/implemented/feature/2026-09-27-video-recap-delivery-and-compliance.md) defines draft and delivery evidence. [Production settings](production-settings.md) owns shared configuration; [short drama](short-drama.md) owns confirmed episode production.

<a id="dev-note"></a>
## Dev Note

None.
