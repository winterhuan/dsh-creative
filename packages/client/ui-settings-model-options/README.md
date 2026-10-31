---
description: "Batch-enable custom model thinking and image input, and configure provider retry limits, from the DSH Models page."
kind: "package-bundle"
---

# @winterhuan/dsh-client-ui-settings-model-options

English | [中文](README.zh.md)

## Summary

Batch-enable the thinking and image capabilities a custom model supports, plus the number of retries after a failed request. This optional bundle adds controls to each saved provider in the Models settings page. Conversation-level thinking selection remains in the chat model picker. Retry limits apply to every model from the same provider.

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

Build this repository, then install the local bundle into an existing DSH web profile. Replace `model-options` with your profile name. DSH dependencies are pinned to `0.2.1-rc.5`; the bundle is independently installable and is not included by Creative.

```sh
dsh plugin --profile model-options add /Users/winter/dsh-creative/packages/client/ui-settings-model-options
```

Restart DSH after installing the bundle and refresh the browser. Open Settings → Models → a saved provider → Capabilities and retries. A new hand-declared provider must be saved before these controls appear.

### Thinking capability

Thinking capability is a batch operation: in the provider card, choose the capability to apply (standard levels, not supported, or restore inherited), choose Apply thinking capability to models, search and select targets within the same provider, review the preview, and apply. Applying replaces only the selected models' thinking drafts; Save persists them together with image and retry edits.

Standard levels writes Off (an empty value omits the parameter), Low, Medium, and High, with request values equal to the level names — the combination common OpenAI-compatible endpoints accept and the same initial set the native model list offers. Not supported writes `false`; restore inherited removes the field so the installed catalog or the provider default decides the capability. Per-level selection and custom parameter values are edited per model in the native model list; the batch does not configure them.

### Image input

Image input is a batch operation: in the provider card, choose the image capability to apply (text only, text and images, or, on pi-ai providers, restore inherited), choose Apply image input to models, search and select targets within the same provider, review the preview, and apply. Applying replaces only the selected models' image-input drafts; Save persists them together with thinking and retry edits.

The pi-ai family writes a model entry's `input` or a catalog override's `input`; restoring inheritance removes the field so the installed catalog or the provider default decides the input types. The deepseek family writes a model entry's `inputModalities`; choosing text only also removes that model's `imagePixelBudget` and `imageMaxBytes`, because the adapter refuses image request limits on a model that does not accept images. The batch declares capability only; it does not detect whether the endpoint accepts images.

### Retry limit

Enter the maximum number of additional attempts after the first request: `0` disables retries and `3` allows at most four attempts under this policy. The default is five retries. A stored unlimited policy remains intact until a number is entered or the inherited limit is restored. Restoring the limit restores the inherited policy mode and count, preserving retry error codes and backoff settings.

Enable **Retry invalid requests (HTTP 400/413)** to include failures the adapter classifies as `INVALID_REQUEST`. The option is off by default and uses the same retry limit; `0` still disables retries. Requests are sent again unchanged, so incompatible parameters can fail again. An unlimited policy already retries these errors; enter a finite limit before adjusting the option.

Enable **Retry authentication errors (AUTH)** to include failures the adapter classifies as `AUTH`. The option is off by default and uses the same retry limit. Enable it only when the provider can recover; invalid credentials and exhausted quota will keep failing and can repeat provider requests.

Enable **Retry quota errors (QUOTA)** to include quota failures classified as `QUOTA`. The option is off by default and uses the same retry limit; `0` still disables retries. Requests are sent again unchanged and do not add quota. Use this when the provider can recover between attempts.

Enable **Retry unclassified errors (PI_AI_ERROR)** to include failures the pi-ai adapter cannot classify, such as a transient gateway message without a status code. The option appears only on pi-ai providers, is off by default, and uses the same retry limit; `0` still disables retries. Unclassified failures can be permanent, so requests may repeat without succeeding.

The provider policy is executed by DSH's `llm-retry` plugin, which the web profile includes. It retries eligible failed model steps and supports cancellation; raw LLM stream calls do not acquire retries from these controls. See the [retry executor](../../../upstream/packages/llm/llm-retry/README.md) for the execution rules.

### Save and recover

Edits remain drafts until Save. Switching models retains their drafts; leaving or collapsing the editor discards them. A refused save retains the draft and reports the failure. If settings change elsewhere, discard the draft and edit the refreshed values before saving again. Read-only settings disable edits.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Ownership and trust boundaries: [Model options subsystem](../../../docs/subsystems/model-options.md).

<details>
<summary>Implementation internals — click to expand</summary>

The [bundle patch](cordis.patch.yml) installs one browser plugin. It registers in the existing `settings.models.provider-card` slot for `llm-pi-ai` and `llm-deepseek`; only the pi-ai family exposes model thinking metadata. The [browser entry](src/client/index.ts) binds the shared settings mirror, native model catalog, and an application-wide save toast. The Host entry registers no settings namespace or request executor.

[Draft operations](src/client/options.ts) address custom models through their existing array entries and built-in models through `modelOverrides`. Each save carries the revision captured on the first edit or when opening a batch preview, and changes only the selected fields. Image input writes the adapter-owned field (pi-ai `input`, deepseek `inputModalities`), and deepseek drops its image limits when a model becomes text-only. No catalog is copied to change a built-in model, and credentials and retry backoff are preserved. The error-class options add or remove only their respective classes from the existing policy; the unclassified-error option appears only on pi-ai providers. Omitted classes use the pinned DSH defaults; if removing the optional classes would leave an empty list, the UI restores the default transient error classes. The adapters validate saved settings and publish their live capabilities to the existing chat selector.

Tests cover field edits, image batches, runtime capability reporting, retry-default parity, error-class preservation, read-only controls, retained drafts, revision conflicts, and slot disposal.

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

The UI adds no prompt or tool. The provider adapter sends the effort selected in chat using the `reasoningEfforts` mapping; the image declaration decides whether the model can receive image attachments; the retry executor reissues eligible failed steps.

#### Token effect

The controls add no prompt tokens. Thinking may consume reasoning tokens, attached images count as input tokens, and each retry can repeat input-token billing under the provider's policy.

#### KV Cache effect

The controls do not edit conversation history. Cache reuse for effort changes and repeated requests depends on the provider.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Thinking and image both have batch entries only, fixed to the standard level set and values; per-level selection and custom parameter values are edited per model in the native model list.
- A batch target summary shows each model's current capability (localized level names), not the raw parameter values.
- An inherited image capability is not readable from the model catalog; catalog models show only their override, and after restoring inheritance the UI cannot tell which input types the catalog declares.
- Per-model default effort and per-model retry policies are not exposed by the pinned runtime. The extension cannot edit an unsaved provider or infer thinking support from model discovery. Third-party adapter families need their own provider-card registration. Protocol compatibility settings remain in the provider configuration.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
