---
description: "Model settings subsystem: thinking and image capability batches, provider retry policy and revision-protected edits."
---

# Model options

English | [中文](model-options.zh.md)

## Summary

Batch-enable model thinking and image capabilities and edit provider retry choices from the existing Models settings page. Batch operations prepare model drafts for one save. The controls configure DSH adapters and retry execution; they do not implement a separate model runtime.

## Table of Contents

- [Package and integration](#ownership)
- [Drafts and save boundaries](#edits)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Package and integration

The [model-options bundle](../../packages/client/ui-settings-model-options/README.md) installs independently and registers provider-card controls for `llm-pi-ai` and `llm-deepseek`; thinking metadata is exposed for the pi-ai family, and image input writes the adapter-owned field. It uses the existing settings mirror and model catalog. The Host entry adds no settings namespace, model tool or request executor.

The adapter maps the effort selected in chat to provider request values. DSH’s retry plugin executes the configured policy and owns cancellation. Capability declarations cannot discover endpoint support or make an unsupported parameter valid; an image declaration likewise states only whether the model can receive images. Retries send requests again without repairing them.

<a id="edits"></a>
## Drafts and save boundaries

Thinking and image declarations belong to individual models; retry mode, limits and optional error classes belong to the provider. Custom model entries and catalog-model overrides retain their existing settings identities. Both batch entries stay within one provider and change drafts until saved; the thinking batch applies the fixed standard level set, and per-level selection stays with each model in the native list.

Saves carry the captured settings revision and edit only selected fields, preserving credentials and unrelated retry configuration. An external revision change prevents a stale save; rejected saves retain the draft. Read-only settings disable edits. The controls add no prompt or tool, although effort changes and repeated attempts can affect provider usage.

<a id="related"></a>
## Related contracts

The [package README](../../packages/client/ui-settings-model-options/README.md) owns supported controls and recovery instructions. Upstream owns the [pi-ai adapter](../../upstream/packages/llm/llm-pi-ai/README.md) and [retry executor](../../upstream/packages/llm/llm-retry/README.md).

<a id="dev-note"></a>
## Dev Note

None.
