import type { Command } from '../src/schema.ts'

export const NOW = Date.parse('2026-10-05T09:00:00+08:00')
export const MINUTE = 60_000
export const DAY = 86_400_000
export const setup = {
  action: 'setup', profile: {
    nickname: '小禾', schoolAlias: '学校A课程', region: '上海市', grade: 2, term: 'first', schoolYear: '2026–2027', schoolSystem: 'five-four',
    parentConfirmation: '家长确认：使用上述学期档案。',
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

/** One sample of every printable figure kind, valid against the shipped schema. */
export const figureSamples = [
  { kind: 'bar-model', bars: [{ name: '小明', segments: [{ label: '', units: 8 }, { label: '多 8 颗', units: 3, style: 'dashed' }], total: '35 颗' }, { name: '小红', segments: [{ label: '?', units: 8 }] }] },
  { kind: 'money', items: ['10元', '5元', '1元', '5角', '1角'] },
  { kind: 'place-value', tens: 6, ones: 3, crossTens: 2, crossOnes: 0, regroup: 'no' },
  { kind: 'place-value', tens: 5, ones: 2, crossTens: 0, crossOnes: 0, regroup: 'yes' },
  { kind: 'hundred-chart', hidden: [23, 37, 100] },
  { kind: 'vertical', count: 3 },
  { kind: 'shapes', rows: [{ name: '○', shape: 'circle', count: 9, blank: 0 }, { name: '△', shape: 'triangle', count: 0, blank: 6 }] },
  { kind: 'number-line', from: 0, to: 20, step: 2, marks: [{ value: 8, label: '8' }], jumps: [{ from: 8, to: 14, label: '+6' }] },
  { kind: 'clock', clocks: [{ hour: 7, minute: 30 }] },
  { kind: 'sticks', bundles: 3, singles: 6, crossBundles: 1, crossSingles: 2 },
  { kind: 'overlap', left: '跳绳', right: '踢毽子', leftOnly: '8', both: '', rightOnly: '6', total: '' },
  { kind: 'overlap', left: '63', right: '82', leftOnly: '', both: '', rightOnly: '29' },
  { kind: 'split', parts: [{ top: '5', left: '2', right: '' }, { top: '6', left: '', right: '4' }] },
  { kind: 'sequence', items: [{ shape: 'circle', count: 2 }, { shape: 'triangle', count: 1 }, { shape: 'circle', count: 2 }, { shape: 'triangle', count: 1 }], blank: 2 },
  { kind: 'wall', rows: [['5'], ['2', '3'], ['1', '', '2']] },
  { kind: 'grid', rows: [{ cells: ['2', '', '6'] }, { cells: ['', '5', ''] }, { cells: ['4', '', '8'] }] },
  { kind: 'dot-array', rows: 3, columns: 5, total: '' },
  { kind: 'plane', items: [{ shape: 'triangle', count: 1 }, { shape: 'curved', count: 1 }, { shape: 'quadrilateral', count: 1 }, { shape: 'rectangle', count: 1 }], mark: 'yes' },
  { kind: 'solid', items: [{ shape: 'sphere', count: 1 }, { shape: 'cuboid', count: 1 }, { shape: 'cylinder', count: 2 }], mark: 'no' },
  { kind: 'counter', hundreds: 3, tens: 0, ones: 5 },
  { kind: 'measure', bars: [{ name: '铅笔', length: 9 }, { name: '', length: 5, style: 'curved' }], ruler: 'yes' },
  { kind: 'compass', blank: 'yes' },
  { kind: 'balance', left: '200 克', right: '1 千克', tilt: 'right' },
  { kind: 'writing', style: 'tianzige', count: 3, example: '禾' },
  { kind: 'writing', style: 'fourline', example: 'a' },
  { kind: 'sketch', height: 80, elements: [{ draw: 'line', from: { x: 40, y: 60 }, to: { x: 200, y: 60 } }, { draw: 'circle', x: 120, y: 40, radius: 24 }, { draw: 'text', x: 120, y: 68, label: '？', align: 'center' }] },
] as const
