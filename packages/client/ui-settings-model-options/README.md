---
description: "Configure custom model thinking levels and provider retry limits from the DSH Models page."
kind: "package-bundle"
---

# @winterhuan/dsh-client-ui-settings-model-options

English | [中文](README.zh.md)

## Summary

Configure the thinking levels a custom model supports and the number of retries after a failed request. This optional bundle adds controls to each saved provider in the Models settings page. Conversation-level thinking selection remains in the chat model picker. Retry limits apply to every model from the same provider.

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

### Install

Build this repository, then install the local bundle into an existing DSH web profile. Replace `model-options` with your profile name. DSH dependencies are pinned to `0.2.1-alpha.1`; the bundle is independently installable and is not included by Creative.

```sh
dsh plugin --profile model-options add /Users/winter/dsh-creative/packages/client/ui-settings-model-options
```

Restart DSH after installing the bundle and refresh the browser. Open Settings → Models → a saved provider → Thinking and retries. A new hand-declared provider must be saved before these controls appear.

### Thinking capability

Select a model, then inherit its configuration or catalog, declare that it does not support thinking, or choose its supported levels. Supported levels are Off, Minimal, Low, Medium, High, Extra high, and Maximum. A custom declaration must include at least one level other than Off; it does not imply that every provider accepts every level.

The model list summarizes each configuration and marks unsaved edits. To reuse a configuration, choose Apply to other models, search and select recipients within the same provider, and review the levels and request parameter values. Select all results affects only the current search results and retains selections outside the filter. Applying copies the exact configuration to the selected models' drafts; Save persists all edits together. Cancel keeps earlier drafts. Copying inheritance restores each recipient's own inherited configuration or catalog settings.

Request parameter values are editable in the expanded mapping. A blank Off value omits the parameter; `none` sends that literal value. Every other selected level needs a nonempty value accepted by the provider API. Capability declarations do not detect endpoint support or change the endpoint protocol. Choose the effort for the current conversation through the native chat model picker.

### Retry limit

Enter the maximum number of additional attempts after the first request: `0` disables retries and `3` allows at most four attempts under this policy. The default is five retries. A stored unlimited policy remains intact until a number is entered or the inherited limit is restored. Restoring the limit restores the inherited policy mode and count, preserving retry error codes and backoff settings.

Enable **Retry invalid requests (HTTP 400/413)** to include failures the adapter classifies as `INVALID_REQUEST`. The option is off by default and uses the same retry limit; `0` still disables retries. Requests are sent again unchanged, so incompatible parameters can fail again. An unlimited policy already retries these errors; enter a finite limit before adjusting the option.

Enable **Retry authentication errors (AUTH)** to include failures the adapter classifies as `AUTH`. The option is off by default and uses the same retry limit. Enable it only when the provider can recover; invalid credentials and exhausted quota will keep failing and can repeat provider requests.

Enable **Retry quota errors (QUOTA)** to include quota failures classified as `QUOTA`. The option is off by default and uses the same retry limit; `0` still disables retries. Requests are sent again unchanged and do not add quota. Use this when the provider can recover between attempts.

The provider policy is executed by DSH's `llm-retry` plugin, which the web profile includes. It retries eligible failed model steps and supports cancellation; raw LLM stream calls do not acquire retries from these controls. See the [retry executor](../../../upstream/packages/llm/llm-retry/README.md) for the execution rules.

### Save and recover

Edits remain drafts until Save. Switching models retains their drafts; leaving or collapsing the editor discards them. A refused save retains the draft and reports the failure. If settings change elsewhere, discard the draft and edit the refreshed values before saving again. Read-only settings disable edits.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [bundle patch](cordis.patch.yml) installs one browser plugin. It registers in the existing `settings.models.provider-card` slot for `llm-pi-ai` and `llm-deepseek`; only the pi-ai family exposes model thinking metadata. The [browser entry](src/client/index.ts) binds the shared settings mirror, native model catalog, and an application-wide save toast. The Host entry registers no settings namespace or request executor.

[Draft operations](src/client/options.ts) address custom models through their existing array entries and built-in models through `modelOverrides`. Each save carries the revision captured on the first edit or when opening a batch preview, and changes only the selected fields. No catalog is copied to change a built-in model, and credentials and retry backoff are preserved. The invalid-request, authentication, and quota options add or remove only their respective error classes from the existing policy. Omitted classes use the pinned DSH defaults; if removing the optional classes would leave an empty list, the UI restores the default transient error classes. The adapters validate saved settings and publish their live capabilities to the existing chat selector.

Tests cover field edits, runtime capability reporting, retry-default parity, error-class preservation, read-only controls, retained drafts, revision conflicts, and slot disposal.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Repository build and browser verification](../../../HANDOFF.md)
- [pi-ai adapter configuration](../../../upstream/packages/llm/llm-pi-ai/README.md)
- [Models page extension slots](../../../upstream/packages/client/ui-settings-models/src/client/slot-contract.ts)

-----

<a id="model-experience"></a>
## Model Experience

### Request settings

#### What the model sees

The UI adds no prompt or tool. The provider adapter sends the effort selected in chat using the `reasoningEfforts` mapping; the retry executor reissues eligible failed steps.

#### Token effect

The controls add no prompt tokens. Thinking may consume reasoning tokens, and each retry can repeat input-token billing under the provider's policy.

#### KV Cache effect

The controls do not edit conversation history. Cache reuse for effort changes and repeated requests depends on the provider.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Per-model default effort and per-model retry policies are not exposed by the pinned runtime. The extension cannot edit an unsaved provider or infer thinking support from model discovery. Third-party adapter families need their own provider-card registration. Protocol compatibility settings remain in the provider configuration.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
