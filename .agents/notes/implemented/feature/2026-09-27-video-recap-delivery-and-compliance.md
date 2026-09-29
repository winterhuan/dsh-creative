# Agent Note: Video recap separates executable delivery evidence from release approval

Status: implemented

English | [中文](2026-09-27-video-recap-delivery-and-compliance.zh.md)

## Problem

Background media jobs can exceed a foreground executor deadline. Process environment checks miss configured credential references, and late text truncation can pay twice for speech that delivery rejects. A missing transcript cannot establish safe sentence cuts, while a keyless fallback must not look like a finished release.

## Decision

Background production resolves the shell with no executor expiry; cancellation and script timeouts still own termination. Preflight reads the same credential/profile view as execution. Fish uses its actual `fish-audio` identifier, with voice ID, token-plan cluster and music path in profile settings. Advanced assembly options remain script environment settings.

Speech validates text duration budgets before paid synthesis. An overlong produced line fails for revision without truncation or automatic second synthesis. Shared provider calls reject missing credentials before requests. Source-sentence cut checks require a transcript or an explicit creator waiver.

Delivery evidence measures placed narration coverage, continuous source picture, source intervals outside narration, stated licensing basis and output geometry/vertical treatment. The measurements neither validate licensing nor promise platform acceptance.

The explicit `--draft` path uses installed local Whisper with a local model, supplied transcript or recorded waiver; bounded storyboard frames receive agent-authored observations. Rendering uses local speech or an explicitly selected timing stand-in and a selectable subtitle track. `draft_status.json` records degradation and `release_ready:false`; Studio labels the output as a local draft. Doctor reports the local capabilities. No model download or paid call is implicit.

One runtime directory owns common Python configuration, provider clients and duplicated writing helpers. The build copies owned files into the self-contained Skill trees; tests reject byte drift. Synthetic media tests exercise keyless draft, composition, stream validation, captions and sampled review without provider access.

## Alternatives considered

Increasing the foreground timeout does not give background jobs the correct lifecycle. Treating missing ASR as permission to cut sentences was rejected because it erases evidence gaps. Local previews remain drafts; licensing declarations remain creator statements rather than inferred clearance.

## Validation

The keyless synthetic run produces a decodable draft with video, audio and subtitles. Tests verify pre-synthesis rejection, transcript waivers, delivery measurements and byte-identical runtime copies. Real DSH checks cover draft playback, its unverified label and both themes. Paid providers and local Whisper were not exercised in these offline checks. The [workbench decision](2026-09-03-creative-workbench.md) retains Session, permission, credential and job ownership.

## Consequences

Local Whisper still requires an installed model. Storyboard descriptions and timing stand-ins have explicit quality limits. Burnt subtitles need libass; selectable subtitle tracks do not. This decision owns execution and delivery rather than a creative standard for compelling narration.
