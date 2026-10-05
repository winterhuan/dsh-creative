# Agent Note: Creative and learning modes

Status: implemented

English | [中文](2026-10-06-domain-modes.zh.md)

## Problem

Installing short-drama, game, video-recap or learning capabilities exposed their tools and workbenches in unrelated Sessions. Each activity needs explicit selection without changing project storage or independent installation.

## Decision

Each existing bundle declares its own native preset: `short-drama`, `novel-to-game`, `video-recap` or `student`. Host entries own routes, settings and historical result rendering; scoped `/agent` entries own Skills and tools. Domain personas route tasks to on-demand Skills. The three creative modes include native production support and delegation; learning supplies tutoring, files, questions and web access without default shell or delegation tools.

The browser follows the selected Session's preset projection. Only the owning mode exposes its workbench guide and body; short-drama file redirects inspect the addressed Session. Unknown projections hide panels without clearing stores. Known mismatches close restored tabs. Existing state keys, project files and learning records remain unchanged; existing conversations retain their presets. Modes select capabilities, not filesystem permissions.

The [novel mode decision](2026-10-06-story-mode.md) retains the shared activation rationale and novel-specific write hooks. The [independent-domain decision](../architecture/2026-09-30-creative-four-domain-plugins.md) retains distribution and checked resource-copy ownership. The [workbench decision](2026-09-03-creative-workbench.md) retains file and production safety, and the [learning decision](2026-10-05-student-learning.md) retains curriculum, evidence and time-limit contracts. These records remain active; only activation expands to the other domains.

## Alternatives considered

**Global tools with hidden panels.** Hiding a workbench alone still exposes unrelated model capabilities.

**Move every registration into the preset.** Retained preset generations can duplicate Host routes or global settings.

**A common creative preset for learning.** Shell, production and delegation add unrelated capabilities to short tutoring tasks. Explicit compositions keep the learning mode focused while preserving native files and images.

## Consequences

Bundles remain independently installable. Preset compositions and their DSH dependencies need review during upgrades. Browser helpers remain local to each bundle, avoiding a business-plugin dependency. Shared production settings remain global; a custom `/agent` composition can supply fallback production configuration.

## Verification

Native registry tests verify Standard and sibling-mode isolation, inherited child capabilities and persona snapshots. Client tests cover selection, blank-session projection updates and subscription cleanup; existing file and study tests retain data contracts. Browser verification uses an isolated DSH profile without paid generation or real-model quality evaluation.

Typecheck, build and all 765 tests across 86 files pass with four workers. Isolated Chrome checks verify each mode’s sole domain guide, workbench opening, reload restoration, and 720px light/dark rendering without page errors. Standard mode exposes no domain workbench. Evidence is in `/tmp/dsh-domain-browser-results.json`; the user’s running profile was not restarted.
