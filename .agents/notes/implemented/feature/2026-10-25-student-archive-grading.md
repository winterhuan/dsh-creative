# Agent Note: Sampled batch grading, derived fields out of the file and term archiving

Status: implemented

English | [中文](2026-10-25-student-archive-grading.zh.md)

## Problem

The parent friction of the paper loop was enough to abandon the main channel: every photographed sheet needed item-by-item confirmation before entering the record. The derived review fields (stage, independentDays, dueAt) replayed from evidence on every read yet were still written back to the state file — two copies of the truth plus write amplification. And the end of a term offered only "move to a new workspace", with no archive exit for the evidence.

## Decision

The parent may confirm a sampled batch of high-confidence correct transcriptions with known assistance and no uncertainty; low-confidence, wrong, partial, unassessed or unknown-assistance items remain individual checks. Confidence cannot supply correctness or independence. Native chat carries the default confirmation intent, and the supplemental manual form uses the same validators.

Derived review stage, independent days and due dates remain outside durable collection facts. Shared evidence replay supplies them on reading, leaving one source of truth. Legacy derived fields remain readable without byte mutation.

A parent-confirmed archive preserves the original term's official entities before replacing active settings. The agent inspects and resumes existing valid output under the same identities; archive/export and active replacement are separate writes with explicit partial outcomes. A new setup creates a new term identity. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns byte-verified migration, restoration, old-term refusal and concurrency limits.

## Alternatives considered

**Auto-entering high-confidence items by model judgement.** Replacing "nothing enters without a parent action" with model discretion crosses this package's trust boundary; batch confirmation keeps the parent as the gate.

**Deleting the state file on archive.** The filesystem service may not expose deletion; a minimal `archivedAt` file reads as absent just the same and stays visible in the schema.

## Consequences

Parent review uses one eligible batch plus individual checks; derived evidence has one owner. Durable term exports retain original identities, while interrupted operations remain inspectable and resumable. Real-family batch/archive walkthroughs are separate from deterministic regression evidence. The [worksheet note](../simplification/2026-10-25-student-worksheet-html.md) and [read-path note](../simplification/2026-10-25-student-read-path.md) retain rendering and replay rationale; release checks belong to [HANDOFF](../../../../HANDOFF.md).
