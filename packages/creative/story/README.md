---
description: "Fiction workbench with independently installed skills, tools and browser UI."
kind: "package-bundle"
---

# @winterhuan/dsh-story

English | [中文](README.zh.md)

## Summary

Write and review fiction with six Skills, seven specialist Roles and a dedicated editor. Opt into a native workflow for outline preparation, writing, independent review and guarded chapter submission. Drafts remain in the current DSH Session, and saves use observed file versions. Install this bundle on its own or through Creative.

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

The fiction workbench discovers novels in the current Session directory and its immediate child directories. For example, opening `shenji/` lists `神机诸天录/正文/` and that novel’s other standard directories; opening `神机诸天录/` directly also works. Each novel’s files and edits keep their full paths. Discovery stops after one project-directory level, while volumes inside `正文/`, `大纲/`, `设定/` and other recognized directories remain recursive. Standalone story documents are supported at either project level.

The six entries are `story` (project setup, existing novels, research and preferences), `story-write` (long and short fiction), `story-analyze` (analysis), `story-review` (review), `story-polish` (local editing and explicitly requested Zhuque detection) and `story-cover` (covers). Existing projects continue directly; raw-text intake does not require full-book analysis.

<a id="specialist-agents"></a>
### Specialist Agents

Use the visible native `subagent` tool for independent specialists. Its task names the professional identity, absolute Role file and resource root; the actual child reads those instructions with native `read`. When the user explicitly requests Agent Teams, use `spawn_teammate` and reuse the member through `send_message`. See the [delegation guide](knowledge/story/references/project/delegation.md). Roles are not separate tools or Skills; reading one in the caller does not create an independent reviewer.

### Native chapter workflow

Ask `story-write` to use the native workflow for a new long-form chapter, or state that preference for future chapters. The parent supplies the project, chapter and constraints, then loads the template through the [invocation guide](knowledge/story/references/writing/long/native-workflow.md). Within DSH's existing `workflow` tool, Prepare checks or creates the chapter outline within the authorized plan and builds a scene plan. Writing, independent review, at most two revision passes and verified tracking submission follow. Existing ready outlines are reused; routine preparation needs no further approval unless requested. Missing facts or required author decisions stop dependent work. Continuous chapters run serially and retain drafts with unresolved findings.

Review returns a small routing recommendation within this workflow. Ordinary review stays prose. Submission checks the reviewed body and outline hashes plus the expected tracking revision; stale files require another check and review. No review certificate is added to tracking. Native run completion can contain a non-committed chapter outcome, so callers inspect the returned status before advancing.

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

The domain catalog exposes only its own Skill descriptions. Loading a Skill supplies its full instructions and packaged helper paths. `story_zhuque` runs a pinned domain script; background execution returns a DSH job ID for `job_output` and `job_kill`. Loaded Skills use foreground delegation for prerequisite stages and require the child’s terminal result plus artifact checks before advancing. Workflow stages receive explicit `structured_output` instructions. Prepare returns actual paths, a scene plan and checked outline identity; the writer receives these results and complete check commands. A missing structured result directs the parent to the failed child's Session. A failed delegation reports its diagnostic and preserves partial work; DSH provider authentication and endpoint failures require provider configuration repair.

#### Token effect

Skill bodies and specialist instructions load on demand. Delegation reads only the selected Role and needed references; no custom Role tool schema or complete expert library enters the initial catalog. The Skill catalog descriptions are unchanged by workflow support. Using `cl100k_base` as a static estimate, the writing and review Skill bodies add 152 and 84 tokens; the deferred template uses 3754 tokens and its guide 3243. Reading and submitting the template retains its source twice before tool framing. Independent children also read their instructions and sources, so this path can cost more than direct delegation; these figures are not provider billing or an end-to-end efficiency claim.

#### KV Cache effect

The plugin uses DSH tool and Skill history. It does not rewrite previous messages or maintain a separate model session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Native Team tools require an explicitly enabled Team composition and persistent Sessions. Specialist instructions enter task context, not a plugin-owned system persona. Review returns ordinary findings; chapter scripts validate mechanical conditions, not literary approval or reviewer model metadata.
- Python scripts require Python 3.9+; chapter checks also require Node. Paid services require creator authorization and configured credentials. Independent sidebars own their state; old aggregate drafts are not migrated.
- The native chapter template needs a DSH composition exposing `workflow` with structured child output. It handles new long-form chapters and their uncommitted drafts; committed-chapter revisions use the existing revision path. Template reuse and review-only duties follow instructions, not Host enforcement or a separate reviewer permission policy. Cancellation retains artifacts; recovery inspects real files and tracking rather than resuming an old script stack. File guards do not isolate arbitrary external writers.

<a id="dev-note"></a>
### Dev Note

No separate common runtime package is introduced.
