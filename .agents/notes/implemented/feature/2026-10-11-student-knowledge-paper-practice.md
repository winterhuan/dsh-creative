# Agent Note: Subject knowledge and paper practice

Status: implemented

English | [中文](2026-10-11-student-knowledge-paper-practice.zh.md)

## Problem

Free-text topics cannot reliably connect concepts, learning goals, mistakes and practice evidence across days. Paper work may arrive after the learner leaves the screen and cannot be represented as an active timed task. A model-issued print command also cannot show that the user saw and confirmed the questions before printing.

## Decision

The [learning decision](2026-10-05-student-learning.md) continues to own curriculum evidence, interactive timers and reward limits. This decision keeps concepts, goals, relations, mistakes, worksheets and paper results in one workspace record. Old collections read as empty, while legacy mistake `topic` values stay intact until someone checks and links a goal. The tutor proposes concepts; a parent can correct the definition, example and source before confirming. Goals reference confirmed concepts in the same subject and use methods allowed for that subject. Relations stay within one subject, and causal relations record their direction and source.

Worksheets reference confirmed mistakes linked to one goal and retain each answer and its evidence. The student PDF contains only questions and writing space. PDF preview precedes a confirmed request to the host's default printer queue. The Host owns that queue call; a model shell cannot replace preview and user confirmation. A queue receipt proves acceptance, not paper output. Printing does not earn learning rewards.

Each paper result identifies a saved worksheet item and is stored by the learning tool after photo transcription and user review. Paper results need no active block and do not earn stars upon upload. Early practice retains evidence; only due mistakes whose classification remains unchanged can advance the review interval through an independent answer. The optional SenseVoice bundle inserts transcripts into the conversation draft; the learner reviews the text and submits through the native answer flow. A transcript does not prove pronunciation.

## Alternatives considered

**Keep free-text `topic` alone.** Different wording for one goal cannot be merged reliably or traced through worksheets.

**Store paper work through the timed `record` action.** Upload time is not the time of paper practice, so deadlines and participation rewards would be misleading.

**Let the model create a file and print with shell.** That path lacks a frozen question set, preview and explicit confirmation, and file creation can be mistaken for actual printing.

**Build another recorder in the learning pane.** DSH already provides local SenseVoice transcription through the conversation microphone. Duplicating recording and permission handling adds maintenance without enabling pronunciation assessment.

## Verification

State tests cover old records, confirmed same-subject concepts, goal and mistake links, worksheet sources, paper results and review intervals. Route tests render a real PDF and prove the queue is not called before confirmation; the queue call is replaced in tests, so no physical print job is sent. Visual PDF review covers Chinese questions and writing lines. Real-model concept quality, photo transcription and teaching outcomes remain for human evaluation.

## Consequences

Concepts and worksheets increase state size and model tool schema size; the package carries the Noto Sans SC font and its license. Direct printing needs `lp` and a default queue on the Host, while Windows has PDF preview only. The current UI shows a queue receipt without retaining print history. The workbench and Skill expose subject methods, but parents still need to check model-proposed definitions, relations and answer evidence.
