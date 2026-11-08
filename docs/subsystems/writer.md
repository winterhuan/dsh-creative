---
description: "Writing subsystem: the writer preset, mutually exclusive skill mounts, and the sidebar save boundary."
---

# Writing

English | [中文](writer.zh.md)

## Summary

写作模式 is an optional preset for fiction sessions. The host copies oh-story skills into the workspace or points skill discovery at the package directory, and the sidebar browses libraries, writing projects, and dated market scans with editable text files. DSH keeps the session, the model, and file reads.

## Table of Contents

- [Package](#ownership)
- [Mount and save boundary](#boundary)
- [Related](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Package

[@winterhuan/dsh-writer](../../plugins/dsh-writer/packages/winterhuan/writer/README.md) installs on its own. The host row owns skill mounting, source diagnosis, backed-up sync and restore commands, and versioned file saves. The preset row owns the tool list and the persona. The browser half is the same package's client entry: the writing sidebar plus a Plugins-page Writing card that binds the Zhuque credential through `makersApiKeyEnv` (Host stores the env name only; secrets go through credentials).

<a id="boundary"></a>
## Mount and save boundary

`skillMount` is `workspace` or `bundled`, defaulting to bundled. Workspace mode copies skills; bundled mode reads the package. Existing project copies still take precedence. Explicit sync and unsync preserve backups, and restore also preserves displaced current copies.

The sidebar lists and reads through `workspaceFiles`. Its Scans tab discovers `扫榜/YYYYMMDD/` records, newest first, and previews the conclusion on expansion, falling back to the aggregate or a readable Markdown ranking file. Original ranking files remain in the same tree. The host route accepts versioned saves of supported text files in the session workspace, including scan reports. It does not serve the oh-story dashboard. `story-setup` on this host skips Claude Code and Codex hook deployment.

The sidebar stores browser recovery drafts by workspace and path; read and save replies update only their owning document. The chapter panel reads book tracking, mechanical checks, and semantic review records on demand. Changed manuscript or outline fingerprints expire the corresponding reports. Skill scripts validate review quotations and versions; the sidebar does not replace author decisions or impose a chapter-commit gate.

<a id="related"></a>
## Related

Install, the mount switch, and limits are in the [package README](../../plugins/dsh-writer/packages/winterhuan/writer/README.md). File discovery is owned by [skill-filesystem](../../upstream/packages/skill/skill-filesystem/README.zh.md). Sidebar registration follows [the right sidebar](../../upstream/docs/subsystems/sidebar-right.zh.md).

<a id="dev-note"></a>
## Dev Note

None.
