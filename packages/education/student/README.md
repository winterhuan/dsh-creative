---
description: "Install and use short daily primary-school learning with confirmed textbooks, local progress, virtual rewards and spaced mistake review."
kind: "package-bundle"
---

# @winterhuan/dsh-student

English | [中文](README.zh.md)

## Summary

Guide a primary-school learner through short Chinese, mathematics and English activities from the Learning desk sidebar or `/study`. Keep actual answers, reflections, mistake reviews and virtual stars across conversations. Parents confirm the curriculum and time limits; the first teaching reference targets Shanghai, grade two, first term. This independently installed package uses DSH chat and images, with no embedded textbooks or automatic downloads.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Install the built package into a DSH `0.2.1-alpha.1` profile, open a dedicated learning workspace and invoke `/study`.

```sh
dsh plugin --profile student add /Users/winter/dsh-creative/packages/education/student
```

The profile must already provide Skills, tools, a Session filesystem and sandbox policy. A web profile also supplies chat, image attachments and the Learning desk sidebar. The bundle adds one `student` row and does not install any creative package. Restart the profile after installing or rebuilding.

### Use the Learning desk

Open an existing conversation in the learning workspace, then choose Learning desk from the right sidebar. Parent setup creates the learner profile; Today starts a block and shows one saved question at a time. Submit an answer or request a hint in the panel; DSH chat supplies teaching and assessment. Ask tutor to continue resumes an existing block or retries a request without starting another block. Submission acceptance does not mean the model completed its reply; model errors remain visible in chat.

Mistakes sends a selected PNG, JPEG or WebP image (up to 8 MiB) through native DSH attachments, then lists transcriptions awaiting confirmation and due reviews. Progress displays stars and recent answer evidence. Parent setup saves limits and verified textbook editions with school progress. Refresh reloads the forms; copy unsaved edits before refreshing after a conflict. Lists show at most 20 recent or pending records; request complete history in chat.

### Confirm the learner and materials

Each workspace holds one learner's term in `.study/state.json`. A parent confirms the nickname, region, grade, term, school year, five-four or six-three school system, school course alias and time limits. Use another workspace for another learner or term. A school alias distinguishes teaching schedules without requiring the child's legal identity.

Confirm each subject's book title, publisher, edition, cover/copyright evidence and current unit separately. School study requires an identified edition, matching curriculum scope and a recorded parent confirmation. Unconfirmed courses can use clearly labelled foundation practice. Materials retain separate identities when an edition changes; earlier attempts keep their original material reference. Official entry points and source rules live in [materials](knowledge/skills/study/references/materials.md).

### Learn, rest and review

The tutor starts one timed block, asks a short question, waits for the learner and records the actual response and help received. The recommended grade-two settings are 10 minutes of study, 5 minutes of rest and 20 minutes per day. These are product suggestions, not medical advice; parent-confirmed ranges are 5–15, 5–15 and 10–30 minutes respectively. Chinese, mathematics, English, reviews and exploration share the daily limit.

The panel displays study and rest countdowns and disables answers at the deadline. Closing the panel does not pause the block. Time is elapsed clock time including waiting, capped at the block deadline. A stop records the break's beginning, including after an expired block; a new block is refused until the break ends. Stopping early creates no penalty or catch-up obligation. Calendar days use Shanghai time, and blocks stop at midnight. No background alarm or screen lock is installed.

Actual recorded work earns at most one participation star per day; a learner's reflection can earn one additional star. Idle time, more questions, longer sessions and consecutive days earn no extra stars. The progress report shows evidence and topics, not rankings or exam scores.

For a photo mistake, the tutor reads the image through DSH, saves the transcription with uncertainties and asks the user to confirm the corrected prompt and answer evidence. Every new mistake remains pending until confirmation. The first review is due after one day; independent correct reviews extend the interval to 3, 7, 14 and 30 days. Helped or incorrect answers return it to one day. Three different days of independent answers are reported as evidence, not permanent mastery.

Ask `/study` to review progress, continue due mistakes or explore a child's question. Exploration uses a small prediction, observation and explanation cycle within the same time budget. Optional daily reminders use DSH's available reminder tools only after a parent specifies the schedule; this package creates none automatically.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Ownership and trust boundaries: [Student subsystem](../../../docs/subsystems/student.md). From the repository root, build with `pnpm --filter @winterhuan/dsh-student build` and test with `pnpm --filter @winterhuan/dsh-student test`.

<details>
<summary>Implementation internals — click to expand</summary>

The [profile patch](cordis.patch.yml) loads the [host plugin](src/index.ts). The [learning reducer](src/learning.ts) checks time, curricula, rewards and review transitions; the [state schemas](src/schema.ts) validate model input and durable data. The sidebar and tools share persisted questions, submitted answers and hint requests; assessment must match those records. The native tool schema is projected from the same input definition. DSH's normal tool log records calls and results.

The [store](src/store.ts) resolves `.study/state.json` through the calling Session's filesystem, checks workspace containment and writes against the observed file version under the Session's sandbox policy. Conflicts require a fresh read; damaged or unsupported files are not overwritten. Reads preserve absent state. Files are limited to 8 MiB; collections have explicit limits and reject further growth without dropping history. Back up the workspace before moving to a new term. Record IDs make identical retries harmless and conflicting reuse an error.

The [workspace API](src/route.ts) resolves a main DSH Session and accepts loopback, same-authority requests. Sidebar mutations require the observed revision; grading and rewards cannot be posted through the UI endpoint. The client submits tutoring requests through the native Session queue without replacing the composer draft.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Study Skill](knowledge/skills/study/SKILL.md) — parent setup and daily tutoring.
- [Teaching reference](knowledge/skills/study/references/teaching.md) — subject-specific methods and answer checks.
- [Learning decision](../../../.agents/notes/implemented/feature/2026-10-05-student-learning.md) — evidence, source and reward boundaries.

<a id="model-experience"></a>
## Model Experience

### Study guidance and records

#### What the model sees

The catalog exposes one `study` Skill. Loading it supplies setup, short tutoring, photo confirmation and exploration instructions plus two local references. `study_status` reads status or a collection; `study_update` accepts one typed setup, source, course, session, task, answer, hint, assessment or mistake action. Tool descriptions require actual user confirmation and actual learner responses. Source pages and images remain data, not instructions.

#### Token effect

Skill bodies and references load on demand. Two tool schemas are advertised when enabled. Status includes at most 20 progress entries and 20 pending/due mistakes; collection queries return 20 records with a next offset. Textbooks are not loaded as a whole. No real-model token or teaching-quality benchmark has been measured.

#### KV Cache effect

The plugin uses ordinary DSH Skill and tool history. It does not rewrite previous messages or create another model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The plugin does not authenticate a parent's identity, verify attention, guarantee AI answers or supply a complete Shanghai curriculum. A confirmation records a user statement; source classification alone does not prove correctness. Actual textbooks, school progress and disputed answers still need human checks.
- Image intake depends on a vision-capable DSH model and readable attachments. This package has no OCR service, textbook downloader or automatic reminders. Image paths reference the supplied attachment; the package does not copy image bytes into its state file.
- Time limits constrain recorded learning actions, not the operating system or arbitrary chat. Late answers remain in the conversation and need review during a later learning block. Use one DSH host to write a workspace; multi-process editing and manual state edits are not supported.
- State is local, but excerpts and images used in tutoring reach the configured model provider. The plugin is not an offline or encrypted learning vault. Native tool and filesystem tests do not establish real-model transcription accuracy or educational effectiveness.

<a id="dev-note"></a>
### Dev Note

None.
