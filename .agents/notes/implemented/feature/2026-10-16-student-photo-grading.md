# Agent Note: Photo transcription drafts and parent confirmation

Status: implemented

English | [中文](2026-10-16-student-photo-grading.zh.md)

## Problem

A recognition error can enter the mistake book and review schedule if a photographed answer is graded before a parent checks its transcription. Transcription confidence, correctness and assistance are separate facts. A valid photo flow must retain the original answer after confirmation, including workbook work without a prepared sheet.

## Decision

Each worksheet owns bounded transcription drafts, frozen questions, original responses and current assessments. Native chat is the default photo and confirmation entry; the agent writes official files and runs validation. Explicit manual marking shares application validators through the typed interface. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns this authoring and stable-identity model.

A draft preserves transcription, result, confidence, assistance, uncertainty and image references separately. Parent confirmation may consume matched drafts but retains each original answer and result under the owning worksheet, including independent-correct workbook outcomes. Partial confirmation and repeated handling preserve identities. Corrections retain known assistance and save error-cause-only edits without manufacturing another response. High-confidence batch eligibility additionally requires correctness, known assistance and no uncertainty; all other items require individual review.

Paper answer dates require explicit parent confirmation and retain day precision. Worksheet-wide dates do not replace per-response dates or explicit unknown values. Receipt and grading times do not establish answer dates or order. Unknown facts stay visible and outside dated evidence.

## Alternatives considered

**Keep writing paper results directly from the photo.** Faster, but a single recognition error enters review unverified, which is the failure the parent review step exists to prevent.

**Add an OCR service.** Still needs human verification of results and causes, and adds a dependency the package deliberately avoids.

**Let the model confirm on its own after transcription.** Confirmation text must quote a real parent statement; self-confirmation would defeat the evidence boundary.

**Mark drafts as unconfirmed paper results in the same collection.** The two have different lifecycles (drafts are consumed, results are replaced) and mixing them would complicate every existing query and capacity rule.

## Verification

Official-file, learning and client regressions cover retained workbook answers, partial confirmation, unknown dates/assistance, invalid batch candidates and cause-only corrections. Real-tool integration and release verification belong to the [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md); deterministic transcription fixtures do not measure OCR accuracy.

## Consequences

Parent review is an explicit cost before photographed work supplies valid evidence. Drafts never count as answers and are disposable only after confirmed answers remain saved. Format 2 requires explicit legacy migration; old-plugin recovery uses a verified backup in a separate workspace.
