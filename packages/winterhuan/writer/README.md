---
description: "Add a writing preset that mounts oh-story skills and a Dashboard-aligned sidebar for libraries and writing projects."
kind: "package-bundle"
---

# @winterhuan/dsh-writer

English | [中文](README.zh.md)

## Summary

This bundle adds 写作模式 to a DSH profile. A new session can use the oh-story skills for serials, short stories, and revision, and the right sidebar browses libraries and writing projects with Dashboard-aligned navigation and editable text files. Skills are copied into the workspace `.agents/skills` directory by default, without replacing files that already exist. Set `skillMount` to `bundled` and restart to read the package `skills` directory instead. The sidebar does not embed or start the oh-story dashboard.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### Install into a profile

Build this repository, then add the local bundle to a DSH `0.2.1-rc.5` profile. Replace `web` with the profile name.

```sh
pnpm --filter @winterhuan/dsh-writer build
dsh plugin --profile web add packages/winterhuan/writer
```

Restart the profile after install or rebuild. The patch adds the `writer` host row and the `preset-writer` row. The preset id is `writer` and the menu name is 写作模式.

### Choose how skills are mounted

`skillMount` is `workspace` or `bundled`. The default is `workspace`. Only one mode is active.

In `workspace` mode the host does not set `bundledSkillDir`. The first time a session enters 写作模式, the host copies each packaged skill directory to `<project>/.agents/skills/<name>/`, where the project is the nearest ancestor containing `.git`, or the session directory when there is none. A directory that already exists is left unchanged. Skill discovery uses the normal project root `.agents/skills`. Run `/writer-sync-skills` in that session to replace those directories with the packaged copies.

In `bundled` mode the host does not copy skills. The preset's skill-filesystem row sets `bundledSkillDir` to the absolute `skills` directory of this package, resolved with `createRequire(baseUrl).resolve('@winterhuan/dsh-writer/package.json')`. That root is trusted by skill-filesystem. The workspace row of skill-filesystem is disabled, so the two rows do not load together. Restart after changing `skillMount`, because the preset reads the mode when it mounts.

```yaml
- id: writer
  name: '@winterhuan/dsh-writer'
  config:
    skillMount: bundled
```

`makersApiKeyEnv` names the environment variable for an explicit Zhuque check. The default is `MAKERS_API_KEY`. `gptImageApiKeyEnv` names the variable for cover image generation. The default is `GPT_IMAGE_API_KEY`. The host stores the names only and mirrors them to `WRITER_ZHUQUE_KEY_ENV` / `WRITER_COVER_KEY_ENV`. The Plugins page shows a Writing entry while this Host row is installed: bind secrets through DSH credentials (never into the settings document). `story-zhuque` and `story-cover` (API path) read those variables and do not run unless the author asks.

### Scan, analyze, and cover skills

These packaged skills are author-triggered. They do not block chapter writing.

| Skill | Triggers | Notes |
|:------|:---------|:------|
| `story-long-scan` | `/story-long-scan` | Long-form ranking scan. May need `agent-browser` / `browser-cdp` for live boards. |
| `story-short-scan` | `/story-short-scan` | Short-form ranking scan. Same browser note. |
| `story-long-analyze` | `/story-long-analyze` | Long-form teardown. Needs Python 3 for scripts. |
| `story-short-analyze` | `/story-short-analyze` | Short-form teardown. Needs Python 3. |
| `story-cover` | `/story-cover` | Prompt-only needs no key. Generating an image on DSH uses the GPT Image credential above. Codex hosts may still use `$imagegen`. |
| `browser-cdp` | `/browser-cdp` | Optional helper when a scan needs a live browser session. |

### Use the sidebar

