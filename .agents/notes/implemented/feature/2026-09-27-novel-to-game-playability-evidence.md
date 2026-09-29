# Agent Note: Game QA requires authenticated browser evidence

Status: implemented

English | [中文](2026-09-27-novel-to-game-playability-evidence.zh.md)

## Problem

A handwritten QA record cannot establish that the current build launches, draws, accepts input or reaches an outcome. A text-only browser also cannot supply Canvas or WebGL evidence. Rebuilding state, save and restart plumbing for every adaptation spends effort before the game has rules.

## Decision

The pinned `game-qa` production entry launches Chrome with a private temporary profile. Its server uses the same CSP source and Session-prefixed resource layout as Studio. The runner replays a fixed `qa/plan.json`, reads the shared state hook, captures and compares rendered frames, checks a designed terminal state, and restarts. Missing controls and runtime or CSP errors fail the run. Only the six mechanical checks remain blocking.

The Host supplies a process-private signing key only to this entry. The runner signs the exact record, including commands, exit codes, file hashes and screenshots. The Host authenticates the record and rechecks contained evidence/build paths before projecting a pass beside the preview. An imported or edited record, a changed build, or a Host restart requires another run. Direct shell runs remain useful diagnostics but cannot mint a Host-accepted pass.

`game-build/templates/create_game.py` creates narrative, turn-based or Canvas starters with deterministic rules, events, save/load, restart, theme variables and the QA hook. The default art standard is local SVG, CSS and Canvas, with locally synthesized audio when needed; the declared art direction must match shipped assets. Paid game media entries are not required by this alternative.

The driver records default, greedy and random strategy runs across five seeds, empirical success rates and unobserved endings. The Skill passes a bounded blind-play request to a separate agent without design or code context and preserves its prompt, actions and observations. Missing browser or subagent capability is an explicit limitation. These reports inform design and do not create a seventh mechanical check.

The game bridge gives absolute exporter, lineage, source-index and template paths. Intake accepts the novel export bundle and checks index coverage; selected-range analysis records its boundaries rather than claiming whole-book coverage. Builds use relative local assets because Studio denies external scripts, fonts and network access.

## Alternatives considered

Trusting self-reported PASS was rejected because freshness does not establish validity. Lightpanda remains suitable for text research but cannot replace a renderer. Subjective playability remains advisory: a mechanical score cannot establish fun or balance.

## Validation

Real Chrome runs passed all six checks for narrative, turn-based and Canvas templates. Missing controls, absolute resource paths and CDN scripts failed. Host tests reject unsigned, changed, missing or inconsistent evidence and changed build inventories. Studio displayed the QA status beside the running Canvas preview. The [workbench decision](2026-09-03-creative-workbench.md) retains Session, permission, credential and job ownership.

## Consequences

Chrome and Node 22+ are local dependencies. Frame changes establish rendering, not visual correctness; five strategy seeds do not establish exhaustive reachability. The host key intentionally expires on restart.
