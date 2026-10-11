---
description: "Student learning ownership: confirmed curricula, local evidence, daily time limits, rewards and native DSH tutoring."
---

# Student learning

English | [中文](student.zh.md)

## Summary

Guide short learning activities while keeping course identity, learner answers and review progress across conversations. Parents confirm the curriculum, and the learner can practise or investigate a question within the same daily time budget. This page defines ownership and trust boundaries; the package README owns use and configuration.

## Table of Contents

- [Ownership](#ownership)
- [Materials and learner evidence](#evidence)
- [Time and rewards](#time)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Ownership

The `student` Agent preset owns model capabilities through the scoped `/agent` entry. Host routes and settings remain global. Sidebar discovery follows the selected Session projection; hidden workbenches retain their existing stores. Mode selection does not migrate history or grant filesystem permissions.

The independently installed [student package](../../packages/education/student/README.md) owns its Skill, references, learning tools, interactive sidebar and workspace state. It lives under `packages/education`, with no creative plugin dependency. DSH owns the conversation, model, image attachments, tool history and filesystem authorization. The plugin neither downloads textbooks nor provides a separate tutoring runtime.

<a id="evidence"></a>
## Materials and learner evidence

One workspace identifies one learner's term. Material records carry region, grade, term, school year, school system, subject and edition evidence. A confirmed school course must match the learner profile and retain an actual parent statement. Unknown books permit foundation practice, not claims of school alignment. Materials keep their identities across course changes so historical work remains attributable.

For grade two, first term, the Skill uses bundled Chinese or mathematics pages when no textbook is supplied for that subject; user materials take priority. Defaults supply learning content without creating a school course or parent confirmation. The [package README](../../packages/education/student/README.md#use-default-textbooks) owns edition details and reading instructions.

Image transcription is model-dependent. New mistakes remain pending until the user confirms the prompt and the tutor records answer evidence; uncertain images never enter review automatically. Helped answers and independent answers remain distinct. Source classification and a stored confirmation are evidence records, not guarantees of authenticity or correctness. Model inputs still follow the configured provider's data handling.

Grades one and two ship knowledge maps for Chinese, mathematics and English in both terms: units, knowledge points, learning goals and same-subject relations are validated at load time for the Host, the tools and the workbench, and state files keep goal references only. Shipped goals count as verified and support questions, answers, mistake classification and worksheets without parent confirmation; concepts outside the map still require it. Mastery, weak points and the daily recommendation derive from answers, paper results and mistake review stages by fixed rules, describing evidence rather than judging ability; the maps follow the curriculum standards and the common teaching order and do not replace the school textbook. A check-in block samples untouched, stalled and long-mastered goals per subject on a recurring schedule, requires every answer to carry a goal and feeds mastery directly; choice tasks restrict answers to the published options; maps for other grades and terms are browse-only and their goals cannot be used for questions.

Concepts retain subject-scoped definitions, examples and source evidence and require user review before they support learning goals. Goals select a method appropriate to their subject. Prerequisite, part, contrast, explanation and causal relations connect confirmed concepts within one subject; causal direction and evidence must be explicit. Mistakes link to goals, while old records retain their original topic until someone classifies them. Worksheets freeze the mistake source, questions, answer evidence and goal; the student PDF contains questions only. Paper answers enter a separate result record after photo transcription and user review, without bypassing interactive task deadlines.

The store uses the calling Session's filesystem and sandbox policy, validates persisted data and compares the observed file version before writing. Conflicts and invalid state stop the mutation. The sidebar HTTP endpoint resolves only main sessions, accepts local same-authority requests and requires a revision for each mutation. The UI cannot post assessments or stars. Questions, raw answers and hint requests persist together; native chat handles teaching and images. Status queries preserve absence and paginate history; rewards and review intervals do not live only in chat memory.

The workbench previews PDFs and confirms printing within the same main-Session boundary. The Host submits to the system default `lp` queue; a receipt shows queue acceptance only. The optional DSH SenseVoice bundle inserts transcripts into the native conversation draft. The learner reviews and sends that text before learning tools save an answer; the plugin does not infer pronunciation quality from text.

<a id="time"></a>
## Time and rewards

Learning blocks, breaks and the daily limit span all three subjects and exploration. Elapsed time includes waiting; it is not attention measurement. The state machine rejects starts during breaks and records after a deadline. The sidebar disables answers at the deadline and offers an explicit stop; the Skill also owns the conversational decision to stop and recommend an offline break; the plugin cannot lock arbitrary chat or the screen.

Stars depend on recorded participation and reflection, with a daily cap. Repeated requests cannot mint extra stars, and stopping early incurs no penalty. Spaced reviews use independent answers on separate days; progress is reported as observed evidence rather than a permanent ability label.

Paper answers need no active learning block and do not earn stars upon upload. Their receipt time is the observed review date. Paper practice before the due date retains evidence without advancing the mistake interval.

<a id="related"></a>
## Related contracts

See the [learning decision](../../.agents/notes/implemented/feature/2026-10-05-student-learning.md) for alternatives and limitations. The [knowledge map decision](../../.agents/notes/implemented/feature/2026-10-12-student-knowledge-map.md) covers the shipped maps and weak-point rules. [Skill Viewer](skill-viewer.md) can inspect the installed Skill and its references.

<a id="dev-note"></a>
## Dev Note

None.
