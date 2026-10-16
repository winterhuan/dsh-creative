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
    case 'overlap': return 112 + (figure.total !== undefined ? 44 : 16)
    case 'split': return 66
    case 'sequence': return 40
    case 'wall': return figure.rows.length * 26 + 8
    case 'grid': return (figure.rows.length + (figure.columns !== undefined ? 1 : 0)) * 30 + 8
    case 'dot-array': return figure.rows * 16 + 8 + (figure.total !== undefined ? 26 : 0)
    case 'plane': return figure.mark === 'yes' ? 56 : 40
    case 'solid': return figure.mark === 'yes' ? 56 : 40
    case 'counter': return 150
    case 'measure': return figure.bars.length * 22 + (figure.ruler === 'yes' ? 40 : 8)
    case 'compass': return 160
    case 'balance': return 116
    case 'writing': return figure.style === 'tianzige' ? 52 : 44
    case 'sketch': return figure.height + 8
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

/** Two overlapping set circles with one number per region; an optional total sits below a bracket. */
function drawOverlap(doc: Doc, figure: Extract<Figure, { kind: 'overlap' }>, x: number, y: number, width: number): number {
  const radius = 56
  const span = radius * 3
  const left = x + (width - span) / 2
  const cx1 = left + radius
  const cx2 = left + radius * 2
  const cy = y + 8 + radius
  doc.circle(cx1, cy, radius).strokeColor(INK).lineWidth(1.2).stroke()
  doc.circle(cx2, cy, radius).strokeColor(INK).lineWidth(1.2).stroke()
  doc.fillColor(INK).fontSize(11).text(figure.left, cx1 - 28, cy - radius + 8, { width: 56, align: 'center', lineBreak: false })
  doc.fillColor(INK).fontSize(11).text(figure.right, cx2 - 28, cy - radius + 8, { width: 56, align: 'center', lineBreak: false })
  labelOrBox(doc, figure.leftOnly, cx1 - radius, cy - 9, radius)
  labelOrBox(doc, figure.both, cx1, cy - 9, radius)
  labelOrBox(doc, figure.rightOnly, cx2, cy - 9, radius)
  const bottom = y + 8 + radius * 2
  if (figure.total === undefined) return bottom + 8 - y
  doc.moveTo(left, bottom + 6).lineTo(left, bottom + 12).lineTo(left + span, bottom + 12).lineTo(left + span, bottom + 6).strokeColor(INK).lineWidth(1).stroke()
  labelOrBox(doc, figure.total, left, bottom + 14, span)
  return bottom + 36 - y
}

/** A small line-art shape used by sequence strips. */
function drawSmallShape(doc: Doc, shape: 'circle' | 'square' | 'triangle' | 'star', cx: number, cy: number) {
  doc.strokeColor(INK).lineWidth(1.2)
  if (shape === 'circle') doc.circle(cx, cy, 7)
  else if (shape === 'square') doc.rect(cx - 7, cy - 7, 14, 14)
  else if (shape === 'triangle') doc.polygon([cx, cy - 8], [cx + 8, cy + 7], [cx - 8, cy + 7])
  else {
    const points: [number, number][] = []
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? 8 : 3.4
      const angle = -Math.PI / 2 + index * Math.PI / 5
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius])
    }
    doc.polygon(...points)
  }
  doc.stroke()
}

/** One split diagram per part: a top number branching into left and right boxes. */
function drawSplit(doc: Doc, figure: Extract<Figure, { kind: 'split' }>, x: number, y: number, width: number): number {
  const partWidth = Math.min(150, (width - 16) / figure.parts.length - 12)
  const left = x + (width - (partWidth + 12) * figure.parts.length + 12) / 2
  figure.parts.forEach((part, index) => {
    const partLeft = left + index * (partWidth + 12)
    const stemLeft = partLeft + partWidth / 2
    const branchLeft = partLeft + partWidth / 4
    const branchRight = partLeft + partWidth * 3 / 4
    labelOrBox(doc, part.top, partLeft, y, partWidth)
    doc.moveTo(stemLeft, y + 20).lineTo(branchLeft, y + 36).strokeColor(INK).lineWidth(1).stroke()
    doc.moveTo(stemLeft, y + 20).lineTo(branchRight, y + 36).strokeColor(INK).lineWidth(1).stroke()
    labelOrBox(doc, part.left, branchLeft - partWidth / 4, y + 40, partWidth / 2)
    labelOrBox(doc, part.right, branchRight - partWidth / 4, y + 40, partWidth / 2)
  })
  return 66
}

