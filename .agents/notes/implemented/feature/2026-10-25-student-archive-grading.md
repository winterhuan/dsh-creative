# Agent Note: Sampled batch grading, derived fields out of the file and term archiving

Status: implemented

English | [中文](2026-10-25-student-archive-grading.zh.md)

## Problem

The parent friction of the paper loop was enough to abandon the main channel: every photographed sheet needed item-by-item confirmation before entering the record. The derived review fields (stage, independentDays, dueAt) replayed from evidence on every read yet were still written back to the state file — two copies of the truth plus write amplification. And the end of a term offered only "move to a new workspace", with no archive exit for the evidence.

## Decision

Grading moved to sampled batches (the parent's choice): `paper-draft` gained an optional `confidence` (high/low, absent treated as low); the skill requires high for unambiguous transcriptions with clear verdicts and low with uncertainties otherwise. The workbench offers one-click batch confirmation for high-confidence items (still one parent action, equivalent to an existing multi-item `confirm-paper` submission), while low-confidence and wrong answers stay item by item. The entry boundary changed from "confirm each item" to "confirm high-confidence in one batch plus per-item checks for the rest" — the parent remains the single gate.

Derived fields left the file: `stage`/`independentDays` became schema defaults (optional in, always present out, zero consumer churn) and `dueAt` optional; writes strip the three fields per mistake and reads refill them through the cached replay. Old files carrying the fields keep loading. The state file is smaller with one source of truth.

Term archiving: the new `archive-term` command (parent-confirmed, refused during an active block) has the store export all evidence to `.study/archive-<school-year>-<term>.json` first (an existing file refuses, preventing accidental overwrites) and then clear the profile to a minimal state carrying `archivedAt`; the read layer treats an `archivedAt` file as absent, so the same workspace can `setup` a fresh term directly. Parent setup gained an archive button with a confirmation dialog, and the action metadata declares it panel-submittable.

## Alternatives considered

**Auto-entering high-confidence items by model judgement.** Replacing "nothing enters without a parent action" with model discretion crosses this package's trust boundary; batch confirmation keeps the parent as the gate.

**Deleting the state file on archive.** The filesystem service may not expose deletion; a minimal `archivedAt` file reads as absent just the same and stays visible in the schema.

## Consequences

Parent review drops from item-by-item to one batch plus a few spot checks; the state file no longer carries derived fields and the read-path replay is the single truth; term switches close inside one workspace with durable evidence exports. Real-family walkthroughs of the batch confirm and the archive flow remain to be verified (ownership recorded in HANDOFF). The grading and archive boundaries live here; the worksheet and read path are recorded in the [worksheet note](../simplification/2026-10-25-student-worksheet-html.md) and the [read-path note](../simplification/2026-10-25-student-read-path.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
