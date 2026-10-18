---
description: "Novel creation mode with on-demand writing Skills and a Session-specific workbench."
kind: "package-bundle"
---

# @winterhuan/dsh-story

English | [中文](README.zh.md)

## Summary

Choose novel creation mode to write and review fiction with six Skills, seven specialist Roles and a dedicated editor. A read-only overview shows long-form progress, characters, foreshadowing and dual timelines. Opt into a native workflow for outline preparation, writing, independent review and guarded chapter submission. Drafts remain in the current DSH Session, and saves use observed file versions. Install this bundle independently.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Build the repository, then install the local bundle into a web profile:

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/story
```

Select **小说创作** (novel creation) for a new or blank Session, then open **story workbench** from the right sidebar. The entry and novel file redirects appear only in novel Sessions. Switching Sessions preserves each novel Session’s selected book, file and unsaved drafts. Story settings remain available globally; Zhuque secrets stay in the DSH credential store.

Long and short fiction both use `{workspace}/{book name}/`. Opening `shenji/` lists `神机诸天录` in Overview; long-form chapters belong in `神机诸天录/正文/`, while a short story can use `另一作品/正文.md`. The workspace itself is not a book, and `长篇/book/` or `短篇/book/` are not extra collection levels. If a book directory is open directly, switch to its parent workspace. Volumes inside a book remain recursive, and files and drafts retain full paths. Workspace-level `拆文库/` remains visible in Files but never appears in the book selector.

The six entries are `story` (project setup, existing novels, research and preferences), `story-write` (long and short fiction), `story-analyze` (analysis), `story-review` (review), `story-polish` (local editing and explicitly requested Zhuque detection) and `story-cover` (covers). Existing projects continue directly; raw-text intake does not require full-book analysis.

### Packaged CLI

Use the installed package’s absolute `lib/cli.js` path from DSH. This checkout provides:

```sh
node /Users/winter/dsh-creative/packages/creative/story/lib/cli.js --help
node /Users/winter/dsh-creative/packages/creative/story/lib/cli.js project status \
  --workspace /Users/winter/workspace/shenji --book 神机诸天录 --json
