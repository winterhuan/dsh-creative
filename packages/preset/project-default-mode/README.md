---
description: "Give each DSH project its own default agent mode, so new sessions in that project start in the mode you choose instead of the single global default."
kind: "package-bundle"
---

# @winterhuan/dsh-project-default-mode

English | [中文](README.zh.md)

## Summary

DSH resolves one global default agent mode (preset) for a new session. This optional bundle adds a per-project default: you pick a mode for a project, and every new blank session created under that project's Workspace starts in it, while sessions elsewhere keep the global default. Sessions already started keep their own mode, and a mode you pick on the new-session screen still overrides the project default for that one session. No profile includes it by default; you add it yourself and configure it from each session's "..." menu.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

Build this repository, then add the local bundle to an existing DSH web profile. Replace `project-default-mode` with your profile name.

```text
dsh plugin --profile project-default-mode add /Users/winter/dsh-creative/packages/preset/project-default-mode
dsh plugin --profile project-default-mode remove @winterhuan/dsh-project-default-mode
```

Restart DSH after installing and refresh the browser. The bundle adds one Host plugin row, `project-default-mode`, which owns the rules namespace; the browser half registers its menu row and dialog only while that Host namespace is served.

### Set a project default

1. Open the sidebar "..." menu of any session that belongs to the project.
2. Choose **Set project default mode**. The dialog names the project (its Workspace title) and lists every mode the deployment offers, plus **Follow the global default**. The mode the project uses now, and the deployment's global default, are marked.
3. Pick a mode and **Save**. New blank sessions in that project now start in it.

To clear a project override, reopen the dialog and choose **Follow the global default**; this removes only that project's rule and leaves every other project's rule intact. A session that belongs to no registered Workspace opens the dialog but offers nothing to save.

The global default itself stays in **Settings → Agent presets**; this bundle never edits it.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [bundle patch](cordis.patch.yml) inserts one row, `project-default-mode`, for `@winterhuan/dsh-project-default-mode`. The package carries a Host half and a browser half; the browser half is served through the package's `dsh.client` manifest, not a second patch row.

The Host half ([src/index.ts](src/index.ts)) declares a volatile `rules` Config — a list of `{ workspaceId, agentPreset }` — and listens for `agent/created`. On a fresh ordinary creation (`source === 'startup'`, no `parentSession`, not a subagent child) it resolves the session's `cwd` to a Workspace through `ctx.workspaceRegistry`, looks up that Workspace's rule, and, when the session is not already on the ruled preset, calls `ctx.agentPresets.select(agent, preset)`. This is the same seam the new-session hero chip uses, so the switch appends an `agent-preset/selected` Session event and mounts the preset revision the log then records. `select` is safe only on a published Agent: it rebinds the scope and emits `tools/change` while the serial `agent/created` dispatch is still running preset-scoped listeners against the creation-time preset, so the switch runs once the dispatch has settled and before the first turn; every failure is logged and never vetoes creation. The optional services are read through `ctx.get`, so the plugin activates without them and does nothing until they are present.

The browser half registers a `sidebar.workspaces.session.menu.item` row (order 500, after the shipped pin/rename/fork/archive rows) and a `shell.overlay` dialog over one shared controller ([src/client/controller.ts](src/client/controller.ts)). Opening resolves the Workspace that accounts for the session from `ctx.workspaces`, waits for the settings form’s first accepted section before staging the project’s current rule, then reads the roster from `ctx.remote.agentPresets.list()`. Saving writes the whole `rules` field through `ctx.configForms.get('project-default-mode').set('rules', …)`: the fold keeps every other project’s rule, a form without an accepted section refuses the write (writing back an empty mirror would drop the other projects’ rules), and the settings form carries the namespace revision fence and recovers its mirror on a refusal. Both surfaces register through `configForms.whileServed`, so a deployment without the Host half shows no trace.

Tests cover which creations adopt a project default, failure containment, rule resolution and replacement, roster load and staging, the settings write, and the menu/dialog presentation.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Repository build and browser verification](../../../HANDOFF.md)
- [Per-project default mode subsystem](../../../docs/subsystems/project-default-mode.md)
- [Agent preset registry](../../../upstream/packages/preset/agent-preset-registry/README.md)

-----

<a id="model-experience"></a>
## Model Experience

### Session composition

#### What the model sees

The plugin adds no prompt or tool of its own. It changes which agent preset a new blank session composes: a session under a ruled project starts in that project's mode instead of the global default, so the tool schemas and prompt sections it sees are the ruled preset's. The switch is recorded as an `agent-preset/selected` Session event before the first turn, which keeps the composition a resumed or forked session rebuilds identical to the one it ran.

#### Token effect

The plugin adds no prompt tokens. The composed preset's own persona, tools, and instructions decide the request size, exactly as they do for a session that selected that preset by hand.

#### KV Cache effect

The switch happens once at creation, before any turn, so conversation history is fixed under the chosen composition from the first request. A session already started is never retargeted, and a fork or subagent child keeps its parent's composition, so no mid-conversation rewrite invalidates a cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Rules match a registered Workspace identity, so a project directory that is not a Workspace has no per-project default. The pinned runtime resolves one global default and exposes no per-Workspace default of its own; this bundle overrides it only at session creation, so **Settings → Agent presets** still shows the global default, not a project's. Only the web client carries the menu and dialog; a headless or SDK session adopts the rule through the same Host listener but has no surface to edit it. A creation request that names the global default explicitly is indistinguishable from an omission, so the project default applies to it too; naming any other preset keeps that choice.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
