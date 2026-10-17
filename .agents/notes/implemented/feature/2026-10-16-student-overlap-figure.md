# Agent Note: Overlap circles as a printable figure

Status: implemented

English | [中文](2026-10-16-student-overlap-figure.zh.md)

## Problem

Overlap problems (two intersecting circles, each with a target number or set name above it and one value per region) had no printable shape: the closed `figure` vocabulary held nine kinds and none expressed shared membership, so a worksheet item asking one could not be saved for printing. The true limit is that vocabulary, not the PDF pipeline — the renderer draws vector primitives through pdfkit and can draw any shape once a kind exists — and free-form HTML sheets were already rejected in the [error elements](2026-10-16-student-error-elements.md) work because they leave the print, grading and review loop.

## Decision

`overlap` is the tenth `figure` kind: two intersecting circles with `left` and `right` printed above each circle, `leftOnly`, `both` and `rightOnly` carry one label per region (an empty label prints an answer box, as in the other kinds), and the optional `total` prints under a bracket below both circles. It covers both textbook uses: sum circles (`left`/`right` are target sums, the two numbers inside each circle add up to it, and the shared number counts toward both — common for two-digit addition and subtraction; an empty `left`/`right` prints an answer box so the sum itself can be the unknown) and set diagrams (`left`/`right` name the sets, the three regions carry counts, and `total` asks the union). The renderer strokes two circles at 1.25 radii of centre distance, centres the pair in the available width, and `figureHeight` reports 144 pt — 172 pt with a total — so a question never splits across pages. The [questions reference](../../../../packages/education/student/knowledge/skills/study/references/questions.md), the `worksheet` tool description, the practice-sheet prompt and both READMEs list the new kind, and the printable-figures test now draws all ten kinds — it had listed six of the nine, so `number-line`, `clock` and `sticks` join it.

## Alternatives considered

**Free-form HTML or SVG figures.** Rejected as the vehicle for printable sheets already — no saved worksheet record and no grading path — and unnecessary here: the same geometry is a few pdfkit calls.

**One generic set-diagram kind taking N circles.** The taught figure is exactly two circles; a fixed shape keeps validation, layout and the height arithmetic simple, and a three-circle figure can become its own kind the same way.

**Splitting sum circles and set diagrams into two kinds.** Both share the same geometry, three region labels and empty-label box rule; only the semantics of the labels above the circles differ (target sums vs set names). Two kinds would enlarge the vocabulary and the test surface without any rendering benefit — the questions reference carries the semantics and the model fills the labels per the problem.

**Reuse `bar-model` or `shapes`.** Neither expresses membership in both sets, and telling the overlap in prose defeats the figure's purpose.

## Verification

Host tests render every kind, including both overlap forms, through `renderWorksheet` into a PDF (two sheets, at most eight items each), and the three overlap forms — sum circle, sum circle with an unknown target, set diagram with a bracket total — were checked visually against the textbook layout. Root `typecheck`, `build`, the student package suite, `doc-sync` and `hygiene` pass. Not exercised in a real DSH browser or with a real model.

## Consequences

Worksheets can print overlap problems while staying inside the print-grade-review loop, and the model picks the kind from the documented list. The vocabulary stays closed on purpose: each new figure is a schema case plus a draw function, never an open rendering surface.
