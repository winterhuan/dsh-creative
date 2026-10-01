# Agent Note: Creative specialists use native collaboration

Status: implemented

English | [中文](2026-10-01-creative-role-agents.zh.md)

## Problem

A dedicated Role tool repeats native delegation and creates a separate Team path. Requiring fixed review JSON then couples chapter submission to role-specific result wrappers and model metadata, although those fields cannot establish literary quality or reviewer independence.

## Decision

Role remains a professional Agent. Native subagent or Team tools create the actual executor; its initial task names its responsibility, packaged Role file and resource root, and the executor reads the instructions with native read. No Role tool, registry, Skill alias, package or system-persona override is needed. Native DSH owns models, permissions, lifecycle, messages and task coordination.

Review produces ordinary findings with source locations and useful quotations, not a mandatory certificate. Chapter submission keeps outline and mechanical checks, current wordcount hashes, state revisions and atomic tracking writes. It neither requires review JSON nor reports literary approval. Story facts remain in tracking rather than being reconstructed from a Team task board.

Existing reader_value_records remain opaque historical data through normal transactions, without new records or continuation projection. Old transaction reader_value is accepted but does not decide submission. Tracking V4/V5 remain readable; no bulk migration, model-metadata service or new format is introduced.

This supersedes Role execution policy in the [workbench decision](2026-09-03-creative-workbench.md#composition-and-knowledge) and the review-certificate/model requirements in the [reader-value decision](2026-09-22-novel-reader-value-generation.md). Their project safety, genre-aware review, outline and advisory-detector rationale remain active.

## Alternatives considered

**Keep a thin creative_role wrapper.** It still owns role selection, two result formats, service availability and cleanup that native tools already provide.

**Load a Role into the caller and call it independent review.** Instructions do not create another executor. Professional delegation still creates a real Agent; self-review is described honestly.

**Replace review JSON with another schema or approval ledger.** This preserves the same maintenance without proving quality. Review remains a workflow responsibility, not script-certified approval.

**Remove tracking too.** Native Session history and Team tasks cannot replace authoritative character, timeline and foreshadowing state or protect project transactions.

## Consequences

Specialist instructions use task context rather than plugin-owned system persona. The compiler no longer enforces a closed Role enum, and scripts no longer require seven review quotations or known model metadata. Mechanical submission success is not literary approval. Tests cover native Agent creation and actual instruction reads, Team reuse, review-free submission, preserved legacy records and retained hash/revision failures. Scripted models do not establish literary quality.
