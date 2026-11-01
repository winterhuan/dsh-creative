# Agent Note: Chapter finish beside the ledger

Status: implemented
Archived: 2026-11-01

English | [中文](2026-10-25-story-chapter-finish.zh.md)

## Problem

A committed chapter and its fact ledger are two writes. The next chapter can start with no claims file, so there is nothing stable to diff. The [fact ledger note](2026-10-19-story-fact-ledger.md) keeps the entries in `追踪/事实账本.json`. Tracking schema 6 stores only a summary link.

## Decision

`facts extract` scans lines that start with one of the seven fact kinds. It writes `草稿/事实/第NNN章.claims.json` (`story-facts-claims/v1`) with both `claims` and `entries`. Prefixes are `VENUE-`, `INJ-`, `ACCT-`, `OBJ-`, `SKILL-`, `ERA-` and `ORD-`. Hand-written ids, including the regression account id `ACC-`, stay as written until extract runs again on that path. The first occurrence of an id wins. An empty list is a covered chapter. `--dry-run` does not write. The scan is not named-entity recognition and does not read `project lookup --reference`. `facts record` still requires a committed chapter and a matching body hash.

`chapter finish`, and `chapter commit --with-facts`, return `story-chapter-finish/v1`. When `rule_audit` is `required`, it verifies the default audit file. When a claims file exists, it diffs. It then commits. A failed commit does not record. After a successful commit with readable claims, it records, then reports stale. A failed record leaves the chapter in place and sets `facts_error`. The result includes `phase`, `rules_sha256`, `claims_present` and `gates`. It has no provider fields. Exit 0 means the chapter is committed and either has no claims or those claims were recorded. Exit 1 means it was not committed, claims were present but not recorded, or `facts_error` is set.

`project gates` echoes `rule_audit`, `facts_diff`, whether `style` is active, `streak`, covered chapters and the stale summary. A missing key is `required`. Write `off` to leave a commit unblocked. `project migrate-gates --legacy-off` writes `off` for an old book. The command does not write. The workbench overview can set either gate to `required` or `off` after confirmation. `project status` keeps its shape. `project check` returns `last_committed_chapter`, `state_revision`, and a `facts` gap. When the ledger file is absent, `facts stale` leaves `missing_chapters` empty and `project check` lists chapters that have a wordcount record. Tracking schema 6 stores the summary link. `project migrate` moves a file to schema 6. `project migrate --to 5` drops the link and does not delete the ledger or change `state_revision`.

`project context --profile lite` keeps the continuation card, the fact cap, `rules_path`, the first five due foreshadow rows, and at most four plan or rhythm signals. The full profile's `omitted` object stays the seven existing counts. A volume plan without a top `章节范围：`, or a unit block without one, is a hint. Span math is unchanged. Rhythm cards match a short list of exact heading aliases, or `--sections`. `cast check` adds hint `outline-cast` for a name on the outline list that has no card or alias, and hint `body-name` for a two- or three-character prose name. `cast_body_names` is `hint` when absent. Calibration lives in the artifact protocols as `草稿/审稿/_calibration.md`. `violate` and `unclear` are counted apart. A missing `rule_audit` is `required`. Write `off` when that calibration does not pass. Style drift stays a hint until `streak` chapters, default 3. `forbid_blank_lines` is blocking on that chapter. Re-apply `text style-baseline --apply` after a large change in body distribution.

The chapter and revise templates extract only when the claims file is missing, and submit with `chapter finish`. Option tables live in `src/cli/specs.ts`. Path guards and top-level dispatch stay in `src/cli/main.ts`. Family commands live in `src/cli/runners/`. The [Skill CLI sync](../process/2026-10-25-story-skill-cli-sync.md) owns the instruction that the six Skills teach this contract.

## Alternatives considered

**Store full ledger entries in tracking schema version 6.** Schema 6 stores only the summary link. Entries stay in the sidecar, so the Python tracking comparison does not absorb ledger rows. Commit and record remain two writes.

**Leave a missing gate as a silent `off`.** A missing `rule_audit` or `facts_diff` is `required`. A book with no claims file or no verified audit fails the next commit. Write `off`, or run `project migrate-gates --legacy-off` on an old book, to leave that commit unblocked.

**Add a third gate value.** `off` and `required` are the only modes. The overview writes one of those two values after confirmation. `project gates` stays read-only.

**Call a model to name characters, or copy reference hits into claims.** `cast check` uses the outline list, card aliases, and a body-name heuristic. `project lookup --reference` stays read-only unless `--record`. A recorded hit uses kind 对标 and does not enter `covered_chapters`. Extract does not copy those hits into claims.

**Turn a missing volume label into a blocking finding.** Old books that omit the top label would start failing plan check. The finding is a hint, and the span rule is unchanged.

**Move path guards into each runner.** Family commands live in `src/cli/runners/`. Option tables live in `src/cli/specs.ts`. Path checks and the top-level dispatch stay in `src/cli/main.ts`.

## Consequences

One finish result names the phase that stopped. A writer can leave an empty claims file so a later extract does not overwrite a hand edit. A book with no `设定/写作检查.json` has both gates `required`, so finish stops until the audit verifies and the claims file exists, or until the book writes `off`. The overview can write either value. These commands were not verified in a real DSH browser and were not run with a real model. The [fact ledger note](2026-10-19-story-fact-ledger.md) still owns the sidecar schema and the diff rules.

## Verification

`packages/creative/story/tests/facts.spec.ts` covers labeled extraction, stable ids, an empty file, and a dry run. `tests/chapter-finish.spec.ts` covers a recorded commit, a failed commit that leaves no ledger, a failed record that leaves the chapter, a finish with no claims file, a required diff that does not commit, a required audit that stops first, and a CLI finish that exits 1 while `project check` still returns `facts`. `tests/gates.spec.ts` expects a missing file to report `required`. `tests/context.spec.ts` expects the full `omitted` object and the lite profile. `tests/plan.spec.ts`, `tests/rhythm-card.spec.ts`, `tests/cast.spec.ts` and `tests/book-audit.spec.ts` cover the hint categories. The book-audit regression warn ids stay health, cast cards, reader value and void entries. `tests/chapter-workflow.spec.ts` and `tests/revise-workflow.spec.ts` expect `chapter finish` and `facts extract` in the templates.
