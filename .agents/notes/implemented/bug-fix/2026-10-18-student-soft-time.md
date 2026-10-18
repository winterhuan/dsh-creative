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

The [learning decision](../feature/2026-10-05-student-learning.md) still owns course evidence, rewards and review. This note owns the time, record, choice and intensity checks.

`blockMinutes`, `breakMinutes` and `dailyMinutes` stay parent-confirmed suggestions. `start`, `task`, `answer`, `hint` and `record` succeed after the suggestion, during `breakUntil`, and after the daily suggestion. A new block ends at the earlier of now plus `blockMinutes` and the next Shanghai midnight. It is not shortened to the minutes left today. `stop` stores the actual elapsed time and still sets `breakUntil`. An attempt saved after that end has `late: true`. `studyStatus` returns `timeNotice` and `time`: elapsed block time, the suggestion, today's total, and the rest clock as Beijing `HH:MM`. The workbench keeps answers and a new start available and shows the same suggestion.

A record for the current task requires a saved answer. `id` must match. `topic` and `prompt` match after NFKC, width, trim and collapsed space. `response` matches the saved response, the raw input, that fold, or a choice letter. Omitted `mistakeId`, `objectiveId`, `variant` and `figure` are copied from the task. A provided value that differs names the field and the expected value.

Choice answers accept case, surrounding space, fullwidth and halfwidth forms, and letter indexes A–D, including 选A, 选择A and 答案是A. The stored `response` is the published choice. `rawResponse` keeps the trimmed input.

`intensity` is stored only for `diagnose`. Other modes ignore it, and `study_update` adds a notice.

## Alternatives considered

**Keep refusing after the suggestion and only soften the message.** The session asked for the child to continue. A refusal still stops the work.

**Remove the three durations from the profile.** Parents still choose a suggested length. Removing the fields would drop that preference and the rest clock.

**Require record to repeat every task field byte for byte.** That is the check that failed after a saved answer: a retyped response was rejected, and the message did not say which field differed.

## Verification

Learning tests cover a late save, a block that is not shortened, a record error that names the field, choice letters, and ignored intensity. Workbench tests keep the answer control enabled after the suggestion and offer Start now during a suggested break. A real DSH browser session was not run.

## Consequences

The plugin does not stop a block at the suggestion. The tutor can continue, and `timeNotice` is the text to relay. Late attempts stay distinguishable. One block at a time is still required, and school mode still requires a confirmed course. A record that names a different prompt or figure still fails, and the error quotes the expected value.
