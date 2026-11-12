# Agent Note: One source for model guidance and a structured hint ladder

Status: implemented

English | [中文](2026-10-25-student-model-guidance.zh.md)

## Problem

One set of teaching rules lived in three places: the `study_update` `change` parameter description (~1300 characters) and the `study_status` kind description (~700 characters) sat in every learning session's context; the five `more` strings returned by `queryStudy` restated question-writing and grading rules; the study skill was the third copy. Keeping them in sync was manual, and the README's claim that "tool descriptions keep the call contract" was not true. Hints were meanwhile improvised by the model: `hintLevel` was only a counter, the skill rule was one sentence about the first hint, and the misconceptions registered per goal in the knowledge maps fed question writing but never hints.

## Decision

Teaching and grading rules have one owner in the study skill. The resident `study_status` description defines bounded lookup, selectors and resource pointers; native file tools author official records, and the packaged read-only CLI validates them. File schemas and examples load on demand from the same definitions used by the business validator. `objectiveElements` derives a three-rung `hintLadder`: the first rung points at givens or a drawing using the learning method, the second asks the learner to check the first registered misconception, and the third offers registered question points as steps. `kind=elements` returns that ladder; the skill applies each rung without supplying the operation or answer. Existing map methods, misconceptions and question points supply the ladder, with no independently maintained hint dataset.

## Alternatives considered

**Keeping the rules in descriptions as redundancy.** Three-way sync costs and drift risk outweigh the safety; schema-enforced rules are backed by validation, and behavioural rules have one owner in the skill.

**Authoring hint ladders into the map JSON.** Hand-writing three hints per goal is heavy; deriving from the existing method, misconception and question-point fields keeps the ladder current whenever the map changes.

## Consequences

The native-authoring package advertises one read-only Student tool. Its actual registered parameter JSON is 2,078 UTF-16 characters, compared with the 61,268-character two-tool baseline; the complete repeated request history, schema reads and CLI results remain additional context costs. These figures do not measure provider tokens or a net cost reduction. Hint quality still depends on a real model following the ladder; derivation and element-output regressions do not establish tutoring quality. Teaching-rule decisions stay with the [learning-system note](../feature/2026-10-05-student-learning.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
