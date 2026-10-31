import { expect, it } from 'vitest'
import { classifyWriterPath, isEditableWriterPath } from '../src/editable.ts'
import { collectBookFiles, findBooks, type DirEntry } from '../src/client/library.ts'

const tree: Record<string, DirEntry[]> = {
  '': [
    { name: 'novel', type: 'directory' },
    { name: 'node_modules', type: 'directory' },
    { name: 'notes.md', type: 'file' },
  ],
  novel: [
    { name: '设定', type: 'directory' },
    { name: '大纲.md', type: 'file' },
    { name: '正文', type: 'directory' },
  ],
  'novel/设定': [
    { name: '世界观.md', type: 'file' },
    { name: '角色', type: 'directory' },
  ],
  'novel/设定/角色': [{ name: '甲.md', type: 'file' }],
  'novel/正文': [
    { name: '第001章.md', type: 'file' },
    { name: '第一卷', type: 'directory' },
  ],
  'novel/正文/第一卷': [{ name: '第002章.md', type: 'file' }],
  node_modules: [{ name: '正文.md', type: 'file' }],
}

it('classifies setting, outline, and chapter paths and rejects escapes', () => {
  expect(classifyWriterPath('novel/设定/世界观.md')).toBe('setting')
  expect(classifyWriterPath('novel/设定/角色/甲.md')).toBe('setting')
  expect(classifyWriterPath('小节大纲.md')).toBe('outline')
  expect(classifyWriterPath('novel/大纲.md')).toBe('outline')
  expect(classifyWriterPath('novel/正文/第001章.md')).toBe('chapter')
  expect(classifyWriterPath('novel/正文/第一卷/第002章.md')).toBe('chapter')
  expect(isEditableWriterPath('../secret.md')).toBe(false)
  expect(isEditableWriterPath('/tmp/正文.md')).toBe(false)
  expect(isEditableWriterPath('novel/notes.md')).toBe(false)
})

it('finds a book and lists its editable files without walking node_modules', async () => {
  const readDir = async (path: string) => {
    const entries = tree[path]
    if (entries === undefined) throw new Error(`missing ${path}`)
    return entries
  }
  expect(await findBooks(readDir)).toEqual(['novel'])
  const files = await collectBookFiles(readDir, 'novel')
  expect(files.map(file => file.path)).toEqual([
    'novel/大纲.md',
    'novel/设定/世界观.md',
    'novel/设定/角色/甲.md',
    'novel/正文/第001章.md',
    'novel/正文/第一卷/第002章.md',
  ])
})
