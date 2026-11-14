# Agent Note: Shipped knowledge map and weak points

Status: implemented

English | [中文](2026-10-12-student-knowledge-map.zh.md)

## Problem

Learning objectives previously existed only after the model proposed a concept and a parent confirmed each one, so a term's knowledge points accumulated slowly through chat and the workbench could not show where the learner stood in a whole book. Mistakes, answers and objectives were never aggregated, so neither parents nor the model could see which knowledge points kept failing or were due for review, and the main workbench tab showed only the timer and the current question.

## Decision

The package ships twelve maps for Chinese, mathematics and English across both terms of grades one and two. Structured units, concepts, goals and same-subject relations carry definitions, examples, methods, sources and checkable facts. The Host validates unique IDs, membership, references and subject-method pairs. Maps follow the first-stage 2022 curriculum standards as a learning framework; [textbook contents](2026-10-14-student-textbook-contents.md) and [knowledge facts](2026-10-17-student-knowledge-facts.md) own the specific readings and edition limits. Shipped goals need no separate concept confirmation; user-defined concepts do. Official files keep references rather than copies of installed maps.

One shared evidence index and mastery rule classify due, weak, stalled, mastered, practising and untouched goals. Genuine independent days, assistance, actual dates and confirmed mistakes supply evidence; unverified facts remain visible but cannot establish dated mastery. The recommendation order is owned by [interest context](2026-10-28-student-interest-context.md), with prerequisite teaching and bounded due items.

Panels show goal progress and selectable units without replacing unfinished work. Browsing another book carries no borrowed current-term mastery and grants no learning scope. A saved explicit matching cross-book scope can authorize those goals; ordinary questions use the historical learner profile. [School frontier](2026-10-14-student-school-frontier.md) bounds school-aligned recommendations and check-ins. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns authoring, original response/assessment identities and scope validation.

Recurring check-ins sample untouched, stalled and long-mastered goals rather than a complete term assessment. They recur after 14 days, can be repeated any time, and use a 35-day mastery recheck. Light, standard and deep intensity remain diagnostic-only; each round probes at most six goals, with several questions permitted per goal. Choices keep original learner wording and a normalized selected option; the tutor records assessment against that saved response. Shared page-specific queries load full maps only when needed.

## Alternatives considered

**Copy the shipped map into every workspace state file.** Each term profile would gain hundreds of duplicated records, map revisions would never reach old profiles, and state files and tool output would grow.

**List knowledge points only in the Skill documentation without structured data.** The model could read them, but the workbench could not display mastery, objective IDs could not be validated and mistakes still could not be classified reliably.

**Align the map to school textbook pages.** There is no evidence for each school's actual book and progress, so this would disguise a framework as school alignment. School alignment is the parent-confirmed textbook plus, when the parent marks it, the map unit the class has reached; that frontier is [school progress](2026-10-14-student-school-frontier.md). Unit and lesson names for the nine books in the parent-supplied contents follow that directory; see [textbook contents](2026-10-14-student-textbook-contents.md).

**Let the model judge weak points freely.** Such judgements cannot be re-checked or displayed consistently; instead, outcomes, assistance levels and mistake stages feed fixed rules.

**Make the check-in a one-off whole-term assessment.** A young learner cannot cover a term in one sitting; recurring small samples let coverage accumulate without a time limit.

**Grade choice questions locally in the panel.** Panel grading would bypass the boundary that assessment is recorded by the tutor with evidence; the native intention preserves the chosen option, and the tutor assesses its saved response.

## Verification

Curriculum tests check all twelve maps, unique IDs and goal/unit reachability. Learning, official-file and client regressions cover shared mastery, diagnostic intensity/sampling, choice normalization, selected goals, current and explicit cross-book scopes, school frontier and page-specific reads. Deterministic questions do not establish real-model quality; release browser checks belong to [HANDOFF](../../../../HANDOFF.md).

## Consequences

Maps remain release-maintained learning frameworks rather than school textbooks. Specific edition gaps belong to the fact/content owners. Only validated target-bound responses supply mastery; legacy unresolved facts can lower totals. Repeated small check-ins accumulate coverage, while original questions and assessment quality still depend on the model.
