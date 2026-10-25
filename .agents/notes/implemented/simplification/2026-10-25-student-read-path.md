# Agent Note: Cached student reads and one mastery rule

Status: implemented

English | [中文](2026-10-25-student-read-path.zh.md)

## Problem

The workbench polled the workspace API every three seconds, and each poll re-read and fully re-validated `.study/state.json` (8 MiB cap, twenty thousand attempts), replayed review scheduling, then ran `studyStatus` and `studyInsight` in full; a cross-grade check-in scope made `diagnosticFor` run a second complete `studyInsight`, which filtered every attempt for each objective. When `objectiveOf` missed the current term it built resolved arrays for all twelve knowledge maps before searching, and `studyStatus` called it per paper result. Near the collection caps a term of real use made the panel visibly slow.

Worse, mastery was derived twice and the copies had drifted: `studyInsight` counted "never independently correct and recently wrong" as weak while `diagnosticFor`'s cross-grade copy lacked that rule and omitted the recurring-error priority term — the same evidence produced different verdicts in the current-term insight and a cross-grade check-in, contradicting the skill's promise that a never-independently-correct objective answered wrong once is marked weak. `queryStudy`'s chain also returned the attempts page for any unknown kind.

## Decision

One derivation: `masteryOf` now serves both the current-term insight and every cross-grade pool (recent-wrong-is-weak included, recurring error causes weighted into priority), and cross-grade objectives are built by the same function; a regression test pins one wrong answer to weak under both readings and out of a deep check-in's re-probe samples.

The read path is layered by cost: `studyStore` caches the parsed, validated, replayed state keyed by the observed file version — a hit skips reading and validating, and any write or external change drops the entry; outcomes are indexed in one pass (attempts and paper results classified together), `objectiveOf` reads a lazily built global index over the twelve maps, and `diagnosticFor` accepts a precomputed insight so a dashboard computes it once. The time state moved into `timeStatus` (sessions and limits only): a poll carries the revision the panel already displays, and unchanged evidence returns just `serverNow` and the fresh time state. The client remembers the query signature its data was fetched with; periodic polls with the same signature and revision go conditional and merge only the time fields, while parameter changes, mutations and manual refreshes still fetch in full. `queryStudy` rejects unknown kinds explicitly, and the collection table is checked with own-key tests so prototype keys cannot pass through.

## Alternatives considered

**Trimming the dashboard payload per tab server-side.** That splits the client-server field contract; conditional polling already reduces an unchanged poll to one `timeStatus`, so trimming can wait for a demonstrated need.

**Caching insight by state plus a time bucket.** `studyInsight` depends on time windows (14-day help, 10-day stall); bucket granularity would skew due-date verdicts, and one indexed pass per request is enough.

**Caching in the route layer instead of the store.** Tool executions and the route both read state; keeping the cache in `studyStore` serves both.

## Consequences

On a synthetic state of 3000 attempts and 200 mistakes, a full dashboard with a cross-grade scope costs about 17 ms while an unchanged poll costs about 0.1 ms of server work and no longer ships the whole knowledge map (previously 60–80 KB every three seconds). Cross-grade check-ins no longer schedule re-probes for weak objectives, matching the recommendation rule that teaching stays on the goal. The conditional response is invisible to the model tools; `study_status` output is unchanged.

The HTML worksheet and single figure source are recorded in the [worksheet note](2026-10-25-student-worksheet-html.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
