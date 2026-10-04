# Agent Note: Six story Skills with native resources

Status: implemented

English | [中文](2026-09-30-story-skills-native-resources.zh.md)

## Problem

Fourteen novel entries split related author tasks by length and pipeline stage. Intake required full-book analysis, editing overlapped with detection, and repeated reference copies carried conflicting mandatory techniques. A dedicated reference tool duplicated DSH resource discovery and file reading.

## Decision

The public entries are `story`, `story-write`, `story-analyze`, `story-review`, `story-polish` and `story-cover`. Long and short workflows remain separate deferred references within their task. `story` owns setup, market research, author preferences and existing-text intake; existing projects continue directly and raw-text intake does not require full-book analysis. Browser operation is internal guidance. Removed Skill names have no registered aliases.

All six Skills use the package’s knowledge/story resource base. Native resource hints and read serve both workflows and delegated specialists; the task supplies the selected Role file and resource root. Native filesystem permissions apply. The custom reference tool, enum and shadow guard remain absent.

This partially supersedes the dedicated-reader choice in the [workbench decision](../feature/2026-09-03-creative-workbench.md#composition-and-knowledge). That note stays active for Role permissions, production and workbench ownership. The [four-domain decision](../architecture/2026-09-30-creative-four-domain-plugins.md) retains independent plugin packaging; shared story resources do not create a cross-domain runtime dependency.

Writing preserves outline readiness, current wordcount hashes and atomic tracking transactions. The [native collaboration decision](../feature/2026-10-01-creative-role-agents.md) removes fixed review JSON and model metadata, while ordinary review remains task-appropriate and self-review never claims independence. Partial short-fiction delivery does not require completing the whole work. Style quotas and detector scores do not decide acceptance; Zhuque requires an explicit request.

## Alternatives considered

**Keep fourteen entries as aliases.** This retains ambiguous routing and catalog cost without adding a distinct author task.

**Merge everything into one large Skill.** Simple work would load unrelated long-form, short-form and detection procedures. Six task entries preserve discoverability and defer detail.

**Keep the dedicated reference reader.** It pins a package source, but fixed Role paths preserve that property while native reading supplies permissions, ranges and observations. The plugin-specific path enum and guard have no remaining responsibility.

**Require deep analysis for intake.** This improves broad source coverage but makes simple organization depend on a large analysis pipeline. Intake reads only what is needed for the requested operation; formal continuation still requires verified current facts and valid tracking initialization.

## Consequences

The catalog shrinks from fourteen to six entries. Exact duplicate consolidation removes 75 reference copies; focused workflow references retain distinct long and short guidance. Skills and helpers remain inside the independently installable story package. Existing Skill commands are intentionally removed; users select one of the six current tasks.

Provider tests verify the exact catalog, native resource base and readable resources; Role tests verify fixed reference paths and the absence of a custom reader. Script tests retain hash invalidation and tracking checks and cover free short fiction without a paywall. Forward checks cover partial-delivery and solo-review boundaries. These checks do not establish live-model prose quality or external detector accuracy.

Long-form multi-chapter extraction uses the short chapter card and batch workflow in [short chapter cards](2026-10-04-story-short-chapter-cards.md). This note still owns the six-entry catalog and native resource reading, and it stays active.
