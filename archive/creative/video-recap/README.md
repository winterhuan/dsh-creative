---
description: "Video-recap workbench with independently installed skills, tools and browser UI."
kind: "package-bundle"
---

# @winterhuan/dsh-video-recap

English | [中文](README.zh.md)

## Summary

Create video recaps with two task-focused Skills, source previews and artifact inspection. The pipeline supports a labeled local draft and measured delivery evidence. Install this bundle independently.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

In a new or blank conversation, select **视频解说** (Video recap) from the native mode menu, then open its workbench in the right sidebar. The workbench and domain Skills/tools are available only in this mode. Existing conversations retain their selected mode; start a new conversation in this mode to continue existing project files. Session state and project files are not migrated. Global settings remain available.

Build the repository, then install the local bundle into a web profile:

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/video-recap
```

Use `/video-recap` for analysis, production, revisions and delivery, or `/video-script` for planning, writing and review without generation. Understanding, cutting, voiceover and assembly are internal procedures loaded as needed.

Open **Video-recap workbench** from the right sidebar. The plugin uses the current DSH Session, filesystem, model and permissions. Production settings remain in the existing Creative production settings page; secrets stay in the DSH credential store.

<a id="understand-the-implementation"></a>
## Understand the implementation

Ownership and trust boundaries: [Video recap subsystem](../../../docs/subsystems/video-recap.md).

From the repository root, run `pnpm --filter @winterhuan/dsh-video-recap build` to build this package and `pnpm --filter @winterhuan/dsh-video-recap test` to test it.

The Host entry owns workspace routes and configuration. The `./agent` export registers domain Skills and tools inside the `video-recap` preset and inherited native child compositions. The preset supplies a task-specific persona and explicit native tools; it does not change the default mode.

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) mounts the domain Host row, the `preset-video-recap` mode row, the `creative-produce` configuration row and its existing settings page. Repeated configuration row IDs resolve through DSH Loader composition. `editorMaxBytes` defaults to 2097152; `trustedHosts` extends the default loopback authority list. The `/video-recap` API limits document and media access to this domain's project paths.

The package owns video scripts and previews under video-recaps/. Speech production reads only MiMo and Fish credential references; keyless draft delivery remains available.

This package is developed, built and installed independently; required helper scripts ship as package resources without a dependency on another domain plugin.

</details>

<a id="model-experience"></a>
## Model Experience

### Domain skills and execution

#### What the model sees

The selected mode adds a domain persona and native tool schemas. Its stable persona is recorded in the [prompt snapshot](../../../tests/fixtures/video-recap-persona.txt); domain capabilities are absent from Standard and sibling modes. The prefix and schemas add context before on-demand Skill loading, and native compaction manages accumulated history. The catalog registers `video-recap` and `video-script` for both user and model invocation. Their shared resource base is `knowledge/video-recap`; native `read` loads the required references. Media scripts retain their packaged paths and are not separate registered Skills. `video_produce_run` runs a pinned domain script; background execution returns a DSH job ID for `job_output` and `job_kill`. Loaded Skills use foreground delegation for prerequisite stages and require the child’s terminal result plus artifact checks before advancing. A failed delegation reports its diagnostic and preserves partial work; DSH provider authentication and endpoint failures require provider configuration repair.

#### Token effect

Skill bodies load on demand. Execution adds ordinary tool results without loading unrelated domain catalogs.

#### KV Cache effect

The plugin uses DSH tool and Skill history. It does not rewrite previous messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The full pipeline has no isolated understanding-only entry for a project that already contains downstream inputs. Repeating it may continue into TTS or rendering; analysis scope must be resolved first.
- Python scripts require Python 3.9+; media operations also require ffmpeg and ffprobe. Paid services require creator authorization and configured credentials. Independent sidebars own their state; old aggregate drafts are not migrated.

<a id="dev-note"></a>
### Dev Note

No separate common runtime package is introduced.
