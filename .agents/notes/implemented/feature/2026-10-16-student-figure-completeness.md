# Agent Note: Complete grade one and two figure set with a sketch fallback

Status: implemented

English | [中文](2026-10-16-student-figure-completeness.zh.md)

## Problem

The tenth figure kind ([overlap circles](2026-10-16-student-overlap-figure.md)) closed one gap, but walking all four grade-one and grade-two mathematics maps showed more: number splits, pattern strips, number walls, grids (magic squares, seat maps, place-value tables), dot arrays, plane and solid figure rows, counters, centimetre rulers, direction crosses, balances and writing grids had no kind, and the clock could only draw o'clock and half past. Each miss meant a text workaround, a 看图 prompt that could not carry its figure, or waiting for yet another kind.

## Decision

The vocabulary grows to twenty-three kinds: `split`, `sequence`, `wall`, `grid`, `dot-array`, `plane`, `solid`, `counter`, `measure`, `compass`, `balance` and `writing` join the ten, and `clock` accepts any five-minute reading (0–55, guarded so the minute hand never lands between ticks). Every kind has a strict schema and shared SVG rendering for saved tasks and browser worksheets; the [HTML worksheet decision](../simplification/2026-10-25-student-worksheet-html.md) owns preview and printing. `sketch` is the last kind: a bounded canvas (height 40–260) holding up to 24 primitives (`line`, `arrow`, `polyline`, `rect`, `circle`, `text`) on an x grid of 0–480, validated so no stroke leaves the canvas. The questions reference carries the full list and tells the model to prefer the dedicated kinds; the practice-sheet prompt and the study skill point at that reference instead of repeating kind lists.

## Alternatives considered

**Keep adding kinds on demand.** Every new topic cost a round trip with the tool blocked until the kind existed; the maps themselves were the checklist, and one pass was cheaper than more interruptions.

**Open rendering: let the model write SVG or drawing code.** Rejected as the printable sheet's vehicle already (no record, no grading path) and again here: freehand output drifts in style, breaks height prediction, and would add a sanitiser and an SVG dependency the print path does not otherwise carry.

**One generic diagram kind for everything.** A single flexible shape would replace the readable vocabulary with a mini drawing language everywhere; the dedicated kinds keep common figures textbook-shaped and reviewable, and `sketch` covers only the long tail.

## Verification

Schema and CLI resource tests validate all 23 kinds and reject invalid clocks, walls and out-of-canvas sketches. Client worksheet tests render the complete figure set through shared SVG. The original textbook visual checks informed balance labels, five-minute hands and writing examples; they do not establish current real-model drawing quality or physical printing.

## Consequences

Printed practice can draw every figure the two grades' maps ask for, and the long tail no longer blocks a sheet: an uncovered figure degrades to a bounded sketch instead of a text workaround. Quality is uneven on purpose — dedicated kinds stay textbook-shaped, sketches are model-composed and can look rough.
