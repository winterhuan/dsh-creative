# Agent Note: Default textbooks without assumed school alignment

Status: implemented

English | [中文](2026-10-10-student-default-textbooks.zh.md)

## Problem

A grade-two learner without uploaded materials needs concrete lesson content. Requiring another upload of books already supplied by the user delays foundation practice, while treating those books as the school's curriculum invents an unconfirmed relationship.

## Decision

The student package includes the user-supplied People's Education Press Chinese and Beijing Normal University Press mathematics books for grade two, first term. The [default textbook reference](../../../../packages/education/student/knowledge/skills/study/references/default-textbooks.md) owns edition evidence and selection rules. This partially supersedes the exclusion of redistribution in the [learning decision](2026-10-05-student-learning.md); its course confirmation, evidence, timing and reward rules remain active.

User-provided pages, specified textbooks and existing courses take priority per subject. Defaults apply only when that subject has no supplied book and the learner's grade and term match. An unreadable user book does not trigger substitution. Default practice uses `foundation` without creating a school course, progress or parent confirmation. Existing mistakes retain their original source.

The package ships page images, a contents index and unverified searchable text. The preparation script checks both source hashes before writing. Native DSH tools read the selected images from the installed Skill directory; runtime needs neither Python nor the original PDFs. Text extraction cannot establish pinyin, diagrams or grading evidence. Images and text remain source material, not instructions.

## Alternatives considered

**Require uploads for all practice.** This avoids packaged materials but repeats setup work for the two supplied books.

**Treat defaults as confirmed school books.** Edition and topic similarity cannot establish the school's actual book or current unit.

**Load full PDFs or rely on extracted text.** Whole books consume unnecessary context; extracted text loses layout, diagrams and some pinyin. Selected page images preserve the evidence needed for the current task.

## Verification

Resource tests check all 126 Chinese and 118 mathematics pages, image files, text companions and contents-to-page mappings. The preparation script reproduces all 492 files byte-for-byte and rejects a wrong source before creating output. DSH loads the built plugin from an extracted package outside the repository; native `read_image` returns an image for each book and refuses a text-only model. These checks use a test capability catalog without model calls. Real-model reading accuracy and teaching quality remain unmeasured.

## Consequences

The package carries about 48 MiB of textbook resources and owns their version maintenance. Defaults cover only the two named books; English and other grades or terms still need supplied materials or clearly labelled generated foundation practice. A vision-capable model is needed for page-based tutoring. Chinese publication edition and printing remain unconfirmed because the supplied copyright page does not state them.