/** One repeating strip of small shapes with dashed slots at the end. */
function drawSequence(doc: Doc, figure: Extract<Figure, { kind: 'sequence' }>, x: number, y: number): number {
  let cursor = x + 8
  for (const item of figure.items) {
    for (let index = 0; index < item.count; index += 1) {
      drawSmallShape(doc, item.shape, cursor + 8, y + 20)
      cursor += 20
    }
  }
  for (let index = 0; index < (figure.blank ?? 0); index += 1) {
    doc.dash(2, { space: 3 }).rect(cursor, y + 12, 16, 16).strokeColor(FAINT).lineWidth(1).stroke().undash()
    cursor += 20
  }
  return 40
}

/** Staggered number-wall bricks; every row below the first has one more cell. */
function drawWall(doc: Doc, figure: Extract<Figure, { kind: 'wall' }>, x: number, y: number, width: number): number {
  const widest = figure.rows.reduce((max, row) => Math.max(max, row.length), 0)
  const brickWidth = Math.min(64, (width - 24) / widest)
  figure.rows.forEach((row, rowIndex) => {
    const rowLeft = x + (width - row.length * brickWidth) / 2
    row.forEach((cell, column) => {
      const left = rowLeft + column * brickWidth
      const top = y + rowIndex * 26
      doc.rect(left, top, brickWidth, 26).strokeColor(INK).lineWidth(1).stroke()
      if (cell !== '') doc.fillColor(INK).fontSize(11).text(cell, left, top + 8, { width: brickWidth, align: 'center', lineBreak: false })
    })
  })
  return figure.rows.length * 26 + 8
}

/** A bordered cell table with an optional header row and row labels; empty cells stay blank. */
function drawGrid(doc: Doc, figure: Extract<Figure, { kind: 'grid' }>, x: number, y: number, width: number): number {
  const columns = figure.rows.reduce((max, row) => Math.max(max, row.cells.length), 0)
  const nameWidth = figure.rows.some(row => row.name !== undefined) ? 64 : 0
  const cellWidth = Math.min(46, (width - nameWidth - 8) / columns)
  const cellHeight = 30
  const left = x + nameWidth + (width - nameWidth - columns * cellWidth) / 2
  let top = y
  if (figure.columns !== undefined) {
    figure.columns.forEach((head, index) => {
      const cellLeft = left + index * cellWidth
      doc.rect(cellLeft, top, cellWidth, cellHeight).strokeColor(INK).lineWidth(1).stroke()
      doc.fillColor(INK).fontSize(10).text(head, cellLeft, top + 9, { width: cellWidth, align: 'center', lineBreak: false })
    })
    top += cellHeight
  }
  figure.rows.forEach((row, rowIndex) => {
    const rowTop = top + rowIndex * cellHeight
    if (row.name !== undefined) doc.fillColor(INK).fontSize(10).text(row.name, x, rowTop + 9, { width: nameWidth - 8, align: 'right', lineBreak: false })
    row.cells.forEach((cell, column) => {
      const cellLeft = left + column * cellWidth
      doc.rect(cellLeft, rowTop, cellWidth, cellHeight).strokeColor(INK).lineWidth(1).stroke()
      if (cell !== '') doc.fillColor(INK).fontSize(12).text(cell, cellLeft, rowTop + 8, { width: cellWidth, align: 'center', lineBreak: false })
    })
  })
  return (figure.rows.length + (figure.columns !== undefined ? 1 : 0)) * cellHeight + 8
}

