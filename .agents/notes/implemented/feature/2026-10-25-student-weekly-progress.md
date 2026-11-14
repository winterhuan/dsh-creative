# Agent Note: Mastery progress on display, a parent weekly summary and per-tab payloads

Status: implemented

English | [中文](2026-10-25-student-weekly-progress.zh.md)

## Problem

Mastery progress was nearly invisible: `independentDays` existed all along, but only the task card drew three dots and the growth tab listed them as text — the knowledge map, the parent's main view, showed none of it, and the learner could not see how far a goal was from mastery. Parents had only evidence lists, no periodic summary, though minutes per day, goal transitions, mistake flow and due-review completion all sat in the data. On payloads, conditional polling had removed the cost of unchanged polls, but any tab switch or parameter change still shipped the whole knowledge map (60–80 KB for Chinese or English) that the today and mistake pages never needed.

## Decision

Task and map views reuse `MasteryDots` to show genuine independent-day progress without another reward channel. Browsing another book carries no borrowed current-term mastery. The parent summary remains derived from effective answers and review evidence rather than a saved weekly ledger.

Seven-day metrics use Shanghai today and the preceding six calendar days. First mastery, recovery through new answers and repeated work remain distinct. Review opportunities include overdue work at window start and genuinely due work in the window; completion requires independent correctness after becoming due, survives rescheduling and remains separate from current difficulty. Unknown dates/assistance cannot supply dated completion. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns identity, source verification and historical replay rules.

Shared queries select page-specific projections, loading full knowledge maps and history only when needed. Stable file versions and time thresholds govern refresh rather than revision alone; the typed resource owns consumption. The [read-path decision](../simplification/2026-10-25-student-read-path.md) owns those cache and lifecycle rules.

## Alternatives considered

**A separate type for the lite view.** With the client fetching per tab, both shapes occur, and a union forces discrimination at every consumer; one shape plus a `lite` flag keeps a single type with heavy collections present only on the map tab.

**Caching the weekly summary on disk.** A week recomputes from evidence in milliseconds; a cache would only add invalidation.

## Consequences

Goal rows show n-of-3 progress, and parents see a compact summary without fetching every map. Numbers describe observed evidence rather than ability; corrections recompute effective facts without adding answers. Display/payload rationale remains here; release browser checks belong to [HANDOFF](../../../../HANDOFF.md).
