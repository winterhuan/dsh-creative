# Agent Note: Interest tags wrap practice and overdue review stays short

Status: implemented

English | [中文](2026-10-28-student-interest-context.zh.md)

## Problem

A long overdue list was the only daily recommendation, so a child never reached the current school goal. Questions also stayed generic, so a scene the child likes never carried the same knowledge-map fact.

## Decision

Parent setup stores 3 to 8 interest tags on the learning state. When the field is absent, status reads the six example tags: 购物超市钱, 运动球类, 动物宠物, 故事角色动画, 积木拼搭手工 and 美食做饭. `study_status` returns those tags and `interestFocus`, the tag chosen from the Shanghai calendar day. Questions, context variants, the daily routine and the OpenMAIC requirement wrap the scene in one of those tags and may rotate. Facts stay the knowledge-map facts. The primary recommendation teaches a goal that needs teaching, then practises a goal that is weak for a reason other than a single due mistake, then a due check-in, then a new goal. `dueToday` lists at most two due mistakes and `dueBacklog` is the full count. The learning desk runs this cascade inside the selected subject, so Chinese and English do not keep a math goal, math lesson, or math due mistake on screen. `study_status` still returns one cross-subject recommendation. Today offers interest practice and an interactive lesson beside the open subject's step. A ready lesson pins Go to class. Generation still uses the tutor shell from [OpenMAIC lessons](2026-10-28-student-openmaic-lessons.md). Soft time limits stay suggestions. [The knowledge map](2026-10-12-student-knowledge-map.md) states this same order.

## Alternatives considered

**A separate `.study/interests.json`.** The tutor writes the lesson log that way because generation must not bump the learning revision. Tags are a parent setting, like time limits, so they belong on the state and in `study_status`.

**Keep reviewing every due mistake before any new goal.** That was the previous order. Dozens of overdue items then block the school unit for good.

**Let interest tags add checkable facts.** A scene the child likes is not a fact from the textbook. Answers still have to match `facts`.

## Consequences

Old profiles without the field still show the example tags until a parent saves. A goal with several open mistakes, repeated recent errors, or a teaching need can still be the practice target. One isolated due mistake cannot. The Host still does not call port 3000. This change has no real DSH browser pass and no live OpenMAIC call.