/** A rectangular dot grid for multiplication meaning, with an optional bracket total. */
function drawDotArray(doc: Doc, figure: Extract<Figure, { kind: 'dot-array' }>, x: number, y: number, width: number): number {
  const spacing = 16
  const gridWidth = (figure.columns - 1) * spacing
  const left = x + (width - gridWidth) / 2
  for (let row = 0; row < figure.rows; row += 1) {
    for (let column = 0; column < figure.columns; column += 1) doc.circle(left + column * spacing, y + 8 + row * spacing, 3.2).fillColor(INK).fill()
  }
  const bottom = y + 8 + figure.rows * spacing
  if (figure.total === undefined) return bottom - y
  doc.moveTo(left - 10, bottom + 4).lineTo(left - 10, bottom + 8).lineTo(left + gridWidth + 10, bottom + 8).lineTo(left + gridWidth + 10, bottom + 4).strokeColor(INK).lineWidth(1).stroke()
  labelOrBox(doc, figure.total, left - 10, bottom + 10, gridWidth + 20)
  return bottom - y + 26
}

type PlaneShape = Extract<Figure, { kind: 'plane' }>['items'][number]['shape']
type SolidShape = Extract<Figure, { kind: 'solid' }>['items'][number]['shape']

/** Small line-art plane figures for a recognition row. */
function drawPlaneShape(doc: Doc, shape: PlaneShape, cx: number, cy: number) {
  doc.strokeColor(INK).lineWidth(1.2)
  if (shape === 'circle') doc.circle(cx, cy, 8)
  else if (shape === 'square') doc.rect(cx - 7, cy - 7, 14, 14)
  else if (shape === 'rectangle') doc.rect(cx - 11, cy - 6, 22, 12)
  else if (shape === 'triangle') doc.polygon([cx, cy - 8], [cx + 8, cy + 7], [cx - 8, cy + 7])
  else if (shape === 'quadrilateral') doc.polygon([cx - 11, cy + 3], [cx - 5, cy - 8], [cx + 9, cy - 6], [cx + 10, cy + 6])
  else doc.ellipse(cx, cy, 10, 7)
  doc.stroke()
}

/** Small line-art solid figures for a recognition row. */
function drawSolidShape(doc: Doc, shape: SolidShape, cx: number, cy: number) {
  doc.strokeColor(INK).lineWidth(1.2)
  if (shape === 'cube') {
    doc.rect(cx - 8, cy - 6, 15, 15)
    doc.polygon([cx - 8, cy - 6], [cx - 2, cy - 12], [cx + 13, cy - 12], [cx + 7, cy - 6])
    doc.polygon([cx + 7, cy - 6], [cx + 13, cy - 12], [cx + 13, cy + 3], [cx + 7, cy + 9])
  } else if (shape === 'cuboid') {
    doc.rect(cx - 11, cy - 4, 22, 12)
    doc.polygon([cx - 11, cy - 4], [cx - 5, cy - 10], [cx + 17, cy - 10], [cx + 11, cy - 4])
    doc.polygon([cx + 11, cy - 4], [cx + 17, cy - 10], [cx + 17, cy + 2], [cx + 11, cy + 8])
  } else if (shape === 'cylinder') {
    doc.ellipse(cx, cy - 8, 8, 3)
    doc.moveTo(cx - 8, cy - 8).lineTo(cx - 8, cy + 8)
    doc.moveTo(cx + 8, cy - 8).lineTo(cx + 8, cy + 8)
    doc.moveTo(cx - 8, cy + 8).quadraticCurveTo(cx, cy + 14, cx + 8, cy + 8)
  } else {
    doc.circle(cx, cy, 9)
    doc.ellipse(cx, cy, 9, 3)
  }
  doc.stroke()
}