Open 写作模式, then open 写作 from the right sidebar. The left rail follows Dashboard information architecture (equal tabs → filename search → tree → footnote); skin stays on DSH tokens. Libraries / Projects tabs (with counts), lazy real directory tree (~200-entry pages, roots open by default), dirty-switch confirm, and editable extensions `.md` / `.txt` / `.json` / `.yaml` / `.yml` / `.toml`. Filename search (debounced, scoped to the active tab, Dashboard result/node/depth caps) with Esc to clear; ⌘/Ctrl+K focuses search when the chat composer is not focused; ⌘/Ctrl+S saves. Edit ↔ Markdown preview, dirty badge (unsaved / saved / saving), editor status bar (line·column, character count, EOL), and EOL preserved on save. The stage masthead shows the workspace short name, library/project counts, and listing health (ready / partial / failed) with an explicit retry when a scan fails; the rail footnote mirrors that health. A save sends the version from the last read. If the file changed on disk, the save is refused until you load the disk copy. Lists, reads, and search walks use the session `workspaceFiles` remote; the sidebar does **not** start a local dashboard-server. Delete, view-state persistence (localStorage), and line-number gutter are not wired yet (P3d polish covers status/health/a11y only).

On DSH, `story-setup` treats the host as `dsh` and does not deploy Claude Code `.claude/hooks` or Codex `.codex/hooks.json`. Other hosts still follow their own deploy files when you ask for them.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The patch in [cordis.patch.yml](cordis.patch.yml) inserts the host and the preset. The preset carries persona, instructions, time, shell, filesystem, search, jobs, skills, compaction, delegation, ask-user, todo, and web. It does not load an `agent` entry or a skill provider. [src/index.ts](src/index.ts) copies skills, registers `/writer-sync-skills`, and mounts `PUT /writer/file`. [src/client/sidebar.tsx](src/client/sidebar.tsx) registers the sidebar tab and its body slot, and shows them only when the session preset is `writer`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Writing subsystem](../../../docs/subsystems/writer.md)
- [Right sidebar](../../../upstream/docs/subsystems/sidebar-right.zh.md)
- [Skill filesystem](../../../upstream/packages/skill/skill-filesystem/README.zh.md)

-----

<a id="model-experience"></a>
## Model Experience

### Writing preset

#### What the model sees

A session on preset `writer` receives the preset persona and the oh-story skill catalog, including `story`, `story-long-write`, `story-short-write`, `story-deslop`, `story-zhuque`, scan/analyze/cover skills, and `browser-cdp`. The persona tells the model to load the matching skill, to skip Claude Code and Codex hooks during `story-setup` on DSH, and not to start the oh-story dashboard. `story-zhuque` is for an explicit Zhuque request. The sidebar save is not a model tool.

#### Token effect

The persona prefix is sent on every turn of a writing session. Loading a skill adds that skill's instructions for that turn. Sessions on another preset do not receive this persona or the forced skill copy.

#### KV Cache effect

The persona is stable for the life of the preset revision. Copying skills into `.agents/skills` can change the skill catalog on a later turn after the first entry into 写作模式. A forced `/writer-sync-skills` can change skill text the same way. Switching `skillMount` applies only after restart, so it does not rewrite an in-flight prompt.

## Known Limitations and Deferred Work

- The sidebar mirrors Dashboard library/project discovery, editable extensions, filename search, preview, editor-shell basics, and P3d masthead/health polish, without starting a local dashboard-server or adopting the zs theme. Delete, view-state localStorage persistence, and line-number gutter are still deferred. It does not create a book, run chapter guards, or list files through a private read API. `workspace` mode will not replace an existing skill directory until `/writer-sync-skills`. A project copy still outranks a bundled skill if both are present after an earlier copy. Zhuque runs only when `story-zhuque` is invoked and the named environment variable is set. Cover image generation needs `GPT_IMAGE_API_KEY` (or the configured name) only when the author asks for an image; prompt-only delivery does not. This environment did not install the bundle into a live DSH profile.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Packaged skills come from the latest `zenstory-ai/oh-story-claudecode` tree at vendoring time, plus `story-zhuque` in this package. The oh-story license is `skills/LICENSE.oh-story`.

</details>
