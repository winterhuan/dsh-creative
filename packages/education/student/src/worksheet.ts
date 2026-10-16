import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import type { StudyState } from './schema.ts'
import { itemObjectiveId, objectiveInfo } from './learning.ts'

const font = fileURLToPath(new URL('../knowledge/fonts/NotoSansSC.ttf', import.meta.url))
const subjectName = { chinese: '语文', math: '数学', english: '英语' }
const MARGIN = 48
const INK = '#333333'
const FAINT = '#b9c0c7'

type Item = StudyState['worksheets'][number]['items'][number]
type Figure = NonNullable<Item['figure']>
type Doc = InstanceType<typeof PDFDocument>

/** Height a figure needs before drawing, so a question never splits across pages. */
function figureHeight(figure: Figure, width: number): number {
  switch (figure.kind) {
    case 'bar-model': return figure.bars.reduce((sum, bar) => sum + (bar.total !== undefined ? 22 : 0) + 52, 0)
    case 'money': return Math.ceil(expandMoney(figure).length / Math.max(1, Math.floor(width / 80))) * 50
    case 'place-value': return 34 + Math.ceil((figure.ones + (figure.regroup === 'yes' ? 10 : 0)) / 10) * 20
    case 'hundred-chart': return figure.window !== undefined ? 92 : 232
    case 'number-line': return 78
    case 'clock': return 106
    case 'sticks': return 42
    case 'vertical': return 108
    case 'shapes': return figure.rows.length * 30
    default: throw new Error('练习单包含无法绘制的图形。')
  }
}

function spaceHeight(item: Item): number {
  const space = item.space ?? (item.figure ? 'line' : 'lines')
  return space === 'none' ? 0 : space === 'line' ? 26 : space === 'box' ? 84 : 72
}

/** An answer box, or the label centred in the given width. */
function labelOrBox(doc: Doc, label: string, x: number, y: number, width: number) {
  if (label === '') {
    const w = Math.min(44, width - 4)
    doc.rect(x + (width - w) / 2, y, w, 18).strokeColor(INK).lineWidth(1).stroke()
    return
  }
  doc.fillColor(INK).fontSize(10).text(label, x, y + 3, { width, align: 'center', lineBreak: false })
}

function drawBarModel(doc: Doc, figure: Extract<Figure, { kind: 'bar-model' }>, x: number, y: number, width: number): number {
  const nameWidth = 72
  const barWidth = width - nameWidth - 8
  const unit = barWidth / Math.max(...figure.bars.map(bar => bar.segments.reduce((sum, segment) => sum + segment.units, 0)))
  let top = y
  for (const bar of figure.bars) {
    const length = bar.segments.reduce((sum, segment) => sum + segment.units, 0) * unit
    const left = x + nameWidth
    if (bar.total !== undefined) {
      doc.moveTo(left, top + 18).lineTo(left, top + 12).lineTo(left + length, top + 12).lineTo(left + length, top + 18).strokeColor(INK).lineWidth(1).stroke()
      labelOrBox(doc, bar.total, left, top - 6, length)
      top += 22
    }
    doc.fillColor(INK).fontSize(11).text(bar.name, x, top + 5, { width: nameWidth - 6, align: 'right', lineBreak: false })
    let cursor = left
    for (const segment of bar.segments) {
      const segmentWidth = segment.units * unit
      if (segment.style === 'dashed') doc.dash(3, { space: 3 })
      doc.rect(cursor, top, segmentWidth, 22).strokeColor(INK).lineWidth(1.2).stroke()
      doc.undash()
      labelOrBox(doc, segment.label, cursor, top + 27, segmentWidth)
      cursor += segmentWidth
    }
    top += 52
  }
  return top - y
}

/** Expand structured coin items into one denomination per drawn coin. */
function expandMoney(figure: Extract<Figure, { kind: 'money' }>): string[] {
  return figure.items.flatMap(item => typeof item === 'string' ? [item] : Array.from({ length: item.count }, () => item.denomination))
}

