# Agent Note: Novel generation must optimize reader value

Status: implemented

English | [中文](2026-09-22-novel-reader-value-generation.zh.md)

## Problem

The baseline examined for this decision had the following failures. The measurements describe that baseline, not the current checks.

Creative's novel-writing workflow validates file structure, tracking state, outline consumption, AI-pattern lint, punctuation and continuity, but reader-value review is not a blocking part of chapter commit. The `story-review` Skill already uses genre-aware checks for reader interest and next-page momentum, but `storyctl.py chapter check` does not consume that review; a chapter can pass without a concrete opening promise, meaningful conflict, protagonist choice, state change or next-page question. The current workflow also forbids adding independent plot when an outline is weak, so a thin outline is expanded into a longer summary instead of being returned for repair.

The writing Skills and `narrative-writer` role load a large set of references and many prescriptive techniques; the long-form writing Skill alone ships 46 reference files, about 310,000 characters with its `SKILL.md`. Fixed event-density targets, percentage-shaped sections, repeated hook formulas, object recurrence rules and anti-AI cleanup instructions compete with the chapter's actual genre and reader promise. The workflow therefore risks replacing one failure mode with another: text can avoid obvious AI phrasing while remaining formulaic or emotionally flat. `narrative-writer` handles prose and local rewriting, `story-review` owns substantive review, and deterministic format and tracking checks run through their current tools; no structured reader-value result joins those paths at commit.

The deterministic checks that do block a chapter reject common human prose and let lightly edited machine prose through. Across eight public-domain works totalling about 45,000 characters, `check-ai-patterns.js` reported 52 blocking hits, 42 of them for the em dash, and only one work passed; in the shorter literary and hand-written samples, 14 of the 24 em-dash hits were inside dialogue. `chapter check` also treats the `normalize-punctuation.js` check as blocking, and normalization rewrote every dialogue ellipsis and dash in those copies, turning an interrupted line into a finished sentence, although [anti-ai-writing.md](../../../../packages/creative/story/knowledge/story/references/agent-references/anti-ai-writing.md) records that 281 of 305 high-scoring web-fiction chapters use the ellipsis and rejects a zero-tolerance ban. In the other direction, synonym variants of the contrast pattern, parallelism and moralizing summaries went uncaught, and editing 1.4 to 5.8 percent of the characters in three planted AI samples cleared every blocking hit, one of them through a real `chapter commit`. A weak real short story with continuity errors scored zero, and a strong real chapter that scored zero carried a new repetitive tic, anadiplosis at 15.7 per thousand characters against a maximum of 3.3 in the human samples; that fits evasion pressure producing new patterns, though one sample does not establish the cause.

Every Role also runs on the Session's model. Role creation starts each Role without `agentOptions`, so upstream [child-agent.ts](../../../../upstream/packages/subagent/subagent/src/child-agent.ts) gives the child the parent's provider, model, reasoning effort and token limit. The model that wrote a chapter therefore reviews it with the same habits, and the reviewer cannot be given more reasoning effort or a different model than the writer. The `story-zhuque` production entry adds an AI-text detector score, which is useful information but would pull the writer toward the detector if it became an acceptance target, given how cheaply the pattern checks were evaded.

## Decision

### Reader-value guidance belongs to review

`story-review` reviews the final chapter against its genre and outline, reporting concrete issues and source locations. The [native collaboration decision](2026-10-01-creative-role-agents.md) supersedes mandatory approving JSON and seven-quotation validation. Chapter scripts retain objective project checks but do not certify literary quality; important review findings remain a workflow responsibility.

### Outlines precede scene execution

The outline checker requires reader expectation, objective, obstruction, choice, consequence, payoff and end question before prose exists. It rejects missing fields and placeholders; the workflow separately returns abstract statements for repair. The writer receives a compact scene plan derived from approved events. Tactics, subtext, evidence handling and micro-obstacles may serve those events, but independent events, reveals and future obligations require outline revision.

