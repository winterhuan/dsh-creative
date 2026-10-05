---
description: "Skill Viewer subsystem: Session-scoped discovery, read-only reference access and browser cache ownership."
---

# Skill Viewer

English | [中文](skill-viewer.zh.md)

## Summary

Inspect the skills available to a Session, search their metadata and read instructions or local references. Inspection is for the human viewer: it does not invoke a Skill, resume an Agent or add model context. The catalog follows the Session’s skill composition.

## Table of Contents

- [Host and client](#ownership)
- [Read boundary and failures](#references)
- [Browser state and lifecycle](#cache)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Host and client

The [skill-viewer bundle](../../packages/skill/skill-viewer/README.md) installs the `skillViewer` Remote service and the [viewer client](../../packages/client/ui-skill-viewer/README.md). It does not require a creative plugin. DSH owns the layered skill registry, Session lookup and preset scopes; the viewer resolves the winning user-invocable skills for that position.

A live Agent supplies its scoped registry. Cold Sessions use the recorded preset’s standing scope, with a global fallback when that scope cannot be resolved; no Agent is constructed or resumed. The model-facing catalog and invocation remain owned by DSH’s skill tools. Viewer reads never enter the Session log.

<a id="references"></a>
## Read boundary and failures

Local reference access starts from the current provider’s absolute resource directory, which can be outside the Session workspace. The browser supplies a skill name and relative reference path, never an arbitrary resource root. Discovery and reads reject traversal and symbolic links and bound both listing work and UTF-8 preview bytes.

Incomplete catalog observations and truncated references remain visible as such. Missing registries, unavailable Sessions and unreadable references report errors rather than an authoritative empty catalog. URL, opaque or relative resource bases have no local reference preview; a missing local `references/` directory is an empty listing.

<a id="cache"></a>
## Browser state and lifecycle

The client caches catalogs by Session and bodies by Session and skill name. Refresh reads current content; reopening can reuse settled caches. Preset changes invalidate the affected Session and connection resets clear the cache. Reference selection reads afresh, and late responses cannot replace the current Session, skill or file.

Closing or disposing the viewer cancels reference reads. Plugin disposal removes the sidebar action, dictionaries and subscriptions. There is no filesystem watch; the [client README](../../packages/client/ui-skill-viewer/README.md) owns refresh and display behavior.

<a id="dev-note"></a>
## Dev Note

None.