/** One row of mixed plane or solid figures, with optional mark boxes under each group. */
function drawFigureRow(doc: Doc, figure: Extract<Figure, { kind: 'plane' | 'solid' }>, solid: boolean, x: number, y: number, width: number): number {
  const pitch = 26
  const gap = 22
  const total = figure.items.reduce((sum, item) => sum + item.count, 0)
  let cursor = x + (width - (total * pitch + (figure.items.length - 1) * gap)) / 2
  for (const item of figure.items) {
    const groupLeft = cursor
    for (let index = 0; index < item.count; index += 1) {
      if (solid) drawSolidShape(doc, item.shape as SolidShape, cursor + 13, y + 20)
      else drawPlaneShape(doc, item.shape as PlaneShape, cursor + 13, y + 20)
      cursor += pitch
    }
    if (figure.mark === 'yes') doc.rect(groupLeft + (item.count * pitch - 26) / 2, y + 40, 26, 14).strokeColor(FAINT).lineWidth(1).stroke()
    cursor += gap
  }
  return figure.mark === 'yes' ? 56 : 40
}

/** An abacus-style counter with beads on the hundreds, tens and ones rods. */
function drawCounter(doc: Doc, figure: Extract<Figure, { kind: 'counter' }>, x: number, y: number, width: number): number {
  const rods: [string, number][] = [['百位', figure.hundreds], ['十位', figure.tens], ['个位', figure.ones]]
  const spacing = 76
  const left = x + (width - spacing * 3) / 2
  const baseY = y + 116
  doc.rect(left, baseY, spacing * 3, 14).strokeColor(INK).lineWidth(1.2).stroke()
  for (const [index, entry] of rods.entries()) {
    const [name, beads] = entry
    const cx = left + spacing / 2 + index * spacing
    doc.moveTo(cx, baseY).lineTo(cx, baseY - 110).strokeColor(INK).lineWidth(1.2).stroke()
    for (let bead = 0; bead < beads; bead += 1) doc.circle(cx, baseY - 9 - bead * 12, 5.6).strokeColor(INK).lineWidth(1.2).stroke()
    doc.fillColor(INK).fontSize(10).text(name, cx - 22, baseY + 18, { width: 44, align: 'center', lineBreak: false })
  }
  return 150
}

/** A centimetre ruler with bars measured from zero, or plain bars for length comparison. */
function drawMeasure(doc: Doc, figure: Extract<Figure, { kind: 'measure' }>, x: number, y: number, width: number): number {
  const showRuler = figure.ruler === 'yes'
  const unit = Math.min(28, (width - 60) / 15)
  const rulerLeft = x + (width - unit * 15) / 2
  figure.bars.forEach((bar, index) => {
    const barY = y + index * 22 + 8
    const barLeft = showRuler ? rulerLeft : x + 16
    const barLength = showRuler ? bar.length * unit : Math.min(bar.length * 16, width - 32)
    if (bar.name !== '') doc.fillColor(INK).fontSize(10).text(bar.name, barLeft, barY - 13, { width: Math.max(barLength, 60), align: 'center', lineBreak: false })
    if (bar.style === 'curved') {
      let cursor = barLeft
      let up = true
      doc.moveTo(barLeft, barY)
      while (cursor < barLeft + barLength - 0.5) {
        const next = Math.min(cursor + 18, barLeft + barLength)
        doc.quadraticCurveTo((cursor + next) / 2, barY + (up ? -6 : 6), next, barY)
        cursor = next
        up = !up
      }
      doc.strokeColor(INK).lineWidth(1.4).stroke()
    } else {
      doc.moveTo(barLeft, barY).lineTo(barLeft + barLength, barY).strokeColor(INK).lineWidth(2.4).stroke()
    }
  })
  if (!showRuler) return figure.bars.length * 22 + 8
  const rulerTop = y + figure.bars.length * 22 + 6
  doc.rect(rulerLeft, rulerTop, unit * 15, 26).strokeColor(INK).lineWidth(1).stroke()
  for (let cm = 0; cm <= 15; cm += 1) {
    const tickX = rulerLeft + cm * unit
    doc.moveTo(tickX, rulerTop).lineTo(tickX, rulerTop + 8).strokeColor(INK).lineWidth(1).stroke()
    doc.fillColor(INK).fontSize(8).text(String(cm), tickX - 8, rulerTop + 10, { width: 16, align: 'center', lineBreak: false })
  }
  return figure.bars.length * 22 + 40
}

