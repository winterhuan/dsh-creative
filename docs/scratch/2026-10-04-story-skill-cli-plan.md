---
description: "Implemented skill-local references and packaged CLI in the existing dsh-story plugin."
status: implemented
updated: 2026-10-04
---

# dsh-story skill resources and CLI plan

English | [中文](2026-10-04-story-skill-cli-plan.zh.md)

## Summary

The six story Skills own local references and route deterministic work through one packaged `dsh-story` CLI. Native DSH workflows retain model collaboration; tracking, author memory and the read-only dashboard retain their existing data. Plugin resources and execution entry points have changed without moving authors’ books or changing persisted story schemas. This plan is implemented; the [package guide](../../packages/creative/story/README.md) owns current usage.

## Table of Contents

- [Problem](#problem)
- [Proposal](#proposal)
- [Implementation order](#implementation)
- [Alternatives considered](#alternatives)
- [Acceptance criteria](#acceptance)
- [Risks](#risks)

<a id="problem"></a>
## Problem

Before implementation, the audited package contained 162 shared references, 15 scripts, two workflow templates and seven professional Role files. The six skills used their own directory as `resourceBase` and reach shared resources through `../../`. The [resource provider](../../packages/creative/story/src/skill-provider.ts) and [reference viewer](../../packages/skill/skill-viewer/src/references.ts) disagree about discovery: the viewer scans only a skill-local `references/`. Calling the current discovery function returned zero references for all six skills.

The audit also identified conflicting consumer rules. Short-form checks default to the current directory, while the Session stays at the workspace. Genre cards prohibit punctuation that the format guide permits. Analysis templates still prescribe obsolete stages and quotas. The previous [analysis workflow](../../packages/creative/story/knowledge/story/skills/story-analyze/workflows/analyze-batch.js) rejects a factual one-event card, starts a second model solely to render Markdown, and relies on its reported output path and byte count before parent verification. The previous [chapter workflow](../../packages/creative/story/knowledge/story/skills/story-write/workflows/chapter.js) asks the reviewer to write Python imports for source identity checks.

<a id="proposal"></a>
## Proposal

Keep the existing `@winterhuan/dsh-story` package and six skill names. Skills own task instructions and interpretation; the CLI owns deterministic validation and mutations; workflows own stage order and handoffs. Native tools still read and write manuscript, outline and setting content. The CLI does not generate fiction or certify literary quality.

### Skill-local references

Remove the plugin-wide `knowledge/story/references/` after its consumers migrate. Each skill loads only its own `references/`, using paths relative to its `SKILL.md`. Switching tasks loads the destination skill explicitly; references do not traverse sibling skill directories. This fits the existing viewer without broadening its filesystem access.

| Skill | Reference ownership |
|---|---|
| `story` | Intake, project preparation, research, status/query guidance, author preferences and export/lineage |
| `story-write` | Long/short planning and writing, revision, format, genre craft, benchmark use and chapter submission |
| `story-analyze` | Long/short analysis methods, source evidence, output examples and batch recovery |
| `story-review` | Review procedure, platform rubrics, character/continuity checks and source identity comparison |
| `story-polish` | Expression diagnosis, local revision, detector interpretation and reporting |
| `story-cover` | Visual styles, generation guidance, dimensions and acceptance |

Split the 66 `agent-references` files by their actual use. Keep creation methods with writing, source-analysis methods with analysis, and quality criteria with review. Preserve useful genre differences and remove obsolete duplicate rules. Where tasks use the same concept differently, write a short task-specific explanation rather than copying a whole manual. CLI help owns command parameters; local references explain when to use a command and how to interpret its result.

Move Role instructions into the owning skill’s `references/roles/`: explorer/researcher to `story`, architect/character-designer/narrative-writer to `story-write`, chapter-extractor to `story-analyze`, and consistency-checker to `story-review`. Delegated tasks name their skill and provide the necessary local reference paths. Remove Role assumptions about a shared library and move task-specific sections to their relevant owner.

The author workspace remains `{workspace}/{book}/` for both long and short fiction. Workspace `拆文库/` holds source analysis and `.story/作者记忆/` holds preferences. These are author data, not packaged references, and stay shared at workspace level. Querying author preferences during writing uses the CLI directly; it does not require loading the project skill’s full reference set.

### One packaged CLI

Expose `dsh-story` through this package’s `bin`, backed by a thin Node launcher and the existing Python dispatcher extended from `storyctl.py`. Keep the tested Python and JavaScript modules in one package-private `runtime/` directory, preserving their internal imports. The Node launcher passes argument arrays and inherited streams/signals without shell interpolation. Add its explicit build entry and package files; keep existing Node/Python prerequisites.

In DSH, invoke the packaged launcher by an absolute path derived from the installed skill location: `node <package-root>/lib/cli.js ...`. The `dsh-story` bin is the equivalent terminal entry when installed on PATH. Plugin linking does not guarantee that a user’s workspace shell exposes the bin; no global install or network download is required. Skills and workflow tasks receive the executable path rather than guessing another checkout.

The following command families are the proposed public surface. Existing validation algorithms remain internal; the names do not imply a rewrite of those algorithms.

| Command family | Responsibility and existing implementation |
|---|---|
| `project init/status/query/check` | Minimal book preparation, continuity queries and full tracking checks; `storyctl`, `project_query`, `tracking_commit` |
| `outline check` | Long-form outline readiness; `check_outline_contract` |
| `chapter check/snapshot/commit/accept-current-length` | Chapter checks, new lightweight source identity, guarded submission and exact-draft length acceptance |
| `short plan-check/delivery-check` | Short-form outline and whole-work delivery checks; the two existing short-form validators |
| `text count/check/normalize` | Word count, degeneration, expression, outline-copy and punctuation checks; normalization requires an explicit apply option |
| `memory init/query/record/commit/check` | Workspace author preferences and existing receipts; `author_memory_commit` |
| `analysis inspect/write-cards` | New bounded batch inspection and deterministic card validation/rendering/write |
| `export txt` / `lineage record` | Existing novel export, chapter mapping and workspace lineage |
| `detect zhuque` | Existing external detector with environment credentials |

Project-scoped commands require `--workspace` and a single-component `--book`; they do not default to `.` or search parents. Validate the selected book as an immediate child, including canonical path containment, and reject workspace roots, category containers and shared analysis as books. New-book initialization validates the parent before creating anything and preserves existing files. Long-form tracking initialization consumes explicit prepared input; short-form initialization does not create long-form tracking.

Memory and lineage use workspace scope. Analysis uses workspace plus source title and may read an explicitly supplied external source; its outputs belong under `拆文库/{source-title}/`. Export supports an explicitly chosen destination. Text-only utilities may read explicit files without pretending they are projects. CLI validation checks supplied paths; the DSH Session and sandbox remain the authority for access permissions.

Provide task-specific `--help` and stable `--json` results. Use stdout for results and stderr for diagnostics; distinguish success, failed checks, invalid inputs and execution failures with documented exit codes and error codes. Preserve revisions, hashes, source paths, query paging and size bounds, and exact receipt semantics. Queries, snapshots and ordinary checks perform no writes or initialization. Interrupted or uncertain commits require state inspection before a retry.

Keep `story_zhuque` as the DSH credential adapter, invoking this same CLI with the resolved secret in the child environment. The CLI does not open DSH’s credential store or put keys in arguments. Direct terminal detection uses an explicitly supplied environment credential. Ordinary polishing stays local; detection still requires the user’s request. This adapter owns secret injection and cancellation, not a second detector implementation.

### Workflow integration

Move `chapter.js` to `story-write/workflows/` and `analyze-batch.js` to `story-analyze/workflows/`. Parent skills load their own template and invoke native DSH `workflow`. Child stages load the appropriate skill and receive the CLI path, workspace, book/source scope and user constraints. The current workflow runtime exposes orchestration helpers, not a general filesystem API; file operations remain with native tools and the CLI.

Chapter execution stays Prepare → Write → Review → bounded Revise → Commit/Verify. Replace direct script calls and model-written imports with CLI commands. Review calls `chapter snapshot` before and after reading; commit independently rechecks the reviewed identity under the existing transaction lock. Preserve complete due-hook paging, draft recovery, exact-version length acceptance and serial progression between chapters. If preparation evidence must be shown during execution, use native progress reporting; do not promise a parent turn between uninterrupted stages.

Analysis uses a three-step batch: the parent calls `analysis inspect` for up to four selected chapter ranges and existing outputs; the workflow extracts bounded structured cards; the parent calls `analysis write-cards` to validate, render and write them. Eliminate the model that only formats JSON. Preserve independent chapter failures, explicit replacement, existing-file protection and actual output verification. Reject stale source identities before writing. Cards reflect actual event/anchor counts, including zero where supported by the source, with size upper bounds and evidence locations instead of invented minimum quotas.

Keep chapter writing, review, polishing and cover generation as model tasks. Add no workflow engine, automatic multi-chapter parallel writing, persistent run registry or duplicate story state. The existing read-only dashboard keeps its read-only data path; CLI adoption is for model execution and does not require every browser refresh to launch a process.

### Target package layout

```text
packages/creative/story/
  src/cli.ts
  lib/cli.js
  runtime/                  # internal Python/JavaScript modules
  knowledge/story/skills/
    story/{SKILL.md,references/}
    story-write/{SKILL.md,references/,workflows/chapter.js}
    story-analyze/{SKILL.md,references/,workflows/analyze-batch.js}
    story-review/{SKILL.md,references/}
    story-polish/{SKILL.md,references/}
    story-cover/{SKILL.md,references/}
```

<a id="implementation"></a>
## Implementation order

Each phase ends with runnable checks. Keep the old resource paths until all live consumers have moved, then remove them in the same release. Do not maintain a second editable reference tree or long-lived forwarding scripts.

| Phase | Work | Exit evidence |
|---|---|---|
| 1. Inventory | Assign every reference/Role/template an owner; trace skill, workflow, Host, test, package and copied-script consumers | A reviewed old-path → owner/move/delete map with unique content preserved |
| 2. CLI | Add the packaged launcher and dispatcher, reuse current scripts, implement scope checks and snapshot/card commands | Built launcher and bin tests cover real file effects, errors and cancellation |
| 3. Local skills | Move references and Roles; repair conflicting rules; replace script instructions with CLI usage | Six skills resolve local references and display them in the viewer |
| 4. Workflows | Relocate templates, use CLI snapshots/commits, replace analysis rendering Agent with parent CLI write | Native chapter recovery and batch partial-failure flows pass |
| 5. Package and install | Move private modules to runtime, remove retired paths, update copied-script synchronization and documentation, verify local linked and packed installation | Package contains all resources; real DSH browser and runtime checks pass |

The export and lineage modules also have consumers in short-drama, video-recap and novel-to-game. Update the existing synchronization script, including its missing game target, so each plugin remains independently installable. These copied implementation files do not reintroduce shared skill references. Update current owning documentation and tests; leave upstream and historical archived notes untouched.

<a id="alternatives"></a>
## Alternatives considered

- Keeping shared references and teaching the viewer to read them leaves the cross-skill loading dependency in place; local ownership directly satisfies the requested direction.
- Copying all 162 references into every skill restores local paths but multiplies conflicting rules. Migrate by task and retain only necessary local explanations.
- Rewriting all Python in TypeScript adds transaction and counting risk without being necessary for a CLI. Reuse proven internals behind the new entry point.
- A new CLI package, custom Agent runtime or model tool for each check adds installation and discovery work. Keep one CLI inside the existing plugin and retain the narrow credential adapter.

<a id="acceptance"></a>
## Acceptance criteria

Use temporary projects and the built package. Scripted models verify execution and isolation; they do not demonstrate literary quality across hundreds of chapters.

- All six skills discover and preview their local references in real DSH. Live skill/Role/workflow instructions contain no retired shared-reference path or direct private-script invocation; referenced resources exist in the packed package.
- Long and short works use immediate named children. Missing book arguments, workspace-root books, collection layouts, analysis-as-book and escaping paths fail before mutation. Two books with the same chapter filename remain isolated.
- The CLI preserves tracking revisions, receipts, source hashes, due-hook pagination and reader/author information separation. Read-only queries/checks create no files, directories or runtime caches inside the project.
- Review detects body, outline or revision changes through snapshots. Submission rejects stale identities and retains lock-protected checks; cancelling work preserves actual artifacts and does not falsely report completion.
- Batch analysis accepts source-supported sparse cards, preserves successful chapters on partial failure, never overwrites existing output without explicit replacement, and reports only verified writes. Re-running after interruption does not duplicate completed output.
- Standalone and aggregate installs resolve the same built CLI without workspace PATH assumptions. Missing Python/Node and invalid arguments produce actionable failures. Secret values never appear in command arguments or logs; Zhuque tests use a fake endpoint.
- During implementation run focused tests, then required typecheck/build/test before committing; validate docs, packed resources, source-tool copies and real DSH reference browsing. Check existing book and memory files byte-for-byte across the resource migration.

<a id="risks"></a>
## Risks

Local references can drift if whole manuals are duplicated; keep each task’s method concise and let CLI implementation/help own deterministic rules. Moving private scripts can break imports, Host detection and copied installers; move their consumers atomically and test the built package. A Node → Python → Node chain needs cancellation and exit propagation tests. Active conversations may retain old resource paths, so finish active workflows before switching the installed build and reload affected skills afterwards. No automatic manuscript or tracking migration is part of this plan.

## Dev Note

Implementation verification: typecheck and build pass; the full suite passes 757 tests across 75 files. Targeted strict TypeScript checks cover the changed runtime-facing tests. CLI checks exercise relocation, missing Python, cancellation, stale submission and read-only queries. The packed plugin contains its launcher, runtime, 162 local references and two templates; its installed bin reads the real book successfully. Real DSH browses all six reference lists and previews; the shenji workspace lists only 神机诸天录, with no story writes and an unchanged tracking hash. Local Creative resolves this checkout’s story CLI. Browser evidence and installation details are recorded in [HANDOFF.md](../../HANDOFF.md). Scripted models test execution; long-run literary consistency and paid detection remain outside this verification.
