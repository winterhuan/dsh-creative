# Agent Note: Interest tags wrap practice and overdue review stays short

Status: implemented

English | [中文](2026-10-28-student-interest-context.zh.md)

## Problem

A long overdue list was the only daily recommendation, so a child never reached the current school goal. Questions also stayed generic, so a scene the child likes never carried the same knowledge-map fact.

## Decision

Term settings retain parent interest tags. Absent tags use the existing six examples; `study_status` supplies them and the Shanghai-day `interestFocus`. Questions, variants, daily routines and OpenMAIC requirements can use those scenes while checkable facts remain the knowledge-map facts.

Within the selected subject, recommendations teach a goal that needs teaching, then strengthen a weak point, then offer a due check-in, then a new goal. At most two due mistakes accompany that recommendation. Unfinished work remains the primary continuation: browsing another subject or book does not replace the active question, and an explicitly selected goal wins over another recommendation. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns scope, native intentions and saved evidence. Relevant ready lessons can accompany the active goal; generation stays in the shell under [OpenMAIC ownership](2026-10-28-student-openmaic-lessons.md). There are no time limits.

## Alternatives considered

**A separate `.study/interests.json`.** The tutor writes the lesson log that way because generation must not bump the learning revision. Tags are parent settings and belong in term settings and `study_status`.

**Keep reviewing every due mistake before any new goal.** That was the previous order. Dozens of overdue items then block the school unit for good.

**Let interest tags add checkable facts.** A scene the child likes is not a fact from the textbook. Answers still have to match `facts`.

## Consequences

Old profiles without the field still show the example tags until a parent saves. A goal with several open mistakes, repeated recent errors, or a teaching need can still be the practice target. One isolated due mistake cannot. The Host still does not call port 3000. This change has no real DSH browser pass and no live OpenMAIC call.
