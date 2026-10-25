# Agent Note: Mastery progress on display, a parent weekly summary and per-tab payloads

Status: implemented

English | [中文](2026-10-25-student-weekly-progress.zh.md)

## Problem

Mastery progress was nearly invisible: `independentDays` existed all along, but only the task card drew three dots and the growth tab listed them as text — the knowledge map, the parent's main view, showed none of it, and the learner could not see how far a goal was from mastery. Parents had only evidence lists, no periodic summary, though minutes per day, goal transitions, mistake flow and due-review completion all sat in the data. On payloads, conditional polling had removed the cost of unchanged polls, but any tab switch or parameter change still shipped the whole knowledge map (60–80 KB for Chinese or English) that the today and mistake pages never needed.

## Decision

Progress on display: the task card's three dots became a shared `MasteryDots` component, reused in the map's concept details and unit goal rows (hidden while browsing another book, which carries no mastery); when the third independent day lands on the current task, the task card celebrates once — no new reward channel, only existing evidence as progress motivation.

The parent weekly summary: `status.ts` gained a purely derived `weeklySummary` — minutes per day and active days over the last seven days, practised and newly mastered goals, new and consolidated mistakes, due-review completion, and the week's top error causes — carried by the dashboard as one compact object on the parent page. Everything recomputes from stored evidence; nothing is stored per week.

Per-tab payloads: the workspace API takes a `tab` parameter (today/map/mistakes/parent) folded into the client's poll signature; only the map tab returns the full knowledge map, every other tab empties its concepts, relations, ideas and order and marks the view `lite`, keeping objectives, units and the summary for progress dots and goal lists. Tool queries are unaffected.

## Alternatives considered

**A separate type for the lite view.** With the client fetching per tab, both shapes occur, and a union forces discrimination at every consumer; one shape plus a `lite` flag keeps a single type with heavy collections present only on the map tab.

**Caching the weekly summary on disk.** A week recomputes from evidence in milliseconds; a cache would only add invalidation.

## Consequences

Goal rows and map details show n-of-3 progress and the parent page gains a weekly card; non-map payloads no longer carry the whole map, so full fetches on tab switches are much lighter. Weekly numbers describe evidence and never judge ability, matching the standing boundary. Visibility and payload decisions live here; the cached read path is recorded in the [read-path note](../simplification/2026-10-25-student-read-path.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
