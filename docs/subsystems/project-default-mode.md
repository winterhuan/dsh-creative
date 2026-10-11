---
description: "Per-project default mode subsystem: Workspace-keyed preset rules applied at session creation, and their trust boundaries."
---

# Project default mode

English | [中文](project-default-mode.zh.md)

## Summary

Give each registered Workspace its own default agent mode. A rule maps one Workspace identity to one agent preset; a new blank session created under that Workspace composes the ruled preset instead of the global default. The plugin owns only this creation-time override and its editing surface; DSH keeps preset composition, the session log, and the global default.

## Table of Contents

- [Package and integration](#ownership)
- [Rule application boundaries](#application)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Package and integration

The [project-default-mode bundle](../../packages/preset/project-default-mode/README.md) installs independently and adds one Host row owning a volatile `rules` namespace; no profile includes it by default. The browser half adds a session-menu row and an overlay dialog, both registered only while the Host namespace is served. Rules are edited through the shared settings form, so persistence, revision fencing, and recovery belong to DSH's settings domain, not to this plugin.

The Host applies a rule through the preset registry's own `select`, the same operation the new-session hero chip performs, so the switch appends the standard `agent-preset/selected` Session event and mounts the recorded preset revision. The plugin declares no preset, tool, or prompt of its own and grants no capability beyond choosing a composition DSH already offers.

<a id="application"></a>
## Rule application boundaries

A rule matches a Workspace identity, resolved from the session's `cwd` through the Workspace registry; a directory that is not a registered Workspace has no rule. Only a fresh ordinary creation is retargeted: a resumed, cleared, or compacted session keeps the composition its log fixed, and a fork or subagent child keeps its parent's. A session already composing the ruled preset is left untouched, so no redundant event is logged.

The override is a default, not a lock: a creation request that names a preset other than the global default wins, and a mode picked on the new-session screen still overrides the project default for that session. `agent/created` is a serial, awaited event whose rejection vetoes creation, so the listener contains and logs every failure; a session whose switch fails keeps its global-default composition rather than failing to start. The global default remains editable only in Settings → Agent presets.

<a id="related"></a>
## Related contracts

The [package README](../../packages/preset/project-default-mode/README.md) owns install steps, the editing flow, and limitations. Upstream owns the [agent preset registry](../../upstream/packages/preset/agent-preset-registry/README.md) and the [workspace registry](../../upstream/packages/workspace/workspace/README.md).

<a id="dev-note"></a>
## Dev Note

None.
