# Agent Note: One source for model guidance and a structured hint ladder

Status: implemented

English | [中文](2026-10-25-student-model-guidance.zh.md)

## Problem

One set of teaching rules lived in three places: the `study_update` `change` parameter description (~1300 characters) and the `study_status` kind description (~700 characters) sat in every learning session's context; the five `more` strings returned by `queryStudy` restated question-writing and grading rules; the study skill was the third copy. Keeping them in sync was manual, and the README's claim that "tool descriptions keep the call contract" was not true. Hints were meanwhile improvised by the model: `hintLevel` was only a counter, the skill rule was one sentence about the first hint, and the misconceptions registered per goal in the knowledge maps fed question writing but never hints.

## Decision

Tool descriptions and `more` strings collapsed to contract and pointers: kind values, required parameters, idempotency and confirmation rules, and schema-enforced constraints stay; question, hint and grading rules live only in the study skill (almost all were already there — the few missing moved in); each `more` became a one-sentence pointer. Hints became structured supply: `objectiveElements` derives a three-rung `hintLadder` — rung one points at the givens or a drawing by the objective's learning method (one cue for each of the nine methods), rung two has the child self-check against the first registered misconception, rung three offers the registered question points as steps. `kind=elements` returns the ladder and the skill's hint section now teaches by rung, never giving the operation or the answer. All of it derives from existing map data (misconceptions and question points cover 100% of the twelve maps); nothing new was authored.

## Alternatives considered

**Keeping the rules in descriptions as redundancy.** Three-way sync costs and drift risk outweigh the safety; schema-enforced rules are backed by validation, and behavioural rules have one owner in the skill.

**Authoring hint ladders into the map JSON.** Hand-writing three hints per goal is heavy; deriving from the existing method, misconception and question-point fields keeps the ladder current whenever the map changes.

## Consequences

The always-present tool definitions shrank markedly (`change` description ~1300 → ~330 characters) and behavioural rules have one owner. Hint quality now depends on a real model following the ladder — one real tutoring session spot-check is owed (verification ownership recorded in HANDOFF); unit tests cover the ladder derivation and the elements output. Teaching-rule decisions stay with the [learning-system note](../feature/2026-10-05-student-learning.md); repository and real-DSH verification belong to [HANDOFF.md](../../../../HANDOFF.md).
