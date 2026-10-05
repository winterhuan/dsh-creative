# Agent Note: Student learning with confirmed course materials

Status: implemented

English | [中文](2026-10-05-student-learning.zh.md)

## Problem

Young learners need short, encouraging practice that preserves mistakes and learning evidence between conversations. A region and grade do not identify the school's textbook edition. Generated textbook content and rewards for elapsed time would undermine learning.

## Decision

The repository provides an independently installed `@winterhuan/dsh-student` in `packages/education/student`. An interactive native sidebar starts and stops learning, accepts answers and photo attachments, shows progress and collects parent-confirmed settings. Native DSH Skills guide Chinese, mathematics and English; tools retain one learner's term in each workspace. The first teaching reference targets Shanghai, grade two, first term. Parents confirm the school year, each textbook and current unit. Generic practice remains available while course alignment is unconfirmed.

Course records retain source identity, edition, scope, location and user confirmation. Parents use official entry points or provide relevant textbook pages; the plugin neither downloads nor redistributes textbooks. Image intake uses DSH vision and requires correction of uncertain transcription before review scheduling.

Code limits each study block and daily duration, requires a break before another block, and awards at most two stars per day for recorded work and reflection. Time limits apply across subjects and exploration. Spaced review requires independent answers on separate days; a hinted answer does not establish mastery. Questions, submitted answers and hint requests survive reload. Assessment must match the saved task and cannot claim independence after a hint request. The local sidebar API resolves main sessions and checks the displayed revision before mutation; it does not accept grading or reward commands. State changes use the calling Session's filesystem and compare-and-replace writes.

## Alternatives considered

**Prompt-only records and limits.** This is smaller but cannot reliably prevent duplicate rewards, conflicting writes or an immediate restart during a break.

**An embedded textbook corpus and independent tutoring application.** This adds edition maintenance and distribution obligations before the school books are known. Native DSH chat, images and files supply the needed interaction.

## Verification

- Native tool tests exercise setup, source confirmation, daily work, transcription records and review. Independent build and isolated profile installation succeed.
- Tests reject mismatched curricula, uncertain transcripts, repeated rewards, premature reviews, skipped breaks and stale writes; fresh reads recover persisted progress.
- Source guidance records official entry points and unresolved edition matches without inventing content or downloading textbooks.
- Browser checks in an isolated DSH profile cover setup, confirmed textbooks, timed learning, saved answers and hints, feedback recovery, breaks, stars, corrected transcriptions, image admission, light/dark themes and narrow layout. The questions and assessments are scripted fixtures; no page script errors occur.
- Real-model transcription accuracy and educational effectiveness are not measured.

## Consequences

The plugin cannot authenticate a parent's identity, measure attention or guarantee generated answers. It records explicit confirmation and observed work; the tutor checks answer evidence and stops when uncertain. A model may ignore tool guidance, so timing is enforced for recorded learning rather than represented as an operating-system screen lock.
