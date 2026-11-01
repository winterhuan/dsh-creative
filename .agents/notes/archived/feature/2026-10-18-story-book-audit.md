# Agent Note: Book audit over a chapter range

Status: implemented
Archived: 2026-11-01

English | [中文](2026-10-18-story-book-audit.zh.md)

## Problem

A writer can pass every single-chapter check and still carry a stale reader-value hash, a character snapshot with no card, or a voided constraint into the next ten chapters. `chapter check` and `project query --kind health` each answer one question. Nothing lists those results for a chosen range, and nothing tells the parent session when a tenth chapter has just landed.

## Decision

`book audit` returns `story-book-audit/v1` for an inclusive range. Without `--write` it reads only. `--write` stores one Markdown report inside the book, defaulting to `草稿/体检_第A-B章.md`, rejects a path that leaves the book, enters `追踪/`, or uses a symlink, and adds `report_path` to the JSON. Exit 0 means no blocking finding, 1 means at least one, and 2 means a bad argument or an invalid tracking or writing-check file. A check is `fail` when it has a blocking finding, `warn` when it has only hints, `pass` when it ran clean, and `skip` when it cannot run. `warn` still exits 0, and `counts` includes `warn`. Findings sort by severity, check, chapter, source path, numeric source line, category, then message.

Checks implement one interface and run from `BOOK_AUDIT_CHECKS`. The first five are `chapter`, `health`, `cast-cards`, `reader-value-stale`, and `void-entries`. `chapter` calls `checkBlockingQuality` on each body and drops void-term rows so `void-entries` reports them once. A missing body is a hint. A missing outline skips the copy comparison. `health` calls `assessHealth` with `--to` as the reference chapter and the default thresholds; those rows stay hints. `cast-cards` matches a snapshot name to a file stem or a declared alias under `设定/角色/`. `reader-value-stale` compares a stored `body_sha256` with the SHA-256 of the current body bytes and with `wordcount_records`, and emits one finding per record. The message names the sides that disagree, and `evidence` keeps the full hashes. The Markdown report shortens a 64-character hash to eight characters and groups hints that share a chapter, category and message. `void-entries` uses the `void:<field>[index]:term` id from [chapter rules](2026-10-18-story-chapter-rules.md), and also reports a foreshadow whose status is already `放弃` or `作废`. Tracking schema stays version 5. `reader_value_records` stays an unvalidated historical field.

After a successful new commit, the native chapter template adds `book_audit_hint` when the chapter number is a multiple of 10. The hint names `book audit --from N-9 --to N`. The template does not run the command. A verify-only pass on an already committed chapter omits the field. Per-rule review of one chapter is [rule audit](2026-10-18-story-rule-audit.md). This command stays a range report.

The [chapter-rules decision](2026-10-18-story-chapter-rules.md) still owns extraction, scan severity, and the `also` field. The [reader-value decision](2026-09-22-novel-reader-value-generation.md) still owns why that field is historical. The [native workflow decision](2026-10-03-story-native-workflow.md) still owns stage order outside the audit child. None of those records is fully superseded.

## Alternatives considered

**Run the audit inside the workflow.** The parent chooses when a range scan is worth the files it reads. The template only names the command.

**Fold the book checks into every `chapter check`.** Cast cards, leftover void entries, and a stale hash are book-level. Repeating them on every chapter would hide the range.

**Keep `also` inside `text`.** The writer line can still show the other ids. `text` has to stay the source sentence. `rules_sha256` still hashes the appended form.

**Store the report in tracking schema.** The report is not state. Schema version stays 5, and `--write` is one Markdown file.

**Print every hint as its own Markdown line.** A range repeats the same punctuation note on many lines, and sorting those notes by message text put line 27 before line 3. The Markdown groups rows that share a chapter, category and message, and sorts line numbers numerically. JSON keeps one finding per row.

**Count each hash mismatch separately.** One chapter can disagree with both the body and the wordcount record. The summary counts records, and one message names the sides that disagree.

## Consequences

A parent session can audit a range without changing state. Hints do not fail the command, so a `warn` exit can still list stale hashes and missing cards. The Markdown grouping hides per-line rows that the JSON still lists. `BOOK_AUDIT_CHECKS` also runs `facts-stale`, `rhythm`, `plan`, `cast-limits` and `style`. Those checks skip when the book has no ledger, promise table, volume plan, power table or `style` key. `--issues` writes `草稿/问题单.json`; the default audit stays read-only. The ledger file and its gates are in the [fact ledger note](2026-10-19-story-fact-ledger.md). A bad `--write` path exits 2 before the audit runs. The command was not verified in a real DSH browser and was not run with a real model.

## Verification

Synthetic fixtures under `packages/creative/story/tests/fixtures/regression/book-audit/` cover the missing card, one stale reader-value record against both hashes, void terms, an abandoned foreshadow, a missing body, a read-only tree hash, `--write` path limits, `report_path`, numeric line order, grouped Markdown hints, exit codes, and stable output. `SHENJI_BOOK` runs a read-only smoke from chapter 1 to 12 when set and skips when unset. The smoke passes a filesystem path to the process. No novel prose is in the fixtures. Repository typecheck, build, full tests and documentation checks cover the package.
