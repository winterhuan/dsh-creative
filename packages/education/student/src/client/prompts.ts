import type { CheckInIntensity } from '../learning.ts'
import { intensityKeys } from './display.ts'
import type { Translate } from './locales.ts'

/** Natural-language tutor requests. The study skill owns the teaching rules. */
export const continuePrompt = '请加载 study 技能，查询 study_status，继续当前学习段。先处理未反馈的答案或提示，再出下一题。一次一题。timeNotice 里的时长是建议，请照原文告诉孩子；孩子还想继续就继续。'
export const reviewPrompt = '请加载 study 技能，查询 study_status 和到期错题。本段复习到期错题：先做变式，不展示已保存答案。task 写上 mistakeId 和 objectiveId。一次一题。'
export const hintPrompt = '请加载 study 技能。学生要提示：只指出条件或该画的图，不给算式和答案。如果这题已经答错，下一题换一种表示，并在 task 上写 figure。'
export const mistakePhotoPrompt = '请加载 study 技能，读取这张题目照片，用 mistake 保存待确认错题。能对应知识地图时写上 objectiveId。不要替我确认。'

/** Continue around one shipped or custom learning goal. */
export function goalPrompt(objectiveId: string): string {
  return `请加载 study 技能，查询 study_status。本段围绕学习目标 ${objectiveId} 出题，一次一题，task 写上这个 objectiveId。需要看图时写 figure。`
}

/** Tell the child the next unit is still ahead of school. */
export function previewPrompt(objectiveId: string): string {
  return `${goalPrompt(objectiveId)}先告诉孩子这是预习，学校还没教到这里。`
}

/** One short question per sampled check-in goal. */
export function diagnosePrompt(intensity: CheckInIntensity, ids: string[], t: Translate): string {
  const intensityName = t(intensityKeys[intensity])
  return `请加载 study 技能，查询 study_status kind=diagnose。本段是${intensityName}摸底，按这些学习目标各出一道短题：${ids.join('，')}。task 和 record 都写 objectiveId。每题只给简短反馈，不展开教学。`
}

/** A 4–6 question daily mini sheet for one subject. */
export function dailySheetPrompt(subject: string): string {
  return `请加载 study 技能，阅读 references/questions.md 和 references/daily-routine.md。用 study_status kind=elements subject=${subject} 写一张每日小卷，4 到 6 题，kind 写 daily，每题写 objectiveId。用 worksheet 保存后告诉我编号。`
}

/** Dictate one word or sentence at a time in the conversation. */
export function dictationPrompt(subject: string): string {
  return `请加载 study 技能，用 study_status kind=elements subject=${subject} 做对话听写。没有进行中的学习段时，用 start 开始一段 foundation（subject=${subject}）。一次报一个，task 写 objectiveId。`
}

/** A mixed practice sheet for the current school unit. */
export function practiceSheetPrompt(subject: string): string {
  return `请加载 study 技能，阅读 references/questions.md。用 study_status kind=elements subject=${subject} 写一张当前单元练习卷：6 到 8 题，题型要换，kind 写 practice，每题写 objectiveId，不要写 mistakeId。需要图时用 figure。用 worksheet 保存后告诉我编号。`
}

/** A review sheet limited to the picks and objective fills already chosen. */
export function reviewSheetPrompt(subject: string): string {
  return `请加载 study 技能，阅读 references/questions.md。按 study_status kind=review-sheet subject=${subject} 的 picks 和 objectiveFills 写巩固卷，kind 写 review。用 worksheet 保存后告诉我编号。`
}

/** Ask the tutor to propose a concept that is outside the shipped map. */
export function organizePrompt(subject: string): string {
  return `请加载 study 技能，查看 ${subject} 的知识地图。如果有地图之外的概念，先保存待确认概念，等家长核对后再创建学习目标。`
}

/** Transcribe one photographed worksheet into drafts. */
export function paperPhotoPrompt(worksheetId: string): string {
  return `请加载 study 技能，读取练习单 ${worksheetId} 的作答照片，按题号用 paper-draft 保存转录草稿。不要直接入库。`
}
