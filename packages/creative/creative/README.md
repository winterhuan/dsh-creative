---
description: "Creative production plugin for fiction, short-drama, interactive-game, and video-recap workbenches."
kind: "package-bundle"
---

# @winterhuan/dsh-creative

English | [中文](README.zh.md)

## Summary

Creative adds fiction, short-drama, interactive-game, and video-recap workflows to DeepSeek Harness. Bundled Skills and specialist Roles work through DSH's workspace, Session, models, tools and permissions; the Web profile also provides an editor, media previews and production cards in the right Sidebar.

One Creative page keeps all four domains available in mixed workspaces. Cross-domain workflows share project files and production settings without requiring separate applications ([decision](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md)).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

---

<a id="use-this-package"></a>
## Use this package

### Install into a profile

`dsh plugin add` installs this bundle into a profile; its [profile patch](cordis.patch.yml) mounts `creative`, the `creative-produce` settings namespace and the settings page. The plugin registers four Skill providers (`story`, `short-drama`, `novel-to-game`, `video-recap`), the `creative_role` specialist Roles and the production tools. These need only the skill, subagent and tool registries; the Session-scoped `/creative` API registers when `webServer` and `typert` are also available.

```yaml
- id: creative
  name: '@winterhuan/dsh-creative'
```

| Field | Default | Meaning |
|---|---|---|
| `editorMaxBytes` | `2097152` | Maximum editable text file size for the workbench editor (bytes). |
| `trustedHosts` | `[]` | Additional `host[:port]` authorities allowed to reach the workbench API beyond loopback. |
| `produce` | `{}` | Initial production profile and credential references; the `creative-produce` settings namespace supplies user overrides. |

### Open the workbench

In a Session, expand the right Sidebar and choose **Creative workbench** on its guide page; it is available even in an empty workspace. Opening a supported Creative file from Chat reveals the same workbench, while other file links keep the Sidebar's file preview. Creating project files does not open the panel.

The fiction pane recognizes projects at the workspace root, under `<book>/`, or under `长篇/<book>/` and `短篇/<book>/`. A short story appears as soon as `设定.md`, `小节大纲.md` or `正文.md` exists, and the default document is prose, then an outline, then another Markdown file.

Editor drafts and conflicts survive refresh and tab changes. A complete listing can mark a draft's file as missing but never discards the unsaved text, and a truncated listing is not evidence of deletion. Saves use the last acknowledged file version, so a concurrent disk change requires conflict resolution rather than an overwrite.

### Chapter review

Long-form chapters follow outline readiness, a compact scene plan and a reader-value review before submission. Reviews bind quoted evidence to the final body hash, and tracking retains a compact continuation summary. Packaged Role `agent_options` select review models without adding caller-controlled tool parameters; malformed options fail at load. AI-pattern and Zhuque results remain advisory. Project punctuation defaults to preservation; `设定/写作检查.json` can select `normalize-narration` for quoted-dialogue-safe normalization. See the [reader-value decision](../../../.agents/notes/implemented/feature/2026-09-22-novel-reader-value-generation.md) and [chapter workflow](knowledge/story/skills/story-long-write/references/workflow-chapter.md).

### Deliver and verify

Short-drama production can compose confirmed clips, timed dialogue, music and subtitles with the `episode-compose` adapter. The workbench checks one coherent episode revision and associates published media through hashed production manifests. Unsaved or invalid episode documents block preparation.

Game templates include state, save/load, restart and QA hooks. The `game-qa` entry runs real Chrome with Studio preview restrictions; the preview shows the authenticated result. Strategy and independent blind-play reports remain design feedback. Without a game project, the Game tab shows an empty state and keeps navigation to the other workbenches available.

Video recap supports an explicit local draft with degraded stages recorded in `draft_status.json`. Drafts remain visibly separate from final output. Delivery evidence measures narration coverage, source reuse, declared rights and framing without granting platform approval.

### Configure paid production

