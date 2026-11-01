# Agent Note: Fact ledger beside tracking

Status: implemented
Archived: 2026-11-01

English | [中文](2026-10-19-story-fact-ledger.zh.md)

## Problem

A chapter can change a venue, an injury, an account, or an ability, and the next chapter still writes the old value. Tracking stores historical reader-value hashes that are not checked against the body. Putting the ledger rows in that file would move `requireKnownKeys`, the rendered views, and the Python byte comparison. Chapter rules can forbid a sentence, but they cannot tell a later claim from the value that was true at an earlier chapter.

## Decision

The ledger is `追踪/事实账本.json` with schema `story-facts/v1`. It is not a tracking-state field. Kinds are 场地, 伤情, 账目, 物件, 能力, 年代 and 指令. Each entry stores `source.body_sha256` of the chapter that introduced it. A later record with the same id appends `changes` and leaves the original `attrs` in place. `facts record` requires the chapter to be committed and the raw body hash to match `wordcount_records`. `facts diff` reports a conflict when the same id and attribute differ and no change for that chapter already stores the claimed value. An unknown id is `unmatched`, not a conflict. `facts stale` lists entries whose source chapter body or wordcount hash moved, and wordcount chapters absent from `covered_chapters`.

`project check` returns `last_committed_chapter`, `state_revision`, and a `facts` gap. A missing ledger chapter is also a `facts stale` row and a book-audit `facts-stale` hint. When the ledger file is absent, `facts stale` leaves `missing_chapters` empty and `project check` lists chapters that have a wordcount record. That leaves `tests/ts-port-parity-tracking.spec.ts` on the Python oracle for the tracking file. `facts_diff` follows `rule_audit`: a missing key is `required`. Write `off`, or run `project migrate-gates --legacy-off` on an old book, to leave a commit unblocked. Tracking schema 6 stores only a summary link. Entries stay in the sidecar. The [Skill CLI sync](../process/2026-10-25-story-skill-cli-sync.md) owns the instruction that Skills teach this.

`project context` adds `facts` (at most 2 KiB) after setting excerpts and before the health summary, then `volume` (at most 1.5 KiB). Trim order is settings, facts, volume, health, timeline, characters, due foreshadow. Prepare runs `project rhythm` from chapter N-8 through N+2 and `project plan check`. A payoff, promise, or blocking plan finding stops before prose. After a successful new commit, the chapter template runs `chapter finish`. That command records when a claims file exists and then reports stale. Extraction, the finish order, and the read-only gate echo are in [chapter finish](2026-10-25-story-chapter-finish.md).

`project rhythm` defaults to a small payoff at least every other chapter (`max_no_payoff` 1) and a peak of intensity 8 every 5 to 8 chapters. A book may replace those integers under `rhythm`. `project plan check` requires contiguous volume ranges. Within 10 chapters of a volume end, the next volume file must exist and its registration status must not still contain 「扩卷前核实」. `OUT-NNN-PAY` comes from the outline 爽点 field. `CANON-n` and `OWN-n` come from the volume headings 原著事实校正与改编边界 and 第一卷写作口径, and only when this chapter's outline or body mentions the chapter number or a two-to-four-character token in that item. `OWN-<单元ID>` comes from 兑现方式与归属. Missing headings do not warn.

`project lookup --reference` reads `拆文库/<主对标>/角色/`, `设定/`, and `剧情/剧情单元_*.md`. It skips `原文/`, names containing 章节摘要汇总, and files over 512 KiB. Hits use `source: reference` and are not book facts. The lookup is read-only unless `--record`. A recorded hit uses kind 对标 and does not enter `covered_chapters`. `analysis rhythm-card` writes at most 2 KiB under `拆文库/<书>/节奏卡/`. Default sections match a short list of exact heading aliases. When that card's chapter range covers the chapter being written, `volume` appends it.

