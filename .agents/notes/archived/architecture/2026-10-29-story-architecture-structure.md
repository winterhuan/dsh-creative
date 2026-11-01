# Agent Note: Story module boundaries

Status: implemented
Archived: 2026-11-01

English | [中文](2026-10-29-story-architecture-structure.zh.md)

## Problem

Story commands accumulated beside one another. Symlink resolution, chapter-number padding, and Markdown table reads were copied. Book-audit checks, ordering, and the Markdown report shared one file. A later edit could not see which module owned a rule, a path, or a JSON document.

## Decision

Six Skill names stay `story`, `story-write`, `story-review`, `story-analyze`, `story-polish`, and `story-cover`. Each calls `lib/cli.js` relative to its own directory, with `--workspace`, `--book`, and `--json`. Command names and JSON documents stay. Host routes do not judge novel rules. The story core does. A Skill calls the CLI. [Skill and CLI alignment](../process/2026-10-25-story-skill-cli-sync.md) owns that contract. [Four domain plugins](2026-09-30-creative-four-domain-plugins.md) owns the package boundary.

`looseRealpath` lives in `packages/creative/story/src/core/fs-path.ts`. The CLI guards re-export it. `paddedChapterNumber` lives in `chapter-names.ts` and is the stem inside `第NNN章` for claims, rule audits, tracking records, missing chapter files, analysis cards, and the chapter record heading. Rule extraction reads headings, lines, and table cells through `markdown-scan.ts`. Its own section reader still treats a bold-only line as a heading. Book-audit checks live in `audit-checks.ts`. `audit.ts` orders them, sorts findings, and renders Markdown. `auditBook` and `BOOK_AUDIT_CHECKS` remain exported from `audit.ts`. Chapter and facts runners take `--chapter` through `positiveChapter` and return exit 1 through `withFindings`. Fixtures that only need an empty tracking init use `tests/support/tracking-input.ts`.

Missing `rule_audit` and `facts_diff` stay `required`. Schema 6 still stores only the ledger link. [Chapter finish](../feature/2026-10-25-story-chapter-finish.md) owns the finish phases. [Fact ledger](../feature/2026-10-19-story-fact-ledger.md) owns the sidecar.

## Layers

| Layer | Path | Owns |
|---|---|---|
| Skill | `knowledge/story/skills/{story,story-write,story-review,story-analyze,story-polish,story-cover}` | Task instructions. Workflow scripts: `story-write/workflows/chapter.js`, `revise.js`, `story-analyze/workflows/analyze-batch.js`. |
| CLI | `src/cli.ts`, `src/cli/main.ts`, `src/cli/runners/` | Argv, path guards, one JSON document on stdout. Exit 0 success, 1 findings, 2 invalid input, 3 execution failure. `detect zhuque` also uses 4. |
| Core | `src/core/` | Deterministic reads and writes: chapter, finish, facts, gates, rules, audit, tracking, lookup, cast, context, memory. |
| Host | `src/index.ts`, `src/agent.ts`, `src/workspace-route.ts`, `src/native-hooks.ts` | `/story` files, preset Skills, write hooks. No commit decision. |
| Client | `src/client/`, `packages/client/ui-settings-story` | Workbench and the Zhuque credential reference. |

## Call paths

A long-chapter write goes through `workflows/chapter.js`. Prepare runs `project check`, `outline check`, `project context`, `project lookup` when settings are omitted, `project query` for health and due foreshadow, `chapter rules`, `project rhythm`, `project plan check`, and `chapter snapshot`. Write runs `chapter check`, then `facts extract` when the default claims file is missing. Review runs `chapter snapshot` and `chapter audit-verify`. Submit runs `chapter finish`.

`chapter finish` reads `writingGates`, verifies the default rule audit when `rule_audit` is `required`, diffs claims when that file exists, commits, records after a successful commit, reports stale facts, and attaches `book audit` when the chapter falls on the book's interval. A failed commit does not write the ledger. A failed record leaves the chapter.

`chapter check` reports outline readiness and quality. Quality includes `scanChapterQuality`. `project gates` echoes `writingGates`, ledger coverage, and the stale summary. `project check` reports the committed chapter, the revision, and `facts` gaps.

## Remaining structure

`rules.ts` still extracts rules and scans the manuscript in one file. `checks/ai-patterns.ts`, `settings-lookup.ts`, `memory.ts`, and `tracking/schema.ts` each mix a second job with the first. The three workflow scripts repeat shell quoting and the `off` / `required` reading. Each script is submitted whole, so a shared module would change the text the session runs. `src/client/activity.ts` still recognizes `storyctl.py` and `tracking_commit.py` so an old tool transcript refreshes the listing. Runners other than chapter and facts still return their exit code inline. Domain error names stay separate because the CLI selects exit 2 from `error.name`.

## Alternatives considered

**Split `rules.ts` and `ai-patterns.ts` in this change.** Extraction and the manuscript scan share file IO and the writing-check config. The pattern file is one matcher. Moving either without a new internal type module cycles the imports or edits the match. Both files stay.

**Fold the workflow scripts onto one helper.** The helper would change the script body the session submits. The six Skill names and the `lib/cli.js` call stay.

**One error class for every domain failure.** Exit 2 is selected from `error.name`. A rename changes that selection for the same failure.

**Move novel-rule checks into the Host route.** The route would start judging chapters. Judgment stays in the story core.

## Consequences

Callers of `dsh-story` see the same commands, documents, and exit codes. A missing gate key is still `required`. Old books still write `off` with `project migrate-gates --legacy-off`. Maintainers change a chapter stem or a symlink walk in one file. A new book-audit check is added in `audit-checks.ts` and listed on `BOOK_AUDIT_CHECKS`. UI settings packages are unchanged. These commands were not run in a real DSH browser and were not run with a real model.

## Verification

`pnpm --filter @winterhuan/dsh-story build` and `pnpm --filter @winterhuan/dsh-story test` cover the CLI, finish, gates, claims paths, and book audit. `pnpm run doc-sync` covers this note and the subsystem link.
