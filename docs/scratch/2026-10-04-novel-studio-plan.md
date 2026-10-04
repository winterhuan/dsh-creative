---
description: "A focused redesign for the novel workbench: one project model, explicit write authorization, optional planning, and a recoverable writing loop."
status: planning
updated: 2026-10-04
---

# Novel workbench: focused redesign

English | [中文](2026-10-04-novel-studio-plan.zh.md)

## Summary

The workbench should extend `@winterhuan/dsh-story` instead of introducing a second novel plugin. Its product unit is a bounded task on one work, not a matrix of collaboration modes, planning methods and execution engines. Every task states whether it may discuss, produce a candidate, or commit an authorized edit; planning depth is optional; DSH remains responsible for sessions, models, tools and cancellation.

This redesign keeps the useful ideas from the earlier proposal—works independent of chat, source-linked context, comparable candidates, version checks and resumable work—but removes nine user-facing combinations, preset switching and duplicate Team compositions. It adds a domain engine for the Story Bible, state ledgers, context assembly and quality workflow; these are novel-domain assets, not DSH runtime state. The first milestone is one complete loop: select a work, preview context, generate a candidate, review it, commit or discard it, and resume safely.

<a id="architecture"></a>
## Architecture

Keep three conceptual layers even when the first release ships them in one TypeScript package. The novel engine owns durable story meaning; the DSH adapter translates public runtime capabilities into task tools; the workbench presents author decisions and artifacts.

| Layer | Owns | Must not own |
|---|---|---|
| Novel engine | Story Bible, outline, ledgers, context selection, workflow state and consistency checks | DSH Session internals, model selection or browser state |
| DSH adapter | Skill and tool registration, scoped file access, subagent/workflow invocation and runtime event mapping | Canonical story facts or UI-only draft state |
| Workbench | Work navigation, editor, task drawer, candidate comparison and human approval | A second chat, hidden permissions or a second source of truth |

The engine should be TypeScript in this repository, with interfaces that accept files, task input and runtime events rather than importing DSH implementation details. A future CLI or SDK can call the same engine. The adapter is the only layer that should change when DSH public APIs change.

<a id="one-core-two-wings"></a>
## One core, two wings

Long fiction and short fiction share a platform and quality layer, but they do not share a writing pipeline. The project mode is explicit in `novel.yaml`; `AGENTS.md` can add human and model guidance, but it is not the machine-readable source of mode state.

| Area | Shared core | Long-fiction wing | Short-fiction wing |
|---|---|---|---|
| Work unit | Files, candidates, version checks, task authorization and commit reporting | Chapter and scene | One complete story |
| Domain state | Bible, author voice, source records and review records | Volumes, chapter cards, rolling summaries, character knowledge and foreshadowing ledger | Story kernel, emotion and twist design card, setup evidence and ending target |
| Context | Explicit sources first, bounded preview and source versions | Current chapter, adjacent prose, relevant ledger entries and summaries | Whole story when it fits, plus design card and style samples |
| Quality focus | Consistency checks, independent review, revision limit, anti-pattern signals and human approval | Continuity, state change, promise debt, pacing and serial stopping points | Opening pull, setup fairness, emotional curve, twist payoff, redundancy and ending image |
| Cost strategy | Visible budget and model routing | Spend per chapter and preserve resumable state | Spend more on whole-story reading and revision |

The mode selects a schema and workflow; it does not silently change author permissions. A future explicit conversion can copy shared material into the other wing, but a short story is not treated as a chapter batch and a long novel is not forced into one-context generation.

## Contents