Production settings name credential references, not secrets. A custom reference such as `AGNES_POOL` still supplies the adapter's canonical `AGNES_API_KEY`; renaming a reference does not rename the child-process variable. Comma-separated references and newline-separated stored keys form rotation pools ([execution policy](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md#production-and-credentials)).

Drama production requires a job prepared and explicitly confirmed with the bundled `production_tool.py`. Pass its `job_id`, the matching `adapter` and the project `workdir` to `creative_produce_run`; the runner snapshots the confirmed inputs, consumes the confirmation once before execution, validates and publishes outputs, and records the run. Replacement job JSON on `stdin` and extra drama arguments are rejected, and `argv: ["--selftest"]` is the only drama diagnostic. Changed job inputs require preparation and confirmation again; a workbench request or job binding never replaces confirmation.

Agnes video uses the free `agnes-video-2.5-flash` model when no model is configured; set `produce.agnesVideoModel`, the matching production setting or `AGNES_VIDEO_MODEL` to choose another, and note that `agnes-video-2.5` bills per second. Its runner validates the model, parameters and reference inputs before consuming the confirmation, so a local validation error reports its cause and leaves the receipt unused.

---

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

| File | Role |
|---|---|
| `src/skill-provider.ts` | Four bundled `SkillProvider` implementations with DSH bridge injection. |
| `src/role-provider.ts`, `src/role-tool.ts` | Bundled Role personas and `creative_role` subagent delegation with per-role tool filtering. |
| `src/reference-tool.ts` | Pinned bundled reference reader for `story-setup` agent references. |
| `src/production-tool.ts` | `creative_production` projection intents. |
| `src/produce-tool.ts`, `src/produce-settings.ts` | `creative_produce_run`, `creative_produce_status` and the credential-reference profile. |
| `src/workspace-route.ts` | Session-scoped `/creative` HTTP API for creative files, media, video preflight, game preview and job stop. |
| `src/native-hooks.ts` | Tool waterfall guards for long-form prose invariants. |
| `src/client/index.ts` | Browser plugin entry; `workbench.tsx` owns the workbench UI and registration. |
| `knowledge/` | Bundled Skills, Roles and scripts: `story/`, `drama/`, `novel-to-game/`, `video-recap/` and the shared `creative/roles/`. |

Creative registers the `creative` page type and its `sidebar.right.pane.tab` body. The [right Sidebar](../../../upstream/packages/client/ui-sidebar-right/README.md) owns layout and carries file navigation through its parameters and revision. The `creative.workbench.v2` store keeps editor buffers, conflicts, selections and production drafts, while in-flight save locks live in the Session's nonpersistent inject face; [editor reconciliation](src/client/editor-buffer.ts) ties content reads to observed file versions ([decision](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md#workspace-and-sidebar)).

Host and Client share [project-path.ts](src/project-path.ts) for project roots, relative paths, domains and file roles, so episodes and shots are addressed by full project paths. Host reads and writes enforce extension allowlists and resolved containment, including symlink targets. Media belongs to the Session's filesystem provider, and direct Host streaming requires that provider to map the Host paths to the same files ([ownership](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md#project-and-file-ownership)).

