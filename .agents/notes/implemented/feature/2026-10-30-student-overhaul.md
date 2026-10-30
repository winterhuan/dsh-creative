# Agent Note: Student plugin overhaul without time limits

Status: implemented

English | [中文](2026-10-30-student-overhaul.zh.md)

## Problem

Suggested block, break and daily limits still shaped the desk copy, profile form and status payload even after soft refusals were removed. Parents also had to retype confirmation text, could not edit the profile or courses during an open block, and could not freely switch subject or end a block in one click. The package shipped concept maps and knowledge-point facts but no schema-validated exercise bank keyed to learning goals, so diagnose, Simon stages and daily sheets relied on free-form model questions. Review intervals still used a 3 / 7 / 14 / 30 curve, and grade-two second-term maps lacked dense checkable facts.

## Decision

Remove every duration and rest field from profile, sessions, attempts and status. Migrate old `.study/state.json` files by stripping `profile.limits`, `breakUntil`, `sessions[*].deadline` and `attempts[*].late`. Phase is only `ready` or `studying`; status keeps quiet elapsed totals (`blockElapsed`, `todayElapsed`) and the weekly summary. `start` auto-closes an open block; `task` may replace an unanswered task; subject switching stays enabled during a block.

Ship a validated exercise knowledge base under `knowledge/curriculum/exercises/{chinese,math,english}.json`, load it in `curriculum.ts`, attach matching items on `kind=elements`, `kind=diagnose` and `kind=review-sheet`, add `kind=exercises`, and store workspace copies in `exercises` with `save-exercise` / `delete-exercise`. Spaced review uses stages at 1 / 7 / 16 / 35 days; mastery recheck uses 35 days. Tasks may carry micro-steps; Today shows Simon phases, the objective goal, a Feynman “little teacher” action and an explore inquiry field. The knowledge-map tab renders a unit → point → relation tree with mastery colours. Parent setup updates a profile in place; confirmations default in the panel; course, progress, interests and mistake confirmation work during an open block; Practice can add, edit and delete confirmed mistakes. Grade-two second-term Chinese, mathematics and English maps gain denser facts, examples and question points.

This note owns the removal of time limits, the exercise bank, the 1 / 7 / 16 / 35 curve and the parent/student flow changes above. The [soft-time note](../bug-fix/2026-10-18-student-soft-time.md) keeps ownership of record matching, choice normalisation and diagnose intensity; its duration fields are gone. The [review-relaxation note](../feature/2026-10-16-student-review-relaxation.md) still owns early advances and non-demoting slips; its consolidated interval is now 35 days.

## Alternatives considered

**Keep soft suggestions without refusals.** Parents still saw countdowns and rest clocks that implied a hard stop after earlier sessions had already taught them the desk could refuse. Removing the fields ends that conflict.

**Store exercises only as free-form chat drafts.** Diagnose and Simon stages then have no shared, validated prompts or figures tied to goals.

**Keep the 3 / 7 / 14 / 30 curve.** The product brief selected the 1 / 7 / 16 / 35 forgetting curve for grade-two review.

## Verification

Student package tests cover migration, open-block start replacement, exercise loading and queries, 1 / 7 / 16 / 35 scheduling, micro-steps, desk copy without time limits, mind-map selection and mistake/exercise panel actions. Root `typecheck`, `build`, `doc-sync` and `hygiene` are required with this change. A real DSH browser session was not run in this pass.

## Consequences

Existing workspaces load without duration fields. Tutors no longer receive `timeNotice` or late flags. Exercise bank IDs and workspace exercises become durable references for worksheets and variants. Consolidated mistakes wait for a 35-day interval. Parents can edit settings mid-block; children can end a block without filling a rest timer.
