# Agent Note: Student unit courses and full interactive lessons first

Status: proposed

English | [中文](2026-11-27-student-unit-course-spec.zh.md)

## Problem

A child who starts learning needs coherent teaching content and a way to resume, receive explanations, and review later. Existing goals, learning blocks, native conversations, and classroom tools do not guarantee this flow: starting may lead only to a text diagnostic, the classroom entry and selected teaching requirement are not reliably connected, and buttons expose the internal execution protocol.

In qiqiStudy session `session-a18bdfa5-9cd2-466c-8cd5-fe6fe2fd7c69` on November 27, 2026, starting Chinese learning took about 775 seconds and answering “幕” took about 368 seconds, with 30 and 11 model steps respectively. Neither full classroom generation nor content presentation tools were invoked. This is an observed failure baseline, not proof of an external service failure or a performance estimate for every learning request.

## Proposal

This spec defines proposed product behavior, data responsibilities, and acceptance conditions. New goals start with full interactive lessons; explanations and later review use mini-lessons. Unit courses organize multiple lessons that can be completed separately. Existing tool interfaces are reusable, but their presence does not make this end-to-end spec implemented.

### Scope and existing decisions

This spec partially revises the cold-start path in the [daily learning plan](2026-11-25-student-daily-learning-plan.md): missing evidence no longer automatically turns new learning into a separate diagnostic task; any necessary brief check belongs inside the lesson. School progress limits, subject recommendations, bounded review, and explicit closure remain.

This spec refines lesson selection and presentation in the [OpenMAIC learning loop](2026-11-22-student-openmaic-learning-loop.md), adding unit organization and lesson recovery. That proposal retains ownership of classroom feedback import, question-family consolidation, and capability mapping. The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) retains native conversations, agent edits to formal files, read-only CLI validation, and independent app reads. This scope introduces neither a general write tool nor a separate tutoring engine.

All three proposals remain active with cross-links because this spec only refines part of each. Existing decisions on [removing time limits](../../implemented/feature/2026-10-30-student-overhaul.md), [school progress](../../implemented/feature/2026-10-14-student-school-frontier.md), and [separating classroom transport from learning evidence](../../implemented/feature/2026-10-28-student-openmaic-lessons.md) still constrain the design and are not archived; the last note's historical shell path is not authority for current interfaces. This spec does not change mastery thresholds, review intervals, or the question bank, migrate the entire capability tree, or automatically prepare every classroom in a unit in the background.

### Course levels and generation ownership

Course coverage and capability mastery are separate. A lesson may cover related capabilities, but each retains its own scope and assessment criteria; a whole text or unit cannot become a single mastery result.

| Level | Content and generator | Generation and reuse |
| --- | --- | --- |
| Unit course | The Student model builds a lesson outline, order, goals, and material references from the textbook. This is an organizational record, not an external classroom. | Create when the user first starts the unit after confirming materials and progress within it; reuse the outline afterward. |
| Full interactive lesson | Student prepares an explicit teaching requirement and calls `openmaic_generate`; the OpenMAIC service generates the classroom. | Generate once when first studying an eligible lesson; resume the same classroom after pausing, refreshing, or changing conversations. |
| Review or explanation mini-lesson | The Student model authors focused content and uses `openmaic_render`, `openmaic_slide`, or `openmaic_widget` as needed. | Explain an observed difficulty; review starts with recall or an attempt and explains only when needed. Reuse suitable existing content first. |
| Unit synthesis lesson | Student summarizes actual coverage and response evidence, then calls `openmaic_generate` for a synthesis classroom. | Generate on demand when the user confirms the unit is finished or explicitly prepares for a unit test; disclose uncovered material. |

A “whole-unit course” means this collection of separately resumable lessons, not one long classroom that must be completed continuously. One text may span multiple lessons when teaching goals justify the split, rather than a fixed page or minute count.

### Materials and school progress

