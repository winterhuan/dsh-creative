import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import type { StudyState } from './schema.ts'

const font = fileURLToPath(new URL('../knowledge/fonts/NotoSansSC.ttf', import.meta.url))
const subjectName = { chinese: '语文', math: '数学', english: '英语' }

/** Render the frozen questions only; answers and evidence stay in the saved worksheet record. */
export async function renderWorksheet(state: StudyState, worksheetId: string): Promise<Buffer> {
  const worksheet = state.worksheets.find(item => item.id === worksheetId)
  if (!worksheet) throw new Error('练习单不存在。')
  const objective = state.objectives.find(item => item.id === worksheet.objectiveId)
  if (!objective) throw new Error('练习单学习目标不存在。')
  const doc = new PDFDocument({ size: 'A4', margin: 48, autoFirstPage: true, info: { Title: `${subjectName[worksheet.subject]}练习单 ${worksheet.id}` } })
  const chunks: Buffer[] = []
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  doc.font(font).fontSize(18).text(`${subjectName[worksheet.subject]}练习单`)
  doc.moveDown(0.3).fontSize(10).text(`编号：${worksheet.id}    学习目标：${objective.title}`)
  doc.moveDown(0.4).text('姓名：____________    日期：____________')
  doc.moveDown(1)
  for (const [index, item] of worksheet.items.entries()) {
    doc.fontSize(12).text(`${index + 1}. ${item.prompt}`, { lineGap: 4 })
    doc.moveDown(0.5)
    for (let line = 0; line < 3; line += 1) {
      if (doc.y > doc.page.height - 72) doc.addPage()
      const y = doc.y + 12
      doc.moveTo(48, y).lineTo(doc.page.width - 48, y).strokeColor('#b9c0c7').stroke()
      doc.y = y + 12
    }
    doc.moveDown(0.8)
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
