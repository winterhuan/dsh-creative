---
description: "Novel-to-game subsystem: project assets, isolated browser previews and authenticated Chrome QA evidence."
---

# Novel to game

English | [中文](novel-to-game.zh.md)

## Summary

Adapt a novel into a playable browser game and inspect it in Game Studio. QA exercises the actual candidate and records evidence for launch, rendering, input, the core loop, outcomes and restart. Mechanical success does not establish subjective playability.

## Table of Contents

- [Package and project boundary](#ownership)
- [QA and evidence ownership](#evidence)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Package and project boundary

The `novel-to-game` Agent preset owns model capabilities through the scoped `/agent` entry. Host routes and settings remain global. Sidebar discovery follows the selected Session projection; hidden workbenches retain their existing stores. Mode selection does not migrate history or grant filesystem permissions.

The [novel-to-game package](../../packages/creative/novel-to-game/README.md) owns four Skills, source helpers, `game_qa`, its routes and the game-only Session store. It installs independently of the story, short-drama and video plugins. Source adaptation exchanges files and lineage rather than another plugin’s private state. DSH owns Session authorization, shell execution and jobs.

Projects use `game-adaptations/<project>/`; the browser entry is `build/app/index.html`. `/novel-to-game` exposes read-only project APIs, and `/novel-to-game/preview/` serves preview assets. Trusted navigation, allowed paths, resolved containment and byte limits protect those reads. The preview and QA runner share a content security policy that restricts resources to the preview asset prefix and permitted local data.

<a id="evidence"></a>
## QA and evidence ownership

`game_qa` runs Chrome against the packaged candidate, captures actions and images, and writes evidence hashes. The Host authenticates the record and verifies current build and evidence bytes before presenting a current result. Handwritten PASS records are not accepted as authenticated evidence; a Host restart invalidates prior process signatures.

QA uses the DSH shell and optional background jobs, without production credentials. Its browser coverage does not certify native executables, media rights, balance or subjective fun. The workbench preserves those limits alongside the mechanical result.

<a id="related"></a>
## Related contracts

The [game evidence decision](../../.agents/notes/implemented/feature/2026-09-27-novel-to-game-playability-evidence.md) owns attestation and freshness. The [package README](../../packages/creative/novel-to-game/README.md) owns installation, runtime requirements and task entry points.

<a id="dev-note"></a>
## Dev Note

None.
