# Agent Note: Photo transcription drafts and parent confirmation

Status: implemented

English | [中文](2026-10-16-student-photo-grading.zh.md)

## Problem

A photographed sheet was previously written straight into paper results by the model through paper-result: a misread answer went directly into the mistake book and the review schedule with no per-question human check, and the panel could only re-mark items afterwards, not verify the transcription first. A separate defect surfaced while tracing the flow: the parent's School progress form posted `school-progress` but the workspace route's action whitelist never contained it, so the form failed with 403 while client tests, which call the reducer through a fake backend, never exercised the route gate.

## Decision

A new `paperDrafts` collection (cap 500, `default([])` so old state parses) stores one transcription draft per question: worksheet, item, transcribed response, judged result (including unassessed), assistance, uncertainties and an optional error cause. `paper-draft` is the model's only way to write them; it validates the sheet and item, refuses discarded sheets, keeps the original receipt time on replacement, and identical retries are no-ops. `confirm-paper` is the parent's way in (the panel also uses the same action through the route): each entry carries item, result, optional response, assistance and cause; a draft or a prior result must exist; confirmation reuses `gradeItem` with feedback 家长核对照片转录 and the draft's receipt time, so replacing marks, advancing review stages and creating practice mistakes keep exactly the grade-sheet semantics. Partial confirmation is allowed, matched drafts are cleared, and re-sending a confirmed batch is idempotent. When the parent supplies a cause on a wrong mark, it is written to the linked mistake too, not only to newly created ones. The route whitelist gains `school-progress` (repairing the 403), `classify-mistake` and `confirm-paper`; `paper-result` is retired everywhere: command, tool description, skill references, prompts and tests. The desk's worksheet block gains a 待核对转录 fieldset with per-item response editing, result radios, a cause select and a 「确认入库 · N」 button; the dashboard worksheet projection carries `drafts`.

## Alternatives considered

**Keep writing paper results directly from the photo.** Faster, but a single recognition error enters review unverified, which is the failure the parent review step exists to prevent.

**Add an OCR service.** Still needs human verification of results and causes, and adds a dependency the package deliberately avoids.

**Let the model confirm on its own after transcription.** Confirmation text must quote a real parent statement; self-confirmation would defeat the evidence boundary.

**Mark drafts as unconfirmed paper results in the same collection.** The two have different lifecycles (drafts are consumed, results are replaced) and mixing them would complicate every existing query and capacity rule.

## Verification

Host tests rewrite all previous paper-result flows as draft-then-confirm and assert receipt-time preservation, feedback, stage advancement, wrong-answer mistake creation, partial confirmation, idempotent retries, missing-transcription rejection and cause override; the panel flow is covered in the client tests, including the cause select and the resulting cause on the linked mistake. Route tests assert paper-draft stays at 403 for the UI while school progress, classification and confirmation return 200. Plugin tests cover the native store path. The interface was not verified in a real DSH browser.

## Consequences

Every photographed result now needs one parent confirmation step before it enters review, which is the intended cost. Drafts are disposable scratch (500 cap ≈ 62 full sheets) and never counted as evidence. An older plugin build reading a new state file is rejected by the strict schema, which is acceptable for this single-workspace package.
