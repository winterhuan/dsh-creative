# Agent Note: Cached student reads and one mastery rule

Status: implemented

English | [中文](2026-10-25-student-read-path.zh.md)

## Problem

The workbench polled the workspace API every three seconds, and each poll re-read and fully re-validated `.study/state.json` (8 MiB cap, twenty thousand attempts), replayed review scheduling, then ran `studyStatus` and `studyInsight` in full; a cross-grade check-in scope made `diagnosticFor` run a second complete `studyInsight`, which filtered every attempt for each objective. When `objectiveOf` missed the current term it built resolved arrays for all twelve knowledge maps before searching, and `studyStatus` called it per paper result. Near the collection caps a term of real use made the panel visibly slow.

Worse, mastery was derived twice and the copies had drifted: `studyInsight` counted "never independently correct and recently wrong" as weak while `diagnosticFor`'s cross-grade copy lacked that rule and omitted the recurring-error priority term — the same evidence produced different verdicts in the current-term insight and a cross-grade check-in, contradicting the skill's promise that a never-independently-correct objective answered wrong once is marked weak. `queryStudy`'s chain also returned the attempts page for any unknown kind.

## Decision

One derivation: `masteryOf` now serves both the current-term insight and every cross-grade pool (recent-wrong-is-weak included, recurring error causes weighted into priority), and cross-grade objectives are built by the same function; a regression test pins one wrong answer to weak under both readings and out of a deep check-in's re-probe samples.

The read path is layered by cost. The official-file reader caches strict parsed entities by stable target identity and actual file version, and checks directory membership before composing a workspace. One evidence index associates block and worksheet responses with their assessments; `objectiveOf` uses the lazy global knowledge-map index, and `diagnosticFor` accepts a precomputed insight. Shared queries in `src/learning/queries.ts` cache projections by observed versions and query options until their next time threshold; elapsed minutes refresh separately. Shanghai midnight, review due times and evidence-window boundaries invalidate the affected projection even without a revision change. The Student resource provider follows generated Remote snapshots and native reconnection, retains failed reads as visibly stale, and waits for stream disposal. `queryStudy` rejects unknown kinds explicitly, and collection lookup uses own-key checks.

## Alternatives considered

**Trimming the dashboard payload per tab alone.** This requires a shared client/server field contract and reduces transfer size, but does not replace version-stable parsing or one shared mastery derivation. The shared query owner selects each required projection.

**Caching insight by state plus a coarse time bucket.** Evidence windows and due times can change within a bucket; explicit refresh thresholds preserve their timing without repeating stable parsing and indexing.

**Caching in the route layer.** Tools, typed queries and read-only file consumers share the reader and query owners; a route-only cache would duplicate validation and evidence work.

## Consequences

The original single-state synthetic benchmark of 3000 attempts and 200 mistakes measured about 17 ms for a full cross-grade dashboard and 0.1 ms for an unchanged conditional poll; it does not measure the entity-file resource path. Current regressions pin stable-version reuse, direct edits without revision changes and time-threshold refresh. Cross-grade check-ins exclude weak goals from re-probe samples, matching the rule that teaching stays on the unmet goal. Tools and panels consume the same evidence rules.

The HTML worksheet and single figure source are recorded in the [worksheet note](2026-10-25-student-worksheet-html.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