Before generating a textbook-specific unit outline, confirm the textbook edition, unit contents, teaching materials, and the school's position within the unit. At minimum, distinguish just started, studying a specified text or topic, and finished. Reuse confirmed information and ask only for missing facts.

Verified assessable facts in a knowledge map can support a full goal lesson, but cannot be presented as textbook text. Starting learning first reuses supplied materials, bundled textbooks or target facts; goal and default-textbook lessons are not blocked by an unconfirmed school edition and require neither duplicate uploads nor another foundation-mode choice. The start request authorizes that goal lesson; retain its actual wording and source limitations, and narrow broad capabilities to concrete characters or question types. Ask for missing edition, text or within-unit position only for an explicit textbook-unit or school-alignment request. Incomplete materials may support an outline draft, not a claimed complete textbook unit or silent replacement of a specified textbook.

By default, generate only the current lesson within confirmed school progress. The outline may show later lessons but cannot authorize preview learning; extending progress follows parent-confirmation rules. Home learning completion does not advance school progress. Material corrections may revise unstarted outline entries; generated classrooms, original questions, and responses retain their original material versions and associations.

### The child's learning flow

Entering the learning page first restores the current activity. When the child explicitly chooses a new lesson, pause the old activity and save its recovery position before starting the new one; an old subject recommendation cannot override the selection. Pending classroom synchronization and assessments retain their original activity ownership and may be set aside while changing content.

| Current situation | Main action or entry | Observable result |
| --- | --- | --- |
| Eligible lesson has no classroom | Start interactive lesson | Save ownership and the teaching requirement, submit full classroom generation once, and show its real state. |
| Submitted but not ready | View generation progress | Query the same job and show waiting, failure, or the reason a parent must help. |
| Classroom ready or paused | Enter / continue interactive lesson | Open the original classroom and restore a verifiable position. |
| Classroom ended, evidence awaiting synchronization | View learning feedback | Read the original classroom records and show synchronization state and verified results. |
| Current goal has an observed difficulty | Explain this | Prepare a focused mini-lesson, then check within the remaining allowance. |
| Review is due | Review | Start with recall or an attempt; close when correct and the round requirements are met, or explain when help is needed. |
| Current activity ended | Finish for today | Show a short summary; the child explicitly chooses further learning or other content. |

A full interactive lesson must include an explicit goal, any necessary brief initial check, explanation and demonstration, guided practice, an independent attempt, and a summary. The generation requirement must request these elements; readable content and questions must be checked afterward. Missing required content, scope violations, or conflicting answer criteria prevent the lesson from being marked usable, with the issue retained for correction.

Do not turn every capability into repeated questioning. Reuse valid responses and explain unfamiliar content instead of adding questions indefinitely to fill fields. The existing limit of three new assessment questions per round must constrain the generation requirement and be checked against readable classroom questions. Demonstrations and assisted practice must be labeled and cannot count as independent checks. If the provider cannot honor this limit, the classroom fails acceptance; creating another block cannot bypass it.

Learning may pause or end at any time without new daily minute limits. Ending a lesson closes the activity; long-term mastery still depends on valid responses and existing rules. Watching, animation, successful generation, component scores, and reporting completion cannot independently award mastery.

### Creating and closing a unit course

Creating a unit course prepares only the overall outline and the currently needed lesson. Later lessons are generated when learning is about to begin, using earlier performance. Starting the next lesson requires the child's explicit continuation; returning to the page or finishing a lesson cannot automatically submit external generation.

The unit outline separately shows whether a classroom has been generated, learning has ended, and evidence awaits verification. One completion percentage cannot replace these facts. The synthesis lesson draws on original classrooms, responses, and difficulties, reuses verified materials, and emphasizes connections and transfer instead of repeating every question in the unit.

If school has finished the unit but Student records are incomplete, the user may start a synthesis lesson; its requirement must disclose evidence gaps without inventing learning history. Confirmation that school is merely studying the unit does not trigger synthesis generation. Completing the synthesis lesson retains weaknesses and later review; closing a unit does not erase prior difficulties.

