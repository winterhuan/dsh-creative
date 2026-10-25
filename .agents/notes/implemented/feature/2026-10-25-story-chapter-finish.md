# Agent Note: Chapter finish beside the ledger

Status: implemented

English | [中文](2026-10-25-story-chapter-finish.zh.md)

## Problem

A committed chapter and its fact ledger are two writes. The next chapter can start with no claims file, so there is nothing stable to diff. The [fact ledger note](2026-10-19-story-fact-ledger.md) already keeps the ledger beside tracking schema version 5. A second schema field, or a default `required` gate, would either bump that schema or fail books that have no ledger.

## Decision

`facts extract` scans lines that start with one of the seven fact kinds. It writes `草稿/事实/第NNN章.claims.json` (`story-facts-claims/v1`) with both `claims` and `entries`. Prefixes are `VENUE-`, `INJ-`, `ACCT-`, `OBJ-`, `SKILL-`, `ERA-` and `ORD-`. Hand-written ids, including the regression account id `ACC-`, stay as written until extract runs again on that path. The first occurrence of an id wins. An empty list is a covered chapter. `--dry-run` does not write. The scan is not named-entity recognition and does not read `project lookup --reference`. `facts record` still requires a committed chapter and a matching body hash.

`chapter finish`, and `chapter commit --with-facts`, return `story-chapter-finish/v1`. When `rule_audit` is `required`, it verifies the default audit file. When a claims file exists, it diffs. It then commits. A failed commit does not record. After a successful commit with readable claims, it records, then reports stale. A failed record leaves the chapter in place and sets `facts_error`. The result includes `phase`, `rules_sha256`, `claims_present` and `gates`. It has no provider fields. Exit 0 means the chapter is committed and either has no claims or those claims were recorded. Exit 1 means it was not committed, claims were present but not recorded, or `facts_error` is set.

`project gates` echoes `rule_audit`, `facts_diff`, whether `style` is active, `streak`, covered chapters and the stale summary. A missing key is `off`. The command does not write. There is no workbench control that sets a gate to `required`. `project status` keeps its shape. `project check` stays `{ last_committed_chapter, state_revision }`. Tracking stays schema version 5.

`project context --profile lite` keeps the continuation card, the fact cap, `rules_path`, the first five due foreshadow rows, and at most four plan or rhythm signals. The full profile's `omitted` object stays the seven existing counts. A volume plan without a top `章节范围：`, or a unit block without one, is a hint. Span math is unchanged. Rhythm cards match a short list of exact heading aliases, or `--sections`. `cast check` adds hint `outline-cast` for a name on the outline list that has no card or alias. Calibration lives in the artifact protocols as `草稿/审稿/_calibration.md`. `violate` and `unclear` are counted apart. `rule_audit` stays `off` until that calibration passes. Style drift stays a hint until `streak` chapters, default 3. `forbid_blank_lines` is blocking on that chapter. Re-apply `text style-baseline --apply` after a large change in body distribution.

The chapter and revise templates extract only when the claims file is missing, and submit with `chapter finish`. Option tables live in `src/cli/specs.ts`. Command dispatch stays in `src/cli/main.ts`.

## Alternatives considered

**Store claims in tracking schema version 6.** The Python tracking comparison and `project check` would move. The sidecar ledger already exists for that reason.

**Default `facts_diff` and `rule_audit` to `required`.** A book with no claims file or no calibration would fail the next commit. Both gates stay `off` until that book sets `required`.

**Add a third gate value, or a workbench button that sets `required`.** `off` and `required` are the only modes. A dashboard toggle would need another file read and a real DSH session. `project gates` is the read-only surface.

**Recognize names in prose, or copy reference hits into the ledger.** The cast hint uses the outline list and card aliases. Reference hits stay `source: reference`.

**Turn a missing volume label into a blocking finding.** Old books that omit the top label would start failing plan check. The finding is a hint, and the span rule is unchanged.

**Split `main.ts` into one runner per command family.** The option tables are the part that grew. Path checks and dispatch stay next to the book path they close over.

## Consequences

One finish result names the phase that stopped. A writer can leave an empty claims file so a later extract does not overwrite a hand edit. Books without `设定/写作检查.json` still commit. The workbench does not show the gate line. These commands were not verified in a real DSH browser and were not run with a real model. The [fact ledger note](2026-10-19-story-fact-ledger.md) still owns the sidecar schema and the diff rules.

## Verification

`packages/creative/story/tests/facts.spec.ts` covers labeled extraction, stable ids, an empty file, and a dry run. `tests/chapter-finish.spec.ts` covers a recorded commit, a failed commit that leaves no ledger, a failed record that leaves the chapter, a finish with no claims file, a required diff that does not commit, a required audit that stops first, and a CLI finish that exits 1 while `project check` stays two fields. `tests/gates.spec.ts` expects a missing file to report `off`. `tests/context.spec.ts` expects the full `omitted` object and the lite profile. `tests/plan.spec.ts`, `tests/rhythm-card.spec.ts`, `tests/cast.spec.ts` and `tests/book-audit.spec.ts` cover the hint categories. The book-audit regression warn ids stay health, cast cards, reader value and void entries. `tests/chapter-workflow.spec.ts` and `tests/revise-workflow.spec.ts` expect `chapter finish` and `facts extract` in the templates.
