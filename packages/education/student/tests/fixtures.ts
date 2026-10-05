import type { Command } from '../src/schema.ts'

export const NOW = Date.parse('2026-10-05T09:00:00+08:00')
export const MINUTE = 60_000
export const DAY = 86_400_000
export const setup = {
  action: 'setup', profile: {
    nickname: '小禾', schoolAlias: '学校A课程', region: '上海市', grade: 2, term: 'first', schoolYear: '2026–2027', schoolSystem: 'five-four',
    limits: { blockMinutes: 10, breakMinutes: 5, dailyMinutes: 20 },
    parentConfirmation: '家长确认：使用上述学期和 10/5/20 分钟安排。',
  },
} satisfies Command
export const material = {
  id: 'math-book', subject: 'math', scope: { region: '上海市', grade: 2, term: 'first', schoolYear: '2026–2027', schoolSystem: 'five-four' },
  title: '测试用数学课本', publisher: '测试出版社', edition: '测试版', editionStatus: 'identified', kind: 'official-textbook',
  locator: '课本版权页和第 5 页', evidence: '家长提供的测试课页，不是实际上海教材目录。',
} satisfies Extract<Command, { action: 'material' }>['material']
export const course = { subject: 'math', materialId: 'math-book', unit: '测试单元', parentConfirmation: '与孩子当前测试课本及进度一致。' } satisfies Extract<Command, { action: 'course' }>['course']
export const start = { action: 'start', id: 'block-1', subject: 'math', mode: 'foundation' } satisfies Command
export const attempt = {
  id: 'answer-1', sessionId: 'block-1', subject: 'math', topic: '加法', prompt: '8 + 7 等于多少？', response: '15，先凑十。',
  result: 'correct', assistance: 'independent', feedback: '说明了凑十过程。', answerEvidence: '8 + 2 + 5 = 15；15 - 7 = 8。',
} satisfies Extract<Command, { action: 'record' }>['attempt']
export const mistake = {
  id: 'error-1', subject: 'math', topic: '加法', prompt: '8 + ? 等于多少？', learnerAnswer: '14', correction: '待核对题干',
  explanation: '照片遮挡第二个数。', answerEvidence: '暂不能判定。', imagePath: 'attachments/problem.png', uncertainties: '第二个数不清楚。',
} satisfies Extract<Command, { action: 'mistake' }>['mistake']
export const confirm = {
  action: 'confirm-mistake', id: mistake.id, prompt: attempt.prompt, correction: '15', explanation: '把 7 分为 2 和 5，先凑十。',
  answerEvidence: attempt.answerEvidence, userConfirmation: '照片上是 8 + 7，我确认题目和订正。',
} satisfies Command