### Generation, failures, and recovery

External job state and learning state are independent. Generation distinguishes not submitted, submission outcome unknown, generating, ready, and failed. Learning distinguishes not started, in progress, paused, and ended. Feedback separately indicates synchronizing, awaiting verification, or verified; none implies mastery.

| Situation | Required behavior |
| --- | --- |
| Double click, refresh, new day, or another native conversation | Read the same lesson and original job through stable ownership; never submit again. |
| Submission times out with acceptance uncertain | Retain original submission identity and mark the outcome unknown; query or recover the original job without automatically creating another. |
| Expired login, identity change, or permission denial | Retain the job and learning position, offer parent recovery, avoid login loops, and never rebind to another learner. |
| Job has definitively failed | Show actionable recovery; retrying the same job requires explicit service support and cannot be assumed from current interfaces. |
| Regeneration is needed | Only after the old outcome is known and the user explicitly chooses it, create a replacement version with separate generation ownership and preserve old references; never overwrite responses. |
| User chooses a mini-lesson first | Identify it as a temporary alternative, not a generated or completed full lesson; retain recovery of the original job and do not interrupt current learning when it becomes ready later. |
| Classroom ready but its business file is not saved | Verify the protected transport record and repair the reference without creating another classroom. |
| Player cannot restore an exact page | Restore the same classroom and disclose that position is unsynchronized; use only a verified or explicitly selected section, without claiming successful position recovery. |

While waiting, show service-reported state and the last check time without invented percentages or estimates. Automatic status reads cannot trigger generation, learning-file writes, or model polling loops; formal-file state updates still pass through the validated native flow. Verify Host and browser authentication separately, and exclude credentials from prompts, business files, and classroom URLs.

### Data ownership and compatibility

The following are proposed minimal logical records, not an inventory of existing fields. Prefer extending formal files and validators; implement a new unit index's exact schema, version, and migration together, without a parallel response database.

| Record | Minimum responsibility |
| --- | --- |
| Unit course index | Stable course ID, learner and term, materials and source versions, unit, outline revision, stable lesson IDs, ordering, goals and scopes, and classroom references. |
| Classroom record | Reuse ownership and lifecycle in `.study/openmaic-lessons.json`; associate the lesson, material version, requirement summary and version, original learning block, external job, and classroom identity. |
| Learning activity | Reuse daily plans and blocks for purpose, current lesson or question, pause position, closure, original responses, assistance, and assessments. |
| Mini-lesson content | Retain reusable content or stable resource references, source classroom or goal, scope, and content version; generated content is not learning evidence. |

Generation ownership is separate from later learning activities: review cannot rewrite the original classroom's learner, term, block, or external job. Review has its own activity referencing the content; late feedback returns to its original activity. Unit synthesis has its own generation ownership and references source lessons and evidence.

Loading legacy records is read-only and does not generate units, classrooms, or invented history. Upgrade migration directly deletes invalid content and updates associations under the rules below, without adding a legacy-course archive feature. Only classrooms with verifiable materials and ownership enter the new outline; never infer ownership from titles. Validate migration on copies with original-file backups; repeated migration cannot duplicate records, rewrite responses, or award mastery.

Multi-file changes use related-file version checks and coordinate pausing the old activity, creating the new activity, and linking the plan within one native operation. On validation failure or interruption, the app retains the last validated view and reports recovery, never a half-completed switch. After conflicts, reread related files and preserve new responses from other conversations instead of overwriting entire files. Persist original responses before assessments.

### Deleting and updating legacy content

Cleanup runs as part of upgrade migration, never on page reads. Actual artifacts, validity, and references determine deletion, not whether `openmaic_generate` was called. Real classrooms generated through other legacy paths remain reusable; a success log alone establishes neither availability nor ownership.

