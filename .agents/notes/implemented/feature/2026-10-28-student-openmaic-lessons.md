# Agent Note: OpenMAIC lessons stay outside the learning record

Status: implemented

English | [中文](2026-10-28-student-openmaic-lessons.zh.md)

## Problem

A local OpenMAIC classroom takes minutes to generate and needs one anonymous cookie session. Native web fetch cannot reach localhost. Putting generation and polling in the learning-state writer would contend with answers and mix service logs with learner evidence.

## Decision

The study skill's `references/openmaic.md` owns the shell procedure: generate, poll about once a minute with one cookie jar, retry the existing run and later read its stages. The agent directly authors the bounded `.study/openmaic-lessons.json` file and validates it with the packaged CLI. Application queries independently validate the complete log, including changes without a learning revision change; the desk reads facts, opens the bare http(s) URL and sends native generation/retry/consolidation intentions.

A saved origin takes precedence over `OPENMAIC_BASE`, then `http://localhost:3000`; `OPENMAIC_ACCESS_CODE` stays in the environment. Ready URLs prove neither attendance nor understanding. Post-class consolidation uses the same saved question/answer/assessment path. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns authoring, transport and evidence validation.

## Alternatives considered

**Store lessons in the learning-state writer.** Generation would contend with answer writes, and the agent would still need curl for the service.

**Proxy OpenMAIC from the Host.** The browser could avoid cross-origin cookies, but the Host would hold the anonymous session and access code. The tutor shell already has the cookie jar.

**Embed the classroom in the sidebar.** The frame would not carry the OpenMAIC cookie, and a static export player is a second product. Playback stays in the system browser.

## Consequences

Generation depends on a service this package does not install or start. The independent lesson log remains outside term archives until explicitly removed. Chat shows the classroom URL as a bare line; the desk repeats it with an open button. Deterministic file/consumer tests do not establish live OpenMAIC generation, classroom quality or attendance; those require separate acceptance.
