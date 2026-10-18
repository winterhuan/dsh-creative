# Agent Note: Chapter rules before prose

Status: implemented

English | [中文](2026-10-18-story-chapter-rules.zh.md)

## Problem

A long-form chapter can contradict its own outline and core settings while `chapter check` still passes. That check measures length, outline readiness, degeneration, punctuation and copied text. It does not hand the writer a stable list of this chapter's execution boundaries, withheld reveals, cast order, volume limits or style bans before the draft exists. A later independent review can reuse a list only when the list and its ids already exist.

## Decision

`chapter rules` extracts that list and returns `story-chapter-rules/v1`. Each rule has an id, text, and a source path and line. Ids stay stable for the same input. The payload, including the trailing newline, stays within 16 KiB. Overflow drops rules from the end, then scan rows, then warnings, and counts those drops in `omitted`. `rules_sha256` hashes the full rule list before the cut. Missing files and headings become warnings. The command exits 0.

`OUT-P` text is `情节点｜边界：执行边界` from the same table row. An empty or placeholder plot keeps the boundary sentence. A placeholder boundary keeps the plot. A row with neither side produces no rule. `主角目标` is one `OUT-NNN-GOAL` rule. A missing field is a warning. `rule_sources` still replaces the whole list, and an unknown prefix is skipped. The `also`, `rules_sha256` and 16 KiB algorithms stay the same.

Default sources and the optional keys in `设定/写作检查.json` are specified in the [artifact protocols](../../../../packages/creative/story/knowledge/story/skills/story-write/references/long/artifact-protocols.md). A present `rule_sources` array replaces the defaults. An absent key keeps them. A file that only sets `punctuation` keeps the previous chapter-check result when the outline has no `出场顺序：` field. A missing `punctuation` key means preserve, so the other keys can stand alone. The same normalized sentence keeps the first rule id. `text` stays that sentence, and later ids go in the optional `also` array. The writer-facing line appends ` also: ` when `also` is non-empty. `rules_sha256` still hashes the appended form, so the digest of one input stays the same. Cast hits match a name inside the cast line, skip names inside Chinese quotation marks, and say the body mentions a name the cast list does not include. A void-term id includes that entry's zero-based array index.

`blocking` is reserved for configured patterns and era terms that have one reading. `hint` reports cast names that appear in the body but not in the cast list, void terms that remain in constraints or risks, and other configured hints. Hints do not fail `chapter check`. `chapter rules` scans cast from the extracted cast rule. `chapter check` reads the outline field directly, including when `rule_sources` omits `OUT-CAST`, and then looks for `出场顺序` unless an `OUT-CAST` source names another heading. Ability-before-acquisition checks are absent. They need a later fact ledger, and this change leaves tracking schema version 5 in place. The [book audit](2026-10-18-story-book-audit.md) reuses the chapter scan and the void-term ids across a range. It does not replace this command. The [rule audit](2026-10-18-story-rule-audit.md) judges the returned `rules` array one id at a time and can gate `chapter commit`. It does not replace this command either.

The native chapter template runs the command in Prepare, stores up to 12000 characters of `id: text` lines on the writer task, and tells the writer to follow them and cite the ids. An underlength draft is still never padded.

The [reader-value decision](2026-09-22-novel-reader-value-generation.md) still owns advisory pattern and punctuation behavior. The [native workflow decision](2026-10-03-story-native-workflow.md) still owns stage order outside the audit child. Neither record is fully superseded.

## Alternatives considered

**Hard-code one book's headings in the extractor.** Another book would need a code change. Defaults follow the current templates, and `rule_sources` replaces them per book.

**Extract only the boundary cell.** The auditor then cannot see whether the plot point happened. The composed sentence puts the plot point and the hard constraint on one id.

**Drop a row when its boundary is a placeholder.** The plot point would leave the list, so a missing beat would not be judged. A placeholder boundary still keeps the plot.

**Fail the command when a heading is missing.** Stock templates omit some default headings. A warning lets Prepare continue, and the writer sees the gap.

**Put every new hit in blocking quality.** Cast overlap and a leftover void term are ambiguous. Only a fixed phrase or an era term fails the check.

**Scan cast only inside `chapter rules`.** Chapter check is the gate the writer already runs. The check reads the outline field itself, so a body can still be scanned after an override drops the cast rule from the extracted list.

**Extend the tracking schema with a fact ledger here.** Ability timing needs that ledger. This change leaves schema version 5 unchanged.

## Consequences

Writers receive an inspectable list before prose, and chapter check can fail on configured unambiguous hits. A writer who treats only `quality.status` as the gate can leave hints unresolved. A later independent review can read `rules`, `rules_sha256` and `scan` without a second parser. Books that follow only the stock templates see warnings for headings those templates omit. `chapter check` can still report a cast hint after `rule_sources` removes `OUT-CAST`. The Python punctuation oracle accepts only `punctuation`.

## Verification

Synthetic fixtures under `packages/creative/story/tests/fixtures/regression/chapter-rules/` cover each default prefix, a missing heading, a source override, the 16 KiB cut, blocking and hint severity, cast hints, a narrative cast line, quoted mentions, void-term indexes, duplicate sentences, a missing punctuation key, and a punctuation-only file that leaves chapter check unchanged. Workflow tests require `chapter_rules` on the ready path and keep the sentence that forbids padding an underlength draft. `SHENJI_BOOK` runs a read-only smoke test when set and skips when unset. No novel prose is in the fixtures. Repository typecheck, build, full tests and documentation checks cover the package. No real DSH browser session and no real model call exercised this command.