```

When installation exposes `dsh-story` on PATH, it is the equivalent command. `--help` lists project, outline, chapter, short-fiction, text, memory, analysis, export, lineage and detection operations. Each book operation requires an explicit workspace and direct-child book name. JSON results carry check findings and errors; text normalization writes only with `--apply`. CLI startup forwards input, output and cancellation, and does not call a model; the CLI is pure TypeScript and does not depend on Python.

### Continuity overview and queries

Overview shows committed chapters, current position, next-chapter commitments, risks and three recent summaries. The Risks card lists overdue foreshadowing, long-unscheduled foreshadowing, core characters whose last timeline touch is stale, and long-open threads; each row uses the existing source button. Expand characters to inspect their state and knowledge; filter foreshadowing by due, overdue, unscheduled or resolved status; switch timelines between author truth and reader knowledge. Sections support search and pagination, and source links open Files. Overview does not write book files, and switching views preserves editor drafts.

New workbenches open Overview; existing editing sessions retain Files. With no books, the interface offers workspace and creation guidance instead of using the workspace name as a book. Select among books with the book selector. Refresh, window focus and recognized chapter submissions reread state. Read failures retain the same book's prior content with a stale notice; missing state offers intake guidance and damaged formats show an error. Progress reflects committed tracking, not uncommitted drafts, file checks or current literary approval inferred from historical reviews.

Use `story` in Chat to query status, characters, foreshadowing or historical records. CLI entry points are `dsh-story project status`, `project query`, `project context`, which gathers the pre-writing context in one call, and `project lookup`, which reads `设定/` without writing. Queries include sources and revisions, return at most 50 entries within 16 KiB, and accept `--revision` to reject mixed-version pages. `project query --kind health` lists the Risks card's four kinds with the same paging. Defaults are 30 chapters since planting for an unscheduled hook, 20 chapters since a character's last timeline touch, and 40 chapters for an unrevealed fact or open thread; `--stale-planted`, `--stale-character` and `--stale-thread` change them. `project context` keeps at most eight of those rows inside the same 16 KiB budget, retains the counts when rows are omitted, and attaches at most four setting excerpts that match the outline or draft; excerpts are omitted before health rows when the budget is tight. Chapter preparation uses that summary, then still queries every due foreshadowing page, including entries absent from the eight-item continuation card. When setting excerpts are omitted, or another passage needs checking, use `project lookup`: `--file` points at an outline or draft, and `--text` passes a literal string. Exact names and aliases rank ahead of keyword scores. Declare aliases in the setting-file header. The author and writing workflow assess dates against the volume plan; queries do not postpone or resolve hooks. See [continuity queries](knowledge/story/skills/story/references/project/continuity-query.md) for commands.

`dsh-story chapter rules` lists the rules that apply to one chapter before a body exists. Each rule has a stable id, its text, and a source path and line. One result stays within 16 KiB. Extra rules, scan rows and warnings are counted in `omitted`, and `rules_sha256` covers the full list. Missing files and headings are warnings, and the command still succeeds. A book can replace the default sources and add `forbidden`, `era` and `void_terms` in `设定/写作检查.json`. The same sentence keeps the first id in `text` and later ids in `also`. The fields and ids are in the [artifact protocols](knowledge/story/skills/story-write/references/long/artifact-protocols.md).

`dsh-story book audit` reads one inclusive chapter range and returns `story-book-audit/v1`. Without `--write` it does not create files or change tracking. `--write` stores one Markdown report inside the book; the default path is `草稿/体检_第A-B章.md`. The path must be a `.md` file inside the book and outside `追踪/`, and a symlink is rejected. Exit 0 means no blocking finding. A check with hints and no blocking finding is `warn`, and `warn` still exits 0. Exit 1 means at least one blocking finding, and 2 means a bad argument or config. `--write` adds `report_path` to the JSON. The first checks reuse chapter quality, the health query, cast cards, reader-value hashes, and leftover void entries. A later check joins the same list. The fields are in the [artifact protocols](knowledge/story/skills/story-write/references/long/artifact-protocols.md#全书体检).

“Remember this book's writing style” uses existing book-scoped author memory and confirmation receipts; character, foreshadowing and event facts use chapter transactions. See [author memory](knowledge/story/skills/story/references/project/author-memory.md) for candidate decisions, replacement, withdrawal and precedence.

<a id="specialist-agents"></a>
### Specialist Agents

Use the visible native `subagent` tool for independent specialists. Its task names the professional identity, absolute Role file and resource root; the actual child reads those instructions with native `read`. When the user explicitly requests Agent Teams, use `spawn_teammate` and reuse the member through `send_message`. See the [delegation guide](knowledge/story/skills/story-write/references/delegation.md). Roles are not separate tools or Skills; reading one in the caller does not create an independent reviewer.

### Native chapter workflow

Ask `story-write` to use the native workflow for a new long-form chapter, or state that preference for future chapters. The parent supplies the project, chapter and constraints, then loads the template through the [invocation guide](knowledge/story/skills/story-write/references/long/native-workflow.md). Within DSH's existing `workflow` tool, Prepare checks or creates the chapter outline within the authorized plan, runs `chapter rules`, and builds a scene plan. The writer receives each rule as `id: text`. When `also` is non-empty, that line appends ` also: ` and the other ids. The writer follows those lines and cites the ids in its summary. Writing, independent review, at most two revision passes and verified tracking submission follow. Existing ready outlines are reused; routine preparation needs no further approval unless requested. Missing facts or required author decisions stop dependent work. Continuous chapters run serially and retain drafts with unresolved findings.

Review returns a small routing recommendation within this workflow. Ordinary review stays prose. Submission checks the reviewed body and outline hashes plus the expected tracking revision; stale files require another check and review. No review certificate is added to tracking. Native run completion can contain a non-committed chapter outcome, so callers inspect the returned status before advancing. A successful new commit of chapter 10, 20, and so on also returns `book_audit_hint`. The template does not run `book audit`.

### Multi-chapter analysis

For an opening, one chapter, or a local question, `story-analyze` reads the source and answers. It writes a file only when requested. For several chapters or a whole book, the parent confirms one chapter-boundary table in `拆文库/<书名>/_progress.md`, uses `analysis inspect` to capture source identity and existing cards, and loads the Skill-local template through the [batch guide](knowledge/story/skills/story-analyze/references/long/native-workflow.md). Each native workflow extracts at most four chapter cards and reports failed or skipped chapters. The parent passes the results to `analysis write-cards`, which validates source identity and chapter evidence, renders Markdown and saves the cards. Existing cards require explicit replacement; source changes reject stale extraction, and retries preserve successful cards. After the cards exist, the parent writes `剧情/节奏.md`, `剧情/情绪模块.md`, `文风.md`, and `拆文报告.md` from at most ten volume segments, reading the source and short cards. Short-fiction analysis does not use this template.

<a id="understand-the-implementation"></a>
## Understand the implementation

Ownership and trust boundaries: [Story subsystem](../../../docs/subsystems/story.md).

From the repository root, run `pnpm --filter @winterhuan/dsh-story build` to build this package and `pnpm --filter @winterhuan/dsh-story test` to test it.

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) registers the `story` preset without changing the default. Its `/agent` entry owns scoped Skills, tools and writing hooks. The Host entry owns the file API and credential configuration, while the client follows the selected Session’s preset projection. The preset supplies filesystem, shell, search, jobs, Skills, native delegation and workflow tools, with isolated compaction and workflow services. The Zhuque key lives in the `story` settings namespace; the default credential reference is `MAKERS_API_KEY`. Stored keys form a pool that reaches the detector on stdin: a key Zhuque rejects advances to the next one, other failures end detection, and at most 16 keys are tried. `editorMaxBytes` defaults to 2097152; `trustedHosts` extends the default loopback authority list. The `/story` API limits document access to this domain's project paths.

The writing guards and specialist Roles belong to this package. Explicitly requested Zhuque detection sends the selected chapter to Tencent EdgeOne Makers; it receives only the configured MAKERS_API_KEY pool.

This package is developed, built and installed independently; required helper scripts ship as package resources without a dependency on another domain plugin.

Each Skill owns its `references/`; specialist Roles live under the owning Skill’s `references/roles/`. `story-write` and `story-analyze` each own their workflow template. Skill Viewer discovers and previews these local references directly. The package’s `lib/cli.js` is the TypeScript CLI itself (bundled from `src/cli/`); internal modules under `src/core/` retain the existing tracking transactions and shared chapter-path and word-target parser. The fiction workspace response carries an independent book catalog, a file listing capped at 1,000 entries, and file truncation status. Book discovery checks standard directories or standalone documents in each direct child and continues after the file limit; Overview reads the selected book’s tracking directly. If a running host omits the catalog, the client derives book names from its file listing until the host restarts. Transaction writers use a `追踪/.tracking-commit.lock/` directory lock: the holder records its PID and the directory is removed when the commit finishes; a dead or older-than-one-minute lock is reclaimed, and waiting fails after ten seconds. After an interrupted write, retry the original transaction before checking derived views.

</details>

<a id="model-experience"></a>
## Model Experience

### Domain skills and execution

#### What the model sees

The novel preset supplies a novelist persona that distinguishes discussion, review and authorized manuscript work. Its domain catalog lists six Skills; other presets do not receive the novel catalog, tools or writing hooks. Loading supplies instructions and resource paths to the current Agent. The selected Skill or workflow assigns task order and checks; Roles supply professional methods. The post-write hook requests fresh checks and review, then tracking updates by the assigned submitter through the chapter transaction. Only the parent reads the invocation guide; children receive stage duties and selected references. Prepare returns actual paths, a scene plan, the chapter rule list and checked outline identity; writers receive these with complete check commands and follow each rule id. Workflow children finish with `structured_output`; missing results direct the parent to the failed child's Session. Delegation failures preserve partial work and report diagnostics; provider authentication or endpoint errors require provider repair. Prerequisite delegations must finish and their artifacts pass checks before work advances. Read-only `story-explorer` returns facts, sources and gaps in prose. `story_zhuque` invokes the packaged detection CLI; background execution returns a DSH job ID for `job_output` and `job_kill`.

#### Token effect

Skill bodies and specialist instructions load on demand. No custom Role tool schema or complete expert library enters the initial catalog. Each continuity response is bounded to 16 KiB and returns a next-page offset when entry or byte limits apply. The health summary shares that budget. Setting lookup is a separate call, also capped at 16 KiB. `chapter rules` is another read-only call with the same cap. `book audit` reads a chapter range; `--write` adds one Markdown report and is not part of the default chapter path. The native template only names that command after a successful commit of chapter 10, 20, and so on. Pre-writing context places at most four setting excerpts in that same bundle and omits those excerpts first. Numerous due hooks require additional pages before writing and cannot be silently omitted. Reading and submitting the workflow template retains its source twice, and independent children also read their instructions and sources, so this path can cost more than direct delegation. Query capacity is not a provider token charge or an end-to-end efficiency guarantee.

#### KV Cache effect

The plugin uses DSH tool and Skill history. It does not rewrite previous messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Existing conversations retain their preset; continue the same book in a new novel Session. Drafts in an existing non-novel Session remain stored but have no novel workbench entry. The preset explicitly lists its tools and must be checked when upgrading DSH.
- Native Team tools require an explicitly enabled Team composition and persistent Sessions. Specialist instructions enter task context, not a plugin-owned system persona. Review returns ordinary findings; chapter scripts validate mechanical conditions, not literary approval or reviewer model metadata.
- The CLI requires Node only. Paid services require creator authorization and configured credentials. Independent sidebars own their state; old aggregate drafts are not migrated.
- The novel preset supplies `workflow` with structured child output for the native chapter template. It handles new long-form chapters and their uncommitted drafts; committed-chapter revisions use the existing revision path. Template reuse and review-only duties follow instructions, not Host enforcement or a separate reviewer permission policy. Cancellation retains artifacts; recovery inspects real files and tracking rather than resuming an old script stack. File guards do not isolate arbitrary external writers.
- Overview reads state through the existing file API and its `editorMaxBytes` limit. Large lists paginate in the interface without another database or server. It validates displayed fields; full tracking inspection still uses `dsh-story project check`. Historical queries return existing chapter records rather than reconstructing complete world state at any chapter; inspect prose and missing records separately.
- Character snapshots have no update chapter. The health query and the Risks card use the newest timeline `updated_chapter` among events that name the character, and they skip a character with no such event. Health is TypeScript only and is not part of the Python oracle under `tests/reference/`.
- Setting lookup reads Markdown under `设定/` through `project lookup`. Aliases are taken only from header front matter and from `别名：` lines in the first 40 lines, before the first second-level heading. It does not change tracking state and has no workbench entry. The implementation is TypeScript only and is not part of the Python oracle.
- `chapter rules` is TypeScript only and is not part of the Python oracle under `tests/reference/`. `tests/reference/normalize-punctuation.js` still accepts only a `punctuation` key. Stock templates omit some default headings, so those books report warnings until the heading exists or `rule_sources` replaces the defaults. This command was not verified in a real DSH browser and was not run with a real model.
- `book audit` is TypeScript only and is not part of the Python oracle under `tests/reference/`. Hints do not fail the command. A check with only hints is `warn`. The Markdown report groups those hints and prints the first eight characters of a hash. Fact-ledger, pacing, character-arc and style checks are not in the first list. This command was not verified in a real DSH browser and was not run with a real model.
- The runtime migration from Python and JavaScript to TypeScript is complete: the CLI and every deterministic operation are TypeScript, and the package no longer ships `runtime/`. The former implementations live on in `tests/reference/` as differential-test oracles; `tests/ts-port-parity*.spec.ts` compares both on identical inputs, and parity remains the compatibility authority.

<a id="dev-note"></a>
### Dev Note

DSH’s fixed-density token-meter estimate for the `story_zhuque` input schema is 249 tokens, versus 226 before named book/file parameters; with other first-turn content held constant, the estimated increase is 23 tokens. This is a schema estimate, not provider tokenization. No separate common runtime package is introduced.

The novel persona text estimates to 298 tokens at four characters per token, versus 14 for the standard preset persona, before variable interpolation. This compares persona text only; tool composition and loaded Skills also affect the first request.
