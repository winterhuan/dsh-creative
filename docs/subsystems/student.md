---
description: "Student ownership: learning content, original learner evidence, native tutoring, protected OpenMAIC transport and read-only validation."
---

# Student learning

English | [中文](student.zh.md)

## Summary

Continue a learner's current question, preserve original answers and use verified evidence for targeted practice and review. Parents confirm the school range; learners keep their identity across terms. The workbench keeps Learning and Parent entries beside native DSH tutoring. This page defines ownership and trust boundaries; the package README owns use and configuration.

## Table of Contents

- [Ownership](#ownership)
- [Materials and learner evidence](#evidence)
- [Elapsed time and rewards](#time)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Ownership

The `student` Agent preset scopes teaching tools and skills to Student conversations. Global Host services independently read and verify files, manage protected connections and support explicit parent edits. The left-sidebar workbench selects an unarchived main Student Session within the learner workspace and retains its native conversation while mounted; switching or closing releases that reference. The right-sidebar entry follows the selected Session projection. Mode selection does not migrate history or grant filesystem permissions.

The independently installed [Student package](../../plugins/dsh-student/packages/winterhuan/student/README.md) separates five responsibilities:

| Part | Ownership |
| --- | --- |
| Knowledge base | Capabilities, confirmed curriculum associations and one source exercise per question family; learner responses remain separate. |
| Student skill | The agent chooses teaching, directly writes formal learning files with native tools, validates them and confirms independent consumption. |
| Read-only CLI | Structural, identity, reference and scope validation; it does not write, repair, grade or choose teaching. |
| Personal storage | Term settings, original question instances, responses, assessments, review history and explicit archive references in workspace files. |
| Official OpenMAIC | Native teaching tools, discoverable skills and classrooms; the official service owns its original submissions and grades. |

The supporting workbench provides Learning and Parent entries, drafts, attachments, printing and the shared current action. DSH owns conversations, models, image attachments, tool history and filesystem authorization. Student adds no separate tutoring runtime or learner database. The official OpenMAIC composition supplies four tools and four discoverable DSH skills; its teaching methods and authoring resources load on demand. Direct teaching components need no full-classroom prerequisite, and component clicks do not establish learner evidence.

<a id="evidence"></a>
## Materials and learner evidence

A learner retains a stable identity across terms. Learning blocks, classroom instances, questions and responses retain distinct owners. Parents confirm material identities and school scope; a shipped capability does not expand that scope automatically. Compatible earlier evidence is referenced under its original term and response identity, retaining review dates and first mastery; a broader number range, vocabulary set or modality requires new evidence. Original answers are not copied into the next term.

For grade two, first term, the skill uses bundled Chinese or mathematics pages when no textbook is supplied for that subject; user materials take priority. Defaults supply learning content without creating a school course or parent confirmation. The [package README](../../plugins/dsh-student/packages/winterhuan/student/README.md#use-default-textbooks) owns edition details and reading instructions.

Image transcription is model-dependent. Uncertain prompts, answers, help and dates remain pending. Parent-reviewed paper records preserve their actual answer day. Receipt and assessment times do not establish that day. Model inputs still follow the configured provider's data handling.

Capabilities and question families separate assessable outcomes from textbook units and concrete variations. The shared evidence consumer derives mastery and review from original responses and effective assessments. A correction preserves the response identity and original official grade history. Unverified sources, unknown dates and help do not grant independent-day credit. Old goal and exercise IDs retain explicit compatible routes or pending review; a unit score does not grant all of its new capabilities.

The protected Host transport reads authorized OpenMAIC submissions, source snapshots and grading and binds them to the original learner and activity. Access codes alone do not authorize reading submissions. The Host owns credentials, browser sign-in and transport metadata; the agent writes formal academic facts and advances a classroom checkpoint only after read-only validation and independent consumption. Model-written source labels and hashes do not authenticate evidence. Native answers also require an independently captured matching owner; earlier native Sessions require authorization before their history is read.

The workbench and native tutor use one current action. An unfinished question or pending assessment takes priority, followed by current evidence gaps, bounded review and new learning inside the confirmed range. A ready classroom opens from that action only when its learner, term, block, goal, scope and current official question binding match; a local supplement continues locally. Generation and unknown submissions resume their original job. Supplemental checks add at most three new questions, and a review round uses at most two question families before new learning.

Workspace reads apply the calling Session's filesystem authorization, validate file membership and observed versions, and independently refresh projections after direct edits. Native Remote methods serve these reads and explicit manual saves. The UI sends learner answers into the native conversation and cannot post assessments or stars. Invalid references remain visible as issues; referenced classrooms survive bounded lesson-log retention. The [package README](../../plugins/dsh-student/packages/winterhuan/student/README.md) owns file layout, recovery and source-verification details.

The workbench renders a worksheet for preview; the parent prints or saves it as PDF through the browser print dialog. The Host generates no PDF and calls no system print queue. Optional DSH SenseVoice inserts transcripts into the native conversation draft; the learner reviews and sends the text. Text does not verify pronunciation quality.

<a id="time"></a>
## Elapsed time and rewards

There is no block, break or daily minute limit. Status quietly reports elapsed block and today totals; calendar days use Shanghai time. Ending or switching an activity retains its pending responses. The plugin cannot lock arbitrary chat or the screen.

Stars depend on recorded participation and reflection, with a daily cap. Repeated reads, corrections, replay and term changes do not mint duplicate rewards. Spaced reviews use independent answers on distinct actual days along a 1 / 7 / 16 / 35-day curve. Completed review requires an independently correct answer after the review becomes due; unknown dates or help cannot advance it. Progress describes observed evidence, not a permanent ability label.

<a id="related"></a>
## Related contracts

The [package README](../../plugins/dsh-student/packages/winterhuan/student/README.md) defines native operation, official composition, validation and recovery. The [learning decision](../../.agents/notes/implemented/feature/2026-10-05-student-learning.md) and [knowledge map decision](../../.agents/notes/implemented/feature/2026-10-12-student-knowledge-map.md) retain their historical design scope. [Skill Viewer](skill-viewer.md) can inspect installed skills and references.

<a id="dev-note"></a>
## Dev Note

None.
