---
description: "Writing subsystem: the writer preset, mutually exclusive skill mounts, and the sidebar save boundary."
---

# Writing

English | [中文](writer.zh.md)

## Summary

写作模式 is an optional preset for fiction sessions. The host copies oh-story skills into the workspace or points skill discovery at the package directory, and the sidebar saves setting, outline, and chapter markdown. DSH keeps the session, the model, and file reads.

## Table of Contents

- [Package](#ownership)
- [Mount and save boundary](#boundary)
- [Related](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Package

[@winterhuan/dsh-writer](../../packages/winterhuan/writer/README.md) installs on its own. The host row owns `skillMount`, the first copy into `.agents/skills`, `/writer-sync-skills`, and `PUT /writer/file`. The preset row owns the tool list and the persona. The browser half is the same package's client entry: the writing sidebar plus a Plugins-page Writing card that binds the Zhuque credential through `makersApiKeyEnv` (Host stores the env name only; secrets go through credentials).

<a id="boundary"></a>
## Mount and save boundary

`skillMount` is `workspace` or `bundled`. Workspace mode copies skills once and does not set `bundledSkillDir`. Bundled mode sets that directory to the package `skills` path and does not copy. Existing skill directories are not replaced until `/writer-sync-skills`.

The sidebar lists and reads through `workspaceFiles`. The host route only accepts a versioned save of a setting, outline, or chapter markdown file in the session workspace. It does not serve the oh-story dashboard. `story-setup` on this host skips Claude Code and Codex hook deployment.

<a id="related"></a>
## Related

Install, the mount switch, and limits are in the [package README](../../packages/winterhuan/writer/README.md). File discovery is owned by [skill-filesystem](../../upstream/packages/skill/skill-filesystem/README.zh.md). Sidebar registration follows [the right sidebar](../../upstream/docs/subsystems/sidebar-right.zh.md).

<a id="dev-note"></a>
## Dev Note

None.
