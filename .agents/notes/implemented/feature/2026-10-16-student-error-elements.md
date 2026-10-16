# Agent Note: Question elements, error causes and the variation ladder

Status: implemented

English | [中文](2026-10-16-student-error-elements.zh.md)

## Problem

Questions were written entirely from prose rules: a knowledge point carried one definition and one example, with no common mistakes, question points or variation axes; a mistake's error cause lived only in free-text explanations, so causes could neither be aggregated nor checked; the review sheet rule was a single sentence about changing numbers and context, with no executable ladder; and six figure kinds could not express number lines, clock faces, partial hundred charts or counting sticks, so the model fell back to hand-written HTML sheets that bypassed printing, marking and review. In the qiqiStudy workspace, none of the twenty worksheets carried a figure while twenty prompts said "look at the picture".

## Decision

The twelve shipped maps gain an elements layer: concepts carry `misconceptions` and `examples`, objectives carry `errorTypes` (subject-scoped controlled vocabulary), `questionPoints` and `variationAxes`, and units carry a daily-practice `focus`; `study_status kind=elements` serves one subject's taught goals with these elements, narrowed by `unit` or `id`. The loader validates vocabulary membership and subject pairing. The workspace's own concepts and objectives accept the same optional fields. `src/vocabulary.ts` holds the subject vocabularies with no schema dependency so client code can import the lists.

Every confirmed mistake can carry one `errorType` from its subject's list; `mistake`, `paper-draft` and grading entries accept a suggestion, `classify-mistake` sets or clears it, and the parent can change it in the panel. Goals aggregate causes into `errorTypes`, a repeated cause (two or more mistakes) adds a `recurring-error` reason and raises priority, and `errorProfile` aggregates causes per subject for the desk and weak-point queries. Review questions climb a `variant` ladder: stage 0–1 numeric, 2 context, 3+ reasoning, and a review item whose prompt equals the original mistake's prompt is rejected, so the review sheet can never reprint the original question. `reviewPlan` v2 caps two picks per cause, keeps two slots for weak-goal objective fills, reports `errorCoverage` and `remaining`, and filters candidates by the parent-confirmed class frontier like the rest of the insight. Mastery tightens to three independent days, no open mistake, and no recent helped or wrong answer. `understandingReminders` (first explain, after correction, before next) stay derived-only: never persisted, never scored, never part of mastery. The figure union grows to nine kinds (number line, clock, sticks, hundred-chart window, structured money), unknown kinds throw instead of rendering NaN layouts, and the shapes truncation and width-passing defects are fixed. Worksheet `kind` (daily, practice, review) selects the printed title; daily mini sheets and chat dictation moved to a new `references/daily-routine.md`.

## Alternatives considered

**A curated question bank.** It would freeze quality but cannot follow the learner's actual errors; elements plus model-written variants keep targeting while staying checkable.

**Keep error causes as free text.** Aggregation, review planning per cause and the parent's two-tap classification all need enumeration; the vocabulary stays optional so nothing blocks older flows.

**Start every review at the original question.** It would contradict the existing no-copy rule and let the learner memorize the answer; the ladder starts one step away and the server enforces a different prompt.

**Allow HTML sheets for rich figures.** They have no records, cannot be marked and never enter review, which is exactly the reported failure mode.

**Migrate existing worksheets automatically.** Old sheets lack elements and some cite pictures without figures; the parent discards or re-issues them in the panel instead of a silent rewrite.

## Verification

Curriculum tests assert every unit has a focus, every objective has at least one subject-valid cause and two question points, and at least 80% of concepts carry a misconception (all twelve maps reach 100%). Host tests cover classification (subject mismatch rejected, empty string clears), the recurring cause and its priority, first-explain reminders that never persist or change mastery, draft confirmation flows, the ladder per stage, the objective fill slot, elements queries, and the prompt-difference rejection. Route tests keep paper-draft outside the UI whitelist while school progress, classification and confirmation pass. Plugin tests reject unknown causes and serve the elements query. Client tests cover the draft review block, the notebook classification form, the routine card with its cause line and daily-sheet prompt, and the reminder card. The PDF renderer draws all nine kinds. The interface was not verified in a real DSH browser and no real model was called; question quality still depends on the model.

## Consequences

The maps carry more content and are maintained in this repository. The causes are a controlled vocabulary the parent can always override. Reminders are deliberately ephemeral so they can never leak into mastery statistics. Old sheets with "look at the picture" prompts but no figure remain until the parent discards or re-issues them.
