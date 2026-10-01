---
description: "Fiction workbench with independently installed skills, tools and browser UI."
kind: "package-bundle"
---

# @winterhuan/dsh-story

English | [中文](README.zh.md)

## Summary

Write and review fiction with six Skills, seven specialist Roles and a dedicated editor. Drafts remain in the current DSH Session, and saves use observed file versions. Install this bundle on its own or through Creative.

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
dsh plugin --profile smoke add /Users/winter/dsh-creative/packages/creative/story
```

Open **Fiction workbench** from the right sidebar. The plugin uses the current DSH Session, filesystem, model and permissions. Production settings remain in the existing Creative production settings page; secrets stay in the DSH credential store.

The fiction workbench treats the current Session directory as the project root. It lists that directory’s direct `正文/`, `大纲/`, `设定/` and other standard roots, plus standalone story documents. Opening their parent directory does not discover child projects; open the novel directory itself. Nested volumes inside a recognized root remain visible.

The six entries are `story` (project setup, existing novels, research and preferences), `story-write` (long and short fiction), `story-analyze` (analysis), `story-review` (review), `story-polish` (local editing and explicitly requested Zhuque detection) and `story-cover` (covers). Existing projects continue directly; raw-text intake does not require full-book analysis.

<a id="specialist-agents"></a>
### Specialist Agents

Use the visible native `subagent` tool for independent specialists. Its task names the professional identity, absolute Role file and resource root; the actual child reads those instructions with native `read`. When the user explicitly requests Agent Teams, use `spawn_teammate` and reuse the member through `send_message`. See the [delegation guide](knowledge/story/references/project/delegation.md). Roles are not separate tools or Skills; reading one in the caller does not create an independent reviewer.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) mounts the domain row, the `creative-produce` configuration row and its existing settings page. Repeated configuration row IDs resolve through DSH Loader composition. `editorMaxBytes` defaults to 2097152; `trustedHosts` extends the default loopback authority list. The `/story` API limits document access to this domain's project paths.

The writing guards and specialist Roles belong to this package. Explicitly requested Zhuque detection sends the selected chapter to Tencent EdgeOne Makers; it receives only the configured MAKERS_API_KEY.

The package has no dependency on the Creative aggregate or another domain plugin. Required helper scripts ship as package resources. The [aggregate](../creative/README.md) preserves legacy tool names and routes without a separate browser page.

The six Skills share the packaged `knowledge/story` resource base. DSH supplies resource hints, and Skills and Roles read references on demand with native `read`; scripts live in that directory’s `scripts/` folder.

</details>

<a id="model-experience"></a>
## Model Experience

### Domain skills and execution

#### What the model sees

The domain catalog exposes only its own Skill descriptions. Loading a Skill supplies its full instructions and packaged helper paths. `story_zhuque` runs a pinned domain script; background execution returns a DSH job ID for `job_output` and `job_kill`. Loaded Skills use foreground delegation for prerequisite stages and require the child’s terminal result plus artifact checks before advancing. A failed delegation reports its diagnostic and preserves partial work; DSH provider authentication and endpoint failures require provider configuration repair.

#### Token effect

Skill bodies and specialist instructions load on demand. Delegation reads only the selected Role and needed references; no custom Role tool schema or complete expert library enters the initial catalog.

#### KV Cache effect

The plugin uses DSH tool and Skill history. It does not rewrite previous messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Native Team tools require an explicitly enabled Team composition and persistent Sessions. Specialist instructions enter task context, not a plugin-owned system persona. Review returns ordinary findings; chapter scripts validate mechanical conditions, not literary approval or reviewer model metadata.
- Python scripts require Python 3.9+; chapter checks also require Node. Paid services require creator authorization and configured credentials. Independent sidebars own their state; old aggregate drafts are not migrated.

<a id="dev-note"></a>
### Dev Note

No separate common runtime package is introduced.
