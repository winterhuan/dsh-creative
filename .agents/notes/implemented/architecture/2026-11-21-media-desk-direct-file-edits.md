# Agent Note: Media Desk ordinary edits use native file tools

Status: implemented

English | [中文](2026-11-21-media-desk-direct-file-edits.zh.md)

## Problem

Ordinary manuscript edits require the assistant to encode content in a business-operation JSON string and provide version maps and operation-specific fields. Invalid arguments reject the save while the creative prompt also forbids native file writes. Notes already supports external editing, so that restriction prevents the Agent from using the same editable file as other editors.

## Decision

The Agent reads and edits registered Notes files through native file tools. A read-only Media Desk validator checks the saved bytes with the existing format and identity parsers. It reads registered references directly, because a Store read also adopts external edits, writes snapshots and updates navigation. Validation has no save, index, history, receipt or undo effects and cannot repair the file itself.

The ordinary workbench refresh imports valid file changes through the existing Notes hydration path, updates content revisions and retains prior snapshots. Direct file edits take effect immediately; stopping or failing the native turn does not roll them back. These edits have no business save receipt or workbench undo entry. Native filesystem permissions apply; the creative instructions require the bound work, current file reads, preserved identity/language metadata and format repair before completion.

This replaces the ordinary text-edit path in [native creation](2026-11-11-media-desk-native-agents.md). [Native acceptance](2026-11-12-media-desk-native-acceptance.md) still owns structured production candidates, durable stage completion, media, workflow state and recovery. Structured stages submit candidates rather than editing their current Notes file; their coordinated state updates retain the Host save journal. Existing business operations remain compatible with retained callers.

## Alternatives considered

**Keep the JSON business tool as the only file writer.** This preserves a business receipt for every edit but requires repeated argument conversion and version-map submission for ordinary manuscript changes. Native file tools already provide an editable-file workflow.

**Make validation save or adopt content.** A check would then change snapshots, Store or the index and could fail after partially saving. The Agent owns the file write; normal refresh owns adoption, and validation reports only the current file’s format.

## Consequences

Ordinary writing uses the native file diff and permission flow. Invalid bytes remain on disk until repaired, and format success does not certify factual quality, stage acceptance or a business transaction. Workbench saves and structured stages retain their existing conflict and recovery behavior.

The package’s direct-file tests exercise actual native read/edit/write calls, invalid-format repair and workbench revision/history/index refresh. A separate filesystem comparison proves that validation changes neither file contents, modification times nor inodes, including for materials and preferences. Real-model tool choice and writing quality are outside that deterministic evidence.
