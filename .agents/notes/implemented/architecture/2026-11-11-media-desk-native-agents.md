# Agent Note: Media Desk native creative Agents

Status: implemented

English | [中文](2026-11-11-media-desk-native-agents.zh.md)

## Problem

A text-request-only workbench cannot reuse native skills, research, approvals or continuing conversations. Saving a private editable copy beside Wiki output also makes external edits require synchronization. Creative execution, editable content and production acceptance need distinct owners without losing existing works, sources, preferences, media or metrics.

## Decision

DSH owns a continuing ordinary Session for each work and a separate global assistant Session. Media Desk records their actual identities, DSH home and Wiki workspace, preserving those associations across restart. The dedicated creative preset supplies file, search, Shell, skill, question, approval and compaction capabilities with a creative persona. It excludes coding, plugin administration, scheduling, goals and automatic delegation. Missing services, preset or saved Wiki prevent execution rather than triggering a direct-model fallback.

The effective `llm-wiki` skill and Wiki instructions govern research and knowledge maintenance. Topic synthesis supplies facts; explicitly selected author samples supply personal style. Accepted generated material saves automatically into Notes. Valuable new knowledge follows the Wiki maintenance workflow; creative output does not become authoritative knowledge merely because it is stored there. An explicit read-only request prevents business writes.

Notes owns one current Markdown per work and language, distinct collected-source material, custom preferences and accepted media. Content-type folders directly under `notes/` let other creative tools reuse these files. Media Desk retains stable identities, references, raw metrics, structured plans, operational state and receipts. Fixed AI originals, inactive drafts and recovery versions remain history. The [native acceptance decision](2026-11-12-media-desk-native-acceptance.md) owns publication, version checks, candidate acceptance and recovery.

Four bounded business tools read registered objects, apply ordinary edits, admit production or regeneration, and submit structured candidates. Actual Session and input associations authorize their operations. Planning precedes dependent writing and media; each production freezes its relevant preferences and input references. Ordinary assistant text cannot substitute for a durable accepted result.

Native Stop ends the current turn and retains unrelated queued input. Cancel production invalidates its owned text and media attempts. Start a new conversation waits for owned work to settle, retains the old Session and its pending input, and binds a new Session without waking the old inbox. Native model selection controls the next unprepared step; image configuration remains independent. The client uses the official conversation factory and a Media Desk Session scope, retaining workbench content actions and ordinary Session navigation.

HTTP and supported subscription image backends retain their separate attempt, result-directory and cancellation contracts. Subscription tools do not gain automatic retry or HTTP fallback. Export reads accepted text, sources and media into a fresh snapshot directory. Scheduling and platform publication remain separate, manual actions.

Future Monid account collection, refresh, connection and cost interfaces are absent. Historical accounts, imported content, source links and metrics remain available for manual and CSV review. Link collection and explicitly selected web samples remain supported. Rule proposals require review and activation; exported voice instructions derive from current enabled preferences and cannot reinstate disabled rules.

## Alternatives considered

**Read Wiki files directly in the prompt builder.** Selecting a few files is a smaller change, but duplicates skill discovery and retrieval while omitting native execution, approvals and reusable skills.

**Use a separate creation workspace and manual export.** This separates creation from the Wiki directory, but adds workspace selection and saving steps. The selected Wiki workspace applies its own instructions and saves accepted creative material automatically while Media Desk retains business state.

**Keep Media Desk text with a saved Notes copy.** This requires fewer initial changes, but retains duplicate editable text and needs synchronization before Obsidian edits reach the workbench. Shared primary files require additional version and recovery work.

**Group material under a plugin-specific Notes directory.** A `media-desk/` wrapper ties paths to one application and adds a navigation level. Content-type folders permit reuse; registered associations still determine which files Media Desk can modify.

**Replace only `callModel()` with an Agent wrapper.** One final text blob, global model status, browser-owned production and memory-only jobs cannot establish native completion or safe writes after cancellation.

**Create a new Agent for every small generation call.** This isolates structured stages but loses the selected continuing conversation and repeats skill and context loading. Production attempts therefore have identities separate from their continuing Session.

**Move all content and orchestration into chat history.** Session evidence cannot replace editable works, scheduling, stable media identities or version checks. Notes holds persistent content, while Media Desk records business acceptance.

**Copy Antfarm's scheduler or invent a parent Agent for the panel.** Native root Agents already exist. Antfarm's SQL workflow and fresh-attempt identity solve a different problem; this integration uses public DSH contracts without adopting another plugin's business engine.

## Consequences

Native execution preserves ordinary tools, input and history while shared Notes files support both workbench and external editing. Skills and research add context and latency. Current enabled preferences take precedence over exported instructions, and original samples remain distinguishable from topic evidence.

Versioned migration preserves historical identities and language variants with verified backups. Legacy chat remains historical context rather than fabricated native tool events. Recovery does not automatically repeat uncertain model, image or Wiki effects; rollback preserves newer Session and Notes evidence. Cooperative ownership covers same-machine local Hosts, not nonparticipating editors, network shares or power-loss durability.

Deterministic Host and Session checks cover acceptance and recovery, and isolated real-model runs establish actual skill loading, source reading and accepted text storage. These checks do not certify writing quality or facts. Paid image services, live subscription accounts and untested platforms retain explicit validation limits in the [package contract](../../../../plugins/dsh-media-desk/README.md) and release evidence. CSV review appends platform aggregates; repeated cumulative snapshots can double-count and do not replace per-post live metrics.
