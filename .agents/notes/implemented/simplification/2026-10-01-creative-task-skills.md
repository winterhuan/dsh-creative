# Agent Note: Task-based drama, game and video Skills

Status: implemented

English | [中文](2026-10-01-creative-task-skills.zh.md)

## Problem

Separate Skills for production stages made small author requests load unrelated procedures and repeatedly hand off adjacent work. Some references required fixed concept counts or repeated reviews, and the video pre-speech checklist required watching a final file that did not yet exist.

## Decision

Drama has five task entries: project and adaptation, writing, visual work, production and review. Four visual modes share one Skill while their creator documents and stable IDs remain separate. Receiving a novel path does not require full-book analysis; analysis preserves its declared scope and distinguishes source evidence from adaptation decisions.

Game has four entries: intake and source analysis, design, build and QA. Design combines concept, world and art work. Existing choices do not trigger mandatory alternatives or fixed verb/system counts. Templates apply only to compatible Web projects; missing tools do not authorize changing the target runtime. QA stays separate and the current authenticated driver verifies Chrome builds only.

Video retains `video-recap` and `video-script`. Understanding, cutting, speech and assembly are conditional references with executable scripts, not registered Skills. Script work does not start paid production. Cut-mode narration uses the actual edited timeline; final viewing follows rendering. Semantic review follows the requested scope and actual runtime strictness rather than an unconditional loop to PASS.

All resources use DSH native reading. Drama and video expose package-local resource roots; game keeps resources with each task. Script locations and checked distribution copies remain stable for production consumers. Resource-only directories are excluded from Skill discovery. Removed Skill names have no registered aliases.

The [four-domain decision](../architecture/2026-09-30-creative-four-domain-plugins.md) retains independent installation and no shared runtime package. The [finished-episode](../feature/2026-09-27-short-drama-finished-episode.md), [game-evidence](../feature/2026-09-27-novel-to-game-playability-evidence.md) and [video-delivery](../feature/2026-09-27-video-recap-delivery-and-compliance.md) decisions remain active for authorization, source identities, actual execution evidence and draft limits. The [story simplification](2026-09-30-story-skills-native-resources.md) separately owns novel workflows and Role resources.

## Alternatives considered

**Keep old names as hidden Skills.** Hidden entries still participate in model discovery and preserve stage-routing obligations. Conditional references provide the procedures without another invocation identity.

**Put each domain in one large Skill.** That loads unrelated work and blurs production authorization and review scope. Task entries retain these boundaries without requiring every stage for every request.

**Only relocate the old instructions.** That preserves mandatory comparisons, intermediate approvals and repeated checks. The workflows remove those obligations while retaining confirmed design changes, paid-operation confirmation and actual delivery verification.

**Move all runtime scripts or extract a shared package.** Existing composition and distribution consumers already use stable paths. Skill discovery does not require a runtime migration or a new dependency.

## Consequences

The three catalogs shrink from 23 to 11 entries; video still has two user-visible commands. Existing removed commands must use their owning task entry. Detailed references remain available for specialized work, and production scripts still require synchronization across independently distributed packages.

Provider checks cover catalog identity, resource hints and readable references. Existing offline production and QA tests cover their retained execution contracts. These checks do not demonstrate artistic quality, live-provider availability or approval to publish.
