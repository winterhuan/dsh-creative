// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFileTree } from '../src/client/file-tree.ts'
import { FileTreeNodes } from '../src/client/file-tree-view.tsx'

afterEach(cleanup)

const files = [
  { path: '长篇/书甲/正文/第二卷/第10章.md', bytes: 100 },
  { path: '长篇/书甲/正文/第二卷/第2章.md', bytes: 100 },
  { path: '长篇/书乙/正文/第二卷/第2章.md', bytes: 100 },
  { path: '设定.md', bytes: 10 },
]

describe('novel directory tree', () => {
  it('keeps full paths and numeric chapter ordering under nested book folders', () => {
    const tree = buildFileTree(files, '')
    expect(tree[0]).toMatchObject({ kind: 'directory', path: '长篇', fileCount: 3 })
    expect(tree[1]).toMatchObject({ kind: 'file', path: '设定.md', name: '设定.md' })
    const select = vi.fn()
    const view = render(<FileTreeNodes nodes={tree} depth={0} expanded={{}} selected={files[1]!.path} onToggle={vi.fn()} onSelect={select} />)
    const chapters = view.getAllByRole('button').filter(button => button.getAttribute('data-file-path')?.includes('书甲'))
    expect(chapters.map(button => button.textContent)).toEqual(['第2章.md', '第10章.md'])
    fireEvent.click(view.getByRole('button', { name: files[1]!.path }))
    expect(select).toHaveBeenCalledWith(files[1]!.path)
    expect(view.container.querySelector('details[open] summary')?.textContent).toContain('长篇')
  })

  it('allows the selected file folder to stay collapsed after a rerender', () => {
    function Tree() {
      const [expanded, setExpanded] = useState<Record<string, boolean>>({})
      return <FileTreeNodes nodes={buildFileTree(files, '')} depth={0} selected={files[1]!.path} expanded={expanded}
        onToggle={(path, open) => setExpanded(current => ({ ...current, [path]: open }))} onSelect={vi.fn()} />
    }
    const view = render(<Tree />)
    const folder = view.container.querySelector('details')!
    expect(folder.open).toBe(true)
    folder.open = false
    fireEvent(folder, new Event('toggle'))
    view.rerender(<Tree />)
    expect(folder.open).toBe(false)
  })
})
