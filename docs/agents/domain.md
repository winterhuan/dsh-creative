# Domain docs

English | [中文](domain.zh.md)

## Summary

Use a single context for the parent repository. Read its domain vocabulary and existing Agent Notes before proposing terms or changing a recorded decision. Each plugin is an independent repository with its own instructions.

## Contents

- [Read before exploring](#read-before-exploring)
- [Document ownership](#document-ownership)
- [Vocabulary and conflicts](#vocabulary-and-conflicts)

<a id="read-before-exploring"></a>

## Read before exploring

Start with [HANDOFF.md](../../HANDOFF.md) to locate the owning plugin. Read the root `GLOSSARY.md` if present; inside a plugin repository, also read its instructions and relevant domain docs. Missing glossaries are skipped silently and created only when a term is actually resolved.

Read relevant active decisions and proposals under `.agents/notes/` using the [Agent Note rules](../../.agents/notes/README.md). Implemented notes describe shipped decisions; proposed notes describe intended work. Archived notes are frozen history, not current authority.

<a id="document-ownership"></a>

## Document ownership

The layout is **single-context**: the optional root `GLOSSARY.md` holds parent-repository domain terms. Existing [translation terminology](../i18n/terminology.md) owns English/Chinese wording, not domain definitions. Plugin-specific terms belong in their owning repository when needed; setup creates no empty glossary or cross-plugin glossary map.

This repository uses `.agents/notes/{lifecycle}/{kind}/` for architectural decision records instead of a parallel `docs/adr/` tree. When an engineering skill asks for an ADR, apply the existing Agent Note creation criteria, lifecycle, naming and bilingual rules. Update the decision's existing owner when appropriate. Follow the plugin's own decision-document convention for plugin-local decisions.

<a id="vocabulary-and-conflicts"></a>

## Vocabulary and conflicts

Use the glossary's defined terms in issues, proposals and tests. If a term is missing, check established code and documentation before introducing a new name; record a resolved domain term through domain modeling when needed.

If a proposal contradicts an active decision, identify the note and explain the proposed change and trade-off. Preserve the distinction between proposed and implemented behavior. A conflicting proposal does not silently supersede an existing decision.
