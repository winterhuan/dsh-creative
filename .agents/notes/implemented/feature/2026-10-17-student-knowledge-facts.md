# Agent Note: Checkable facts on knowledge points

Status: implemented

English | [中文](2026-10-17-student-knowledge-facts.zh.md)

## Problem

A knowledge point was one definition and one example. The tutor then invented the rest of the lesson while writing a check-in or a worksheet. For Chinese, grade two, first term, that produced claims the bundled textbook does not make: 《场景歌》 was given “一片沙滩”, grape raisins were dried in a “阴房”, and 《植物妈妈有办法》 dropped the pomegranate. Short definitions cannot keep a generated question inside the lesson.

## Decision

A knowledge point may carry `facts`: two to eight checkable sentences, each at most 240 characters. `study_status kind=curriculum` and `kind=elements` return them on the knowledge point, and the workbench lists them under the point. Question instructions treat `facts` as the whole set of lesson claims a question may use. A point without `facts` still uses only its definition and example; the tutor does not fill in plot, readings, garden exercises or verse that the map does not state.

Chinese, grade two, first term, is the book whose pages ship with the package. Every knowledge point in that map has `facts` taken from those pages, and a few definitions and examples that contradicted the pages were corrected. Every knowledge point on the other eleven maps also has `facts`. Mathematics states the method and the worked example. Chinese states the characters, lines and events that lesson can be checked against. English, grade two, first term, Units 1 to 4 follow a parent-provided reading sheet. Units 5 to 10 of that book now use sentences taken from 2024 Shanghai five-four excerpts that were actually read. Grade one, first term, Units 1 and 3 use sentences already read; Units 2, 4, 5, 6, 8, 9 and 10 use matching sentences from the knowledge-point sheet. In Unit 7 of that book, the topic words, Helpful animals and Helping Mira use the sentences that match; the small task and the pet home stay as topic-word meanings because no reliable sentence was read, and the mismatched line “The horse is warm” is not included. Grade one, second term, Units 1 to 10 use sentences from the pages that were read. Starter, both appendices and grade two, second term, still state what the topic words mean until a matching page is read. For mathematics, grade one both terms and grade two first term, a knowledge point whose lesson page or plan was read, and whose concept matches, now states the method, rhyme or shape feature that page supports. A point without a matching page keeps its earlier facts. Mathematics, grade two, second term, is unchanged in this pass. Publisher, edition and volume may differ. A later page or paper that is the same concept can replace a fact; a concept that does not match is left out. A new question is written from the facts; the original stem is not copied into the map. A search snippet does not count as reading, and an unknown scan is not used. Workspace concepts accept the same optional field. Existing objective IDs stay, so saved answers and worksheets keep their goals.

## Alternatives considered

**Save exam papers found on the web as a reference bank.** Questions on a paper corroborate the course. Publisher may differ, and a material that has been read can supply checkable facts when the concept is the same one on the map. Keeping the whole paper as a stem bank, attaching a concept the map point does not contain, or copying items into a new exercise, still loses. An unknown scan is not authority, and a new question is written from the facts.

**Ask the parent to upload every school paper before any question can be written.** A paper the parent has is useful as a mistake photo, but it is not required to state what 《小蝌蚪找妈妈》 already says on the bundled page. The closed set belongs on the knowledge point.

**Replace unit objectives with one new objective per lesson.** Check-ins would sample lessons instead of units, and saved `objectiveId` values such as `c2a-o1` would stop resolving. Facts sit on the lessons those objectives already cite.

## Consequences

Chinese, grade two, first term, is checked page by page against the bundled textbook. The English units named above are checked against the reading sheet or the excerpts that were read. The mathematics points in grade one, both terms, and grade two, first term, that name a page already read are checked against that page. Points without a matching page, and mathematics grade two second term, keep the earlier facts. The other maps state the concept itself, so a later reading of the same concept can replace a fact. Facts are short claims, not a copy of a paper's original items. The model can still misread a fact; parents still watch question quality. This change was not exercised with a real model or in a real DSH browser.
