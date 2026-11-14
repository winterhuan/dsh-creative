# Agent Note: Overlap circles as a printable figure

Status: implemented

English | [中文](2026-10-16-student-overlap-figure.zh.md)

## Problem

Two intersecting circles need distinct labels for each set, shared membership and the union. A closed figure vocabulary without that shape forces a prose workaround or a free-form sheet outside saved marking and review. The [question-elements decision](2026-10-16-student-error-elements.md) requires recorded, checkable figures.

## Decision

The `overlap` figure uses two circles with `left`/`right` labels and `leftOnly`, `both`, `rightOnly` regions; blank labels show answer boxes, and optional `total` labels the union below. Sum circles and set diagrams share geometry but assign different meaning to the upper labels. The [questions reference](../../../../plugins/dsh-student/packages/winterhuan/student/knowledge/skills/study/references/questions.md) owns those semantics. Strict schemas preserve the saved worksheet record; shared SVG drawing and print layout belong to the [HTML worksheet decision](../simplification/2026-10-25-student-worksheet-html.md).

## Alternatives considered

**Free-form HTML or SVG figures.** Rejected as the vehicle for printable sheets already — no saved worksheet record and no grading path — and unnecessary here: the dedicated shared SVG geometry already expresses the problem.

**One generic set-diagram kind taking N circles.** The taught figure is exactly two circles; a fixed shape keeps validation, layout and the height arithmetic simple, and a three-circle figure can become its own kind the same way.

**Splitting sum circles and set diagrams into two kinds.** Both share the same geometry, three region labels and empty-label box rule; only the semantics of the labels above the circles differ (target sums vs set names). Two kinds would enlarge the vocabulary and the test surface without any rendering benefit — the questions reference carries the semantics and the model fills the labels per the problem.

**Reuse `bar-model` or `shapes`.** Neither expresses membership in both sets, and telling the overlap in prose defeats the figure's purpose.

## Verification

Schema, CLI resource and client worksheet tests cover sum and set forms, blank targets and optional totals. The original visual check compared these three forms with textbook layouts. Current real-model figure choice and physical printing remain separate acceptance concerns.

## Consequences

Worksheets can print overlap problems while staying inside the print-grade-review loop, and the model picks the kind from the documented list. The vocabulary stays closed on purpose: each new figure is a schema case plus a draw function, never an open rendering surface.