function drawMoney(doc: Doc, figure: Extract<Figure, { kind: 'money' }>, x: number, y: number, width: number): number {
  const perRow = Math.max(1, Math.floor(width / 80))
  expandMoney(figure).forEach((value, index) => {
    const left = x + (index % perRow) * 80
    const top = y + Math.floor(index / perRow) * 50
    const note = value.endsWith('元') && value !== '1元'
    if (note) doc.rect(left, top + 4, 72, 36).strokeColor(INK).lineWidth(1.4).stroke()
    else doc.circle(left + 22, top + 22, 19).strokeColor(INK).lineWidth(1.4).stroke().circle(left + 22, top + 22, 15).strokeColor(FAINT).lineWidth(0.8).stroke()
    doc.fillColor(INK).fontSize(11).text(value, note ? left : left + 2, top + 16, { width: note ? 72 : 40, align: 'center', lineBreak: false })
  })
  return Math.ceil(expandMoney(figure).length / perRow) * 50
}

function drawPlaceValue(doc: Doc, figure: Extract<Figure, { kind: 'place-value' }>, x: number, y: number): number {
  const regroup = figure.regroup === 'yes'
  const tensLeft = x
  const onesLeft = x + 200
  doc.fillColor(INK).fontSize(11).text('十位', tensLeft, y, { lineBreak: false }).text('个位', onesLeft, y, { lineBreak: false })
  const dot = (cx: number, cy: number, crossed: boolean, dashed: boolean) => {
    if (dashed) doc.dash(2, { space: 2 })
    doc.circle(cx, cy, 7).strokeColor(INK).lineWidth(1.2).stroke()
    doc.undash()
    if (crossed) doc.moveTo(cx - 7, cy + 7).lineTo(cx + 7, cy - 7).strokeColor(INK).lineWidth(1.2).stroke()
  }
  for (let index = 0; index < figure.tens; index++) {
    const moved = regroup && index === figure.tens - 1
    dot(tensLeft + 10 + index * 18, y + 30, !moved && index < figure.crossTens, moved)
  }
  const ones = figure.ones + (regroup ? 10 : 0)
  for (let index = 0; index < ones; index++) {
    dot(onesLeft + 10 + (index % 10) * 18, y + 30 + Math.floor(index / 10) * 20, index < figure.crossOnes, regroup && index >= figure.ones)
  }
  return 34 + Math.ceil(ones / 10) * 20
}

function drawHundredChart(doc: Doc, figure: Extract<Figure, { kind: 'hundred-chart' }>, x: number, y: number): number {
  if (figure.window !== undefined) {
    const cellW = 26
    const center = figure.window.center
    for (let row = -1; row <= 1; row++) for (let column = -1; column <= 1; column++) {
      const value = center + row * 10 + column
      const left = x + (column + 1) * cellW
      const top = y + (row + 1) * cellW
      doc.rect(left, top, cellW, cellW).strokeColor(INK).lineWidth(0.8).stroke()
      if (row === 0 && column === 0) doc.fillColor(INK).fontSize(11).text(String(value), left, top + 7, { width: cellW, align: 'center', lineBreak: false })
    }
    return 3 * cellW + 12
  }
  const cell = 22
  const hidden = new Set(figure.hidden ?? [])
  for (let number = 1; number <= 100; number++) {
    const left = x + ((number - 1) % 10) * cell
    const top = y + Math.floor((number - 1) / 10) * cell
    doc.rect(left, top, cell, cell).strokeColor(INK).lineWidth(0.8).stroke()
    if (!hidden.has(number)) doc.fillColor(INK).fontSize(9).text(String(number), left, top + 6, { width: cell, align: 'center', lineBreak: false })
  }
  return 10 * cell + 12
}

