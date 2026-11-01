---
description: "Production settings subsystem: the shared drama/video profile, credential references and browser write boundaries."
---

# Production settings

English | [中文](production-settings.zh.md)

## Summary

Configure provider credentials and runtime options used by short-drama and video production. Both plugins use one settings page and profile, so edits affect both consumers. Saving configuration does not start production or authorize a paid job.

## Table of Contents

- [Packages and namespace](#ownership)
- [Credentials and execution](#credentials)
- [Related contracts](#related)
- [Dev Note](#dev-note)

<a id="ownership"></a>
## Packages and namespace

The [production settings client](../../packages/client/ui-settings-creative-produce/README.md) is included by the [short-drama](short-drama.md) and [video-recap](video-recap.md) bundles. Their `/produce` entries serve `creative-produce`; the client contributes its page while that namespace is served. The client has no bundle patch and installs no business plugin.

Both bundle patches use the same production settings row IDs. Removing one domain leaves settings available through the remaining domain. This shared profile does not merge the domains’ Skills, tools or project state. The Zhuque reference belongs to the separate [story](story.md) settings namespace.

<a id="credentials"></a>
## Credentials and execution

The profile holds six provider credential references and non-secret runtime fields. Key literals remain in DSH credentials; the page reads presence metadata and writes secrets through that service. Blank secret drafts preserve stored values, and provider reference changes must not publish presence results for an older reference.

Production tools resolve references at call time and pass the required secrets through explicit subprocess environments; the drama runner can also use private pool input. Secrets are not model arguments or command text. Provider presence does not prove connectivity, and settings edits cannot replace the owning tool’s confirmation rules.

<a id="related"></a>
## Related contracts

The [client README](../../packages/client/ui-settings-creative-produce/README.md) owns form fields and save behavior. [Short drama](short-drama.md) owns receipt-based execution, while [video recap](video-recap.md) owns Skill-enforced paid-generation confirmation.

<a id="dev-note"></a>
## Dev Note

None.
