---
description: "Subsystem index for all repository plugins, their owning packages and composition boundaries."
---

# Subsystems

English | [中文](README.zh.md)

## Summary

Find the subsystem that owns a plugin’s responsibilities and trust boundaries. The student learning workbench, Skill Viewer, model options, the per-project default mode, and writing mode have separate references. The package map includes both installable bundles and supporting clients. The four creative domains (story, short drama, video recap, novel to game) and their settings clients were archived on 2026-10-31; their packages and references now live under `archive/`.

## Table of Contents

- [Package map](#packages)
- [Related documentation](#related)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Package map

This map assigns every active package to its subsystem. Installation and configuration details stay in the linked package READMEs.

| Subsystem | Package | Composition |
|---|---|---|
| [Student learning](student.md) | [@winterhuan/dsh-student](../../packages/education/student/README.md) | Independent bundle |
| [Skill Viewer](skill-viewer.md) | [@winterhuan/dsh-skill-viewer](../../packages/skill/skill-viewer/README.md) | Independent bundle |
| [Skill Viewer](skill-viewer.md) | [@winterhuan/dsh-client-ui-skill-viewer](../../packages/client/ui-skill-viewer/README.md) | Included by Skill Viewer |
| [Model options](model-options.md) | [@winterhuan/dsh-client-ui-settings-model-options](../../packages/client/ui-settings-model-options/README.md) | Independent bundle |
| [Project default mode](project-default-mode.md) | [@winterhuan/dsh-project-default-mode](../../packages/preset/project-default-mode/README.md) | Independent bundle |
| [Writing](writer.md) | [@winterhuan/dsh-writer](../../packages/winterhuan/writer/README.md) | Independent bundle |

<a id="related"></a>
## Related documentation

Use [HANDOFF](../../HANDOFF.md) for repository layout, build procedures and local verification. The archived [four-domain decision](../../.agents/notes/archived/architecture/2026-09-30-creative-four-domain-plugins.md) records the creative plugins’ separation; the [documentation standard](../AGENTS.md) defines where contracts are maintained.

<a id="dev-note"></a>
## Dev Note

The archived creative-domain references (story, short drama, video recap, novel to game, production settings) moved to `archive/docs/subsystems/` together with their packages under `archive/`; they are frozen snapshots and no longer maintained.