Realm and ability stay `kind` 能力. `project cast check` compares those rows with `设定/世界观/力量体系.md` and compares `关系阶段：` with `阶段序：` on the card. Snapshot names without a card stay on book-audit `cast-cards`. Appearance counts a snapshot or card name of at least two characters that occurs in three or more chapter files. A name on the outline cast list without a card or alias is hint `outline-cast`. A two- or three-character prose name is hint `body-name`. `cast_body_names` is `hint` when absent, `off` to skip, or `blocking`. A one-character name and a bare `道` are not extracted. `text style-baseline` measures paragraph median, dashes, anadiplosis (the last 2–4 characters of a sentence matching the next sentence), a fixed metaphor list, and blank lines. Drift is a hint until the same metric exceeds the limit for `streak` chapters (default 3). Blank lines are blocking when `forbid_blank_lines` is set.

`project legacy archive --reader-value` moves `reader_value_records` to `追踪/_legacy/reader_value_records.json` and increments `state_revision` only when the field was present. `project context retire` removes one exact string from the current context lists without a chapter append, appends `追踪/维护记录.md`, and increments `state_revision`. A `mode=revision` transaction still resubmits the current context and does not retire items. `workflows/revise.js` is Locate, Plan, Rewrite, Audit, Submit. Plan returns `needs_input` when approval is still required. Submit uses `mode=revision` and `chapter finish`, which reports stale and records when a claims file exists. The order is in [chapter finish](2026-10-25-story-chapter-finish.md).

Book audit keeps pass, warn, fail, skip and the read-only default. `--issues` writes `story-issues/v1` to `草稿/问题单.json`. The [book audit note](2026-10-18-story-book-audit.md) still owns the report document. The [chapter rules note](2026-10-18-story-chapter-rules.md) still owns default extraction. The [rule audit note](2026-10-18-story-rule-audit.md) still owns per-rule verdicts. This note does not replace them.

## Alternatives considered

**Put full ledger entries in tracking schema version 6.** Schema 6 stores only the summary link. Entries stay in the sidecar, so `requireKnownKeys` on the ledger rows, the rendered views, and the Python byte comparison stay off that file. The cost is that commit and record are two writes. `facts stale` and `project check`'s `facts` name the gap.

**Replace `project check` with the ledger report.** Callers still read `last_committed_chapter` and `state_revision`. `facts` is an added object. `facts stale` keeps an empty gap when the ledger file is absent, so the tracking parity test does not grow a third progress field.

**Leave `facts_diff` off until each book opts in.** A missing key is `required`. A book with no claims file fails the next commit. Write `off`, or run `project migrate-gates --legacy-off` on an old book.

**Retire context only on the next append.** A voided line would stay in Prepare until some later chapter. `project context retire` removes it without pretending the retirement happened inside an older chapter's revision record.

**Extract every prose token for the cast check.** The deterministic check uses snapshot names, card stems, the outline cast list, and a two- or three-character heuristic. It does not call a model. Semantic ownership of a highlight stays with the rule verdict for `OWN-<单元ID>`.

## Consequences

A writer can record, query, diff and stale-check facts while the ledger rows stay out of the tracking file. Context can omit fact rows before it omits health rows. Rhythm and plan findings are hints or blocking plan rows, not tracking mutations. Reference hits stay out of the ledger unless `project lookup --reference --record` is passed, and those rows do not cover a chapter. Style blocking is a quality row on `chapter check`. Book audit reports that row on `style`. The audit chapter check does not repeat it. The commands were not verified in a real DSH browser and were not run with a real model.

## Verification

`packages/creative/story/tests/facts.spec.ts` reads `tests/fixtures/regression/R4.md`, `R5.md`, `R7.md`, `R8.md` and `R9.md`. Those files are one-line synthetic fields, not novel prose. R4, R7, R8 and R9 are diff conflicts. R5 is an ability token before `since`, visible to `chapter rules` as kind `skill`. The same file covers an appended change, an unknown id, a stale body, and a CLI record that exits 0 while diff exits 1. `tests/rhythm.spec.ts`, `tests/plan.spec.ts`, `tests/reference-lookup.spec.ts`, `tests/rhythm-card.spec.ts`, `tests/cast.spec.ts`, `tests/style-drift.spec.ts`, `tests/legacy.spec.ts` and `tests/revise-workflow.spec.ts` cover the other commands. `tests/book-audit.spec.ts` still expects the regression fixture to warn on health, cast cards, reader value and void entries, and to skip the new checks. `tests/context.spec.ts` expects `omitted.facts` and `omitted.volume`.
