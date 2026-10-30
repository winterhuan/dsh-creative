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

The [learning decision](../feature/2026-10-05-student-learning.md) still owns course evidence, rewards and review. Duration and rest fields were later removed by the [overhaul decision](../feature/2026-10-30-student-overhaul.md); this note keeps ownership of record matching, choice normalisation and diagnose intensity.

A record for the current task requires a saved answer. `id` must match. `topic` and `prompt` match after NFKC, width, trim and collapsed space. `response` matches the saved response, the raw input, that fold, or a choice letter. Omitted `mistakeId`, `objectiveId`, `variant` and `figure` are copied from the task. A provided value that differs names the field and the expected value.

Choice answers accept case, surrounding space, fullwidth and halfwidth forms, and letter indexes A–D, including 选A, 选择A and 答案是A. The stored `response` is the published choice. `rawResponse` keeps the trimmed input.

`intensity` is stored only for `diagnose`. Other modes ignore it, and `study_update` adds a notice.

## Alternatives considered

**Keep refusing after the suggestion and only soften the message.** The session asked for the child to continue. A refusal still stops the work.

**Remove the three durations from the profile.** Rejected here so parents could keep a suggested length; the [overhaul decision](../feature/2026-10-30-student-overhaul.md) later removed them after soft refusals still left countdown UI.

**Require record to repeat every task field byte for byte.** That is the check that failed after a saved answer: a retyped response was rejected, and the message did not say which field differed.

## Verification

Learning tests cover a record error that names the field, choice letters, and ignored intensity. Duration and late-save cases moved to the overhaul tests. A real DSH browser session was not run.

## Consequences

Record matching, choice normalisation and diagnose intensity remain as decided here. Duration suggestions, `timeNotice`, `late` and rest clocks are owned by the [overhaul decision](../feature/2026-10-30-student-overhaul.md). School mode still requires a confirmed course. A record that names a different prompt or figure still fails, and the error quotes the expected value.
