// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dashboard } from '../src/dashboard.ts'
import { updateStudy } from '../src/learning.ts'
import { en } from '../src/client/locales.ts'
import { sheetTitle, WorksheetPrint, WorksheetSheet } from '../src/client/worksheet-view.tsx'
import { NOW, setup, figureSamples } from './fixtures.ts'

const t = (key: keyof typeof en) => en[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

/** Four sheets covering every figure kind, each with one distinct answer space. */
function sheetDashboards() {
  const base = { objectiveId: 'm2a-o-sub', answer: '略', explanation: '略', answerEvidence: '略' }
  const items = figureSamples.map((figure, index) => ({ ...base, id: `q${index}`, prompt: `第 ${index + 1} 题`, figure }))
  const spaces = ['box', 'lines', 'line', 'none'] as const
  let state = updateStudy(undefined, setup, NOW)
  for (let index = 0; index < 4; index += 1) {
    const figures = items.slice(index * 7, index * 7 + 7)
    state = updateStudy(state, { action: 'worksheet', worksheet: { id: `fig${index + 1}`, subject: 'math', items: [...figures, { ...base, id: `space${index}`, prompt: '写出想法', space: spaces[index] }] } }, NOW)
  }
  return dashboard(state, NOW, { subject: 'math' }).study?.worksheets ?? []
}

describe('worksheet HTML view', () => {
  it('renders every figure kind as SVG with the matching answer space', () => {
    const worksheets = sheetDashboards()
    expect(worksheets).toHaveLength(4)
    const spaces = ['box', 'lines', 'line', 'none'] as const
    for (const worksheet of worksheets) {
      const space = spaces[Number(worksheet.id.replace('fig', '')) - 1]
      const view = render(<WorksheetSheet worksheet={worksheet} t={t} />)
      const sheet = view.container.querySelector('.student-sheet')!
      expect(sheet.querySelector('h2')!.textContent).toBe('Math practice sheet')
      const figures = worksheet.items.filter(item => item.figure !== undefined)
      expect(sheet.querySelectorAll('.student-sheet-item svg')).toHaveLength(figures.length)
      expect(sheet.querySelectorAll('.student-sheet-box')).toHaveLength(space === 'box' ? 1 : 0)
      // A figure item defaults to one ruled line; the explicit space item adds its own space.
      expect(sheet.querySelectorAll('.student-sheet-rule')).toHaveLength(figures.length + (space === 'lines' ? 3 : space === 'line' ? 1 : 0))
    }
  })

  it('names daily and review sheets from their saved kind and the legacy mistake heuristic', () => {
    const [first] = sheetDashboards()
    expect(first).toBeDefined()
    expect(sheetTitle({ ...first, kind: 'daily' }, t)).toBe('Math daily mini sheet')
    expect(sheetTitle({ ...first, kind: 'review' }, t)).toBe('Math review sheet')
    expect(sheetTitle(first, t)).toBe('Math practice sheet')
  })

  it('prints only through the browser dialog and closes from Escape and the backdrop', () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    const [first] = sheetDashboards()
    expect(first).toBeDefined()
    function Probe() {
      const [open, setOpen] = useState(true)
      return open ? <WorksheetPrint worksheet={first!} onClose={() => setOpen(false)} t={t} /> : null
    }
    const view = render(<Probe />)
    const dialog = screen.getByRole('dialog', { name: 'Math practice sheet' })
    expect(document.body.querySelector('.student-sheet-portal')).toBeTruthy()
    expect(within(dialog).getAllByText((_, element) => element?.textContent === en.sheetNameDate)).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: en.printSheet }))
    expect(print).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()
    const again = render(<Probe />)
    fireEvent.click(screen.getByRole('dialog', { name: 'Math practice sheet' }).parentElement!)
    expect(screen.queryByRole('dialog')).toBeNull()
    again.unmount()
    expect(document.body.querySelector('.student-sheet-portal')).toBeNull()
  })
})