- [Architecture](#architecture)
- [One core, two wings](#one-core-two-wings)
- [Design decision](#design-decision)
- [Author journey](#author-journey)
- [Work and task model](#work-and-task-model)
- [Quality loop](#quality-loop)
- [Native DSH composition](#native-dsh-composition)
- [Workbench and task states](#workbench-and-task-states)
- [Delivery sequence](#delivery-sequence)
- [Open questions and evidence](#open-questions-and-evidence)

<a id="design-decision"></a>
## Design decision

Use one story plugin, one ordinary writing session, and one task contract. Do not expose collaboration modes as presets or make authors choose an execution engine before they know what they want to write.

| Decision | Chosen design | Reason |
|---|---|---|
| Product boundary | Extend `@winterhuan/dsh-story` and its existing workbench | Existing discovery, editor, file routing and versioned writes already form the right host |
| Author control | Per-task write authorization: discuss, candidate, commit, or bounded run | Permission is visible at the point where a side effect occurs |
| Planning | Open exploration, current-unit plan, or book map; choose only when useful | Planning depth does not change who owns the prose |
| Execution | Main session by default; native workflow only for an explicitly bounded multi-step run | Implementation machinery stays proportional to task size |
| Persistence | Markdown/TXT remains canonical; structured story artifacts and a small project index store domain state and task references | The project stays inspectable and portable without duplicating DSH history |
| Teams | Later opt-in for long-running research or structure work | Team membership is an execution optimization, not a writing mode |

The author sees three common actions: discuss, draft a candidate, and apply a specified change. “Continue” is a bounded task with a target and stopping point, not an autonomous mode. Review is a service that returns evidence and suggestions; it never silently grants write permission.

The design deliberately gives up preset hot-swapping, automatic full-book analysis, fixed chapter quotas, mandatory review gates, score-based acceptance and a parallel writer team. Those mechanisms add state and cost without protecting the core author decision. The engine still owns real domain checks; the reduction removes premature product choices, not novel-specific rigor.

<a id="author-journey"></a>
## Author journey

Every task follows the same short path. The UI may skip steps that have no work to do, but it must preserve the same state and authorization semantics.

1. Select a work and a target: a scene, document, chapter range or question.
2. Choose an intent: discuss, draft candidate, apply edit, or continue within a bounded range.
3. Preview the context: selected files, versions, excerpts, omissions and unresolved choices.
4. Run the task in the existing DSH session; add a native subagent or workflow only when the task requests it.
5. Return a result as one of discussion, candidate, committed document, blocked decision or failure with retained artifacts.
6. The author accepts, edits, discards or resumes. No candidate changes the manuscript before acceptance or explicit commit authorization.

| Request | Default result | Stop condition |
|---|---|---|
| “Help me find the conflict” | Evidence and options in chat | Missing source or unresolved author choice |
| “Try this scene” | Candidate linked to the source version | Candidate is ready or context is insufficient |
| “Rewrite this selection” | Candidate diff | Source version changed or selection is ambiguous |
| “Write the next chapter” | One bounded commit, or a candidate if the author asked for review first | Target reached, conflict, error or consequential choice |
| “Write three chapters” | Sequential bounded run with one checkpoint per chapter | Any chapter fails; later chapters do not start |

Existing manuscripts remain first-class. Intake previews encoding and chapter mapping, preserves the source file, and lets the author start from a selected task; it does not require a whole-book analysis.

<a id="work-and-task-model"></a>
## Work and task model

The work is the stable identity shared by files, drafts, candidates, tasks and DSH sessions. Files remain ordinary Markdown or TXT so an author can leave the workbench without losing access to the manuscript.

| Record | Required fields | Owner and rule |
|---|---|---|
| Work index | root, documents, order, optional title and writing preferences | Work service; create lazily on explicit save and derive missing values from files |
| Story Bible | world rules, character cards, voice samples and reader promise | Novel engine; structured where checks need structure, prose where the author needs nuance |
| Outline | book direction, arc goals and current-unit beats | Novel engine; plans remain proposed until the author confirms them |
| Ledgers | timeline, character state, knowledge boundaries, foreshadowing and new facts | Novel engine; every entry carries source version, status and source record |
| Task | intent, target, base versions, context selection, budget and stop point | Task service; immutable after launch except cancellation state |
| Candidate | source document, base version, selection or whole-document patch, content and diagnostics | Work service; never current prose until accepted |
| Handoff | completed scope, actual versions, unresolved choices and native task reference | Work service; short and source-linked, never a copy of chat |
| History | prior document versions and action metadata | Work service; restore creates a new version and keeps later history |

Facts that affect future writing must point to a document version or an author-confirmed setting. Model-extracted facts enter the ledger as proposals until the configured commit step accepts them; a failed extraction must not block a valid manuscript commit. Derived notes can become stale by source document; the UI marks them for review instead of presenting them as facts. No sentence-level dependency graph or vector database is required for the first release.

Context assembly uses this order: current request and explicit constraints, author-selected material, target text and adjacent passages, relevant settings and plans, then history. The preview is part of the task record, so a missing or truncated required source is visible and recoverable.

All writes use compare-and-swap on the exact base version. A changed source rejects a stale candidate or asks for a fresh comparison. The chapter pipeline is plan → scene draft → review → bounded revision → manuscript commit → ledger proposal and summary. Ledger updates are separately recorded, so a failed bookkeeping step cannot pretend that prose was not committed. A multi-document run reports each document separately; it never claims whole-book atomicity.

<a id="quality-loop"></a>
## Quality loop

Treat consistency, reader pull and prose texture as different questions with different evidence. The engine must not turn a literary proxy into an objective approval score.

| Question | Primary evidence | Effect |
|---|---|---|
| Does the chapter remain coherent? | Code checks for identities, time, place, state, knowledge boundaries, registered entities and source-linked ledger changes | Block hard contradictions; report softer warnings |
| Does the chapter create a reason to continue? | Scene-card fields, promise and payoff records, state-change checks, an independent review and small human reading samples | Flag missing desire, obstacle, change or unresolved reader value; author decides revision |
| Does the prose sound like this work? | Style samples, dialogue voice checks, repetition and sentence-pattern signals, blind author or reader comparison | Suggest targeted rewrites; never certify “human” or “good” automatically |

The chapter path writes one scene at a time. Each scene records a goal, obstacle, result and emotional or informational change. The reviewer receives the manuscript and relevant source artifacts, not the writer's hidden reasoning, and returns locations plus actionable comments. Revision has a visible limit; unresolved disagreements become a human decision instead of another silent loop.

The first release stores Bible and ledger artifacts as inspectable files. A derived index may be added after measured query pressure; SQLite, embeddings and Git commits are integrations, not canonical truth. A file transaction and version record must remain sufficient to recover the work when DSH is unavailable.

<a id="long-and-short-pipelines"></a>
## Long and short pipelines

The long-fiction wing uses chapter and scene cards. A card records the target, obstacle, outcome, state change, scene beats, knowledge boundaries, foreshadowing movement, end hook and an optional platform word range. A chapter without a meaningful state change is a warning or stop according to the project policy, not a universal literary law.

Its normal path is: assemble bounded context → draft scene by scene → run hard consistency checks → independent review → bounded revision → anti-pattern and voice pass → commit the chapter and ledger proposals → human sampling. Long runs remain sequential because the next chapter depends on the committed previous state.

The short-fiction wing uses one design card with a logline, reader promise, protagonist desire and wound, opening hook, twist type and reveal position, setup evidence, emotion curve, ending image and scale limits. Its normal path is: market or reference analysis → story kernel → author-approved design card → beat and length budget → draft → setup backtrace → whole-story reader review → whole-story revision → anti-pattern and title/opening pass → human final decision.

Short-fiction checks must locate each planned setup in the manuscript, test whether the reveal is fair without being obvious, find flat emotional regions, remove scenes that serve neither emotion nor story change, and inspect the final image for explanatory summary. These checks supplement the shared quality layer; they do not turn a fixed formula into a guarantee.

<a id="native-dsh-composition"></a>
## Native DSH composition

The existing story bundle remains the installation boundary. Add a novel engine module and a thin DSH adapter inside that package; do not create `novel-studio`, three collaboration presets or Team-specific plugin rows. Business code talks to adapter interfaces, not DSH internal stores or Cordis services.

The normal path uses the current Session, Skill loading and native file tools. A bounded continuation may call the existing native `workflow` with a task script that names its target, budget, write policy and checkpoint. A subagent may read or analyze; it does not receive manuscript write authority unless the parent task explicitly grants that authority and the runtime enforces it. Specialist roles can be added for planning, drafting, review and bookkeeping, but roles never replace tool-level permission checks.

The plugin must test, rather than infer, the limits of native delegation. In particular, verify cancellation of parent and child work, write access through shells and workflow children, and the terminal state reported after a failed commit. Role wording is guidance; the work service and tool composition enforce the durable boundary.

No live preset switching is needed. A task captures the current Session and work versions at launch. Changing the writing preference affects the next task; changing a running task requires cancellation and a verified terminal state.

<a id="workbench-and-task-states"></a>
## Workbench and task states

Keep the existing editor and file tree. Add a compact task drawer rather than a second chat or a mode-selection wizard.

The drawer shows the work, target, intent, context preview, write policy, budget, progress and result. Candidate review shows the source and replacement side by side, with accept, partial selection, discard and regenerate actions. External edits keep the local draft and expose a comparison.

Use explicit task states:

| State | Meaning | Allowed next actions |
|---|---|---|
| Ready | Target and context are selected | Start, edit task, or cancel |
| Running | Native work is active | Observe or request cancellation |
| Needs author | A consequential choice or missing source blocks progress | Supply input, narrow scope or discard |
| Candidate | A version-bound result is waiting for a decision | Compare, accept, edit or discard |
| Committed | The exact authorized document version was saved | Inspect, continue or start another task |
| Failed | Work stopped without a valid commit | Inspect diagnostics, retry missing work or discard |

The workbench stores only task and artifact references. DSH owns conversation history, model choice, job state, subagents, Teams and cancellation records. Refresh, Session changes and a second window must reconstruct the drawer from those references without overwriting drafts.

<a id="delivery-sequence"></a>
## Delivery sequence

Start with a short-fiction quality loop, then add the long-fiction state layer. Each phase has an observable product result and a narrow technical gate.

| Phase | Deliverable | Evidence |
|---|---|---|
| 0. Short-fiction manual loop | Design card, scene drafting, whole-story review and anti-pattern pass as Skills | Five small stories expose reader drop-off, weak twists and voice problems before automation |
| 1. Shared quality tools | Candidate commit, setup backtrace, consistency checks, review workflow and revision limits | Engine tests run without DSH; hard conflicts block and literary checks return evidence |
| 2. Long-fiction state | Chapter cards, rolling summaries, character knowledge and foreshadowing ledger | A committed chapter produces source-linked proposals; rejected extraction never changes canonical facts |
| 3. Long-fiction continuation | Scene or chapter pipeline with checkpoint, review and handoff | Resume never repeats a committed unit or silently expands scope |
| 4. Batch and Teams | Sequential multi-unit workflow and explicit opt-in Team research | A failed unit stops later units; Team artifacts have clear ownership and no write bypass |
| 5. Install and experience | Package installation, browser behavior, import/export and writing comparison | Functional evidence is separate from literary-quality evidence |

The first acceptance set is intentionally small: one-sentence idea, candidate scene, selection rewrite, next chapter, stale-source rejection, external edit conflict, cancellation, refresh recovery and existing-manuscript intake. Themes, narrow windows, keyboard actions, bilingual copy and isolated `DSH_HOME` remain part of browser verification.

Evaluate literary quality separately with the same model and comparable budgets for a new opening, a continuation and a local revision. Measure continuity, author-retained text, intervention count, latency and token use; do not turn those observations into an automatic acceptance score.

<a id="open-questions-and-evidence"></a>
## Open questions and evidence

The current repository already proves the file discovery, editor buffering, versioned save and native story Skill seams. The redesign relies on those seams and narrows the new work to task authorization, candidate persistence and resumable orchestration.

Before implementation, answer these questions with isolated DSH experiments:

- Can the work service enforce the write policy for native workflow children and shell-capable tools?
- Which native job and Session records are sufficient to reconstruct a cancelled task after process restart?
- Can a task reference remain valid when the author moves or renames a document inside the supported project scope?
- What is the smallest index format that supports ordering and history without becoming a second manuscript database?

The earlier research remains useful as design input: work state should be independent of chat, explicit material should outrank inferred memory, and candidates should be comparable. It does not justify fixed quotas, mandatory gates or a new plugin boundary.

### Dev Note

This is a planning document, not a shipped contract. Once the vertical slice is verified, move current behavior to the story package README, record durable architectural choices under `.agents/notes/`, and delete superseded planning prose rather than keeping two competing designs.