function drawVertical(doc: Doc, figure: Extract<Figure, { kind: 'vertical' }>, x: number, y: number): number {
  const cell = 24
  for (let frame = 0; frame < figure.count; frame++) {
    const left = x + frame * 150 + cell
    for (const row of [0, 1, 3]) {
      for (let column = 0; column < 3; column++) doc.rect(left + column * cell, y + row * cell, cell, cell).strokeColor(FAINT).lineWidth(0.8).stroke()
    }
    doc.rect(left - cell, y + cell, cell, cell).strokeColor(FAINT).lineWidth(0.8).stroke()
    doc.moveTo(left - cell, y + cell * 2 + cell / 2).lineTo(left + cell * 3, y + cell * 2 + cell / 2).strokeColor(INK).lineWidth(1.2).stroke()
  }
  return 108
}

function drawShapes(doc: Doc, figure: Extract<Figure, { kind: 'shapes' }>, x: number, y: number, width: number): number {
  figure.rows.forEach((row, index) => {
    const top = y + index * 30
    doc.fillColor(INK).fontSize(11).text(row.name, x, top + 6, { width: 60, align: 'right', lineBreak: false })
    for (let n = 0; n < row.count; n++) {
      const cx = x + 76 + n * 20
      const cy = top + 12
      if (row.shape === 'circle') doc.circle(cx, cy, 7)
      else if (row.shape === 'square') doc.rect(cx - 7, cy - 7, 14, 14)
      else doc.polygon([cx, cy - 8], [cx + 8, cy + 7], [cx - 8, cy + 7])
      doc.strokeColor(INK).lineWidth(1.2).stroke()
    }
    if (row.blank > 0) {
      const start = x + 68 + row.count * 20
      doc.dash(2, { space: 3 }).moveTo(start, top + 22).lineTo(Math.min(start + row.blank * 20, x + width - 12), top + 22).strokeColor(FAINT).lineWidth(1).stroke().undash()
    }
  })
  return figure.rows.length * 30
}

/** One number line with an optional marked point and jump arcs. */
function drawNumberLine(doc: Doc, figure: Extract<Figure, { kind: 'number-line' }>, x: number, y: number, width: number): number {
  const lineY = y + 44
  const span = figure.to - figure.from
  const position = (value: number) => x + (value - figure.from) / span * width
  doc.moveTo(x, lineY).lineTo(x + width, lineY).strokeColor(INK).lineWidth(1.2).stroke()
  const ticks = span / figure.step
  for (let index = 0; index <= ticks; index += 1) {
    const value = figure.from + index * figure.step
    const left = position(value)
    doc.moveTo(left, lineY - 4).lineTo(left, lineY + 4).strokeColor(INK).lineWidth(1).stroke()
    if (ticks <= 20) doc.fillColor(INK).fontSize(9).text(String(value), left - 14, lineY + 7, { width: 28, align: 'center', lineBreak: false })
  }
  for (const mark of figure.marks ?? []) {
    const left = position(mark.value)
    doc.circle(left, lineY, 3.4).fillColor(INK).fill()
    if (mark.label !== undefined && mark.label !== '') doc.fillColor(INK).fontSize(10).text(mark.label, left - 30, lineY - 18, { width: 60, align: 'center', lineBreak: false })
  }
  for (const jump of figure.jumps ?? []) {
    const from = position(jump.from)
    const to = position(jump.to)
    doc.moveTo(from, lineY - 8).quadraticCurveTo((from + to) / 2, lineY - 30, to, lineY - 8).strokeColor(INK).lineWidth(1).stroke()
    const tip = to > from ? to - 5 : to + 5
    doc.polygon([tip, lineY - 8], [tip - (to > from ? 6 : -6), lineY - 13], [tip - (to > from ? 6 : -6), lineY - 3]).fillColor(INK).fill()
    if (jump.label !== undefined && jump.label !== '') doc.fillColor(INK).fontSize(10).text(jump.label, Math.min(from, to), lineY - 42, { width: Math.abs(to - from), align: 'center', lineBreak: false })
  }
  return 78
}

