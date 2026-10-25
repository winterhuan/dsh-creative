# Agent Note: Learning core split into modules with action metadata

Status: implemented

English | [中文](2026-10-25-student-learning-modules.zh.md)

## Problem

`src/learning.ts` carried seven responsibilities in 1541 lines — time and text helpers, review scheduling, time status, a twenty-six-action execution switch, mastery insight, map projection and review planning — six tenths of the Host face, with `tests/learning.spec.ts` swollen to match. Adding one action meant touching five places: the schema, the switch, the tool description, the hand-copied route allowlist and the client copy, and the allowlist had no compile-time link to the schema.

## Decision

The file split into six `src/learning/` modules plus an `update/` handler family: `shared.ts` (time/text helpers and scope predicates), `schedule.ts` (review replay), `status.ts` (time status and today's summary), `mastery.ts` (the single mastery rule, insight and check-in plans), `view.ts` (objective resolution, question elements, review-sheet planning and map projection) and `update/{context,profile,session,mistakes,paper,index}.ts` (action handlers by family with a type-safe dispatch switch). `rawApply` owns clone, dispatch and the post-amble (revision bump, replay, revalidation); a handler returns the previous state for a no-op and the clone for a mutation, and the composite configure-course action composes its two sub-actions through `rawApply` under one revision bump. Fourteen importers now import explicit new paths with no barrel file.

Action metadata became declarative: `src/actions.ts` declares `Record<Command['action'], { panel, group }>` exhaustively — the submission surface and owning handler family per action — and the route allowlist is generated from `panel: true`, kept compile-time consistent with the schema's twenty-six actions. A new action now touches three places: schema, handler and metadata. `locales.ts` stays one file with section comments, and the spec split along the same boundaries into update/schedule/insight/view files.

## Alternatives considered

**Keeping learning.ts as a re-export barrel.** Zero importer churn, but the monolith persists and future features keep growing on it.

**A handler registry driving dispatch.** Mapped-type dispatch needs an `as` cast (the repository gate forbids new assertions), so an exhaustive switch delegation stands in, with the compiler proving no action is missed.

**Splitting locales into several files.** Namespace merging needs module augmentation in four places; section comments already serve navigation.

## Consequences

A pure refactor: 129 tests pass unchanged, redistributed across 11 files, and the client bundle stays effectively the same size (4.61 MB). The cached read path and one mastery rule are recorded in the [read-path note](2026-10-25-student-read-path.md) and the HTML worksheet in the [worksheet note](2026-10-25-student-worksheet-html.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