### Writing, continuity and review have separate owners

`narrative-writer` writes prose and makes local revisions. `story-review` obtains reader-value evidence from `story-architect`; `consistency-checker` checks facts, character state and foreshadowing. Deterministic tools own format, degeneration and tracking. The writer receives selected genre, emotion and rhythm guidance with relevant examples. References remain available on demand; fixed density, chapter percentages, three-use objects and hook formulas are optional techniques, not universal acceptance rules. The [six-Skill decision](../simplification/2026-09-30-story-skills-native-resources.md) defines the solo fallback: the main session performs a separate complete review and identifies it honestly as main-session review, without claiming independence or producing a fixed review record.

### Review configuration is recorded

DSH Session history owns actual execution and request metadata. The [native collaboration decision](2026-10-01-creative-role-agents.md) removes Role model overrides and the requirement to copy model configuration into review documents. A separate reviewer is a different executor, not necessarily a different model; model metadata is not required to report useful findings.

### Pattern and detector results are advisory

All AI-pattern rules are advisory, including synonym contrasts and repeated sentence links. The JSON report includes document-level finding density; neither a single hit nor density decides acceptance. The [regression corpus](../../../../packages/creative/story/tests/fixtures/novel-pattern-corpus.json) separates public-domain excerpts from synthetic dialogue and planted evasion variants. Tests calculate rule precision and recall on those labeled cases and ensure pattern findings cannot block. A future blocking pattern rule requires broader human-prose calibration; the small corpus does not establish general accuracy, and no licensed contemporary human web-fiction corpus is bundled.

Punctuation defaults to preservation. Projects can select `normalize-narration` in `设定/写作检查.json`; explicit normalization preserves quoted pauses. Zhuque scores remain diagnostic in both writing and polishing: they neither authorize submission nor trigger retries. Degeneration and checker execution failures still block.

### Continuation retains story facts

Tracking V4/V5 remains readable. Existing reader_value_records are retained unchanged as historical data, without new review records or automatic continuation projection. Current continuation uses the existing story facts, recent chapter summaries, next-chapter commitments and continuity risks. The [native collaboration decision](2026-10-01-creative-role-agents.md) owns this removal; no bulk rewrite is required.

## Alternatives considered

**More banned words or mandatory formulas.** Rejected: lexical cleanup already rejects human prose and is cheaply evaded. Additional templates can reduce expression without increasing reader interest.

**Free plot invention when an outline is thin.** Rejected: it creates unapproved continuity obligations. Repair the outline while permitting scene-level invention within its approved events.

**One quality score across genres.** Rejected: suspense, romance, healing and progression fiction promise different experiences. Shared evidence fields keep decisions inspectable without a universal score.

**Only a final review.** Rejected: a late review cannot supply the outline's missing choices. Outline readiness, continuity and deterministic checks retain independent responsibilities.

**Accept text when its detector score is low.** Rejected: small edits can clear pattern checks without improving a chapter; detection therefore cannot be the writer's objective.

**Always inherit the writer's model for review.** Rejected: it couples review to the writer's habits. Pinned DSH supports host-owned child model options without granting model selection to the caller.

## Testing

Focused tests cover review-free chapter commits and revisions, preserved legacy data, stale wordcount hashes and state revisions, outline gaps and punctuation policies. Native delegation tests cover actual specialist instruction reads and Team reuse. Public-domain and synthetic fixtures cover diagnostic false positives. These keyless regressions do not measure literary judgment or commercial reader response.

## Consequences

Reader-value judgments remain fallible. Explicit exploratory requests can produce drafts without advancing tracking; formal submission still requires review. A creator who disagrees can revise the outline or retain a draft, but there is no silent acceptance bypass. Optional references may require targeted follow-up reads. Independent reviews can cost more and disagree with the writer; actual provider behavior and prose quality still need live-model evaluation. Schema version 5 is a project-file change, separate from DSH Session persistence; older tracking readers cannot consume it.