| Legacy content | Direct handling rule |
| --- | --- |
| Prompts, text teaching drafts, and entries without artifacts presented as full courses | Delete course entries and unreferenced associated files, removing recommendation and outline references. If content is the only question snapshot or assessment basis for an answered question, preserve it in the original evidence record and verify it before deleting redundant files. |
| Empty learning blocks and obsolete plan tasks without responses | Delete confirmed abandoned records while repairing daily plans, current activity, and cross-day references. A live unanswered question or generating activity is not deletable merely because it has no response. |
| Text teaching activities with real responses | Preserve original questions, responses, assistance, dates, and assessment associations. End obsolete activities or remove them from current recommendations, labeling them as historical text practice rather than completed interactive lessons. |
| Verifiable, usable legacy classrooms | Preserve generation ownership and reuse them after adding supported material and lesson associations; missing tool invocation records do not justify deletion. |
| Confirmed invalid classroom entries or broken references | Remove them from current outlines and recommendations. Retain classroom identity and question versions still referenced by real responses in necessary evidence records; never cascade deletion into evidence. |
| Temporarily unverifiable classrooms or jobs with unknown submission outcomes | Retain recovery identities, exclude them from usable recommendations, and mark them awaiting verification. Network failures, temporary login issues, or an empty index cannot justify deletion. |

The new flow must not resume deleted abandoned tasks. Check all references before deletion and repair plans and outlines in the same migration. Independently read and validate afterward: no dangling references, duplicate current activities, or lost real responses. Do not change materials or school progress, generate replacement classrooms to fill the new outline, or rewrite historical errors as correct answers.

Migration backups support failure recovery only, without a new child-facing legacy archive page or parallel historical course catalog. Execution records list deleted and modified paths, reasons, and validation results; repeated execution deletes nothing further. If concurrent new responses appear, reread and retain them rather than applying stale cleanup results.

### Interaction and performance requirements

Buttons display only the child's intent, such as “Start interactive lesson” or “My answer: 幕.” Separate internal protocol from display text; update identity, deduplication, and native message source validation together while preserving readability of old messages. Hiding long text while still sending the full version table and duplicated instructions does not satisfy this requirement.

Each action loads only the selected task's goal, requirement, related versions, and necessary evidence. Prepare teaching content once and reuse it; batch independent reads and changes to the same file, without separate model steps for timestamps or repeated schema discovery. Status reads, outline browsing, page navigation, and saved content presentation do not invoke the model. Latency reductions cannot remove response persistence or source checks.

These are release acceptance targets, not existing capabilities or service promises. In an isolated profile, use the same model and configuration with fixed materials for at least ten start/resume actions and ten answer actions. Retain median, P95, failure counts, model steps, and request sizes. Report external full-classroom generation time separately without omitting it from end-to-end reporting.

| Metric | First-release acceptance requirement |
| --- | --- |
| Click and answer echo | Local acceptance P95 at most 1 second; an echo cannot imply persistence or assessment. |
| Internal button input | No workspace-wide version table and only one instruction; fixed short-answer payload at most 4 KiB, with valid long answers tested separately. |
| Initial preparation to generation submission | With fixed materials, P95 from click to sending the first generation request is at most 120 seconds; report external generation waiting separately and in full. |
| Ordinary answer | At most 5 model steps in fixed scenarios without recovery exceptions; both response and assessment validated, with end-to-end feedback P95 at most 90 seconds as the initial ceiling. |
| Generation waiting | Show the original job state after acceptance; polling consumes no model inference per check and never resubmits. |
| Reuse and navigation | Open saved teaching content directly; page navigation and outline browsing invoke the model zero times. |

The 90-second ceiling is an initial improvement over the observed six-minute answer flow, not a claim of suitable long-term interaction speed. If native file edits still miss the target, record the bottleneck and propose a separate architecture revision assessing deterministic programmatic persistence. Removing acceptance conditions or deferring required work while claiming completion cannot make the release pass.

### Independent content review

