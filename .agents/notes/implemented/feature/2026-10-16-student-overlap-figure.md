# Agent Note: Overlap circles as a printable figure

Status: implemented

English | [中文](2026-10-16-student-overlap-figure.zh.md)

## Problem

Overlap problems (two sets sharing members, drawn as the classic two-circle set figure) had no printable shape: the closed `figure` vocabulary held nine kinds and none expressed shared membership, so a worksheet item asking one could not be saved for printing. The true limit is that vocabulary, not the PDF pipeline — the renderer draws vector primitives through pdfkit and can draw any shape once a kind exists — and free-form HTML sheets were already rejected in the [error elements](2026-10-16-student-error-elements.md) work because they leave the print, grading and review loop.

## Decision

`overlap` is the tenth `figure` kind: `left` and `right` name the two sets, `leftOnly`, `both` and `rightOnly` carry one label per region (an empty label prints an answer box, as in the other kinds), and the optional `total` prints under a bracket below both circles. An empty set name is rejected. The renderer strokes two circles at one radius of centre distance, centres the pair in the available width, and `figureHeight` reports 128 pt — 156 pt with a total — so a question never splits across pages. The [questions reference](../../../../packages/education/student/knowledge/skills/study/references/questions.md), the `worksheet` tool description, the practice-sheet prompt and both READMEs list the new kind, and the printable-figures test now draws all ten kinds — it had listed six of the nine, so `number-line`, `clock` and `sticks` join it.

## Alternatives considered

**Free-form HTML or SVG figures.** Rejected as the vehicle for printable sheets already — no saved worksheet record and no grading path — and unnecessary here: the same geometry is a few pdfkit calls.

**One generic set-diagram kind taking N circles.** The taught figure is exactly two circles; a fixed shape keeps validation, layout and the height arithmetic simple, and a three-circle figure can become its own kind the same way.

**Reuse `bar-model` or `shapes`.** Neither expresses membership in both sets, and telling the overlap in prose defeats the figure's purpose.

## Verification

Host tests render every kind, overlap included, through `renderWorksheet` into a PDF (two sheets, at most eight items each), and the three total variants — a bracket with an answer box, a bracket with a label, no bracket — were checked visually against the textbook layout. Root `typecheck`, `build`, the student package suite, `doc-sync` and `hygiene` pass. Not exercised in a real DSH browser or with a real model.

## Consequences

Worksheets can print overlap problems while staying inside the print-grade-review loop, and the model picks the kind from the documented list. The vocabulary stays closed on purpose: each new figure is a schema case plus a draw function, never an open rendering surface.