/** A direction cross; blank mode prints four write-in boxes instead of the four characters. */
function drawCompass(doc: Doc, figure: Extract<Figure, { kind: 'compass' }>, x: number, y: number, width: number): number {
  const cx = x + width / 2
  const cy = y + 78
  const reach = 52
  const arrow = (tx: number, ty: number, dx: number, dy: number) => doc.polygon([tx, ty], [tx - dx * 9 + dy * 4, ty - dy * 9 - dx * 4], [tx - dx * 9 - dy * 4, ty - dy * 9 + dx * 4]).fillColor(INK).fill()
  doc.moveTo(cx, cy - reach).lineTo(cx, cy + reach).strokeColor(INK).lineWidth(1.2).stroke()
  doc.moveTo(cx - reach, cy).lineTo(cx + reach, cy).strokeColor(INK).lineWidth(1.2).stroke()
  arrow(cx, cy - reach, 0, -1)
  arrow(cx, cy + reach, 0, 1)
  arrow(cx - reach, cy, -1, 0)
  arrow(cx + reach, cy, 1, 0)
  const blank = figure.blank === 'yes'
  labelOrBox(doc, blank ? '' : '北', cx - 16, cy - reach - 22, 32)
  labelOrBox(doc, blank ? '' : '南', cx - 16, cy + reach + 8, 32)
  labelOrBox(doc, blank ? '' : '西', cx - reach - 34, cy - 9, 28)
  labelOrBox(doc, blank ? '' : '东', cx + reach + 6, cy - 9, 28)
  return 160
}

/** A balance scale tilting to the heavier side, with one label per pan. */
function drawBalance(doc: Doc, figure: Extract<Figure, { kind: 'balance' }>, x: number, y: number, width: number): number {
  const cx = x + width / 2
  const beamY = y + 26
  const reach = 78
  const drop = figure.tilt === 'left' ? 17 : figure.tilt === 'right' ? -17 : 0
  const leftEnd = { x: cx - reach, y: beamY + drop }
  const rightEnd = { x: cx + reach, y: beamY - drop }
  const baseY = y + 94
  doc.moveTo(cx, beamY).lineTo(cx, baseY).strokeColor(INK).lineWidth(1.4).stroke()
  doc.moveTo(cx - 40, baseY).lineTo(cx + 40, baseY).strokeColor(INK).lineWidth(2.4).stroke()
  doc.moveTo(leftEnd.x, leftEnd.y).lineTo(rightEnd.x, rightEnd.y).strokeColor(INK).lineWidth(1.2).stroke()
  for (const end of [leftEnd, rightEnd]) {
    const panY = end.y + 26
    doc.moveTo(end.x, end.y).lineTo(end.x, panY).strokeColor(INK).lineWidth(1).stroke()
    doc.moveTo(end.x - 30, panY).quadraticCurveTo(end.x, panY + 14, end.x + 30, panY).strokeColor(INK).lineWidth(1.2).stroke()
  }
  if (figure.left !== '') labelOrBox(doc, figure.left, leftEnd.x - 34, leftEnd.y + 10, 68)
  if (figure.right !== '') labelOrBox(doc, figure.right, rightEnd.x - 34, rightEnd.y + 10, 68)
  return 116
}

/** Writing grids: tianzige squares with dashed guides, or a four-line letter band. */
function drawWriting(doc: Doc, figure: Extract<Figure, { kind: 'writing' }>, x: number, y: number, width: number): number {
  if (figure.style === 'fourline') {
    const left = x + 16
    const right = x + width - 16
    for (let line = 0; line < 4; line += 1) {
      const lineY = y + 8 + line * 9
      doc.moveTo(left, lineY).lineTo(right, lineY).strokeColor(line === 2 ? INK : FAINT).lineWidth(line === 2 ? 1.2 : 0.8).stroke()
    }
    if (figure.example !== undefined && figure.example !== '') doc.fillColor(FAINT).fontSize(22).text(figure.example, left + 6, y + 6, { lineBreak: false })
    return 44
  }
  const count = figure.count ?? 4
  const size = 36
  const gap = 8
  const left = x + (width - (count * size + (count - 1) * gap)) / 2
  for (let index = 0; index < count; index += 1) {
    const cellLeft = left + index * (size + gap)
    doc.rect(cellLeft, y + 4, size, size).strokeColor(INK).lineWidth(1).stroke()
    doc.dash(2, { space: 2 })
    doc.moveTo(cellLeft + size / 2, y + 4).lineTo(cellLeft + size / 2, y + 4 + size).strokeColor(FAINT).lineWidth(0.8).stroke()
    doc.moveTo(cellLeft, y + 4 + size / 2).lineTo(cellLeft + size, y + 4 + size / 2).strokeColor(FAINT).lineWidth(0.8).stroke()
    doc.undash()
    if (index === 0 && figure.example !== undefined && figure.example !== '') doc.fillColor(FAINT).fontSize(26).text(figure.example, cellLeft, y + 10, { width: size, align: 'center', lineBreak: false })
  }
  return 52
}