Before generation, save at most three complete questions, answer keys, explanations, completed sentences and exact supporting quotations. The Host reads the original course material from its contained workspace path, verifies SHA-256, and reviews the batch in a fresh context using the current model, without the author's approval claim, conversation history or tools. Submission requires complete output and explicit approval of grammar, facts, answer uniqueness, criteria and scope. Uncertainty, timeout or missing fields cannot pass.

The Host assembles the external requirement from the approved scope, final teaching plan, original material and a single authoritative question list. It excludes internal mastery rubrics, draft reasoning and rejected examples. Pre-review also checks consistency between the teaching plan and question list; a lesson explicitly limited to written meanings does not acquire an oral assessment merely because the broader capability rubric includes pronunciation.

After generation, read the actual scenes and frozen questions in one operation. Compare approved wording, options, answers and explanations exactly, then independently review the complete content and six teaching stages. The official generation interface accepts a requirement; it does not guarantee question injection or in-place repair. Rewritten questions are rejected instead of silently replacing the approved version. The original job retains its pre-review receipt; revisions require explicit replacement versions preserving earlier questions and answers.

Protected transport receipts cache reviews by policy version, model, original owner, source, plan and actual content fingerprints, and coalesce concurrent requests. Native agents still author academic quality files. Playback independently authenticates the receipt and current content; a self-authored passed flag cannot authorize playback. Receipts are not learning assessments or mastery evidence. Navigation, polling and reopening perform no additional inference. Review latency remains part of end-to-end reporting.

The fixed regression set includes the unnatural phrase “一条水的河流”, the false explanation “游泳需要在水边进行”, correct sentences and ambiguity controls. Deterministic tests cover tampering, omissions, uncertainty, content drift, caching and restart. Real-model evaluation reports detection and false rejection separately; scripted models cannot replace it. Rejected generation requires an explicit revision instead of repeated automatic paid regeneration.

### Implementation order

1. Define unit and lesson associations with existing activities, source requirements, migration, and recovery. Implement invalid legacy-content deletion and reference repair, verify real-response preservation and repeated execution on copies, then cover starting Chinese while old English remains unfinished.
2. Reduce button protocol and task queries together, repairing lost teaching requirements in selected suggestions; verify response saving, source verification, deduplication, and old-protocol compatibility together.
3. Connect one full interactive lesson through generation, status display, opening, recovery, feedback, and closure, then add review and explanation mini-lessons; accept one complete path first.
4. Add unit outlines, generation per lesson, synthesis lessons, and material revisions; verify new-day, subject, and conversation changes.
5. Complete real-model and official-service acceptance in an isolated profile before updating the daily installation through the release workflow. Back up code and learning-data migrations separately; rollback must preserve real answers added after the upgrade.

## Alternatives considered

**Mini-lessons as the new-learning default.** Initial preparation is lighter, but it fails the requirement to start new learning with a full interactive lesson. Mini-lessons remain for review, explanation, and explicitly chosen failure alternatives.

**One long classroom for the whole unit.** It produces much content at once but increases waiting, complicates recovery by text, and prevents later lessons from adapting to earlier performance. Use an outline and on-demand lessons instead.

**Regenerate a classroom after every answer.** This repeats waiting and changes content and question versions. Reuse classrooms and create replacement versions only for explicit content corrections.

**Immediately move all business writes to the Host.** This may reduce model round trips but changes the confirmed direct-file architecture and source recovery rules. Remove redundant steps first and reassess separately if performance fails acceptance.

**Archive all legacy content.** This retains invalid course entries and an additional history catalog rather than fulfilling direct cleanup. Delete confirmed invalid content and repair references while retaining real learning evidence and necessary recovery identities.

## Acceptance criteria

Acceptance checks content, real operations, durable recovery, and performance. Synthetic data supports automated tests; the real service and real DSH client validate integration. Do not fabricate child responses or alter daily records for acceptance; test identities and daily learning records remain separate.

