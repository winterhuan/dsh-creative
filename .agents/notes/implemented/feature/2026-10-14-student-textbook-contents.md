# Agent Note: Textbook contents in the knowledge maps

Status: implemented

English | [中文](2026-10-14-student-textbook-contents.zh.md)

## Problem

The school-progress control asks the parent to pick the map unit the class has reached. Chinese and English maps were organized by skill topics, so that list did not match the lessons in the child's book. A parent cannot confirm "the class is on unit 3" when the map's unit 3 is "reading methods" rather than the book's third unit.

## Decision

Chinese and English maps for both terms of grade one and the first term of grade two list the units and lessons from the parent-supplied textbook contents. A book unit is a map unit, including 我上学了, Starter, 附录, and the English 其他栏目. Each lesson, 语文园地, 快乐读书吧, English section, or appendix item is a knowledge point. A learning objective covers at most five knowledge points in that unit. Mathematics for those three books keeps the 2024 Shanghai five-four units and knowledge points; the grade-two-first shopping unit is named 欢乐购物街. Grade two, second term of all three subjects stays on the earlier framework, because that book is not in the supplied contents.

The bundled grade-two-first page scans (People's Education Press Chinese, Beijing Normal University mathematics) remain a separate default reading source. Their lesson names are not rewritten to match this directory.

## Alternatives considered

**Keep skill-topic maps and store the directory only in documentation.** The parent dropdown and the check-in would still use topics the book does not have.

**Replace the bundled page scans with this directory.** Those scans are a different edition already in the package. This change does not retitle their pages. Tutoring that reads a scan must not treat its lesson titles as the map units.

**Fill grade two, second term from a public table of contents.** The supplied directory does not include that book.

## Consequences

Check-ins still sample objectives, so a unit with several lessons is one or two probes, not one probe per lesson. Appendix units sit at the end of the map and stay out of the daily plan until the parent marks the frontier there. See [knowledge map](2026-10-12-student-knowledge-map.md) and [school progress](2026-10-14-student-school-frontier.md).
