---
description: "Install and use short daily primary-school learning with confirmed textbooks, local progress, virtual rewards and spaced mistake review."
kind: "package-bundle"
---

# @winterhuan/dsh-student

English | [中文](README.zh.md)

## Summary

Guide a primary-school learner through short Chinese, mathematics and English activities from the Learning desk sidebar or `/study`. Keep actual answers, reflections, mistake reviews and virtual stars across conversations. Parents confirm the curriculum and time limits; the first teaching reference targets Shanghai, grade two, first term. This independently installed package uses DSH chat and images, includes default Chinese and mathematics textbook pages for grade two, first term, and ships knowledge maps for Chinese, mathematics and English across both terms of grades one and two that show mastery, weak points and a daily recommendation from recorded answers.

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

In a new or blank conversation, select **智能学习** (Smart learning) from the native mode menu, then open its workbench in the right sidebar. The workbench and domain Skills/tools are available only in this mode. Existing conversations retain their selected mode; start a new conversation in this mode to continue existing project files. Session state and project files are not migrated. Global settings remain available.

Install the built package into a DSH `0.2.1-rc.2` profile, open a dedicated learning workspace and invoke `/study`.

```sh
dsh plugin --profile student add /Users/winter/dsh-creative/packages/education/student
```

The profile must already provide Skills, tools, a Session filesystem and sandbox policy. A web profile also supplies chat, image attachments and the Learning desk sidebar. The bundle adds the `student` Host row and the `preset-student` mode row and does not install any creative package. Restart the profile after installing or rebuilding.

### Use the Learning desk

Select 智能学习 in a new conversation in the learning workspace, then choose Learning desk from the right sidebar. The desk has a student page and a parent page. On the student page, choose Chinese, mathematics or English. It shows the remaining daily time, today's stars, the due-review and weak-point counts, and one recommendation (review due mistakes first, then strengthen a weak point, then a due check-in, then learn a new knowledge point), which can start the matching block directly. When school progress is confirmed, the page names the current unit. Today also shows a Today's subject routine card (print a daily mini sheet or start a chat dictation, built from the unit focus and the most frequent error causes), an explain-it-back reminder that is never scored, and the selected subject's check-in card. Once a block starts, the page shows one saved question at a time with its learning goal: a figure on the question is drawn beside the prompt, and when that goal belongs to the current term's map, three dots show how many days it was answered independently. Choice questions are answered by tapping an option, others by typing. Submit an answer or request a hint in the panel; DSH chat supplies teaching and assessment. The action follows the current task: ask for a question, request feedback or a hint again, or move to the next question. These actions reuse the active block. The original answer stays visible with its feedback. Finishing asks the child to say in one sentence how they did it; that sentence is stored with the stop record and does not earn a star by itself. Submission acceptance does not mean the model completed its reply; model errors remain visible in chat.

The parent page has four places. Concepts lists every concept for the subject, which stays the same across books, and groups the open book's relations into compare, classify and cause and effect. Knowledge map lists the selected subject's knowledge points for this term as vertical units. Opening a unit shows its progress bar, knowledge points and learning goals, and whether school has reached that unit; tapping a point shows its definition, example, source and relations. The suggested learning order sits outside the units. Picking a goal and returning to the student page practises around it. Switching grade and term browses any grade-one or grade-two book, and a book that is not the current term has no mastery and no practice buttons. Check-ins for all three subjects — status, coverage, intensity, scope and history — are on this map. Tutor-proposed concepts outside the map are also checked here. Mistakes sends a selected PNG, JPEG or WebP image (up to 8 MiB) through native DSH attachments, lists pending transcriptions and due reviews for the selected subject, and filters each subject's notebook by due, reviewing and consolidated. Each subject pages through its confirmed mistakes with the question, original answer, correction, evidence, error cause, review stage (1–5), linked learning goal, next review time and related worksheets. Worksheets are named by learning goal and expand to preview and print, mark every unmarked question right and then correct the ones that were wrong (optionally typing what the child wrote and tagging an error cause), send that sheet's photo to the tutor, or discard, with each question's source mistake. The mistakes entry shows a count while mistakes are due. Parent setup saves limits and verified textbook editions with school progress, and shows stars, the selected subject's mastery overview and recent answer evidence. Refresh reloads the forms; copy unsaved edits before refreshing after a conflict. Pending, due and recent-answer lists show at most 20 records; request older records in chat.

### Choose a learning activity

