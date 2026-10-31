import { expect, it } from 'vitest'
import { classifyWriterPath, isEditableWriterPath } from '../src/editable.ts'
import {
  buildWriterTree,
  collectBookFiles,
  compareWriterNames,
  defaultWriterTreeExpanded,
  findBooks,
  relativeWithinSection,
  type DirEntry,
  type WriterFile,
} from '../src/client/library.ts'

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
    { name: '第010章.md', type: 'file' },
    { name: '第001章.md', type: 'file' },
    { name: '第2章.md', type: 'file' },
    { name: '第一卷', type: 'directory' },
  ],
  'novel/正文/第一卷': [
    { name: '第002章.md', type: 'file' },
    { name: '番外', type: 'directory' },
  ],
  'novel/正文/第一卷/番外': [{ name: '第003章.md', type: 'file' }],
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
    'novel/正文/第010章.md',
    'novel/正文/第001章.md',
    'novel/正文/第2章.md',
    'novel/正文/第一卷/第002章.md',
    'novel/正文/第一卷/番外/第003章.md',
  ])
})

it('sorts chapter names with numeric natural order', () => {
  const names = ['第010章.md', '第2章.md', '第001章.md']
  expect([...names].sort(compareWriterNames)).toEqual(['第001章.md', '第2章.md', '第010章.md'])
})

it('builds a sectioned tree with nested folders and natural sibling order', () => {
  const files: WriterFile[] = [
    { path: 'novel/大纲.md', name: '大纲.md', section: 'outline' },
    { path: 'novel/设定/世界观.md', name: '世界观.md', section: 'setting' },
    { path: 'novel/设定/角色/甲.md', name: '甲.md', section: 'setting' },
    { path: 'novel/正文/第010章.md', name: '第010章.md', section: 'chapter' },
    { path: 'novel/正文/第001章.md', name: '第001章.md', section: 'chapter' },
    { path: 'novel/正文/第2章.md', name: '第2章.md', section: 'chapter' },
    { path: 'novel/正文/第一卷/第002章.md', name: '第002章.md', section: 'chapter' },
    { path: 'novel/正文/第一卷/番外/第003章.md', name: '第003章.md', section: 'chapter' },
  ]
  expect(relativeWithinSection('novel/正文/第一卷/番外/第003章.md', 'novel', 'chapter')).toBe('第一卷/番外/第003章.md')
  const nodes = buildWriterTree(files, 'novel', { setting: '设定', outline: '大纲', chapters: '章节' })
  expect(nodes.map(node => node.kind === 'section' ? node.section : node.kind)).toEqual(['setting', 'outline', 'chapter'])
  const chapters = nodes.find(node => node.kind === 'section' && node.section === 'chapter')
  expect(chapters?.kind).toBe('section')
  if (chapters?.kind !== 'section') return
  expect(chapters.children.map(child => child.name)).toEqual(['第一卷', '第001章.md', '第2章.md', '第010章.md'])
  const volume = chapters.children.find(child => child.kind === 'directory' && child.name === '第一卷')
  expect(volume?.kind).toBe('directory')
  if (volume?.kind !== 'directory') return
  expect(volume.children.map(child => child.name)).toEqual(['番外', '第002章.md'])
  const extra = volume.children.find(child => child.kind === 'directory' && child.name === '番外')
  expect(extra?.kind).toBe('directory')
  if (extra?.kind !== 'directory') return
  expect(extra.children).toEqual([{ kind: 'file', name: '第003章.md', path: 'novel/正文/第一卷/番外/第003章.md', section: 'chapter' }])
  expect(defaultWriterTreeExpanded('section:chapter', undefined)).toBe(true)
  expect(defaultWriterTreeExpanded('chapter:第一卷', 'novel/正文/第一卷/第002章.md')).toBe(true)
  expect(defaultWriterTreeExpanded('chapter:第二卷', 'novel/正文/第一卷/第002章.md')).toBe(false)
})
