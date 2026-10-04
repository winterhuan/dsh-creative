---
description: "Creative production plugin for fiction, short-drama, interactive-game, and video-recap workbenches."
kind: "package-bundle"
---

# @winterhuan/dsh-creative

English | [中文](README.zh.md)

## Summary

Creative installs the fiction, short-drama, game and video-recap workbenches together and retains legacy production tools and HTTP APIs. The four domain plugins provide the sidebar pages; Creative has no aggregate page or browser entry.

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

`dsh plugin add` installs this bundle into a profile; its [profile patch](cordis.patch.yml) mounts `story`, `short-drama`, `novel-to-game`, `video-recap`, `creative`, the `creative-produce` settings namespace and the settings page. The bundle composes four Skill providers (`story`, `short-drama`, `novel-to-game`, `video-recap`), packaged specialist instructions and the production tools. These need only the skill and tool registries; the Session-scoped `/creative` API registers when `webServer` and `typert` are also available.

```yaml
- id: creative
  name: '@winterhuan/dsh-creative'
```

| Field | Default | Meaning |
|---|---|---|
| `editorMaxBytes` | `2097152` | Maximum editable text file size for the workbench editor (bytes). |
| `trustedHosts` | `[]` | Additional `host[:port]` authorities allowed to reach the workbench API beyond loopback. |
| `produce` | `{}` | Initial production profile and credential references; the `creative-produce` settings namespace supplies user overrides. |

### Open the workbenches

Select the project workspace in a Session, then open Fiction, Short-drama, Game or Video-recap from the right sidebar. Each page has independent state. Saved project files remain directly usable; unsaved drafts from the retired aggregate page are not migrated.

### Chapter review

Long-form chapters follow outline readiness, a compact scene plan and review of important issues before submission. Review returns ordinary findings with source references, not a mandatory certificate or model record. Chapter scripts retain current wordcount hashes, state revisions and atomic tracking writes; mechanical success does not establish literary quality. AI-pattern and Zhuque results remain advisory. Project punctuation defaults to preservation; `设定/写作检查.json` can select `normalize-narration`. See the [chapter workflow](../story/knowledge/story/skills/story-write/references/long/workflow-chapter.md).

### Deliver and verify

Short-drama production can compose confirmed clips, timed dialogue, music and subtitles with the `episode-compose` adapter. The workbench checks one coherent episode revision and associates published media through hashed production manifests. Unsaved or invalid episode documents block preparation.

Game templates include state, save/load, restart and QA hooks. The game plugin’s `game_qa` tool (also available as the legacy `game-qa` entry) runs real Chrome with Studio preview restrictions; the preview shows the authenticated result. Strategy and independent blind-play reports remain design feedback. Without a game project, the game workbench shows its empty state.

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

The [bundle patch](cordis.patch.yml) composes four domain packages and the existing production settings page. Domain packages own Skills, resources and browser entries. Creative's [Host entry](src/index.ts) registers legacy production tools and the `/creative` compatibility API; it builds no browser bundle and owns no combined page state.

Stable domain row IDs prevent duplicate registration alongside individual installs. Domain packages own editor and production views; existing on-disk projects need no migration.

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

Skills are discovered through `ctx.skills` and loaded with `skill`. The [four providers](src/skill-provider.ts) supply task instructions and native resource hints. Independent specialists use ordinary DSH delegation or opt-in Team tools and read the selected Role file inside the actual child; see [specialist Agents](../story/README.md#specialist-agents). Creative adds no Role executor, tool aliases or model-selection layer.

#### Token effect

Discovery supplies concise descriptions; all 17 Skill entries fit the default catalog limit of 500 characters. Skill loads and native reads add only the requested instructions to the consuming Agent’s context.

#### KV Cache effect

Native Skill, read and delegation records remain in DSH Session history. Creative does not rewrite prior messages or maintain a separate specialist conversation.

### Production projection tool

#### What the model sees

`creative_production` exposes four projection intents (`open_section`, `focus_target`, `set_sequence`, `track_job`) with validated full-project `episode` paths and `targetId` fields. `track_job` requires an existing job owned by the current Session and a production request identity; episode composition runs through the confirmed `episode-compose` adapter in the background. `creative_produce_run` accepts optional production context only in explicit background mode and returns its actual job binding. Foreground results retain `exitCode`, `timedOut`, termination `signal` and bounded stdout/stderr, and nonzero or unknown exit codes count as failed. A generic command's `completed` state means only that its process ended. Neither tool's production context authorizes paid media generation.

#### Token effect

A successful production result adds compact request, target and job-reference JSON to tool history; other intents move the Browser workbench focus without adding document content to the model context.

#### KV Cache effect

Projection intents are tool calls whose results carry the confirmation message; they do not add persistent context beyond the Session's tool history.

### Production credential status

#### What the model sees

`creative_produce_status` reports credential presence for the drama adapters, including `agnes-image` and `agnes-video`, and the MiMo and Fish video providers. It uses the execution profile's credential lookup, returns no keys and launches no process. Ordinary shell environment checks cannot inspect the managed credential store; missing keys belong in the Creative production settings, not chat. Zhuque detection uses `story_zhuque` and the story settings page.

#### Token effect

Each invocation adds one small JSON status result. The tool makes no model or media-provider request.

#### KV Cache effect

Status follows normal logged tool history. Each new check resolves current credentials without changing earlier messages; presence does not prove provider connectivity or authorize production.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Operational failures use zh-Hans** — each workbench owns its locale namespace; Host diagnostics remain Chinese.
- **Knowledge is bundled** — the `knowledge/` tree increases clone and package size; on-demand fetching is not implemented.
- **Browser automation uses external binaries** — The story browser reference needs compatible `agent-browser` and Lightpanda binaries in the execution environment; neither is bundled, Chrome profiles are not reused, while game QA separately requires Chrome and Node 22+ for screenshots and interaction evidence.
- **Jobs are process-local** — after a Host restart, bindings without a matching live job show as unavailable and never restart. Historical `track_job` records without real bindings remain requests, not execution evidence.
- **Preview runtimes follow their domain tabs** — reopening a game or video page rebuilds its preview instead of restoring in-memory execution state.
- **Remote execution needs mounted resources** — provider-backed media reads accept at most 256 MiB per file, and a remote shell needs the packaged scripts mounted or copied into its own filesystem.
- **Video production is less guarded than drama** — video entries rely on Skill-enforced creator confirmation instead of the drama runner's single-use receipt and ledger, rotate keys only between calls, and expose full recap, voiceover and diagnostics and explicit short-drama media review. Local drafts need ffmpeg; local transcription and speech need installed engines or an explicit transcript waiver and timing stand-in.
- **Accepted drama submissions are never retried** — key rotation happens only after an initial-submission rejection marked `submission_rejected`; polling, download and uncertain failures end the run.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
