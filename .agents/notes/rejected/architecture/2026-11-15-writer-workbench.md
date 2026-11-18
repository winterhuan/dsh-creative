# Agent Note: Writer novel workbench

Status: rejected — The native Writer conversation and writing sidebar cover the workflow, while a separate workbench duplicates navigation, session management and book registration.

English | [中文](2026-11-15-writer-workbench.zh.md)

## Problem

Writer provides oh-story workflows, guarded editing, draft recovery, chapter checks and versioned reviews, but its session-bound right sidebar makes authors navigate files before they can understand a book. A full workbench needs more writing space and clear book ownership while preserving existing manuscripts and native conversations.

## Proposal

Upgrade the existing `@winterhuan/dsh-writer` package and keep preset ID `writer`. Use an official main panel with a sidebar entry and an embedded native conversation. The first release covers existing long and short works, planning, writing and reviewing. Keep research views and optional cover generation reachable without making them prerequisites for writing.

This proposal extends the [Writer decision](../../implemented/feature/2026-10-31-writer-preset.md): its skill precedence, guarded file writes and role dispatch remain constraints. Its sidebar presentation is proposed for replacement. The [browser decision](../../implemented/architecture/2026-11-07-writer-box-ego.md) remains applicable. Those records remain active; no implemented decision is superseded by this unbuilt proposal.

### Navigation and first entry

Use three top-level destinations: Works, Analysis library and Market research. Settings is a utility action. Works opens by default; within a browser, reopening restores the last valid book and document without sending a prompt. A missing book keeps its registration visible with a locate action rather than silently recreating its directory.

Works shows compact book cards or equivalent rows with title, long/short form, directory hint and recorded progress. Show “Unknown” when progress is unavailable, and distinguish saved text from committed chapters. Continue opens the last document and associated conversation. Do not invent cover images, literary scores, productivity streaks or completion percentages from incomplete records.

An empty Works page offers Open existing work and New work. Opening explicitly selects a registered workspace and book directory; discovery proposes candidates and does not register all scanned folders. New work collects title, long/short form and destination, then offers a planning request. Validate names and refuse existing target paths. Creating a workspace or directory requires a small Host operation using native controllers and file permissions; the current replacement-only save endpoint cannot create a project.

### Writing layout

Separate the Works page from the book workspace. Inside a book, a compact header contains Back to works, book title and the current document. Save state sits beside the document, and conversation actions sit beside the assistant. Avoid stacking global navigation, book tabs and editor tabs across three permanent header rows.

