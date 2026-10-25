# Agent Note: Teaching walks prerequisite chains and review spacing senses recurrence

Status: implemented

English | [中文](2026-10-25-student-prerequisite-spacing.zh.md)

## Problem

Teaching suggestions ignored dependencies: `curriculumView` already computed a topological order over prerequisite relations for display, but the needs-teaching verdict and the recommendation never used it — a child stuck on the multiplication tables kept getting table questions even when the real gap was the earlier meaning of multiplication. Review spacing was equally flat: a wrong, partly right or helped answer after confirmation always reset to the next day, treating a first slip and a repeated wrong alike, and mistakes recurring with the same error cause on one goal still received the lowest "change the numbers" variant on review sheets.

## Decision

Teaching drills down the prerequisite chain: `studyInsight` walks each needs-teaching goal's same-subject prerequisite edges (concept-level relations mapped to goals through concept membership) breadth-first and returns the nearest goal that is neither mastered nor due; a hit earns that prerequisite a `prerequisite-gap` reason and a priority lift, the recommendation redirects to it carrying `redirectedFrom` (the original goal), and the workbench card says to return to the original goal afterwards. Once the prerequisite is mastered, the suggestion falls back automatically.

Review spacing senses recurrence: the first wrong or partial after confirmation resets to the next day, a repeated wrong waits two days; `reviewPlan` raises the variant floor from "numeric" to "context" when a goal carries two or more active mistakes sharing one error cause. Both verdicts derive from existing answer and mistake evidence with no state-file change.

## Alternatives considered

**Finding the earliest rather than nearest gap on the chain.** The earliest goal on a long chain may already be practising for other reasons; the nearest unmet prerequisite matches the current blockage and the step a teacher would check first.

**Matching recurrence per question.** Outcome evidence carries no error cause (causes live on mistakes and grading entries), so per-question pairing has no data; counting same-goal active mistakes per cause is enough to raise the variant.

## Consequences

The recommendation order gains a `prerequisite-gap` step (after due mistakes, before direct teaching) that falls back once the prerequisite is met; the schedule is more conservative about repeated wrongs and review sheets change context first for recurring causes. All 347 prerequisite relations across the three subjects are live, and cross-grade scopes are unaffected. Learning-order and suggestion rules stay with the [knowledge-map decision](../feature/2026-10-12-student-knowledge-map.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