| ID | Scenario | Required observation |
| --- | --- | --- |
| A1 | First start of a new lesson with materials and confirmed unit progress | Unit outline and full teaching requirement exist; exactly one `openmaic_generate` submission; missing evidence does not turn the action into text-only diagnosis. |
| A2 | Only a knowledge map exists, or position within the unit is missing | Reuse verified facts or bundled pages for a full goal lesson, asking only for missing concrete learning scope; school alignment separately verifies edition and position. No invented text or school progress, and no repeated foundation-mode choice. |
| A3 | Start Chinese after pausing old English | Classroom matches the selected Chinese requirement; old work is resumable and plan/activity validation passes. |
| A4 | Double click, refresh, timeout, or conversation change during generation | Same job identity persists; unknown outcomes do not resubmit; restart recovery works. |
| A5 | Authentication denial, generation failure, or content-check failure | Reason is visible; only supported recovery actions appear, without false success or automatic downgrade. |
| A6 | Interruption after generation but before saving the classroom reference | Repair the reference from the original job and open the same classroom without duplication. |
| A7 | Real classroom playback and response return | Question and ownership checks pass; original response is saved once; repeated import adds no evidence and unknown assistance or dates remain unknown. |
| A8 | Viewing ends without valid responses | Activity may end without viewing changing existing capability conclusions; absent evidence stays unknown or awaiting verification, without automatic mastery. |
| A9 | Correct review answer, or explanation after an error | Correct evidence meeting criteria permits closure; difficulty triggers a focused mini-lesson, with later checks within the original allowance and no full-classroom regeneration. |
| A10 | An existing correct “幕” response | Reuse it in preparation without repeated diagnosis; update performance only from new evidence and never treat a text choice as oral-reading evidence. |
| A11 | School confirms unit completion or user prepares for a unit test | Synthesis references actual materials and evidence, discloses coverage gaps, and separates generation, viewing, and mastery. |
| A12 | Material revision, concurrent answers, legacy migration, and rollback rehearsal | Original questions, answers, and classroom ownership survive; conflicts recover, migration is idempotent, and post-upgrade answers remain. |
| A13 | Repeated operations and performance sampling | Meet numeric and zero-call requirements above; buttons show no internal prompts; report full external generation time and failure rate. |
| A14 | External classroom lacks exact position recovery or assessment-count constraints | Disclose position limits or refuse to mark the classroom usable respectively, without unsupported recovery or quality claims. |
| A15 | Drafts without classrooms, abandoned empty activities, and their plan references | Delete confirmed invalid entries and unreferenced files, repairing current activity and cross-day links. Reload does not resume abandoned tasks, validation finds no dangling references, and repeated execution deletes nothing further. |
| A16 | Legacy content contains real answers, or new answers arrive during cleanup | Original questions, responses, and necessary source records remain traceable without falsified assessments. Recheck concurrent changes and never delete an entire activity containing responses. |
| A17 | Mixed legacy success logs, usable classrooms, temporary authentication failures, and unknown submissions | Reuse usable classrooms with verified ownership; logs do not imply availability. Retain recovery identities for unverifiable classrooms and unknown jobs rather than deleting everything lacking tool invocations. |

| A18 | Incorrect content, rewritten questions or forged approval | Independent review rejects both observed errors and ambiguous questions while allowing correct controls; missing or altered receipts block playback, and repeated polling invokes no model. |

## Risks

Full classroom generation depends on the external service, authentication, and content quality; available interfaces do not prove a working real flow. Player recovery, generated-content inspection, and question-count constraints require real verification. Block release of capabilities that cannot satisfy them and record the gap. Verify text, listening, speaking, and physical activity evidence separately.

Full lessons first increase initial waiting and generation cost. Control cost through explicit starts, generation per lesson, and reuse. Do not promise instant completion or silently turn waiting into background bulk generation.

Native multi-file edits and model latency may still affect usability. Measure persistence-failure recovery and interaction time before release. Legacy deletion and updates belong to upgrade migration, never ordinary page reads. Delivering this spec does not mean migration has run or claim completed code or real-classroom acceptance.
