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

The store uses the calling Session's filesystem and sandbox policy, validates persisted data and compares the observed file version before writing. Conflicts and invalid state stop the mutation. The sidebar HTTP endpoint resolves only main sessions, accepts local same-authority requests and requires a revision for each mutation. The UI cannot post assessments or stars. Questions, raw answers and hint requests persist together; native chat handles teaching and images. Status queries preserve absence and paginate history; rewards and review intervals do not live only in chat memory.

<a id="time"></a>
## Time and rewards

Learning blocks, breaks and the daily limit span all three subjects and exploration. Elapsed time includes waiting; it is not attention measurement. The state machine rejects starts during breaks and records after a deadline. The sidebar disables answers at the deadline and offers an explicit stop; the Skill also owns the conversational decision to stop and recommend an offline break; the plugin cannot lock arbitrary chat or the screen.

Stars depend on recorded participation and reflection, with a daily cap. Repeated requests cannot mint extra stars, and stopping early incurs no penalty. Spaced reviews use independent answers on separate days; progress is reported as observed evidence rather than a permanent ability label.

<a id="related"></a>
## Related contracts

See the [learning decision](../../.agents/notes/implemented/feature/2026-10-05-student-learning.md) for alternatives and limitations. [Skill Viewer](skill-viewer.md) can inspect the installed Skill and its references.

<a id="dev-note"></a>
## Dev Note

None.
