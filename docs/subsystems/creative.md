# Creative

English | [中文](creative.zh.md)

Fiction, short drama, novel-to-game and video recap belong to `dsh-story`, `dsh-short-drama`, `dsh-novel-to-game` and `dsh-video-recap`. Each owns its Skills, tools, routes and sidebar; [`@winterhuan/dsh-creative`](../../packages/creative/creative/README.md) composes them. DSH owns models, Sessions, tools, permissions and roots. Package READMEs own configuration and usage.

Source: [`packages/creative/creative/src/index.ts`](../../packages/creative/creative/src/index.ts)

## The four seams

**Skill and Role supply.** Four `SkillProvider`s serve the bundled `knowledge/` trees and prepend a DSH bridge to every Skill body, so no workflow starts another creator UI, Agent runtime, or transport. `creative_role` runs the seven Roles as spawned children with host-owned per-Role model options and tool allowlists, and `creative_bundled_reference` is the only reader for packaged reference files.

**Paid production.** `story_zhuque`, `drama_produce_run` and `video_produce_run`, plus the aggregate compatibility alias `creative_produce_run`, are the paths from a model to the bundled Python production scripts and their provider keys. Keys live in the credentials store; the settings namespace holds references and non-secret profile fields; the tool resolves references per call and forwards them as explicit child environment variables, because every other subprocess starts from a scrubbed environment. Drama runs consume a single-use creator confirmation, and contract verdicts drive bounded key rotation.

**Projection intents.** `creative_production` is a concurrency-safe tool with no side effects outside the Session log; the browser workbench replays its results to drive the short-drama production views. It never edits creator documents or authorizes paid generation. Pending input belongs to the Session's `inbox` projection, durable production results to the Conversation projection, and presentation drafts to the workbench store.

**Workbench routes.** `/creative` is a Session-scoped HTTP API trusted only from loopback or `trustedHosts`, with extension allowlists, resolved-path containment, `FsVersion` compare-and-swap writes, ranged media streaming, video preflight, CSP-isolated game previews, and an owner-checked job stop. The browser workbench dispatches production only as chat prompts through the normal approval flow.

The standalone `creative-game` sidebar owns a game-only Session store and reads `/novel-to-game` APIs. The game package supplies all seven skills, packaged source helpers, `game_qa` and isolated previews. Creative retains legacy QA and preview aliases without a browser page; it does not register the game provider itself.

The four domain plugins install independently. Creative composes installation and retains Host tool and route compatibility without an aggregate page or legacy draft reads. See the [split decision](../../.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.md).

## Delivery evidence

The Host reads five episode documents as one checked revision and the Python creator checker owns structural diagnostics. Hashed production manifests associate verified media with targets and requests. The `episode-compose` adapter reuses the video speech, mixing and subtitle runtime.

Game QA runs Chrome under the shared preview policy and authenticates its build and evidence hashes before showing a current result. Video local drafts carry degraded-stage records; delivery measurements describe source reuse, narration, rights declarations and framing. See the [game](../../.agents/notes/implemented/feature/2026-09-27-novel-to-game-playability-evidence.md), [drama](../../.agents/notes/implemented/feature/2026-09-27-short-drama-finished-episode.md) and [video](../../.agents/notes/implemented/feature/2026-09-27-video-recap-delivery-and-compliance.md) decisions.

## Language seam

Workbench UI copy is locale-owned through each domain namespace (zh source of truth, key-identical `en`), including the protocol diagnostics the production views render by code. Workspace-protocol identifiers (`正文/`, `剧集/EP001`, `SHOT-*`), the agent-facing prompt builders, and operational failure text stay zh-Hans: they belong to the creator protocol that the Skills and Host guards share, not to browser chrome.
