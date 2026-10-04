# Agent Note: Short chapter cards for long-form analysis

Status: implemented

English | [中文](2026-10-04-story-short-chapter-cards.zh.md)

## Problem

A full-book deconstruction stored a per-beat plot index, an expansion table, a writing formula, and a concatenated chapter summary. Writing opens the rhythm file, the emotion-module file, and the style profile. The next book would otherwise need another improvised parallel script, and a failed chapter could be rewritten only by inventing overwrite rules at the keyboard.

## Decision

Long-form multi-chapter analysis loads `workflows/analyze-batch.js` through [the batch guide](../../../../packages/creative/story/knowledge/story/references/analysis/long/native-workflow.md). The parent confirms one chapter-boundary table, then submits at most four chapters per foreground run. The read-only extractor returns one short card: a 100–300 character summary, three to five key events, the named characters in the chapter, and three to eight turning points. Each turning point has a short title, one of the eight plot types, one descriptive sentence, one of the ten tones, and a source locator. Tones stay on turning points. The writer renders that JSON into `章节/第NNN章_摘要.md` and does not receive another chapter's card.

The script does not read the disk. `chapters` are the chapters in this batch. `existing` lists chapter numbers the parent says already have summary files. `replace` lists chapter numbers allowed to overwrite. A writer runs only for a chapter in the batch that is absent from `existing` or listed in `replace`. A null or thrown child fails only that chapter. Opening questions, single-chapter questions, and short fiction stay on their direct paths.

After the cards exist, the parent writes `剧情/节奏.md`, `剧情/情绪模块.md`, `文风.md`, and `拆文报告.md` from at most ten volume segments, reading the source and the short cards. It does not generate `_章节摘要汇总.md`. An existing long summary, including the finished 《龙蛇演义》 library, counts as done and stays readable. A P line whose type is 转折点 remains a valid key-point anchor. A missing rhythm or emotion file is filled as that volume file, not by re-extracting the book.

This narrows the analysis shape inside the [six-Skill decision](2026-09-30-story-skills-native-resources.md). That note still owns the catalog and native resource reading, and it stays active.

## Alternatives considered

**Keep the per-beat index, expansion table, formula, and concatenated summary.** Those fields made chapter files large while the writing path read the volume rhythm, emotion, and style files. The short card keeps the summary, events, names, and turning points that later files actually cite.

**Let the parent write a new parallel script for each book.** That repeats the batch size, the null-result rule, and the overwrite rule in an unreviewed script. One maintained template keeps those branches fixed.

**Re-extract finished libraries into the short card.** 《龙蛇演义》 already has readable chapter files. Treating those files as complete avoids a 514-chapter rewrite that writing does not need.

## Consequences

New multi-chapter runs produce short cards and the four volume-level files. Old long summaries remain valid input for rhythm, emotion, and key-point lookup. `analyze-batch.spec.ts` checks null extraction, writer isolation, a sibling success, batch-size and line-range rejection, zero-byte and wrong-path writes, and the `existing` / `replace` rule. Those checks do not establish literary quality. The [chapter workflow](../feature/2026-10-03-story-native-workflow.md) remains the writing template; this note does not replace it.
