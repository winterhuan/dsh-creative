# Agent Note: Novel creation mode

Status: implemented

English | [中文](2026-10-06-story-mode.zh.md)

## Problem

Installing the novel bundle exposed writing capabilities and a workbench independently of a Session's purpose. Authors need an explicit novel mode whose tools and workspace follow the selected Session without losing drafts.

## Decision

The [domain mode decision](2026-10-06-domain-modes.md) owns activation for short-drama, game, video-recap and learning Sessions.

The existing bundle declares the `story` Agent preset without changing the new-task default. Its scoped `/agent` entry owns novel Skills, production tools and writing hooks. A concise novelist persona distinguishes discussion, critique and authorized writing; detailed methods stay in six on-demand Skills. Native filesystem, shell, search, job, delegation and workflow tools support those Skills. Compaction and workflow services use separate isolation groups.

The Host entry retains the file API and credential settings so retained preset revisions cannot register duplicate routes. The browser reads the Session's `agentPreset` projection, including selections made after blank-session creation. Only novel Sessions expose the workbench guide entry and novel file redirects. The editor hides while the projection is unknown and closes a restored tab when a known different preset owns it. Global settings remain available.

Editor buffers keep `creative.story.v1`; switching Sessions or hiding discovery does not clear their state. Existing conversations retain their preset and can continue the same book in a new novel Session. Existing non-novel Session drafts stay stored but have no novel workbench entry. There is no conversation-history or project-file migration.

The [creative workbench decision](2026-09-03-creative-workbench.md) retains file, draft and production ownership. The [four-domain decision](../architecture/2026-09-30-creative-four-domain-plugins.md) retains independent distribution. This decision changes the novel activation boundary only; both records remain active and cross-linked. The rule-ownership and native-workflow decisions retain their task-order and chapter-transaction rationale.

## Alternatives considered

**A permanently visible workbench:** makes installation equivalent to entering the novel environment and exposes it in unrelated Sessions.

**Move the complete plugin into the preset:** mixes Session-scoped tools with Host routes and settings, risking repeated route registration across retained preset generations.

**Rewrite the editor and storage:** adds a migration without improving mode selection; existing Session buffers and versioned file saves already own the data.

## Consequences

Novel behavior and discovery follow Session purpose. The preset explicitly lists its tools, so DSH upgrades require composition review. The global sidebar registry requires subscriptions to both selected-Session identity and Session projection updates; tab bodies and editor stores remain registered while guide visibility changes. A preset is not a filesystem security sandbox, and literary quality remains outside mechanical checks.

## Verification

Preset tests exercise native registry mounting, child composition, tool and Skill isolation, scoped write hooks and a persona snapshot. Client tests cover unknown modes, blank-session changes, Session switches, observer disposal and file claims by the addressed Session. Existing native chapter tests exercise preparation, independent review and guarded commit.

Typecheck and build pass. The default-concurrency full test run reports one 30-second chapter-workflow timeout and 754 passes; the workflow file passes independently, and the full run with four workers passes all 755 tests. The timeout remains a verification limitation under unrestricted host concurrency; no test deadline or assertion is weakened. Documentation and hygiene checks pass.

An isolated DSH profile and Chrome verify mode selection, the novel-only workbench, selected-file and unsaved-draft retention across Sessions and reload, and narrow layouts without page script errors. Browser evidence is under `/tmp/dsh-story-mode.RrT7Cf/`. No real model or paid detection runs; these checks establish composition and UI behavior, not autonomous literary performance.