The following wireframe expresses ownership, not final styling. The review region replaces or expands below the document; it is not a fourth permanent column.

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Works ←   Book title           Current document          View options │
├──────────────┬───────────────────────────────┬────────────────────────┤
│ Overview     │ Chapter title    Save state   │ Writing assistant      │
│ Chapters     │ Edit / Preview / Changes      │ Current conversation ▾ │
│ Outline      │                               │                        │
│ Settings     │         Manuscript            │ Native messages,       │
│ Tracking     │                               │ tools and approvals    │
│ Files        │                               │                        │
│              ├───────────────────────────────┤ Native input           │
│              │ Checks / Review (expandable)  │                        │
└──────────────┴───────────────────────────────┴────────────────────────┘
```

Book navigation has Overview, Chapters, Outline, Settings, Tracking and Files. Here Settings means story settings, not application preferences; localized copy must make that distinction clear. Short works show Body and section outlines instead of an empty chapter/volume hierarchy. Files retains access to supported text and structured records. One selected document owns the editor, preview, diff and recovery state.

Start the layout trial with a 220 px navigation rail, a resizable assistant near 380 px, and a document region of at least 520 px when side by side. Measure the panel container after DSH chrome, not the viewport. Collapse navigation first when space is insufficient; then switch between Content and Assistant instead of squeezing both. These values are trial targets, not fixed acceptance thresholds.

Opening a book defaults to showing the native assistant beside the manuscript whenever the container can fit both. Do not restore a previous collapsed assistant as the default on reopening. Authors can manually collapse it or enter focus mode; constrained containers use the Content/Assistant switch. Focus mode hides navigation and assistant while retaining the document title, save state and exit action. Each region scrolls independently. Changing view mode preserves selection, unsent native input, attachments and manuscript drafts. Keyboard resizing and focus return must work without a pointer.

### Visual design

Use the existing DSH theme and UI primitives for backgrounds, borders, typography, menus, dialogs and toast feedback. Borrow Media Desk’s panel organization and native chat integration. Retain Writer’s restrained document treatment: quiet surfaces, clear alignment, subtle separators and a single primary action per region. Decorative glass, animated backgrounds and large cover walls do not help the first writing release.

Keep controls on the existing compact scale and cap feature font weights at 500. Give manuscript text a separate comfortable reading scale and bounded line length, verified with Chinese long paragraphs and mixed Latin text. Color is supplementary: saved, unsaved, stale, failed and running states also have text or icons. Verify contrast in both themes.

Use shared library icons with tooltips for ambiguous icon actions. Menus escape clipping, fit the window and dismiss with outside click or Escape. Respect macOS titlebar clearance locally; verify Windows and touch layouts without changing global theme variables. Avoid hover-only actions.

### Planning, writing and review

Overview explains recorded progress, unfinished materials and next available actions. The primary action follows evidence: Continue chapter when unfinished material exists, otherwise prepare a request for the next known chapter or planning step. Do not infer permission to write prose from an empty project, a planning confirmation or a selected outline.

Chapter rows display number, title and independently evidenced manuscript/check/review states. Selection opens the body; related outline, checks and review stay accessible without navigating raw JSON. Invalid records show the failing record and a recovery action; missing records mean not checked or unknown, never passed. Chapter commitment still uses the existing oh-story workflow.

Review expands near the text with severity, quotation, explanation and proposed revision. Selecting a finding locates its quotation only when the current version still matches; otherwise show the reviewed version and a stale label. Compare against the recorded review text. Decisions are requests to the existing validated recorder, not local checkbox state. A failed or interrupted request cannot display an accepted resolution.

Context actions prepare an explicit task in native input, preserving any existing draft and attachments. Include book, chapter/document, operation and stopping point. Selection discussion includes source version and identifies unsaved text. Before a mutation the execution path must re-read or validate the source; a quoted version alone does not enforce concurrency. No model request occurs until the author sends.

### Conversations and context recovery

A book has a preferred current native conversation and may retain earlier phase conversations. Use native session/workspace controllers to create or bind actual Sessions. Opening a book is separate from sending input. Bind an existing conversation only after validating its home, workspace, preset and book association; a matching title is not sufficient. Two books must not accidentally inherit the same active binding.

Keep Writer’s native automatic compaction, tool-result pruning and manual compact command. Do not show an invented context percentage or a claim that compaction retained every fact. Native compaction feedback remains in the native conversation. Add a workbench pressure indicator only if a supported runtime source supplies it.

Start new phase conversation is explicit and preserves the previous Session. If work is active, offer to wait or use native Stop and wait for it to settle before changing the binding. Releasing a panel does not stop an Agent. Conversation history remains available through the native workspace.

Before new-phase writing, recover current chapter and revision from committed tracking records, use the existing derived context card, then read the current outline, relevant settings, author constraints and nearby prose as the skill requires. Do not load the whole book or tracking JSON every turn. Missing or inconsistent state is shown before writing. Essential author decisions must be recorded through the existing workflow rather than left only in a summary.

### Files, drafts and persistence

Manuscript files remain the content authority, including existing Chinese directories and `.story` records. Do not move them into Wiki Notes or introduce a second editable manuscript store. Minimal Host-owned registration stores canonical workspace/book location and actual conversation associations, scoped to DSH home; browser preferences store layout and last selection. Book display names are not identifiers. Directory moves require explicit relinking and association validation.

Reuse `useWriterDocument`, draft storage, EOL handling, versioned saves, discovery and review parsing. Inspect ownership before lifting editor state out of its current session-keyed mount. The main panel is the sole editable owner in one browser runtime; the old sidebar opens that panel at its current file. Preserve existing recovery keys or provide an explicit tested import.

External changes refresh clean documents; dirty documents retain their draft and expose comparison/reload without overwriting either version. Late reads and saves cannot update another document, book or conversation. Starting a new phase must not discard an unsaved manuscript. Preserve the existing write permission checks; registration does not grant file access.

### Loading, failure and empty states

Use list skeletons for loading collections and a centered spinner for initial document loading. Retain populated content during refresh. Query failures keep a nearby Retry action; transient operation outcomes use the app-wide toast. Save conflicts and unavailable browser recovery stay visible beside the editor until resolved. Errors use short localized copy.

A missing workspace, wrong preset or unavailable Session offers a repair action without silently creating another conversation. Keep book browsing available where file authorization permits. A busy button names its active operation; a stopped or failed model turn is not a completed chapter or a saved review.

### Implementation responsibilities

Keep the implementation inside the existing Writer package. Split presentation only where ownership changes: a main-panel shell, Works page, book navigation, document view and native assistant adapter. Extract the document controls from `desk.tsx`; reuse the existing discovery, document, review and diff modules. Avoid a general workbench framework or a second writing runtime.

| Responsibility | Existing owner | Required change |
| --- | --- | --- |
| Launch and navigation | `client/index.ts`, `sidebar.tsx`, `mode.ts` | Register official main panel and always-available workbench launcher; retain preset checks for bound editing/conversation. |
| Book discovery | `library.ts`, `search.ts` | Restrict discovery to the explicitly selected native workspace; convert candidates to book registrations only on selection. |
| Document editing | `desk.tsx`, `use-writer-document.ts`, `draft-storage.ts` | Separate document lifetime from the current Session and extract editor controls without changing recovery keys. |
| Checks and review | `BookPanel.tsx`, `book-status.ts`, `RevisionDiff.tsx` | Expose existing validated records beside the selected chapter; retain fingerprint invalidation. |
| File authorization and saving | `read.ts`, `save.ts`, `write-route.ts` | Continue using native authorized reads and expected-version saves; revalidate after a Session change. |
| Book and conversation registration | New small Host service | Persist stable book IDs, native workspace IDs, relative book paths and phase Session associations with serialized atomic updates. |
| Native assistant | New Client adapter using official factories | Retain the book-bound Session explicitly; render native input/history/approval inside that scope. |
| Skills and credentials | Existing preset, settings and `writer-agent.ts` | Keep current ownership; update task context only where book selection requires it. |

### Workspace identity and document lifetime

Distinguish the native workspace root from the book directory. Preserve the workspace root of an adopted Session and store the book as a validated relative path beneath it, including the root-book case. New phase Sessions use that same workspace. This preserves workspace instructions, project skill discovery and the current `[cwd, relativePath]` browser recovery keys. Do not silently re-root a Session at the book directory.

When several books share a workspace, the selected book is explicit task context. Do not rewrite workspace-wide `.active-book` merely because the user browses another book. Pass the book path to skills and commands that support it; verify every shortcut before exposing it. If a workflow still requires the workspace-wide active-book preference, serialize that operation or request an explicit selection rather than letting simultaneous conversations change it silently.

Own a document controller by workspace and relative file identity, independently of assistant visibility and phase Session ID. Keep it alive while switching conversation phases; pause saves during rebinding, settle any active save, then re-read through the new authorized Session and validate the baseline before enabling saves. Existing code closes and discards recovery when opening another file, so switching books must first offer Save, Keep draft or Cancel. Keep draft must persist successfully before releasing the controller; when recovery storage fails, offer download or remain on the document. Never present a recovery write failure as a completed switch.

For the first release, replace the old editable sidebar with Open workbench targeting its current Session/book/file. This makes the main panel the only editor in one browser runtime and avoids a shared global editor service. Multiple browser tabs still use the existing recovery-copy conflict checks and filesystem versions.

### Native binding and operation states

The global workbench must not inherit whichever native Session is currently selected elsewhere. Give its conversation child a strict Session scope backed by the selected book association, as in Media Desk. Use official factories and balanced retain/release; hidden assistant layout preserves native input state. Add the required DSH package declarations and Remote type imports at their real call sites.

Keep book availability, conversation binding and document status independent. Book states are available, missing or needs relink; binding states are unbound, creating, ready or needs repair; document states include loading, clean, dirty, saving, conflict and failed. A conversation error does not erase an open manuscript, and a file error does not erase native chat. UI operations expose pending state and disable only conflicting actions.

Serialize binding changes per book and persist creation intent before calling native controllers. Record the actual Session ID as soon as obtained and preserve partial creation evidence. A refresh or double click must not create another Session. If a crash leaves creation uncertain, reconcile using supported native evidence or show repair; do not automatically repeat it. Registration metadata contains references, not copied Session logs or book content.

Shortcut routing must distinguish editor and assistant explicitly. The current `isChatComposerTarget` excludes descendants of the Writer workbench, which becomes incorrect once chat is embedded there. Scope Save and Search to the editor/navigation region, preserve native conversation shortcuts, and test focus after menu dismissal, review navigation and narrow-layout switching.

### Implementation order

1. Layout trial: register the main panel and official conversation slot on DSH `0.2.2-rc.1`; display an existing manuscript using the current editor. Verify container sizing, native input, selection, draft preservation and light/dark themes before expanding functionality.

2. Book opening: implement explicit registration and validated Session associations, short/long navigation and old-sidebar handoff. Keep one editable document owner. Verify legacy drafts and reopening after Host/browser restart.

3. Writing loop: add evidence-based overview, chapter selection, outline/settings navigation, review inspection and native draft actions. Exercise one existing long work and one short work from planning through revision using the current skills.

4. Completion: organize analysis and research views, add safe project initialization, complete new-phase recovery and compaction checks, then update paired docs and build the fixed Git install package. Keep optional paid cover requests explicit.

## Alternatives considered

**Expand only the right sidebar.** This preserves current registration but still competes with the native conversation for manuscript width and hides book-level work behind session navigation.

**Copy the complete Media Desk implementation.** Its panel and chat integration are useful references; its Notes migration, production acceptance and publishing model would add unrelated storage and workflow responsibilities. Use DSH public primitives without adding a shared workbench framework in the first release.

**Use one conversation forever, or a fresh conversation for every chapter.** The first accumulates mixed decisions and depends too heavily on summaries; the second discards useful local continuity. A preferred conversation with explicit phase changes balances continuity and bounded recovery.

**Create a new writing engine or embed the oh-story Dashboard.** Both replace existing ownership rather than expose it. Keep native conversation, current skills and validated manuscript records. Automatic publishing, scheduled writing and graph editors are outside the first release.

## Acceptance criteria

- Design review in real DSH: inspect Works, long-work editing, short-work editing, stale review, file conflict and new-phase conversation at wide, constrained and touch sizes in both themes. Check that prose remains readable, controls stay reachable and no fourth column or clipped overlay appears.

- Content safety: existing files remain byte-identical through discovery, registration, view switching and conversation changes. Save only the chosen document. Retain dirty drafts on failed reads/saves, external edits, rapid book switching and restart; test delayed responses and the old recovery format.

- Workflow: plan without creating prose, write a named chapter without expanding scope, inspect valid and stale check/review records, and record review decisions through the existing validated workflow. Raw file availability is not proof of committed progress.

- Native integration: preserve unsent text and attachments across layout changes; navigate to the same actual Session from the workbench and native workspace; keep tasks running when views close; verify Stop, failures, rebind and restart without duplicate prompt submission.

- Context recovery: force actual compaction in an isolated runtime, inspect persisted compaction events and continue a chapter. Then start a new phase and recover chapter/revision, relevant character state and recorded author constraints. Controlled fixtures verify mechanics; a real model run assesses usable recovery and does not certify literary quality.

- Delivery: run Writer typecheck, build and tests, relevant prose/UI gates and documentation checks. Validate a built package in an isolated development profile, restart the Host and hard-refresh the browser. This planning note does not claim those product checks have run.

## Risks

Native main-panel Session scope, controller APIs and document ownership must be demonstrated in the layout trial; Media Desk code does not prove Writer integration. Lifting a large sidebar component can duplicate effects and invalidate draft ownership. Reuse focused modules and change only what the main panel requires.

Compaction can omit creative details and a single oversized input can still exceed model capacity. File recovery depends on authors and skills recording important decisions. Existing skill copies may override updated bundled behavior; preserve source diagnostics and explicit synchronization rather than silently replacing project customizations.
