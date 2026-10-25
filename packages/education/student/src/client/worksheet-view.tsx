import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Dashboard } from '../dashboard.ts'
import { FigureView } from './figure-view.tsx'
import type { Translate } from './locales.ts'

type Worksheet = NonNullable<Dashboard['study']>['worksheets'][number]
type WorksheetItem = Worksheet['items'][number]

const roleNames = { daily: 'sheetDaily', practice: 'sheetPractice', review: 'sheetReview' } as const

/** A sheet's printed role: its saved kind, or the legacy all-sourced-mistakes heuristic. */
function sheetRole(worksheet: Worksheet): keyof typeof roleNames {
  if (worksheet.kind !== undefined) return worksheet.kind
  const sourcedElsewhere = worksheet.items.every(item => item.mistakeId !== undefined
    && worksheet.sources.find(source => source.itemId === item.id)?.mistakeId !== undefined)
  return sourcedElsewhere ? 'review' : 'practice'
}

export function sheetTitle(worksheet: Worksheet, t: Translate): string {
  return `${t(worksheet.subject)}${t(roleNames[sheetRole(worksheet)])}`
}

/** The answer space one printed question leaves: one ruled line, three lines, or a dashed box. */
function AnswerSpace({ space }: { space: NonNullable<WorksheetItem['space']> }) {
  if (space === 'none') return null
  if (space === 'box') return <div className="student-sheet-box" />
  return <div className={`student-sheet-lines student-sheet-${space}`}>
    {Array.from({ length: space === 'line' ? 1 : 3 }, (_, index) => <div key={index} className="student-sheet-rule" />)}
  </div>
}

/** The printable student sheet: title, name and date line, then questions with figures and answer space. Answers stay in the saved record. */
export function WorksheetSheet({ worksheet, t }: { worksheet: Worksheet; t: Translate }) {
  return <div className="student-sheet">
    <h2>{sheetTitle(worksheet, t)}</h2>
    <p className="student-sheet-meta">{t('sheetIdLabel')}：{worksheet.id}{worksheet.objectiveTitle !== '' ? `　${t('sheetGoalLabel')}：${worksheet.objectiveTitle}` : ''}</p>
    <p className="student-sheet-meta">{t('sheetNameDate')}</p>
    {worksheet.items.map((item, index) => <div key={item.id} className="student-sheet-item">
      <p>{index + 1}. {item.prompt}</p>
      {item.figure !== undefined && <FigureView figure={item.figure} t={t} />}
      <AnswerSpace space={item.space ?? (item.figure !== undefined ? 'line' : 'lines')} />
    </div>)}
  </div>
}

/** Preview dialog doubling as the print source: the browser print dialog prints only the sheet. */
export function WorksheetPrint({ worksheet, onClose, t }: { worksheet: Worksheet; onClose: () => void; t: Translate }) {
  const [container] = useState(() => {
    const element = document.createElement('div')
    element.className = 'student-sheet-portal'
    return element
  })
  useEffect(() => {
    document.body.appendChild(container)
    return () => { container.remove() }
  }, [container])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(<div className="student-sheet-backdrop" onClick={onClose}>
    <div className="student-sheet-dialog" role="dialog" aria-modal="true" aria-label={sheetTitle(worksheet, t)} onClick={event => event.stopPropagation()}>
      <div className="student-sheet-toolbar">
        <p className="student-muted">{t('printSheetHelp')}</p>
        <button type="button" className="student-primary" onClick={() => { window.print() }}>{t('printSheet')}</button>
        <button type="button" className="student-quiet" onClick={onClose}>{t('close')}</button>
      </div>
      <div className="student-sheet-scroll"><WorksheetSheet worksheet={worksheet} t={t} /></div>
    </div>
  </div>, container)
}