/** Freehand fallback: bounded primitives drawn inside a declared canvas height. */
function drawSketch(doc: Doc, figure: Extract<Figure, { kind: 'sketch' }>, x: number, y: number): number {
  const px = (value: number) => x + value
  const py = (value: number) => y + value
  for (const element of figure.elements) {
    if (element.draw === 'line') doc.moveTo(px(element.from.x), py(element.from.y)).lineTo(px(element.to.x), py(element.to.y)).strokeColor(INK).lineWidth(1.2).stroke()
    else if (element.draw === 'arrow') {
      doc.moveTo(px(element.from.x), py(element.from.y)).lineTo(px(element.to.x), py(element.to.y)).strokeColor(INK).lineWidth(1.2).stroke()
      const angle = Math.atan2(element.to.y - element.from.y, element.to.x - element.from.x)
      doc.polygon([px(element.to.x), py(element.to.y)],
        [px(element.to.x) - 8 * Math.cos(angle - 0.4), py(element.to.y) - 8 * Math.sin(angle - 0.4)],
        [px(element.to.x) - 8 * Math.cos(angle + 0.4), py(element.to.y) - 8 * Math.sin(angle + 0.4)]).fillColor(INK).fill()
    } else if (element.draw === 'polyline') {
      const [first, ...rest] = element.points
      if (first === undefined) continue
      doc.moveTo(px(first.x), py(first.y))
      for (const point of rest) doc.lineTo(px(point.x), py(point.y))
      if (element.closed === 'yes') doc.closePath()
      doc.strokeColor(INK).lineWidth(1.2).stroke()
    } else if (element.draw === 'rect') doc.rect(px(element.x), py(element.y), element.width, element.height).strokeColor(INK).lineWidth(1.2).stroke()
    else if (element.draw === 'circle') doc.circle(px(element.x), py(element.y), element.radius).strokeColor(INK).lineWidth(1.2).stroke()
    else if (element.align === 'center') doc.fillColor(INK).fontSize(11).text(element.label, px(element.x) - 50, py(element.y), { width: 100, align: 'center', lineBreak: false })
    else doc.fillColor(INK).fontSize(11).text(element.label, px(element.x), py(element.y), { lineBreak: false })
  }
  return figure.height + 8
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
    case 'overlap': return drawOverlap(doc, figure, x, y, width)
    case 'split': return drawSplit(doc, figure, x, y, width)
    case 'sequence': return drawSequence(doc, figure, x, y)
    case 'wall': return drawWall(doc, figure, x, y, width)
    case 'grid': return drawGrid(doc, figure, x, y, width)
    case 'dot-array': return drawDotArray(doc, figure, x, y, width)
    case 'plane': return drawFigureRow(doc, figure, false, x, y, width)
    case 'solid': return drawFigureRow(doc, figure, true, x, y, width)
    case 'counter': return drawCounter(doc, figure, x, y, width)
    case 'measure': return drawMeasure(doc, figure, x, y, width)
    case 'compass': return drawCompass(doc, figure, x, y, width)
    case 'balance': return drawBalance(doc, figure, x, y, width)
    case 'writing': return drawWriting(doc, figure, x, y, width)
    case 'sketch': return drawSketch(doc, figure, x, y)
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
