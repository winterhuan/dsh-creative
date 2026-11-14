# Agent Note: Native Media Desk result acceptance

Status: implemented

English | [中文](2026-11-12-media-desk-native-acceptance.zh.md)

## Problem

An assistant can submit a plausible candidate before its native turn fails or is stopped. A file can also be published before its metadata receipt is durable. Treating assistant prose, idle status or a copied Markdown file as accepted work would let uncertain results overwrite newer edits and restart external effects after a crash.

## Decision

DSH owns work/global Sessions and their native input, tool, approval and question history. Media Desk owns business admission and acceptance. Structured plan, article, style and rule candidates require the actual associated Agent, matched consumed input, successful persisted turn end, original Notes version and a durable acceptance receipt. Candidate storage remains private and does not select current text. Ordinary business edits return their own immediate validated receipts.

Notes contains the sole editable work, material and preference text and the single accepted file for each media identity. Fixed AI originals, preference versions, source ideas and recovery snapshots are historical records. Store retains references, language selection, structured plans, operational state and raw metrics. Stable media identities remain resolvable after a redraw; exports use fresh folders and a content/media manifest.

Each admitted production freezes the requested writing preferences and material/language versions. The accepted plan starts a dependent article and independent media attempts. A current-body edit does not invalidate sibling images; an old plan cannot accept a new script, and a new plan cannot export an old script with its new media. Current native model selection applies to the next unprepared step rather than freezing one text model for the whole production.

Native Stop cancels its current turn and retains pending input. Whole-production cancellation invalidates its text and media attempts. Starting a new conversation waits for owned active work to settle, retains the old Session and inbox, then binds a fresh Session. Queue edits and steering preserve native message identity while invalidating changed business-stage input.

Same-machine writer ownership covers the canonical data directory and every retained Notes root. Noncooperating editors are checked by bytes at publication and receipt acceptance; displaced bytes and independent candidates permit conflict review. Recovery verifies durable files, inputs and receipts, reuses known candidates and never automatically repeats uncertain model, image or Wiki writes. Offline rollback restores a verified pre-migration backup while retaining later Notes and Session evidence.

The [native creation decision](2026-11-11-media-desk-native-agents.md) owns the creative composition, Wiki storage and collection choices. This record owns acceptance and recovery; [the package contract](../../../../plugins/dsh-media-desk/README.md) owns current behavior and validation limits.

## Alternatives considered

**Assistant text or idle as success.** Neither proves the matched input completed successfully or that its file and receipt were accepted. Native durable events and explicit candidate tools preserve that distinction.

**Editable private text plus a Wiki copy.** Two current bodies require synchronization and can overwrite an external editor. Notes is the editable owner; private historical candidates support recovery rather than a second current body.

**Replay the whole production after restart.** A missing receipt does not prove a model, image or knowledge write never happened. Explicit save retry reuses retained bytes; uncertain external effects require a new user action.

**One cancellation scope or frozen text model.** Native correction and continued conversation need turn-level control; production owns a wider set of image attempts. Native step preparation, rather than plugin defaults, owns the actual text model.

## Consequences

The design retains existing works and gives editors a shared Markdown owner, durable receipts and recoverable candidate bytes. Publication and Store replacement remain separate operations with a journal; local cooperative locks do not make ordinary editors atomic participants. Cross-machine shared directories, power-loss durability and exactly-once external billing remain unsupported.

Real model and deterministic native-runtime evidence establish execution and accepted storage, not factual or writing quality. Paid image and subscription-account availability depend on the selected external service. Local release records identify exact validation scope rather than promoting controlled fixtures to real-service evidence.
