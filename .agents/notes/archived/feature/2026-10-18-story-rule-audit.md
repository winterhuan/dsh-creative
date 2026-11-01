# Agent Note: Independent rule audit and the commit gate

Status: implemented
Archived: 2026-11-01

English | [中文](2026-10-18-story-rule-audit.zh.md)

## Problem

`chapter rules` can hand a writer a stable list, and the native template can still submit after a holistic review that never judges those ids. A violate that the author wants to keep has nowhere to live except the tracking state, and a quote the auditor invents would look like evidence. The holistic review and this per-rule pass have to stay in the same revision budget.

## Decision

After Write, the chapter template starts Review and Audit in one `phase('Review')` with `Promise.all`. rc.2 `agent()` in `@deepseek-ai/dsh-workflow-ptc` takes a slot before it starts the child. The default ceiling is `min(16, max(1, availableParallelism() - 2))`. When that ceiling is at least 2 the two children overlap. When it is 1 they queue, and both still run. The template does not fall back to a hand-written serial loop.

The auditor reads `story-review` and `references/roles/rule-auditor.md`. It judges only ids in the `rules` array returned by `chapter rules`. It does not invent ids, and it does not accept an exception. `also` ids are not separate verdicts. Rules dropped by the 16 KiB cut are not judged. The file is `story-rule-audit/v1` at `草稿/审稿/第NNN章.rules.json`. Each verdict is `pass`, `violate`, `not_applicable` or `unclear`. A `violate` carries at least one `{ line, quote }`. The same role file states the judgments: any span of a `CORE` or `VOL-OLD` anti-pattern is violate, and a later repair does not cancel it; a rule that starts with 「禁止」 checks whether the forbidden act occurs; a composed `OUT-P` sentence is violate when the plot point is missing or the boundary is crossed; an `OUT-GOAL` that contradicts the goal is violate, and an unadvanced goal without `not_applicable` is unclear. Evidence comes only from this chapter's body. A title or nickname that names the same person applies. Doubt is unclear.

`chapter audit-verify` checks that file without a model. Every current rule id has one verdict, and every verdict id is in that list. `normalizeRuleSentence` strips `**`, removes whitespace and strips trailing sentence punctuation. The quote must then occur on that 1-based body line. Internal punctuation stays, so dropping a comma fails. `body_sha256` is the SHA-256 of the current body bytes. `rules_sha256` is the current chapter-rules digest. A verified result exits 0 and lists violate and unclear ids. A failed check exits 1 and lists every reason, including a missing file. A path that leaves the book exits 2. An invalid writing-check file exits 2.

`设定/写作检查.json` may set `rule_audit` to `off` or `required`. A missing file or a missing key means `required`. Write `off` so `chapter commit` and `chapter finish` do not require the audit file. `project migrate-gates --legacy-off` writes `off` for an old book. `required` requires a verified file at the default path and no violate whose id is absent from `accepted_findings`. `unclear` and scan hints enter the revision notes and do not block a commit. Calibration of chapters 001–012 records whether this book keeps `required`: R1–R3 must hit, and a known-clean chapter shows at most one false violate. Write `off` when that calibration does not pass. The [Skill CLI sync](../process/2026-10-25-story-skill-cli-sync.md) owns the instruction that Skills teach this default.

`accepted_findings` is an optional transaction array of `{ rule_id, reason }`, at most 12 items, with unique ids. A non-empty list is rendered into the chapter record under `## 接受的规则例外`. It is not copied into the tracking state. Tracking schema 6 stores a fact-ledger summary link, not this list. An empty or absent list leaves the chapter record byte-identical to a transaction that omits the field.

An unaccepted violate shares the existing revision cap of two passes. At the cap the template returns `revision_limit`, lists `unresolved_rule_ids`, and names the three choices: accept the exception, change the rule source, or change the outline.

The [chapter-rules decision](2026-10-18-story-chapter-rules.md) still owns extraction and `rules_sha256`. The [book-audit decision](2026-10-18-story-book-audit.md) still owns the range report. The [native workflow decision](2026-10-03-story-native-workflow.md) still owns the other stages. None of those records is fully superseded.

## Alternatives considered

**Run Audit only after Review returns ready.** A violate found that late spends a revision the holistic review already used. Starting both in the same phase keeps one shared counter.

**Serial Audit then Review inside the script.** rc.2 already queues `agent()` when the ceiling is 1, so a second scheduler would only hide that ceiling. `Promise.all` uses the engine's own limit.

**Store accepted exceptions in the tracking state.** The exception is a decision about one chapter's prose. The chapter record can show it. Schema 6's `facts` link is a ledger summary, not this list.

**Block commit on `unclear`.** A missing neighbor chapter is not a violated rule. Only an unaccepted `violate` blocks, and only when the gate is `required`.

## Consequences

A missing `rule_audit` is `required`. Write `off` when chapters 001–012 are not calibrated. A required gate with a stale hash or a forged quote refuses the commit. Authors who accept a violate record the reason in the chapter Markdown, and a later reader of the state JSON does not see that field. The auditor can still miss a rule that the 16 KiB cut omitted. Holistic review can still be ready while a violate forces another pass.

## Verification

Synthetic fixtures reject a forged quote, an unknown rule id, a missing verdict, a body or rules hash mismatch, and a path that leaves the book. They commit when the gate is `off`, refuse a required gate until the file verifies, and let `accepted_findings` through while keeping that field out of the state JSON. `tests/gates.spec.ts` expects a missing key to report `required`. The scripted workflow covers an unaccepted violate, an accepted id and an unclear note. The native composition runs the audit child beside review and stops at `revision_limit` when the violate remains. `SHENJI_BOOK` runs a read-only smoke test when set and skips when unset. No novel prose is in the fixtures. Repository typecheck, build, full tests and documentation checks cover the package. No real DSH browser session and no real model call exercised this command.
