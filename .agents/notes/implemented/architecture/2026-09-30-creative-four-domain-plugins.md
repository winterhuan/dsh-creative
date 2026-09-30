# Agent Note: Four independently enabled Creative domain plugins

Status: implemented

English | [中文](2026-09-30-creative-four-domain-plugins.zh.md)

## Problem

A single Creative package made creators install four workflows together. Its combined state and cross-tree Python imports also made a directory-only split insufficient: game intake needed story and drama helpers, while drama composition needed video scripts.

## Decision

Four independently installable bundles own their Host tools, Skills, resources, routes, browser entries and Session state: `dsh-story`, `dsh-short-drama`, `dsh-novel-to-game` and `dsh-video-recap`. Each provides a direct sidebar entry. DSH retains Sessions, filesystem authorization, jobs, credentials and model configuration. No domain depends on the Creative aggregate or another business plugin.

Creative composes the four packages and retains legacy routes and production aliases. It has no aggregate page, browser entry or combined state store. Domain providers register only in their owning packages. Stable bundle row IDs prevent duplicate registrations. The existing production settings page and namespace remain shared; the split adds no common runtime package.

Story owns six Skills, seven Roles, writing hooks and `story_zhuque`. Drama owns ten Skills, `creative_production`, confirmation handling, projection and `drama_produce_run`. Game owns seven Skills, templates, authenticated `game_qa` and previews. Video owns six Skills, delivery measurements, playback and `video_produce_run`. The aggregate retains `creative_produce_run` and `creative_produce_status`; standalone Skill bridges name their domain tools.

Each route preserves Session lookup, trusted requests, resolved-path containment and file budgets; editors preserve versioned writes. Domain listings and reads reject unrelated domain documents. Drama replay accepts both its own producer results and legacy aggregate results. Cross-domain adaptation exchanges project files and source identities, never another plugin's private store.

Required source-export and lineage helpers ship inside each consumer. Drama includes the media scripts its composition and review tools need. `scripts/sync-video-runtime.py` maintains video runtime copies, drama media copies and story helper copies; tests also compare game source helpers. These are checked distribution copies, not runtime dependencies on sibling directories.

Independent pages use `creative.story.v1`, `creative.drama.v1`, `creative.game.v1` and `creative.video.v1`. Old `creative.workbench.v2` state is neither read nor migrated; the user explicitly chose removal without draft migration. Saved project files, settings and credential references remain usable.

## Alternatives considered

**Only split components or add sidebars.** That leaves Host registration and script lookup coupled, so it cannot support independent installation.

**Make four wrappers depend on Creative.** That retains unrelated workflows and creates a cycle when Creative becomes the aggregate.

**Extract a common runtime first.** The concrete sharing consists of existing DSH services and bounded helper scripts. A new service layer would add ownership and release obligations without a demonstrated need. Reconsider a library only when maintaining checked copies becomes more expensive.

**Keep the aggregate page for old drafts.** This leaves a fifth page, combined state and duplicate UI code. The user does not require draft migration, so the four independent pages own all browser workflows.

## Consequences

Creators can install one workflow. Maintainers own more manifests and build entries, and shared script changes must pass synchronization checks. The aggregate retains only Host compatibility code; independent packages must not import it. Unsaved content from the retired aggregate page has no UI entry.

Standalone registration/disposal tests and Loader composition tests cover domain catalogs and aggregate-plus-domain installation. Route tests reject unrelated files. The existing workflow tests exercise chapter checks, synthetic decoded episode delivery, local recap delivery and authenticated game evidence. Real Chrome checks exercise standalone novel editing and saving, the drama production page, video playback and the four entries installed through the aggregate. Paid provider calls and artistic quality are outside this evidence.

### Related decisions

The [Creative workbench decision](../feature/2026-09-03-creative-workbench.md) remains active for DSH ownership, production authorization, Session projections and file safety. This decision supersedes only its single-package rationale. Reader-value, game-evidence, finished-episode and video-delivery decisions retain their business contracts. No archived note or archive manifest changes.
