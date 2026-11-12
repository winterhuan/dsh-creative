# Agent Note: Learning core split into modules with action metadata

Status: implemented

English | [中文](2026-10-25-student-learning-modules.zh.md)

## Problem

`src/learning.ts` carried seven responsibilities in 1541 lines — time and text helpers, review scheduling, time status, a twenty-six-action execution switch, mastery insight, map projection and review planning — six tenths of the Host face, with `tests/learning.spec.ts` swollen to match. Adding one action meant touching five places: the schema, the switch, the tool description, the hand-copied route allowlist and the client copy, and the allowlist had no compile-time link to the schema.

## Decision

`src/learning/` separates shared time/text/scope helpers, review replay, status, mastery, views, normalized evidence and read-only queries. The `update/{context,profile,session,mistakes,paper,index}.ts` family retains type-safe exhaustive dispatch for shared domain transformations. `rawApply` owns cloning, dispatch, revision changes and revalidation; no-op handlers return the previous state. Official-file schemas, consistent reading, validation, guarded manual saves and recovery descriptions live in `src/files/`. Tools and panels consume the same evidence and query rules rather than rebuilding them.

Manual-save permissions belong to the closed typed intent union in `src/files/manual.ts`; the Remote checks registered main-Session access before executing it. Handler-family ownership remains in the update modules without a second handler registry or consumer group labels. The Client locale dictionary stays one file, and tests follow the domain owners.

## Alternatives considered

**Keeping learning.ts as a re-export barrel.** Zero importer churn, but the monolith persists and future features keep growing on it.

**A handler registry driving dispatch.** Mapped-type dispatch needs an `as` cast (the repository gate forbids new assertions), so an exhaustive switch delegation stands in, with the compiler proving no action is missed.

**Splitting locales into several files.** Namespace merging needs module augmentation in four places; section comments already serve navigation.

## Consequences

The original module split preserved 129 tests across 11 files and a 4.61 MB client bundle; these measurements do not describe the later official-file and transport additions. The cached read path and one mastery rule are recorded in the [read-path note](2026-10-25-student-read-path.md) and the HTML worksheet in the [worksheet note](2026-10-25-student-worksheet-html.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
