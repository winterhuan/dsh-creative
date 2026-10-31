# Agent Note: Writing preset

Status: implemented

English | [中文](2026-10-31-writer-preset.zh.md)

## Problem

The fiction workflow in this repository is a full novel plugin: its own skill provider, chapter CLI, and file API. A DSH session that only needs oh-story skills and a place to edit the setting, outline, and chapter still has to take that plugin. Loading the same skills both from a copied workspace directory and from a bundled directory makes it unclear which copy the model will follow.

## Decision

`@winterhuan/dsh-writer` is a separate bundle. Preset `writer`（写作模式）uses the standard tool rows for persona, instructions, time, shell, files, search, jobs, skills, compaction, delegation, questions, todos, and web. It does not register an agent entry or a skill provider.

`skillMount` is `workspace` or `bundled`, default `workspace`. Workspace mode copies packaged skills into the project `.agents/skills` on first entry and does not set `bundledSkillDir`. An existing skill directory stays until `/writer-sync-skills`. Bundled mode sets `bundledSkillDir` to the absolute package `skills` directory and disables the workspace skill-filesystem row. `story-setup` treats DSH as its own host and does not deploy Claude Code or Codex hooks unless the author asks for that host.

The sidebar registers a tab and body for preset `writer`. It reads and lists through `workspaceFiles` and saves with `PUT /writer/file` when the version still matches. It does not embed the oh-story dashboard.

## Alternatives considered

**Keep using `@winterhuan/dsh-story`.** That plugin owns chapter transactions, a skill provider, and a private file listing. The writing mode was supposed to stay a thin host.

**Always set `bundledSkillDir` and also copy into the workspace.** Project copies would shadow the package copies, so both modes would be active.

**Ship a `writer-*` skill set.** The model-facing names are the oh-story names (`story`, `story-long-write`, `story-short-write`, `story-deslop`). `story-zhuque` is the explicit detector skill, not a second writing workflow.

## Consequences

Installing the bundle does not change other presets. Switching `skillMount` needs a restart. A skill directory already in the workspace is not refreshed until the sync command. Zhuque stays an explicit `story-zhuque` request and does not guard chapter saves.

## Verification

Package tests cover the mutually exclusive mount flags, a workspace copy that discovers `story`, `story-long-write`, `story-short-write`, `story-deslop`, and `story-zhuque` without using an unused bundled directory, no-overwrite then force sync, the versioned save, and the DSH branch in `story-setup`. The bundle was not installed into a live DSH profile in this environment.
