# Agent Note: School progress frontier

Status: implemented

English | [中文](2026-10-14-student-school-frontier.zh.md)

## Problem

A learner who is in school and also practising at home can be walked through the whole term map, including units the class has not reached. The parent-confirmed course stores a free-text unit name, and that name does not limit check-ins, weak points or the next new goal. A check-in that samples untaught units marks them as needing work after one miss.

## Decision

After a subject has a confirmed textbook, `school-progress` stores the shipped map unit the class has reached, the time of that confirmation, a posture (`keep-up` or `catch-up`), whether preview of the next unit is on, and a pace (`teaching` or `review`). The host writes `confirmedAt`. The unit id must exist on the profile's grade and term. Replacing the textbook with `course` or `configure-course` keeps this record.

Until a subject has this record, recommendations for that subject stay on the whole map. With the record:

- Due mistakes and weak points lead only when their goal sits in the current unit or an earlier one. A mistake with no goal stays in the queue. Mistakes tied to a later unit stay in the notebook.
- Check-in samples and the coverage total use only those taught units.
- `keep-up` offers a new goal only inside the current unit. `catch-up` offers the first unstarted goal in any taught unit. `review` offers no new goal.
- Preview, when on during a teaching week, recommends the first unstarted goal of the next unit only after no taught new goal remains, and that goal is not part of the check-in. The recommendation kind is `preview`.
- When later units are still unstarted and nothing above applies, the recommendation kind is `hold`.

The workbench lets the parent reconfirm the same unit, move to the next map unit, or mark a review week. Home mastery does not move the frontier.

## Alternatives considered

**Advance the frontier from the calendar or from home mastery.** Teachers pause, review and reorder. Treating a practised unit as a taught unit would start the next chapter because the child practised ahead.

**Let a homework photo set the unit.** A photo can support a suggestion. Saving it without the parent's confirmation would record a guess as school progress.

**Hide later units from the map.** Parents still need to see the rest of the book. The map keeps those units and labels them as not yet taught; they drop out of the daily plan and the check-in.

## Consequences

A subject with no confirmed frontier still follows the whole map, so existing profiles do not change until a parent marks a unit. Check-in coverage is then "taught so far", not the whole book. Preview practice can still create a weak point; that point does not outrank taught goals. The free-text course unit remains the parent's label for the textbook; the map unit id is what the plan uses. See [knowledge map](2026-10-12-student-knowledge-map.md).
