# Agent Note: Soft study-time reminders

Status: implemented

English | [中文](2026-10-18-student-soft-time.zh.md)

## Problem

A grade-two session on 2026-10-18 stopped because suggested durations were refusals, and because later checks rejected answers the child had already given.

- After the block suggestion, answer and record were refused.
- An unfinished break refused the next start, and a nearly finished daily suggestion shortened it. With 18 of 20 minutes recorded, the next mathematics block was two minutes long.
- After a saved answer, record failed with one message that did not name the mismatched field.
- A choice had to equal the published option, so "Jump" and "选择A" were refused.
- A foundation start that included intensity light was refused.

## Decision

The [learning decision](../feature/2026-10-05-student-learning.md) owns course evidence and rewards; the [overhaul decision](../feature/2026-10-30-student-overhaul.md) owns the absence of duration/rest fields. This note retains choice normalization and diagnostic intensity. Stable response/assessment association now belongs to the [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md).

Assessment references a saved response in its owning block and question. Repeating every question field is unnecessary; official-file validation rejects mismatched identities, missing answers and contradictory assistance before facts count as evidence.

Choice answers accept case, surrounding space, width variants and A–D letter forms including 选A, 选择A and 答案是A. The normalized response may store the published choice while `rawResponse` preserves the original learner wording.

`intensity` applies only to `diagnose`; official-file validation rejects it on other modes. No write-tool notice substitutes for validation.

## Alternatives considered

**Keep refusing after the suggestion and only soften the message.** The session asked for the child to continue. A refusal still stops the work.

**Remove the three durations from the profile.** Rejected here so parents could keep a suggested length; the [overhaul decision](../feature/2026-10-30-student-overhaul.md) later removed them after soft refusals still left countdown UI.

**Require record to repeat every task field byte for byte.** That is the check that failed after a saved answer: a retyped response was rejected, and the message did not say which field differed.

## Verification

Learning and official-file regressions cover choice letters, response identity, missing answers, assistance conflicts and diagnostic-only intensity. Duration removal is covered by the overhaul tests; real-tool and release checks belong to the native learning architecture.

## Consequences

Answers no longer need byte-for-byte repetition to receive feedback. Original wording remains available, assessment identity stays explicit, and school mode still needs a confirmed course. Time limits are absent; invalid official evidence remains pending repair.
