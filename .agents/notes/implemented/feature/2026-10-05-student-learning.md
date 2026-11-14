# Agent Note: Student learning with confirmed course materials

Status: implemented

English | [中文](2026-10-05-student-learning.zh.md)

## Problem

Young learners need short, encouraging practice that preserves mistakes and learning evidence between conversations. A region and grade do not identify the school's textbook edition. Generated textbook content and rewards for elapsed time would undermine learning.

## Decision

The [domain mode decision](../../archived/feature/2026-10-06-domain-modes.md) owns activation. The independently installed `@winterhuan/dsh-student` provides native DSH guidance for Chinese, mathematics and English, with one learner's term per workspace. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns conversational operations, official files, stable question/response identities, validated evidence and supplemental guarded manual saves.

Course records retain source identity, edition, scope, location and explicit parent confirmation. Parents use official entry points or supply relevant pages to confirm school alignment. Generic foundation practice remains available while alignment is pending. The [default textbook decision](2026-10-10-student-default-textbooks.md) owns bundled foundation materials; the plugin does not download textbooks. Uncertain image transcription needs correction before review.

There is no block, break or daily time limit; the [overhaul decision](2026-10-30-student-overhaul.md) owns that policy. At most two stars per day reward recorded participation and reflection. Independent dated answers establish spaced review; hinted or unverified answers cannot establish independence. Original responses precede assessment and survive reload. Native and shell writes remain outside the application's version guard; independent validation and observed backups do not guarantee recovery of unseen overwrites.

## Alternatives considered

**Prompt-only records and limits.** This is smaller but cannot reliably prevent duplicate rewards or conflicting writes. Validated facts retain those rules; the [overhaul decision](2026-10-30-student-overhaul.md) records why duration limits are absent.

**A complete school textbook corpus and independent tutoring application.** This adds edition maintenance and distribution obligations before the school books are known. Two bounded foundation defaults follow the separate textbook decision without establishing school alignment. Native DSH chat, images and files supply the needed interaction.

## Verification

- Native tool and official-file tests cover setup, course confirmation, saved answers, assistance, review, stale manual saves and repeated rewards.
- Source guidance identifies official entry points and unresolved editions without inventing content or downloading textbooks.
- Deterministic integration uses real native tools and independent file consumers; release browser/install checks belong to [HANDOFF](../../../../HANDOFF.md).
- Real-model transcription accuracy and educational effectiveness remain unmeasured.

## Consequences

The plugin cannot authenticate parents, measure attention or guarantee generated answers. It records explicit confirmation and observed work; uncertainty remains visible. A model may ignore guidance. Quiet elapsed totals use Shanghai calendar days and neither lock the screen nor refuse late answers.