/** One or two analog clocks with hour and minute hands at an o'clock or half-hour time. */
function drawClock(doc: Doc, figure: Extract<Figure, { kind: 'clock' }>, x: number, y: number): number {
  const radius = 46
  figure.clocks.forEach((clock, index) => {
    const cx = x + radius + 12 + index * (radius * 2 + 30)
    const cy = y + radius + 6
    doc.circle(cx, cy, radius).strokeColor(INK).lineWidth(1.4).stroke()
    for (let hour = 1; hour <= 12; hour += 1) {
      const angle = hour / 12 * Math.PI * 2
      doc.fillColor(INK).fontSize(10).text(String(hour), cx + Math.sin(angle) * (radius - 14) - 8, cy - Math.cos(angle) * (radius - 14) - 5, { width: 16, align: 'center', lineBreak: false })
    }
    const hand = (angle: number, length: number) => {
      doc.moveTo(cx, cy).lineTo(cx + Math.sin(angle) * length, cy - Math.cos(angle) * length).strokeColor(INK).lineWidth(2).stroke()
    }
    hand(((clock.hour % 12) + clock.minute / 60) / 12 * Math.PI * 2, radius * 0.5)
    hand(clock.minute / 60 * Math.PI * 2, radius * 0.72)
    doc.circle(cx, cy, 2.4).fillColor(INK).fill()
  })
  return radius * 2 + 14
}

/** Bundled and loose counting sticks, with crossed-out ones struck through. */
function drawSticks(doc: Doc, figure: Extract<Figure, { kind: 'sticks' }>, x: number, y: number): number {
  let cursor = x
  figure.bundles > 0 || figure.singles > 0 ? undefined : doc.fillColor(FAINT).fontSize(10).text('（没有小棒）', x, y + 12, { lineBreak: false })
  for (let index = 0; index < figure.bundles; index += 1) {
    const crossed = (figure.crossBundles ?? 0) > figure.bundles - 1 - index
    for (let stick = 0; stick < 5; stick += 1) doc.moveTo(cursor + 3 + stick * 4, y + 4).lineTo(cursor + 3 + stick * 4, y + 34).strokeColor(INK).lineWidth(1.1).stroke()
    doc.rect(cursor, y + 15, 22, 8).fillColor('#ffffff').fill().strokeColor(INK).lineWidth(1.1).stroke()
    if (crossed) doc.moveTo(cursor - 2, y + 36).lineTo(cursor + 24, y + 2).strokeColor(INK).lineWidth(1.6).stroke()
    cursor += 32
  }
  for (let index = 0; index < figure.singles; index += 1) {
    const crossed = (figure.crossSingles ?? 0) > figure.singles - 1 - index
    doc.moveTo(cursor + 3, y + 4).lineTo(cursor + 3, y + 34).strokeColor(INK).lineWidth(1.1).stroke()
    if (crossed) doc.moveTo(cursor - 1, y + 36).lineTo(cursor + 7, y + 2).strokeColor(INK).lineWidth(1.4).stroke()
    cursor += 10
  }
  return 42
}

function drawFigure(doc: Doc, figure: Figure, x: number, y: number, width: number): number {
  switch (figure.kind) {
    case 'bar-model': return drawBarModel(doc, figure, x, y, width)
    case 'money': return drawMoney(doc, figure, x, y, width)
    case 'place-value': return drawPlaceValue(doc, figure, x, y)
    case 'hundred-chart': return drawHundredChart(doc, figure, x, y)
    case 'number-line': return drawNumberLine(doc, figure, x, y, width)
    case 'clock': return drawClock(doc, figure, x, y)
    case 'sticks': return drawSticks(doc, figure, x, y)
    case 'vertical': return drawVertical(doc, figure, x, y)
    case 'shapes': return drawShapes(doc, figure, x, y, width)
    default: throw new Error('练习单包含无法绘制的图形。')
  }
}