Smart learning is the conversation mode. Under Another way on the Learning desk, choose a subject and one of four activities; each uses the same daily budget. Sync practice is stored as the school course when that subject has confirmed school progress, and as labelled foundations otherwise. The workbench saves tasks and responses, while the conversation carries explanations, hints and tutor feedback.

| Activity | When to use it | Prerequisite |
|---|---|---|
| Sync | Practise the confirmed school unit, or labelled foundations when that course is not confirmed yet | Parent-confirmed learner profile |
| Due review | Recall a previously confirmed mistake or try a related variation | Confirmed mistakes due for review in the selected subject |
| Check-in | Sample a few short questions from the knowledge map to find what is known and what needs work, at light, standard or deep intensity | Learner profile; suggested every 14 days per subject, repeatable any time |
| Explore | Investigate a child's question through a prediction, observation and explanation | Learner profile; explain the question in chat |

Use Parent setup on the parent page before the first activity. Today shows the selected subject's methods, remaining daily time, stars and due-review count. A parent can correct and confirm a tutor-proposed concept's definition, example and source; the tutor then creates selectable learning goals and evidenced prerequisite, part, contrast, explanation or causal relations. Sync practice can start with one selected goal. Old mistakes retain their original `topic` until someone checks and links them to a goal. Choose a due review in Mistakes, then explicitly start it in Today; an active block, break or exhausted daily budget prevents another review. Submit an answer and wait for feedback; Finish and rest ends the block.

The mistake book prints a daily mini sheet, practice sheets and review sheets. A daily mini sheet has 4–6 questions from the subject routine (characters or words, a sentence or oral arithmetic, and one variant of a recurring error cause). A practice sheet covers the current school unit, mixes question types, and leaves space to write. For a review sheet the system picks the mistakes: up to 8 due today or tomorrow, lowest review stage first, one variant each, skipping mistakes already printed on a sheet that has not been marked. The PDF can draw bar models, Chinese money, tens-and-ones dot diagrams and counters, a hundred chart (including a nine-cell window), number lines, clock faces at any five-minute step, counting sticks, column-arithmetic grids, shape comparisons, plane and solid figure rows, overlap circles (sum circles and set diagrams), number splits, pattern strips, number walls, grids, dot arrays, centimetre rulers, direction crosses, balances, tianzige squares and four-line letter bands, plus a sketch fallback for anything else, each with one line, three lines or a box to answer in. Open the PDF preview before the print button becomes available; confirm again to send the student PDF to the host's default `lp` queue. A receipt proves queue acceptance, not paper output. The PDF contains questions, figures and answer space; answers and evidence remain in the learning record.

After the child finishes, the parent expands the sheet in the mistake book, marks each question right, partly right or wrong against the answer key, optionally types what the child wrote and tags the error cause, and saves; a photo of the sheet can also go to the tutor, who saves each question as a transcription draft for the parent to check and confirm in the panel. A wrong or partly right answer on a practice sheet becomes a mistake on that question's goal, and correcting the mark to right removes it. Each review question climbs a numeric, then context, then reasoning ladder and keeps the mistake's error cause. Review questions count by day: an independent correct answer on any day, earlier than the due day included, moves the mistake to the next stage and the next review counts from that day, while a wrong or partly right answer only makes it due again the next day without lowering the stage. A sheet that will not be used can be discarded so its mistakes can be printed again. Paper results need no active timer and earn no stars.

If DSH's SenseVoice input is enabled, the learner can dictate an answer in chat. The transcript enters the draft for review before sending; the tutor then saves the original text against the current task. A transcript cannot assess reading or English pronunciation. The desk does not add another recorder.

### Confirm the learner and materials

Each workspace holds one learner's term in `.study/state.json`. A parent confirms the nickname, region, grade, term, school year, five-four or six-three school system, time limits and an optional course note. Use another workspace for another learner or term. The school-year dropdown covers the current academic year, five earlier years and the next year; its initial value is blank and requires a parent selection. For example, 2026–2027 spans two calendar years. A course note is an optional family label, not an official school code; you can leave it blank. Existing profiles remain readable.

