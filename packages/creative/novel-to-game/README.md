---
description: "Adapt novels into playable browser games with a dedicated workspace and authenticated QA."
kind: "package-bundle"
---

# @winterhuan/dsh-novel-to-game

English | [中文](README.zh.md)

## Summary

Turn a novel into a playable browser game with four task-oriented Skills, Chrome QA and a dedicated Game Studio sidebar. Install this bundle independently. The plugin uses the current DSH Session, workspace and permissions; Chrome and Python are required for QA.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

In a new or blank conversation, select **游戏创作** (Game creation) from the native mode menu, then open its workbench in the right sidebar. The workbench and domain Skills/tools are available only in this mode. Existing conversations retain their selected mode; start a new conversation in this mode to continue existing project files. Session state and project files are not migrated. Global settings remain available.

After building this repository, install the local bundle into a web profile:

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/novel-to-game
```

Open **Game Studio** in the right sidebar. Start with `/novel-to-game quick`; projects live under `game-adaptations/<project>/`, with a browser entry at `build/app/index.html`. `game_qa` accepts that relative project root as `project` and runs in the current Session workspace. Background runs return a DSH job ID for `job_output` and `job_kill`.

| Request | Skill |
|---|---|
| Novel intake, source evidence or adaptation orchestration | `novel-to-game` |
| Gameplay, systems, levels, narrative or visual direction | `game-design` |
| Implement a design or test a specific risk with a whitebox | `game-build` |
| Independently verify the actual browser build | `game-qa` |

The bundle mounts the `novel-to-game` Host row and the `preset-novel-to-game` mode row. Its optional `editorMaxBytes` defaults to 2097152; `trustedHosts` defaults to an empty list and extends the loopback-only API authority list. It does not install story, drama or video tools.

<a id="understand-the-implementation"></a>
## Understand the implementation

Ownership and trust boundaries: [Novel to game subsystem](../../../docs/subsystems/novel-to-game.md).

From the repository root, run `pnpm --filter @winterhuan/dsh-novel-to-game build` to build this package and `pnpm --filter @winterhuan/dsh-novel-to-game test` to test it.

The Host entry owns workspace routes and configuration. The `./agent` export registers domain Skills and tools inside the `novel-to-game` preset and inherited native child compositions. The preset supplies a task-specific persona and explicit native tools; it does not change the default mode.

<details>
<summary>Implementation internals — click to expand</summary>

The [profile patch](cordis.patch.yml) loads the [host plugin](src/index.ts). The scoped Agent entry owns Skill resources and `game_qa`; the host owns `/novel-to-game/workspace`, `/novel-to-game/file` and isolated preview routes. QA runs through DSH shell and jobs, without production credentials. Preview evidence is signed by the current host process and checked against current build and evidence bytes.

The [browser entry](src/client/index.ts) registers a game-only sidebar with independent Session state. Source export, lineage and index helpers ship in `knowledge/source-tools`; tests compare these copies with their maintained sources.

</details>

<a id="further-exploration"></a>
## Further Exploration

- [Four-plugin proposal](../../../.agents/notes/implemented/architecture/2026-09-30-creative-four-domain-plugins.md)

<a id="model-experience"></a>
## Model Experience

### Skills and QA

#### What the model sees

The selected mode adds a domain persona and native tool schemas. Its stable persona is recorded in the [prompt snapshot](../../../tests/fixtures/novel-to-game-persona.txt); domain capabilities are absent from Standard and sibling modes. The prefix and schemas add context before on-demand Skill loading, and native compaction manages accumulated history. Four Skill descriptions appear in the DSH catalog. Loading a Skill supplies its packaged instructions and native DSH resource directory for reading task references, plus local helper paths. `game_qa` exposes a project path, optional background execution and timeout; it returns process output or a job ID. Loaded Skills use foreground delegation for prerequisite stages and require the child’s terminal result plus artifact checks before advancing. A failed delegation reports its diagnostic and preserves partial work; DSH provider authentication and endpoint failures require provider configuration repair.

#### Token effect

Skill bodies load on demand. QA output becomes an ordinary tool result; browser preview content does not enter the prompt automatically.

#### KV Cache effect

The plugin uses normal DSH Skill and tool history. It does not rewrite earlier messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- QA requires local Chrome, Node 22+ and Python 3.9+. The preview supports browser builds; native executables need a separate delivery path. A PASS authenticates execution checks, not subjective playability. Host restarts invalidate prior process signatures. This package does not generate paid assets or grant rights to source novels.

<a id="dev-note"></a>
### Dev Note

All four domain plugins are developed, built, tested and installed independently.
