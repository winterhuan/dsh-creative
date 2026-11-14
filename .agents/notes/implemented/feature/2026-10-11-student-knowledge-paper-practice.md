# Agent Note: Subject knowledge and paper practice

Status: implemented

English | [中文](2026-10-11-student-knowledge-paper-practice.zh.md)

## Problem

Free-text topics cannot reliably connect concepts, learning goals, mistakes and practice evidence across days. Paper work may arrive after the learner leaves the screen and cannot be represented as an active timed task. A model-issued print command also cannot show that the user saw and confirmed the questions before printing.

## Decision

The [learning decision](2026-10-05-student-learning.md) owns course evidence and rewards. Concepts, goals, relations, mistakes, worksheets and paper results retain explicit identities in one workspace term. Legacy topics remain unchanged until someone checks and links them. The tutor proposes concepts; a parent can correct definition, example and source before confirmation. Goals and relations stay within one subject, with subject-appropriate methods and explicit causal direction/evidence.

Worksheets freeze questions, sources and goals and retain original answers and assessments. The student sheet contains questions and writing space; the [HTML worksheet decision](../simplification/2026-10-25-student-worksheet-html.md) owns shared browser rendering, preview and the print dialog. A saved file or print dialog does not prove physical output. Printing earns no learning rewards.

The agent saves confirmed paper answers in official worksheet files after transcription and explicit parent review. Paper work needs no active block and earns no upload stars. Parent-confirmed actual dates and known assistance govern independent review, including early advancement under [review relaxation](2026-10-16-student-review-relaxation.md). The [native learning architecture](../architecture/2026-11-12-student-learning-flow-architecture.md) owns stable bindings and unknown legacy facts. Optional SenseVoice inserts text into the native draft for review before submission; transcription does not establish pronunciation.

## Alternatives considered

**Keep free-text `topic` alone.** Different wording for one goal cannot be merged reliably or traced through worksheets.

**Store paper work through the timed `record` action.** Upload time is not the time of paper practice, so deadlines and participation rewards would be misleading.

**Let the model create a file and print with shell.** That path lacks a frozen question set, preview and explicit confirmation, and file creation can be mistaken for actual printing.

**Build another recorder in the learning pane.** DSH already provides local SenseVoice transcription through the conversation microphone. Duplicating recording and permission handling adds maintenance without enabling pronunciation assessment.

## Verification

Learning and official-file tests cover subject links, frozen worksheet sources, retained paper responses and independent-day review. Client worksheet tests cover the shared figures, writing spaces and preview; deterministic rendering is not physical printer evidence. Real-model concept quality, transcription and teaching outcomes remain unmeasured.

## Consequences

Structured records let paper and screen work share evidence without treating upload time as answer time. The browser owns printing with no Host PDF, system queue or bundled PDF font. Parents still check proposed definitions, relations, transcriptions and answer evidence; unknown facts remain outside verified dated metrics.