Production cards persist request drafts, not execution state. The task board takes queued preparations from the Session's `inbox` projection, durable results and job bindings from the Conversation projection, running state from the Session's DSH job rows, and live file activity from formal Chat nodes. Stopping goes through `/creative/job/stop`, which checks the Session owner and exact job reference before `jobs.kill` ([production requests](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md#production-requests-and-jobs)).

</details>

---

<a id="further-exploration"></a>
## Further Exploration

- [Creative group map](../README.md) — package family overview.
- [Creative subsystem](../../../docs/subsystems/creative.md) — the four seams and their trust boundaries.
- [Creative workbench decision](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md) — rationale, alternatives and verification.
- [DeepSeek Harness Architecture](../../../upstream/docs/architecture.md) — composition and extension points.

---

<a id="model-experience"></a>
## Model Experience

### Creative skills and roles

#### What the model sees

Skills are discovered through `ctx.skills` and loaded with `skill`. The [four providers](src/skill-provider.ts) read descriptions and complete bodies from `SKILL.md` and prepend shared invocation and domain integration instructions: workflow names, including `$name` and `/name` references, identify Skills; `creative_role` delegates only the seven bundled novel specialists; a delegated stage uses `subagent` with a self-contained task that loads the named Skill. Roles read packaged references through `creative_bundled_reference` ([decision](../../../.agents/notes/implemented/feature/2026-09-03-creative-workbench.md#composition-and-knowledge)).

#### Token effect

Discovery supplies concise descriptions; all 37 entries fit the default catalog limit of 500 characters. A `skill` load adds that body as a tool result without replacing the catalog message or preloading other bodies; `creative_role` adds the selected Role persona in a child turn.

#### KV Cache effect

No direct prompt effect from this package alone. The `skill` catalog message and tool results are durable context; subagent delegation via `creative_role` adds a nested turn whose KV entries are scoped to that child.

### Production projection tool

#### What the model sees

`creative_production` exposes four projection intents (`open_section`, `focus_target`, `set_sequence`, `track_job`) with validated full-project `episode` paths and `targetId` fields. `track_job` requires an existing job owned by the current Session and a production request identity; episode composition runs through the confirmed `episode-compose` adapter in the background. `creative_produce_run` accepts optional production context only in explicit background mode and returns its actual job binding. Foreground results retain `exitCode`, `timedOut`, termination `signal` and bounded stdout/stderr, and nonzero or unknown exit codes count as failed. A generic command's `completed` state means only that its process ended. Neither tool's production context authorizes paid media generation.

#### Token effect

A successful production result adds compact request, target and job-reference JSON to tool history; other intents move the Browser workbench focus without adding document content to the model context.

#### KV Cache effect

Projection intents are tool calls whose results carry the confirmation message; they do not add persistent context beyond the Session's tool history.

### Production credential status

#### What the model sees

`creative_produce_status` reports credential presence for the drama adapters, including `agnes-image` and `agnes-video`, the MiMo and Fish video providers and Zhuque detection. It uses the execution profile's credential lookup, returns no keys and launches no process. Ordinary shell environment checks cannot inspect the managed credential store; missing keys belong in the Creative production settings, not chat.

#### Token effect

Each invocation adds one small JSON status result. The tool makes no model or media-provider request.

#### KV Cache effect

Status follows normal logged tool history. Each new check resolves current credentials without changing earlier messages; presence does not prove provider connectivity or authorize production.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Operational failure text stays zh-Hans** — workbench chrome renders through the `creative` locale namespace, while server error bodies, runtime diagnostics and thrown errors remain zh-Hans until the workspace route ships stable error codes.
- **Knowledge is bundled** — the `knowledge/` tree increases clone and package size; on-demand fetching is not implemented.
- **Browser automation uses external binaries** — `browser-cdp` needs compatible `agent-browser` and Lightpanda binaries in the execution environment; neither is bundled, Chrome profiles are not reused, while game QA separately requires Chrome and Node 22+ for screenshots and interaction evidence.
- **Jobs are process-local** — after a Host restart, bindings without a matching live job show as unavailable and never restart. Historical `track_job` records without real bindings remain requests, not execution evidence.
- **Preview runtimes follow tab mounting** — leaving Creative can unmount game and video previews; returning restores editor state and reloads previews, not their in-memory runtime.
- **Remote execution needs mounted resources** — provider-backed media reads accept at most 256 MiB per file, and a remote shell needs the packaged scripts mounted or copied into its own filesystem.
- **Video production is less guarded than drama** — video entries rely on Skill-enforced creator confirmation instead of the drama runner's single-use receipt and ledger, rotate keys only between calls, and expose full recap, voiceover and diagnostics and explicit short-drama media review. Local drafts need ffmpeg; local transcription and speech need installed engines or an explicit transcript waiver and timing stand-in.
- **Accepted drama submissions are never retried** — key rotation happens only after an initial-submission rejection marked `submission_rejected`; polling, download and uncertain failures end the run.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
