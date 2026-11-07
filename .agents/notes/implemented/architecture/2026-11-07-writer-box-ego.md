# Agent Note: Box and Ego for Writer browser tasks

Status: implemented

English | [中文](2026-11-07-writer-box-ego.zh.md)

## Problem

Writer needs browser login state, page JavaScript and recoverable ranking scans. A local Chrome launcher that copies personal profiles and closes unrelated processes disrupts the author. An Ego-only prerequisite prevents the author from choosing a cloud browser.

## Decision

The [browser skill](../../../../plugins/dsh-writer/packages/winterhuan/writer/skills/browser-cdp/SKILL.md) supports Box by default and Ego by explicit selection. It keeps its existing name so project skill discovery remains stable. The seven collectors and researcher templates share the same selection policy. Browser failure never silently changes the backend; existing browser-free HTTP paths remain available.

Collectors stay in the local project. Box operations use the official CLI's remote shell and the vendor's Chrome launcher inside Box; Ego operations use the official Ego CLI and TaskSpace API. This keeps reports and checkpoints together without syncing the project or copying login profiles. Box CLI login is independent of the host's MCP connection. The vendor skills and actual tool definitions own general browser instructions.

Each Box task creates its own page and records its browser identity, target and ownership under Box's user state directory. A filesystem lock serializes operations; intent is persisted before browser effects. Handoff and uncertain results survive local process exits. Missing targets or a restarted browser cannot be replaced during resume. Explicit recovery reloads the task page and discards its JavaScript context; it does not prove that a server-side request was cancelled. Ego retains its own handoff and safety-timeout rules.

A per-call marker and complete JSON result bind Box responses to the local call. Large results are stored in Box, transferred in bounded chunks and verified by size and SHA-256 before deletion; this avoids the observed remote-shell stream reset on large single responses. Collector checkpoints bind the browser, Box, parameters and parser revision; a checkpoint does not prove that a browser operation stopped. Login tokens remain in page context, and error messages omit page exception bodies. Successful cleanup closes only task-created pages; errors and handoff retain the scene.

The [writer preset](../feature/2026-10-31-writer-preset.md) continues to own bundled/workspace mounting and protection of edited project copies. Existing workspace copies require an authorized coherent refresh; source changes do not update daily remote installations.

## Alternatives considered

**Ego only:** it provides native TaskSpace ownership, but the user requires Box as the default and Ego as a choice. The earlier exclusive-backend proposal is obsolete; its durable ownership and credential constraints remain in this decision and the implementations.

**Local Chrome and duplicated CDP helpers:** they add profile-copy and process-lifecycle responsibility outside the chosen backends. The standalone launcher and both unused helpers are removed.

**Box browser MCP for every collector call:** its documented operations do not expose the page evaluation interface these collectors need. Running the small browser worker through the official remote shell preserves the existing parsers and local checkpoints without depending on an undocumented MCP method or a generic driver registry.

## Consequences

Box adds network latency and a separate CLI login. Box and Ego keep separate website login states. Direct Box CDP does not provide Ego's automatic user-control stop signals: collection must pause before human interaction, and callers must not operate the same page concurrently. A terminated remote process can leave a lock; callers must inspect the process and page rather than remove it automatically. Uncertain page-creation failures may require manual cleanup of the task window.

The Box path is verified from macOS to Linux with Node 24 and Chrome 157: DOM evaluation, a complete 1 MiB result transferred in chunks, recovery and same-page resume, nine Ciweimao boards with ten linked entries each, and 200 books across two pages of Heiyan's official public library plus public book metadata. Ego's explicit selection passes a live page probe. Unit tests cover selection, ownership, stale sessions, checkpoints and failed result transport. Heiyan uses `https://www.heiyan.com/all.html` without a management account; its mixed-length library and cumulative click counts do not establish short-story popularity. All remaining platform flows, Windows launch behavior and automatic detection of human control in Box remain unverified; these are not implied by the shared adapter tests.
