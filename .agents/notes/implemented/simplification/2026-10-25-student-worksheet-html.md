# Agent Note: Student worksheets render as HTML and print from the browser

Status: implemented

English | [中文](2026-10-25-student-worksheet-html.zh.md)

## Problem

The 23 printable figure kinds each had two hand-written geometries: the Host's `src/worksheet.ts` drew PDFs with pdfkit by manual coordinates (693 lines) while the client's `src/client/figure-view.tsx` drew on-screen SVG figures (324 lines). Keeping the two copies in sync was manual, and the 2026-10-17 overlap-circle fix touched only the PDF side. Printing also served non-Windows hosts only: preview opened a separate PDF page, confirmation sent the Host to `lp`, and Windows returned 501. The package additionally shipped a 17 MB NotoSansSC font and the pdfkit dependency.

## Decision

The client now renders the sheet: `src/client/worksheet-view.tsx` composes the whole sheet (title, sheet id, name and date line, questions, figures, one-line/three-line/box answer space) from the same `FigureView` components as on-screen tasks, leaving one SVG geometry. The mistake book's "Preview & print" button opens a preview dialog in a body-level portal; `window.print()` opens the browser print dialog, and `@media print` keeps only the sheet, paginates at A4 and never splits a question. The parent picks a printer or "Save as PDF" in that dialog, which is itself the confirmation.

The Host drops the `/student/worksheet.pdf` preview, the `/student/print` confirmed-print endpoint, `src/worksheet.ts`, the pdfkit and `@types/pdfkit` dependencies and the bundled font, shrinking the package by about 17 MB. Sheet `kind`, answer spaces and all validation are unchanged; sheets without a `kind` keep the "every question sourced from another sheet's mistakes means review" naming heuristic, now computed client-side from `sources`.

## Alternatives considered

**Converting HTML to PDF on the Host with a headless browser before `lp`.** That adds a rendering dependency far heavier than pdfkit and keeps the subprocess; the browser already has a complete print pipeline.

**Keeping pdfkit as the print backend with HTML only for preview.** Both geometries would remain, Windows printing would stay missing, and the font and dependency would still ship.

**Emitting static HTML strings from the Host.** That trades pdfkit's manual layout for manual HTML layout, and figures would still need a second implementation.

## Consequences

The client owns worksheet rendering with one SVG geometry; the browser owns preview/print and actual output is checked by the parent. Client regressions cover all figures, writing spaces, naming and dialog dismissal, while schema/CLI tests cover the same closed figure union. No Host PDF or system print queue remains. Real browser pagination and physical output require separate release acceptance.

The [question-elements note](../feature/2026-10-16-student-error-elements.md) retains variation and cause rules; the [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns saved content and response bindings. Release verification belongs to [HANDOFF](../../../../HANDOFF.md).
