---
description: "The story settings page on the dsh web client's Plugins page: the Zhuque detection key."
kind: "package-reference"
---

# @winterhuan/dsh-client-ui-settings-story

English | [中文](README.zh.md)

## Summary

Open **Plugins** in the sidebar and select **Story** to set the Zhuque detection key. The page stages what is typed and writes it only on save; the key is written through the credentials domain rather than the settings document, so its literal never rides a response. The page exists while the Host serves the `story` namespace.

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

The **API key** control starts blank on every load and reports only whether a key is configured; a blank draft keeps the stored key. **Manage keys in bulk** opens a dialog that stores a whole key pool as one write, one key per line. Nothing is written until **Save**; leaving the page drops the draft. A `MAKERS_API_KEY` in the startup environment takes precedence over the credentials file and makes the input and bulk management read-only; the page explains why. Remove that variable from the startup environment and restart to save a key on this page.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for. The browser half binds the `story` namespace through `ctx.configForms.get` and keeps the staged form in `StorySettingsCardController`. The key write goes to `remote.credentials.set` under the reference `makersApiKeyEnv` names (`MAKERS_API_KEY` when it names none). The page registers `StorySettingsCard` into the Plugins page's `plugins.item` slot through `ctx.configForms.whileServed`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-plugin-manager](../../../upstream/packages/client/ui-plugin-manager/README.md) — the Plugins page and the `plugins.item` slot the page registers into.
- [ui-settings](../../../upstream/packages/client/ui-settings/README.md) — the settings scope and the served-namespace watch the page rides.
- [story](../../creative/story/README.md) — the plugin that serves the `story` namespace and runs `story_zhuque`.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side settings surface that registers no model surface.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Namespace coverage** — the page edits the Zhuque credential reference on the story plugin. File-size and trusted-host fields of that namespace are not shown here.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