/** Render the frozen questions, figures and answer space; answers and evidence stay in the saved worksheet record. */
export async function renderWorksheet(state: StudyState, worksheetId: string): Promise<Buffer> {
  const worksheet = state.worksheets.find(item => item.id === worksheetId)
  if (!worksheet) throw new Error('练习单不存在。')
  const goals = worksheet.items.map(item => objectiveInfo(state, itemObjectiveId(state, worksheet, item) ?? ''))
  if (goals.some(goal => !goal || goal.subject !== worksheet.subject)) throw new Error('练习单学习目标不存在。')
  const titles = [...new Set(goals.map(goal => goal?.title ?? ''))]
  const review = worksheet.items.every(item => item.mistakeId !== undefined && !state.mistakes.some(mistake => mistake.id === item.mistakeId && mistake.source?.worksheetId === worksheet.id))
  const role = worksheet.kind ?? (review ? 'review' : 'practice')
  const name = role === 'daily' ? `${subjectName[worksheet.subject]}每日小卷` : `${subjectName[worksheet.subject]}${role === 'review' ? '巩固卷' : '练习卷'}`
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true, info: { Title: `${name} ${worksheet.id}` } })
  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  const width = doc.page.width - MARGIN * 2
  doc.font(font).fillColor(INK).fontSize(18).text(name, { align: 'center' })
  doc.moveDown(0.2).fontSize(10).text(titles.length === 1 ? `编号：${worksheet.id}    学习目标：${titles[0]}` : `编号：${worksheet.id}`, { align: 'center' })
  doc.moveDown(0.4).text('姓名：____________    日期：____________')
  doc.moveDown(0.8)
  for (const [index, item] of worksheet.items.entries()) {
    const promptHeight = doc.fontSize(12).heightOfString(`${index + 1}. ${item.prompt}`, { width, lineGap: 4 })
    const needed = promptHeight + 8 + (item.figure ? figureHeight(item.figure, width - 16) + 10 : 0) + spaceHeight(item) + 14
    if (doc.y + needed > doc.page.height - MARGIN) doc.addPage()
    doc.fillColor(INK).fontSize(12).text(`${index + 1}. ${item.prompt}`, MARGIN, doc.y, { width, lineGap: 4 })
    let y = doc.y + 8
    if (item.figure) y += drawFigure(doc, item.figure, MARGIN + 16, y, width - 16) + 10
    const space = item.space ?? (item.figure ? 'line' : 'lines')
    if (space === 'box') {
      doc.dash(3, { space: 3 }).rect(MARGIN + 16, y, width - 16, 72).strokeColor(FAINT).lineWidth(1).stroke().undash()
      y += 84
    } else if (space !== 'none') {
      for (let line = 0; line < (space === 'line' ? 1 : 3); line++) {
        y += 22
        doc.moveTo(MARGIN + 16, y).lineTo(MARGIN + width, y).strokeColor(FAINT).lineWidth(1).stroke()
      }
      y += 4
    }
    doc.x = MARGIN
    doc.y = y + 14
  }
  doc.end()
  return result
}

/** Queue a confirmed PDF with the system default printer and return CUPS's receipt. */
export function queueWorksheet(pdf: Buffer, title: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn('lp', ['-t', title, '-'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    let error = ''
    const timer = setTimeout(() => process.kill(), 30_000)
    process.stdout.setEncoding('utf8').on('data', chunk => { output += String(chunk).slice(0, 4096 - output.length) })
    process.stderr.setEncoding('utf8').on('data', chunk => { error += String(chunk).slice(0, 4096 - error.length) })
    process.on('error', reason => { clearTimeout(timer); reject(reason) })
    process.on('close', code => {
      clearTimeout(timer)
      if (code === 0 && output.trim()) resolve(output.trim())
      else reject(new Error(error.trim() || '打印机未接受练习单，请检查队列后再试。'))
    })
    process.stdin.on('error', reject)
    process.stdin.end(pdf)
  })
}
