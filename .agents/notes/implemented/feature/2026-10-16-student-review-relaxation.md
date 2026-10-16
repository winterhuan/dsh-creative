# Agent Note: Kinder review rules for mistake practice

Status: implemented

English | [中文](2026-10-16-student-review-relaxation.zh.md)

## Problem

The spaced-review rules were built for evidence purity: independence required, the due day required, and a clean slate after any lapse. In the qiqiStudy workspace the parent reached twenty-nine overdue mistakes that would not move. A consolidation sheet finished one day early credited nothing, one wrong or helped answer reset a mistake to stage zero, and review blocks refused answers before the due day. The family reported the system as unusable.

## Decision

Three rules change. An independent correct answer now advances a mistake one stage on any day, earlier than the due day included, still at most one stage per day; the next due day counts from that answer. Wrong, partial or helped answers no longer lower the stage or clear the independent-day record; they only make the mistake due again the next day. Interactive evidence matches: `record` and review tasks accept any confirmed mistake, no longer only due ones, so an early review block records normally. The consolidation-sheet window (a mistake may be printed when due by tomorrow) and the consolidated stage (stage four, a 30-day interval) are unchanged.

## Alternatives considered

**Demote one stage instead of keeping it.** That still punishes an isolated lapse; keeping the stage is what the family asked for, and a mistake still needs four separate independent correct days, early or on time, to reach stage four.

**Keep the due-day rule and only explain it better.** The reported failure was real work that the system silently credited nothing for; explanation does not fix that.

**Drop the daily cap too.** Consecutive-day drills would then reach "consolidated" in four days without any spacing; one stage per day keeps a day of spacing between advances.

## Verification

Host tests cover an early interactive answer advancing the stage, a one-day-early sheet answer advancing, a wrong answer keeping the stage while moving the due day to tomorrow, the relapse path at stage four keeping the stage, and unchanged due-day flows. Client and route tests are unaffected but were run.

## Consequences

Review progress now counts every independent success, so stages move faster and can be earned early; the printed review window and consolidated stage still pace the loop. One failure no longer erases the independent-day history, so the after-correction reminder and displays stay truthful.
