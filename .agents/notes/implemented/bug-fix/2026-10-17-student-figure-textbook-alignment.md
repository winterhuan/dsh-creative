# Agent Note: Figure alignment with the textbooks

Status: implemented

English | [中文](2026-10-17-student-figure-textbook-alignment.zh.md)

## Problem

Printed worksheet figures did not match the textbooks, so children could not read them:

- **Sticks drawn as bundles of five.** `drawSticks` hardcoded five sticks per bundle, but the textbooks (BNU grade 2, Shanghai grade 1) and place-value teaching use **ten sticks per bundle** — one bundle is one ten. A bundle of five cannot represent "four tens and two ones is 42"; children could not map bundles to tens.
- **Place-value dots mixed borrowing dashes with crossing slashes in one figure.** `place-value` allowed `regroup: 'yes'` (borrow one ten, add ten dashed ones) together with `crossTens`/`crossOnes` (cross out). The borrowing-subtraction lesson (52−37) is taught with a **counter plus vertical**, not a dot diagram; once dashes and slashes shared a figure, no one could tell which dots were crossed.
- **No "which figure for which objective" rule.** questions.md described each figure's fields but never said which textbook topic each figure belongs to, so the model chose figures by impression (borrowing got a dot diagram, multiplication meaning did not get a dot array).
- **Bar-model `units` not proportional.** 25, 39 and 45 sticks were filled as 10, 16 and 18 units, so the bars misled.

## Decision

1. **Sticks become ten-per-bundle.** `drawSticks` draws ten sticks per bundle, sized so nine bundles plus nine singles (99) fits the page width. questions.md now says "ten sticks per bundle (one bundle is one ten)".
2. **Place-value forbids the mix.** Schema validation requires `crossTens`/`crossOnes` to be zero when `regroup: 'yes'`; the borrowing procedure pairs `counter` with `vertical` instead. When `regroup: 'no'`, crosses may not exceed the drawn dots. On load, store.ts zeroes crosses on legacy mixed figures (prompt and answer are unchanged, so the item still works), for backward compatibility.
3. **questions.md gains a figure-to-topic map.** Each figure states its fixed textbook use (counter for borrowing, vertical for arithmetic, sticks for place-value composition, dot-array for multiplication meaning, number-line for counting and multiplication jumps), and hard rules: one figure per item, the figure is the only given information so the prompt must not restate it, and `units` must be proportional to the quantity.
4. Saved sheets such as `ws-20261017-review-test` migrate on next load and do not block the plugin.

## Alternatives considered

**Keep five-per-bundle and add a ten-per-bundle kind.** No textbook topic uses five-per-bundle, so two kinds would only invite the same mis-pick. The bundle field always meant "one ten"; only the drawing was wrong, so fixing the drawing is enough.

**Keep the place-value mix and explain in the prompt which dots are crossed.** This breaks the existing "prompt must not restate the figure" rule and shifts the reading burden to the child.

## Verification

The student package's 53 tests pass (including new place-value mix-rejection, cross-exceeds-rejection, and sticks rendering cases); root `typecheck` and `build` pass; the real state.json (24 sheets) loads after migration. Not exercised in a real DSH browser or with a real model. The textbook check used the text layer of the 236-page BNU grade-2 book and the knowledge maps; the image layer was not checked page by page because the current model does not accept image input.

## Consequences

Worksheet figures now match the textbooks: sticks express place value in tens, borrowing subtraction uses a counter plus vertical, and each figure returns to its intended topic. Newly saved place-value figures that mix borrowing with crossing are rejected by the schema at the source. Legacy sheets migrate on load and do not block the plugin.
