# Agent Note: Story Skills follow the CLI contract

Status: implemented

English | [中文](2026-10-25-story-skill-cli-sync.zh.md)

## Problem

The six story Skills are where a session learns the chapter close. Host routes do not judge novel rules. A Skill page that names another missing-key default, another tracking schema, or a `project check` without a ledger gap is the instruction the session follows.

## Decision

`story`, `story-write`, `story-review`, `story-analyze`, `story-polish`, and `story-cover` keep their names. Each calls `lib/cli.js` by a path relative to that Skill, with `--workspace`, `--book`, and `--json`. The story core decides. A Skill does not invent a rule id or a CLI flag.

A missing `rule_audit` or `facts_diff` is `required`. Write `off` to leave a commit unblocked. An old book runs `project migrate-gates --legacy-off`.

Tracking schema 6 stores only a summary link. Entries stay in `追踪/事实账本.json`. `project migrate` moves a file to schema 6. `project migrate --to 5` drops the link and does not delete the ledger or change `state_revision`.

The chapter path is optional `facts extract` when the claims file is missing, then review and rule audit, then `chapter finish`. Finish runs `audit-verify` when `rule_audit` is `required`, diffs claims, commits, records, then reports stale. On a multiple of the book interval, the finish result includes `book_audit`.

`project gates` is read-only. `project check` reports the `facts` gap. `project lookup --reference` is read-only unless `--record`. A recorded hit uses kind 对标 and does not enter `covered_chapters`. Outline-cast hints and the body-name heuristic both run. `cast_body_names` is `hint` when absent.

`story-polish` and `story-cover` do not describe these gates. Their methods stay as they are.

The [chapter finish note](../feature/2026-10-25-story-chapter-finish.md) owns the finish phases. The [fact ledger note](../feature/2026-10-19-story-fact-ledger.md) owns the sidecar and the diff. The [rule audit note](../feature/2026-10-18-story-rule-audit.md) owns per-rule verdicts. This note owns the instruction that the six Skills match those commands.

## Alternatives considered

**Teach a missing gate as `off`.** A session would leave a commit unblocked, and would skip `project migrate` and `project migrate-gates --legacy-off`.

**Merge or rename the six Skills.** The names are the load keys. This instruction keeps all six.

**Judge the gates in a Host route.** Host routes do not judge novel rules. The story core decides, and a Skill calls the CLI.

## Consequences

A session that follows a Skill gets the same missing-key default as `writingGates`. An old book that must keep committing writes `off`. Skills still do not invent rule ids. These pages were not exercised in a real DSH browser and were not run with a real model.

## Verification

`packages/creative/story/tests/gates.spec.ts` expects a missing file to report `required`. `tests/project-check.spec.ts` expects a `facts` gap. `tests/chapter-workflow.spec.ts` expects the chapter template to name `rule_audit`. The package README pair states the same defaults.