Confirm each subject's book title, publisher, edition, cover/copyright evidence and current unit separately. After the textbook is confirmed, choose the map unit the class has reached in Parent setup: new goals and check-ins stay in that unit and the units already taught. Keep-up teaches the current unit, catch-up fills earlier gaps first, a review week adds no new goal, and preview covers at most the next unit. The frontier moves only after confirmation. School study requires an identified edition, matching curriculum scope and a recorded parent confirmation. Unconfirmed courses can use clearly labelled foundation practice. Materials retain separate identities when an edition changes; earlier attempts keep their original material reference. Official entry points and source rules live in [materials](knowledge/skills/study/references/materials.md).

<a id="use-default-textbooks"></a>
### Use default textbooks

For grade two, first term, `/study` uses the bundled People's Education Press Chinese or Beijing Normal University Press mathematics textbook when the user supplies no textbook for that subject. User-provided books and pages take priority. You do not need to upload these two books again: complete the learner profile and choose Foundations, or ask in chat to learn multiplication with the default mathematics textbook. Without a selected topic, the tutor offers a short choice from the first unit. Defaults do not establish the school's edition or fill in school progress; English, other grades and other terms have no default textbook.

See [default textbooks](knowledge/skills/study/references/default-textbooks.md) for contents, edition evidence and reading rules. DSH's `read_image` reads selected pages and requires an image-capable model. Extracted text supports lookup only; it cannot directly establish pinyin, diagrams or column calculations for grading. Without image support, use user-provided or previously verified prompts, or clearly labelled generated foundation exercises.

<a id="use-the-knowledge-map"></a>
### Use the knowledge map and weak points

The package ships twelve knowledge maps for Chinese, mathematics and English across both terms of grades one and two, organized from the first-stage requirements of the 2022 curriculum standards. Chinese and English for both terms of grade one and the first term of grade two list the units and lessons from the parent-confirmed textbook contents. Mathematics for those three books follows the 2024 Shanghai five-four textbook contents. Grade two, second term of all three subjects keeps the earlier framework. They are a learning framework, not the school textbook or the teacher's progress. Map learning goals need no parent confirmation for questions, answers, mistake classification or worksheets; the tutor reads each knowledge point's definition, example and checkable facts with `study_status kind=curriculum` before asking, and records the goal on every question. Every knowledge point on the twelve maps has checkable facts, and a question may not go beyond them. Chinese, grade two, first term, is taken from the bundled People's Education Press pages. The other books state the concept itself: mathematics states the method and the worked example, and Chinese states what that lesson can be checked against. English, grade two, first term, Units 1 to 4 follow a parent reading sheet; Units 5 to 10 of that book, grade one first term Units 1 and 3, and grade one second term Units 1 and 2 use sentences read from 2024 Shanghai five-four excerpts. The remaining English units state what the topic words mean. A later page or paper can replace a fact when it is the same concept. Publisher and volume may differ. Paper questions corroborate the course, and a new question is written again rather than copied.

Mastery is derived from recorded evidence: independent correct answers on three different days with no open mistakes and no recent helped or wrong answer show as mastered; two or more wrong or helped answers in the last 14 days, or two or more open mistakes, show as needing work; practised but untouched for more than 10 days shows as not practised lately; a due mistake shows as review due. Weak points rank by due mistakes, recent errors and inactivity, and the daily plan is review due mistakes, strengthen a weak point, then learn a new knowledge point. A repeated error cause adds a recurring-error reason and lifts its goal; explain-it-back reminders derive from the day's evidence and never count as mastery. These states describe evidence; they are not ability labels and do not replace school assessment. Coverage, queries and the consolidation loop are in [knowledge map](knowledge/skills/study/references/knowledge-map.md).

The check-in is a short, recurring probe: for each subject it samples untouched goals across units, then goals not practised lately and mastered goals older than 30 days, and suggests another round 14 days after the last one; it can be repeated any time. Three intensities are available: light (3 choice questions), standard (6, the default) and deep (up to 12 with one reasoning task per unit and re-checks of goals in progress); the desk recommends one from the number of untouched goals. The confirmed school frontier is the default sampling range, not a limit: a check-in can also run in another grade and term, in selected units, or against a picked set of goals by passing that scope when the block starts, and answers are only checked against the chosen scope. Each sampled goal gets one short question and every answer must carry the learning goal; a goal never answered independently is marked as needing work after a single wrong answer, and today's plan turns to targeted practice. A check-in has no score or ranking and is limited to one block.

### Learn, rest and review

The tutor starts one timed block, asks a short question, waits for the learner and records the actual response and help received. The recommended grade-two settings are 10 minutes of study, 5 minutes of rest and 20 minutes per day. These are product suggestions, not medical advice; parent-confirmed ranges are 5–15, 5–15 and 10–30 minutes respectively. Chinese, mathematics, English, reviews and exploration share the daily limit.

