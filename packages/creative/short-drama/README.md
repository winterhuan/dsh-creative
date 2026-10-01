---
description: "Short-drama workbench with independently installed skills, tools and browser UI."
kind: "package-bundle"
---

# @winterhuan/dsh-short-drama

English | [中文](README.zh.md)

## Summary

Develop short dramas with five Skills, an episode editor and a production board. Confirmed jobs produce media and composed episodes through DSH tools. Install this bundle on its own or through Creative.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Build the repository, then install the local bundle into a web profile:

```sh
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/short-drama
```

Open **Short-drama workbench** from the right sidebar. The plugin uses the current DSH Session, filesystem, model and permissions. Production settings remain in the existing Creative production settings page; secrets stay in the DSH credential store.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) mounts the domain row, the `creative-produce` configuration row and its existing settings page. Repeated configuration row IDs resolve through DSH Loader composition. `editorMaxBytes` defaults to 2097152; `trustedHosts` extends the default loopback authority list. The `/short-drama` API limits document and media access to this domain's project paths.

Production consumes a prepared job confirmation once. The package includes the video runtime scripts needed for composition and media review, without installing the video workflow plugin.

The package has no dependency on the Creative aggregate or another domain plugin. Required helper scripts ship as package resources. The [aggregate](../creative/README.md) preserves legacy tool names and routes without a separate browser page.

</details>

<a id="model-experience"></a>
## Model Experience

### Domain skills and execution

#### What the model sees

The domain catalog exposes only its own Skill descriptions. The five entries are `short-drama` (project, development and optional source analysis), `short-drama-write`, `short-drama-visual` (visual settings, image prompts, storyboard and video prompts), `short-drama-produce`, and `short-drama-review`. Loading an entry supplies task instructions and a shared native resource base at `knowledge/drama`; normal `read` loads only the needed references. Script and template directories remain package resources, not additional registered Skills. `drama_produce_run` runs a pinned domain script; background execution returns a DSH job ID for `job_output` and `job_kill`. Loaded Skills use foreground delegation for prerequisite stages and require the child’s terminal result plus artifact checks before advancing. A failed delegation reports its diagnostic and preserves partial work; DSH provider authentication and endpoint failures require provider configuration repair.

#### Token effect

Skill bodies load on demand. Execution adds ordinary tool results without loading unrelated domain catalogs.

#### KV Cache effect

The plugin uses DSH tool and Skill history. It does not rewrite previous messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Python scripts require Python 3.9+; media operations also require ffmpeg and ffprobe. Paid services require creator authorization and configured credentials. Independent sidebars own their state; old aggregate drafts are not migrated.

<a id="dev-note"></a>
### Dev Note

No separate common runtime package is introduced.
