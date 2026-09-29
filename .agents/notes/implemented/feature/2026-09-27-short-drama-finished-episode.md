# Agent Note: Short-drama delivery owns composition and consistent production evidence

Status: implemented

English | [中文](2026-09-27-short-drama-finished-episode.zh.md)

## Problem

Independent document reads and filename-based media matching can project a mixed episode or attach an output to the wrong shot. Container signatures alone admit unusable media, and consuming confirmation before credential discovery wastes approval without sending a request. Shot generation alone leaves dialogue, music and subtitles outside delivery.

## Decision

The existing drama entry accepts `episode-compose`. Its confirmed source plan fixes clip order and trims, screenplay-derived timed dialogue, optional music, dimensions and an explicit retain/replace decision for model audio. The adapter reuses video-recap speech, mixing, ducking, loudness and subtitle code. It publishes one decoded episode with a selectable subtitle track; optional burnt subtitles require libass. New speech spend requires a preview and confirmation through the existing ledger.

Reference labels remain creator text in any language. Provider prompts receive positional picture tokens and language-appropriate purposes, not labels or control scopes. The Python creator checker compares identity, wardrobe and location references with declared shot subjects, supports pending-reference keyframe preparation and storyboard start frames, and accepts video/audio reference suffixes. Final motion preparation runs the checker before production.

The runner resolves missing credentials before consuming confirmation. Once submission starts, failure consumes it. Staged output must have usable streams, matching declared duration/dimensions/audio and successful decoding before publication. Successful contextual runs publish manifests with target, request, framework job identity and media hashes. The Client associates current matching bytes through these manifests; filenames do not establish ownership.

One episode endpoint reads all five documents, runs the Python structural checker on those bytes and rechecks revisions. Concurrent changes return a conflict. Client buffers retain dirty text, and incoherent or unsaved documents block submission. Python owns structural diagnosis; TypeScript projects display items and accepts only explicit valid VISUAL IDs. Shared fixtures cover both consumers. Errors block single, batch and composition submission before admission; warnings do not.

Media review samples three frames per clip, builds contact sheets and optionally calls the shared picture-analysis provider after explicit paid confirmation. Identity, location and visible-text observations remain advisory.

## Alternatives considered

Free-form shell composition was rejected because it loses the confirmed plan and credential path. Filename inference and independent structural validators were rejected because renaming or parser drift changes production meaning. Media review is advisory because samples cannot establish whole-clip continuity.

## Validation

Synthetic media tests compose ordered clips, stand-in dialogue, music and selectable subtitles, then decode the result and sample review frames. Contract tests preserve confirmation when credentials are missing and reject invalid media. Snapshot tests detect missing documents and concurrent document or project changes; a real DSH browser retained unsaved text during a disk conflict and blocked invalid production preparation. The [workbench decision](2026-09-03-creative-workbench.md) retains Session, permission, credential and job ownership.

## Consequences

Composition requires ffmpeg/ffprobe and a configured speech credential. Plans and references remain bounded by the production runner limits. Legacy outputs without a manifest remain files, not tracked target versions.
