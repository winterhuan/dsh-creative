---
description: "Oh Story fork integration: creative workbenches, upstream ownership, and local development checks."
---

# Creation

English | [中文](writer.zh.md)

## Summary

The Oh Story fork provides novel, short-drama, interactive-game and video-recap workbenches in DSH. DSH owns agents, sessions, models and permissions. Skills, roles and creative documents come from the plugin.

## Table of Contents

- [Source](#source)
- [Runtime and assets](#runtime)
- [Development](#development)
- [Dev Note](#dev-note)

<a id="source"></a>
## Source

[plugins/oh-story-dsh](../../plugins/oh-story-dsh/README.md) tracks [winterhuan/oh-story-dsh](https://github.com/winterhuan/oh-story-dsh), a fork of [zenstory-ai/oh-story-dsh](https://github.com/zenstory-ai/oh-story-dsh). The package is `@winterhuan/oh-story-dsh`; its source and build output live under `packages/dsh-plugin`.

The former `plugins/dsh-writer` source is removed. Its [preset](../../.agents/notes/archived/feature/2026-10-31-writer-preset.md) and [Box/Ego integration](../../.agents/notes/archived/architecture/2026-11-07-writer-box-ego.md) are historical decisions. The new fork retains its upstream workbenches; the old sidebar, `writer_agent` and credential settings are not copied into it. Browser tasks use the official [ego-browser](https://lite.ego.app/document/zh/docs/ego-browser) directly, loading its installed-version guide with `ego-browser skill`.

<a id="runtime"></a>
## Runtime and assets

The bundle registers `oh-story` in its DSH profile. It supplies four workbenches, skill providers and the `oh_story_role` tool; DSH retains conversation and permission ownership. Installation and runtime behavior are documented in the [upstream package README](../../plugins/oh-story-dsh/packages/dsh-plugin/README.md) and [architecture guide](../../plugins/oh-story-dsh/docs/ARCHITECTURE.md).

The four fixed asset sets live in `packages/knowledge/{oh-story,drama,novel-to-game,video-recap}`. Their manifests record versions and file hashes. Follow the fork's [AGENTS.md](../../plugins/oh-story-dsh/AGENTS.md) and synchronization commands; do not edit vendored knowledge by hand. Role and reference loading follows the fork's own adapters.

Replacing the development submodule does not migrate installed profiles, existing sessions or manuscripts. The independent `writer` service still uses its installed legacy Writer package until a separate runtime migration is performed. Current service locations remain in [HANDOFF.md](../../HANDOFF.md#independent-service-profiles).

<a id="development"></a>
## Development

Parent commands discover the fork's workspace and `packages/dsh-plugin/package.json`. Installation, type checking, build and tests use its own toolchain; optional cleanup runs only where declared. Run `pnpm verify` inside the fork for lint, type checks, asset parity, DSH ownership checks, script tests, unit tests and build. Its explicit Vitest config prevents an enclosing repository from changing test discovery.

The fork keeps its upstream source and documentation conventions. Parent style and bilingual-template checks cover the integration docs, while the fork's own checks cover its implementation and fixed assets. Parent links into the fork remain checked. Real DSH validation and releases follow its [contribution](../../plugins/oh-story-dsh/CONTRIBUTING.md) and [release](../../plugins/oh-story-dsh/docs/RELEASING.md) guides.

<a id="dev-note"></a>
## Dev Note

None.
