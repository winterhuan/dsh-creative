import type { CheckInIntensity } from '../learning/mastery.ts'
import { intensityKeys } from './display.ts'
import type { Translate } from './locales.ts'

/** Natural-language tutor requests. The study skill owns the teaching rules. */
export const continuePrompt = '请加载 study 技能，查询 study_status，继续当前学习段。先处理未反馈的答案或提示，再出下一题。一次一题。没有时长限制，孩子想继续就继续；想休息就 stop。'

/** Ask the child to teach the idea back like a little teacher (Feynman). */
export function feynmanPrompt(topic: string | undefined): string {
  const focus = topic ? `围绕「${topic}」` : '围绕刚才学的内容'
  return `请加载 study 技能。你扮演好奇的同桌。请孩子${focus}当小老师讲一讲：用简单的话说明是什么、怎么做、为什么。孩子讲完后，用一两句追问帮他发现漏洞并补齐；不要直接替他讲完整答案。`
}
export const reviewPrompt = '请加载 study 技能，查询 study_status 和到期错题。本段复习到期错题：先做变式，不展示已保存答案。task 写上 mistakeId 和 objectiveId。一次一题。'
export const hintPrompt = '请加载 study 技能。学生要提示：只指出条件或该画的图，不给算式和答案。如果这题已经答错，下一题换一种表示，并在 task 上写 figure。'
export const teachHintPrompt = '请加载 study 技能，阅读 references/teaching.md 的「不会做时先教」。按当前题的 phase 教方法：还没示范就先 demo，引导步先给一步提示，不把算式和答案直接填进括号。'

/** Ordinary tries get a nudge. A stuck learner, a teaching step, or a follow-up hint follows the teaching steps. */
export function hintPromptFor(task: { phase?: string | undefined; hintLevel?: number | undefined; stuck?: boolean | undefined }): string {
  if (task.stuck || task.phase === 'demo' || task.phase === 'guide' || (task.hintLevel ?? 0) >= 1) return teachHintPrompt
  return hintPrompt
}

/** Teach one objective before any later lesson. */
export function teachPrompt(objectiveId: string): string {
  return `请加载 study 技能，阅读 references/teaching.md 的「不会做时先教」。本段先教学习目标 ${objectiveId}：按 demo、guide、try、vary 四步，task 写 phase 和这个 objectiveId。今天停在这个目标上，不排下一课。`
}

/** Teach one confirmed workbook item that is not linked to an objective yet. */
export function teachQueuePrompt(title: string): string {
  return `请加载 study 技能，阅读 references/teaching.md 的「不会做时先教」。本段教这道待教的题：${title}。按 demo、guide、try、vary 四步，task 写 phase。`
}

export const stuckPrompt = '请加载 study 技能，阅读 references/teaching.md 的「不会做时先教」。孩子说不会。先用 demo 示范方法，再进入 guide。摸底段只记下不会，不讲课。'
export const mistakePhotoPrompt = '请加载 study 技能，读取这张题目照片，用 mistake 保存待确认错题。能对应知识地图时写上 objectiveId。不要替我确认。'

/** Practise the current goal inside one interest scene. Facts stay on the knowledge map. */
export function interestPracticePrompt(objectiveId: string | undefined, tags: string[], focus: string, unitName?: string): string {
  const goal = objectiveId ? `学习目标 ${objectiveId}` : '今日建议的目标'
  const scene = tags.length > 0 ? `兴趣标签：${tags.join('、')}。本题优先用「${focus}」套壳，下一题可以换一个标签。` : '用 study_status 的 interests 套壳。'
  const unit = unitName ? `校内单元「${unitName}」。` : ''
  return `请加载 study 技能，阅读 references/interest-hooks.md 和 references/questions.md。本段用趣味情境练${goal}。${scene}${unit}事实只核知识地图的 facts，不把兴趣写成知识点。一次一题，task 写 objectiveId。`
}

/** Clear only the one or two due mistakes named for today. */
export function dueClearPrompt(ids: string[]): string {
  return `请加载 study 技能，阅读 references/interest-hooks.md。今天只清 dueToday 里的这 ${ids.length} 条到期错题（${ids.join('、')}），其余到期错题留到以后。先做变式，不展示已保存答案。task 写 mistakeId 和 objectiveId。情境用 interests 里的标签套壳，事实只核知识地图。一次一题。`
}

/** Problem-based explore: guess, check, revise. */
export function explorePrompt(question: string | undefined): string {
  const focus = question && question.trim() !== '' ? `孩子的疑问是：${question.trim()}。` : '先问孩子想弄清什么。'
  return `请加载 study 技能。本段是自主探究（explore）。${focus}按问题导向法引导：我猜什么 → 如何验证（翻课页或做小实验）→ 看到了什么 → 我改变了什么想法。一次只推进一小步，不要直接给出完整答案。`
}

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

/** Ask the tutor to generate one local OpenMAIC lesson for the current goal, with interest tags and the school unit. */
export function openmaicGeneratePrompt(subjectLabel: string, objectiveId: string | undefined, tags: string[], focus: string, unitName?: string): string {
  const goal = objectiveId ? `围绕学习目标 ${objectiveId}。` : '围绕今日建议或孩子要点的知识点。'
  const scene = tags.length > 0 ? `requirement 必须写入兴趣标签（${tags.join('、')}），本题优先套「${focus}」。` : 'requirement 必须写入 study_status 的 interests。'
  const unit = unitName ? `校内单元「${unitName}」。` : ''
  return `请加载 study 技能，阅读 references/openmaic.md 和 references/interest-hooks.md。为${subjectLabel}生成一节 OpenMAIC 互动课。${goal}${unit}${scene}事实只核知识地图。用 shell 和 curl 调用本机服务，不要用 web_fetch 访问 localhost。成功后把课堂 URL 单独一行原文发给我，并写入 .study/openmaic-lessons.json。`
}

/** Ask the tutor to retry a failed generation without resubmitting the requirement. */
export function openmaicRetryPrompt(runId: string): string {
  return `请加载 study 技能，阅读 references/openmaic.md。互动课生成失败且可以重试。用同一 cookie jar 对 runId ${runId} 调用 retry，不要重新提交 requirement。把结果写回 .study/openmaic-lessons.json。成功后把课堂 URL 单独一行原文发给我。`
}

/** Ask the tutor to pull the stage outline and write a few consolidation questions. */
export function openmaicReviewPrompt(classroomId: string): string {
  return `请加载 study 技能，阅读 references/openmaic.md 和 references/questions.md。孩子上完互动课 ${classroomId}。用同一 cookie jar GET /api/stages/${classroomId}，把大纲和场景摘要写回 .study/openmaic-lessons.json 的 summary。再按摘要出 2 到 5 道巩固题，走现有出题和作答，不要嵌播放器。`
}

/** Transcribe a workbook photo that is not tied to a saved worksheet. */
export const workbookPhotoPrompt = '请加载 study 技能。这是练习册照片，事先没有练习单。用 workbook-draft 按题保存草稿：不会用 stuck，提示后才对用 hinted，独立做错用 independent-wrong，独立做对用 independent-correct。能对应目标就写 objectiveId。不要直接入库，等家长确认。'
