# Agent Note: OpenMAIC lessons stay outside the learning record

Status: implemented

English | [中文](2026-10-28-student-openmaic-lessons.zh.md)

## Problem

A local OpenMAIC classroom takes minutes to generate, and its anonymous cookie cannot survive a browser call from the learning desk to port 3000. The study web fetch tool is also blocked from localhost. Putting that job inside `study_update` would bump the learning revision on every poll and mix an external service log into learner evidence.

## Decision

The study skill's `references/openmaic.md` is the procedure: the tutor shell calls generate, polls about once a minute with one cookie jar, retries a failed run without resubmitting the requirement, and later reads `/api/stages/{classroomId}`. Rows are appended to `.study/openmaic-lessons.json`. The workspace route only reads that file, including on a poll whose learning revision has not changed, and the desk lists the rows, opens the bare http(s) URL in the browser, and queues a tutor turn to generate, retry or write 2 to 5 consolidation questions. The parent may save an OpenMAIC origin; `OPENMAIC_BASE` and then `http://localhost:3000` fill in when it is blank. `OPENMAIC_ACCESS_CODE` is read from the environment and is never stored.

## Alternatives considered

**Store each lesson as a `study_update` action.** The desk would see rows through the existing revision, but a long generation would contend with answer writes, and the agent would still need curl for the service itself.

**Proxy OpenMAIC from the workspace route.** The browser could avoid cross-origin cookies, but the route would hold the anonymous session and an access code on behalf of every tab. The tutor shell already has the cookie jar.

**Embed the classroom in the sidebar.** The frame would not carry the OpenMAIC cookie, and a static export player is a second product. Playback stays in the system browser.

## Consequences

Generation still depends on an OpenMAIC process this package does not start. The lesson log is not exported with the term archive and remains until someone deletes it. Chat must show the classroom URL as a bare line; the desk repeats that URL as text plus an open button. No real OpenMAIC call and no real DSH browser pass are part of this change.