The panel displays study and rest countdowns and disables answers at the deadline. Closing the panel does not pause the block. Time is elapsed clock time including waiting, capped at the block deadline. A stop records the break's beginning, including after an expired block; a new block is refused until the break ends. Stopping early creates no penalty or catch-up obligation. Calendar days use Shanghai time, and blocks stop at midnight. No background alarm or screen lock is installed.

Actual recorded work earns at most one participation star per day; a learner's reflection can earn one additional star. Idle time, more questions, longer sessions and consecutive days earn no extra stars. The progress report shows evidence and topics, not rankings or exam scores.

For a photo mistake, the tutor reads the image through DSH, saves the transcription with uncertainties and asks the user to confirm the corrected prompt and answer evidence. Every new mistake remains pending until confirmation. The first review is due on the day after confirmation; an independent correct answer on any day, before the due day included, extends the interval to 3, 7, 14 and 30 days, at most one stage per day. Helped or incorrect answers only make it due again the next day without lowering the stage. Review stages are recomputed from all recorded answers, so a corrected or late mark updates them. Three different days of independent answers are reported as evidence, not permanent mastery.

Ask `/study` to review progress, continue due mistakes or explore a child's question. Exploration uses a small prediction, observation and explanation cycle within the same time budget. Optional daily reminders use DSH's available reminder tools only after a parent specifies the schedule; this package creates none automatically.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Ownership and trust boundaries: [Student subsystem](../../../docs/subsystems/student.md). From the repository root, build with `pnpm --filter @winterhuan/dsh-student build` and test with `pnpm --filter @winterhuan/dsh-student test`.

The Host entry owns workspace routes and configuration. The `./agent` export registers domain Skills and tools inside the `student` preset and inherited native child compositions. The preset supplies a task-specific persona and explicit native tools; it does not change the default mode. Learning uses filesystem, search, web, questions, presentation and platform-specific shell tools without delegation or creative production workflows.

<details>
<summary>Implementation internals — click to expand</summary>

The [profile patch](cordis.patch.yml) loads the [host plugin](src/index.ts). The [knowledge-map loader](src/curriculum.ts) reads and validates the twelve maps in `knowledge/curriculum/`; state files keep goal references only. The [learning reducer](src/learning.ts) checks time, curricula, concept links, rewards and review transitions, validates shipped goal references against the map, and derives mastery, weak points and the daily recommendation from answers, paper results and mistake stages; the [state schemas](src/schema.ts) validate model input and durable data. New collections default to empty on old profiles without guessing concept links. The sidebar and tools share persisted questions, submitted answers, hint requests and paper results; assessment must match a saved task or worksheet item. The native tool schema is projected from the same input definition. DSH's normal tool log records calls and results.

The [store](src/store.ts) resolves `.study/state.json` through the calling Session's filesystem, checks workspace containment and writes against the observed file version under the Session's sandbox policy. Conflicts require a fresh read; damaged or unsupported files are not overwritten. Reads preserve absent state. Files are limited to 8 MiB; collections have explicit limits and reject further growth without dropping history. Back up the workspace before moving to a new term. Record IDs make identical retries harmless and conflicting reuse an error.

The [workspace API](src/route.ts) resolves a main DSH Session and accepts loopback, same-authority requests. Sidebar mutations require the observed revision; the sidebar may save the parent's marks on a printed sheet and discard a sheet, while tutor assessment and rewards cannot be posted through the UI endpoint. Read-only PDF preview and confirmed printing use the same main-Session boundary. The [PDF generator](src/worksheet.ts) uses the bundled [Noto Sans SC font and license](knowledge/fonts/OFL.txt). Printing invokes the system default `lp` queue without a model shell command. The client submits tutoring requests through the native Session queue without replacing the composer draft.

