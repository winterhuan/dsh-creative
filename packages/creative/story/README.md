---
description: "Fiction workbench with independently installed skills, tools and browser UI."
kind: "package-bundle"
---

# @winterhuan/dsh-story

English | [中文](README.zh.md)

## Summary

Write and review fiction with fourteen Skills, seven specialist Roles and a dedicated editor. Drafts remain in the current DSH Session, and saves use observed file versions. Install this bundle on its own or through Creative.

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

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [patch](cordis.patch.yml) mounts the domain row, the `creative-produce` configuration row and its existing settings page. Repeated configuration row IDs resolve through DSH Loader composition. `editorMaxBytes` defaults to 2097152; `trustedHosts` extends the default loopback authority list. The `/story` API limits document access to this domain's project paths.

The writing guards and specialist Roles belong to this package. Zhuque detection sends the selected chapter to Tencent EdgeOne Makers; it receives only the configured MAKERS_API_KEY.

The package has no dependency on the Creative aggregate or another domain plugin. Required helper scripts ship as package resources. The [aggregate](../creative/README.md) preserves legacy tool names and routes without a separate browser page.

</details>

<a id="model-experience"></a>
## Model Experience

### Domain skills and execution

#### What the model sees

The domain catalog exposes only its own Skill descriptions. Loading a Skill supplies its full instructions and packaged helper paths. `story_zhuque` runs a pinned domain script; background execution returns a DSH job ID for `job_output` and `job_kill`. Loaded Skills use foreground delegation for prerequisite stages and require the child’s terminal result plus artifact checks before advancing. A failed delegation reports its diagnostic and preserves partial work; DSH provider authentication and endpoint failures require provider configuration repair.

#### Token effect

Skill bodies load on demand. Execution adds ordinary tool results without loading unrelated domain catalogs.

#### KV Cache effect

The plugin uses DSH tool and Skill history. It does not rewrite previous messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Python scripts require Python 3.9+; chapter checks also require Node. Paid services require creator authorization and configured credentials. Independent sidebars own their state; old aggregate drafts are not migrated.

<a id="dev-note"></a>
### Dev Note

No separate common runtime package is introduced.
