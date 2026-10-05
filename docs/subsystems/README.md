---
description: "Subsystem index for all repository plugins, their owning packages and composition boundaries."
---

# Subsystems

English | [中文](README.zh.md)

## Summary

Find the subsystem that owns a plugin’s responsibilities and trust boundaries. Each creative workflow has its own reference; Skill Viewer, model options and shared production settings have separate references. The package map includes both installable bundles and their supporting clients.

## Table of Contents

- [Package map](#packages)
- [Related documentation](#related)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Package map

This map assigns every package to its subsystem. Installation and configuration details stay in the linked package READMEs.

| Subsystem | Package | Composition |
|---|---|---|
| [Story](story.md) | [@winterhuan/dsh-story](../../packages/creative/story/README.md) | Independent bundle |
| [Story](story.md) | [@winterhuan/dsh-client-ui-settings-story](../../packages/client/ui-settings-story/README.md) | Included by story |
| [Short drama](short-drama.md) | [@winterhuan/dsh-short-drama](../../packages/creative/short-drama/README.md) | Independent bundle |
| [Video recap](video-recap.md) | [@winterhuan/dsh-video-recap](../../packages/creative/video-recap/README.md) | Independent bundle |
| [Novel to game](novel-to-game.md) | [@winterhuan/dsh-novel-to-game](../../packages/creative/novel-to-game/README.md) | Independent bundle |
| [Student learning](student.md) | [@winterhuan/dsh-student](../../packages/education/student/README.md) | Independent bundle |
| [Skill Viewer](skill-viewer.md) | [@winterhuan/dsh-skill-viewer](../../packages/skill/skill-viewer/README.md) | Independent bundle |
| [Skill Viewer](skill-viewer.md) | [@winterhuan/dsh-client-ui-skill-viewer](../../packages/client/ui-skill-viewer/README.md) | Included by Skill Viewer |
| [Model options](model-options.md) | [@winterhuan/dsh-client-ui-settings-model-options](../../packages/client/ui-settings-model-options/README.md) | Independent bundle |
| [Production settings](production-settings.md) | [@winterhuan/dsh-client-ui-settings-creative-produce](../../packages/client/ui-settings-creative-produce/README.md) | Included by short drama or video recap |

<a id="related"></a>
## Related documentation

Use [HANDOFF](../../HANDOFF.md) for repository layout, build procedures and local verification. The [four-domain decision](../../.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.md) records the creative plugins’ separation; the [documentation standard](../AGENTS.md) defines where contracts are maintained.

<a id="dev-note"></a>
## Dev Note

None.