Default textbook resources live in the Skill's `textbooks/` directory and ship with `knowledge`. The [preparation script](scripts/prepare-textbooks.py) generates contents, page images and unverified text from the two checked PDFs, using PyMuPDF 1.28.2 and verifying source hashes before writing. Runtime reads use native file and image tools without Python, a PDF parser or the original download path. Skill instructions select the textbook without automatically changing learning state; default textbook answers retain page references and evidence in `answerEvidence`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Study Skill](knowledge/skills/study/SKILL.md) — parent setup and daily tutoring.
- [Teaching reference](knowledge/skills/study/references/teaching.md) — subject-specific methods and answer checks.
- [Knowledge map](knowledge/skills/study/references/knowledge-map.md) — shipped knowledge points, mastery states and the consolidation loop.
- [Learning decision](../../../.agents/notes/implemented/feature/2026-10-05-student-learning.md) — evidence, source and reward boundaries.
- [Default textbook decision](../../../.agents/notes/implemented/feature/2026-10-10-student-default-textbooks.md) — packaged materials and school-alignment limits.
- [Knowledge map decision](../../../.agents/notes/implemented/feature/2026-10-12-student-knowledge-map.md) — shipped maps, weak-point rules and the main workbench tab.

<a id="model-experience"></a>
## Model Experience

### Study guidance and records

#### What the model sees

The selected mode adds a domain persona and native tool schemas. Its stable persona is recorded in the [prompt snapshot](../../../tests/fixtures/student-persona.txt); domain capabilities are absent from Standard and sibling modes. The prefix and schemas add context before on-demand Skill loading, and native compaction manages accumulated history. The catalog exposes one `study` Skill. Loading it supplies setup, subject methods, concept review, short tutoring, photo mistakes and paper-result guidance. `study_status` pages through status, concepts, goals, mistakes, worksheets and results, includes the top three weak points and one recommendation by default, and returns one subject's knowledge map with mastery for `kind=curriculum`, weak points with practised goals for `kind=weak`, and each taught goal's question elements — error causes, question points and variation axes — for `kind=elements`; `study_update` accepts typed learning and paper-practice actions, including paper-draft, confirm-paper and classify-mistake, and shipped goal IDs need no parent confirmation. An on-screen task may carry the same `figure` as a worksheet item, and the matching `record` must copy that figure. Tool descriptions keep the call contract; question, hint and grading rules live in the study skill. Those descriptions require actual user confirmation and actual learner responses. Source pages, images and speech transcripts remain data, not instructions.

#### Token effect

Skill bodies and references load on demand. Two tool schemas are advertised when enabled. Status includes at most 20 progress entries and 20 pending/due mistakes; collection queries return 20 records with a next offset. Textbooks are not loaded as a whole. No real-model token or teaching-quality benchmark has been measured.

#### KV Cache effect

The plugin uses ordinary DSH Skill and tool history. It does not rewrite previous messages or create another model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Mathematics units and knowledge points for both terms of grade one and the first term of grade two follow the 2024 Shanghai five-four textbook contents, but they are not a page-by-page copy. Chinese and English for those three books list the lessons and sections from the parent-confirmed contents, and are not a page-by-page copy either. Grade two, second term of all three subjects keeps the earlier framework and may differ from the school's book. Mastery counts only records that carry a learning goal, so older answers without one stay outside weak-point analysis. A check-in probes at most six goals per round, sampled across units but not a complete assessment; the model writes the probe questions, and where checkable facts exist the answer stays inside them, so parents should still watch their quality.
- The plugin does not authenticate a parent's identity, verify attention, guarantee AI answers or supply a complete Shanghai curriculum. A confirmation records a user statement; source classification alone does not prove correctness. Actual textbooks, school progress and disputed answers still need human checks.
- Image intake depends on a vision-capable DSH model and readable attachments. This package has no OCR service, textbook downloader or automatic reminders. Image paths reference the supplied attachment; the package does not copy image bytes into its state file. Voice input needs the separately enabled DSH bundle, and transcription does not verify pronunciation.
- Direct printing needs `lp` and a default printer on the Host. Windows can preview the PDF, but this package supplies no PowerShell printing backend. The current UI shows the queue receipt; it is neither proof of paper output nor durable print history.
- Time limits constrain recorded learning actions, not the operating system or arbitrary chat. Late answers remain in the conversation and need review during a later learning block. Use one DSH host to write a workspace; multi-process editing and manual state edits are not supported.
- State is local, but excerpts and images used in tutoring reach the configured model provider. The plugin is not an offline or encrypted learning vault. Native tool and filesystem tests do not establish real-model transcription accuracy or educational effectiveness.

- Transcriptions, review variants and daily mini sheets are model-written. A photographed sheet first becomes transcription drafts; the parent checks them in the panel before results and error causes enter the record, and printed practice remains the main learning surface.

<a id="dev-note"></a>
### Dev Note

None.
