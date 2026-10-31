import { expect, it } from 'vitest'
import {
  EDITABLE_EXTENSIONS,
  classifyWriterPath,
  isEditableWriterName,
  isEditableWriterPath,
} from '../src/editable.ts'
import {
  DIRECTORY_PAGE_SIZE,
  buildLoadedChildren,
  compareWriterNames,
  defaultWriterTreeExpanded,
  entryToTreeNode,
  findProjectRoots,
  listLibraryRoots,
  pageDirectoryEntries,
  rootToDirectoryNode,
  scanWriterWorkspace,
  shouldIgnoreDirectory,
  visibleDirectoryEntries,
  type DirEntry,
} from '../src/client/library.ts'

function dirTree(map: Record<string, DirEntry[]>): (path: string) => Promise<readonly DirEntry[]> {
  return async (path) => {
    const entries = map[path]
    if (entries === undefined) throw new Error(`missing ${path || '.'}`)
    return entries
  }
}

it('classifies book markers and gates saves by editable extension', () => {
  expect(classifyWriterPath('novel/设定/世界观.md')).toBe('setting')
  expect(classifyWriterPath('小节大纲.md')).toBe('outline')
  expect(classifyWriterPath('novel/正文/第001章.md')).toBe('chapter')
  expect(isEditableWriterPath('../secret.md')).toBe(false)
  expect(isEditableWriterPath('/tmp/正文.md')).toBe(false)
  expect(isEditableWriterPath('novel/notes.md')).toBe(true)
  expect(isEditableWriterPath('novel/meta.json')).toBe(true)
  expect(isEditableWriterPath('novel/config.yaml')).toBe(true)
  expect(isEditableWriterPath('novel/bin.png')).toBe(false)
  expect([...EDITABLE_EXTENSIONS].sort()).toEqual(['.json', '.md', '.toml', '.txt', '.yaml', '.yml'])
  expect(isEditableWriterName('roles.toml')).toBe(true)
  expect(isEditableWriterName('image.PNG')).toBe(false)
})

it('discovers 拆文库 books and legacy 拆文库- roots', async () => {
  const readDir = dirTree({
    '': [
      { name: '拆文库', type: 'directory' },
      { name: '拆文库-旧书', type: 'directory' },
      { name: 'other', type: 'directory' },
    ],
    拆文库: [
      { name: '新书', type: 'directory' },
      { name: '.git', type: 'directory' },
    ],
  })
  const { roots } = await listLibraryRoots(readDir)
  expect(roots.map(root => root.path)).toEqual(['拆文库-旧书', '拆文库/新书'])
})

it('finds long and short writing projects and skips library paths', async () => {
  const readDir = dirTree({
    '': [
      { name: '拆文库', type: 'directory' },
      { name: 'novel', type: 'directory' },
      { name: 'short', type: 'directory' },
      { name: 'nested', type: 'directory' },
      { name: 'node_modules', type: 'directory' },
    ],
    拆文库: [{ name: '样本', type: 'directory' }],
    '拆文库/样本': [
      { name: '正文', type: 'directory' },
      { name: '设定', type: 'directory' },
    ],
    novel: [
      { name: '正文', type: 'directory' },
      { name: '大纲', type: 'directory' },
      { name: '设定', type: 'directory' },
    ],
    short: [
      { name: '正文.md', type: 'file' },
      { name: '小节大纲.md', type: 'file' },
    ],
    nested: [{ name: 'deep', type: 'directory' }],
    'nested/deep': [{ name: 'book', type: 'directory' }],
    'nested/deep/book': [
      { name: '正文', type: 'directory' },
      { name: '追踪', type: 'directory' },
    ],
    node_modules: [
      { name: '正文', type: 'directory' },
      { name: '设定', type: 'directory' },
    ],
  })
  const scan = await scanWriterWorkspace(readDir)
  expect(scan.libraries.map(root => root.path)).toEqual(['拆文库/样本'])
  expect(scan.projects.map(root => root.path)).toEqual(['nested/deep/book', 'novel', 'short'])
  const onlyLibraries = await findProjectRoots(readDir, ['拆文库/样本'])
  expect(onlyLibraries.map(root => root.path).sort()).toEqual(['nested/deep/book', 'novel', 'short'].sort())
})

it('ignores dashboard-hidden directories and pages listings at 200', () => {
  expect(shouldIgnoreDirectory('.git')).toBe(true)
  expect(shouldIgnoreDirectory('.agents')).toBe(true)
  expect(shouldIgnoreDirectory('node_modules')).toBe(true)
  expect(shouldIgnoreDirectory('.story')).toBe(false)
  expect(shouldIgnoreDirectory('正文')).toBe(false)

  const entries: DirEntry[] = [
    { name: '.git', type: 'directory' },
    { name: '正文', type: 'directory' },
    { name: 'notes.md', type: 'file' },
    { name: 'skip.bin', type: 'file' },
    { name: 'readme.txt', type: 'file' },
  ]
  const visible = visibleDirectoryEntries(entries)
  expect(visible.map(entry => entry.name)).toEqual(['正文', 'notes.md', 'readme.txt', 'skip.bin'])

  const many = Array.from({ length: 250 }, (_, index) => ({
    name: `f${String(index).padStart(3, '0')}.md`,
    type: 'file' as const,
  }))
  const page = pageDirectoryEntries(many, 0)
  expect(page.entries).toHaveLength(DIRECTORY_PAGE_SIZE)
  expect(page.nextOffset).toBe(200)
  expect(pageDirectoryEntries(many, 200).nextOffset).toBeNull()

  const built = buildLoadedChildren('novel', many, DIRECTORY_PAGE_SIZE, true)
  expect(built.children).toHaveLength(200)
  expect(built.shown).toBe(200)
  expect(built.truncated).toBe(true)
  expect(entryToTreeNode('novel', { name: 'skip.bin', type: 'file', size: 10 }).kind).toBe('file')
  if (entryToTreeNode('novel', { name: 'skip.bin', type: 'file', size: 10 }).kind === 'file') {
    expect(entryToTreeNode('novel', { name: 'skip.bin', type: 'file', size: 10 }).editable).toBe(false)
  }
  expect(entryToTreeNode('novel', { name: 'big.md', type: 'file', size: 3 * 1024 * 1024 }).kind).toBe('file')
  const big = entryToTreeNode('novel', { name: 'big.md', type: 'file', size: 3 * 1024 * 1024 })
  expect(big.kind === 'file' && big.editable).toBe(false)
})

it('sorts names naturally and builds lazy root shells', () => {
  expect([...['第010章.md', '第2章.md', '第001章.md']].sort(compareWriterNames)).toEqual([
    '第001章.md',
    '第2章.md',
    '第010章.md',
  ])
  const node = rootToDirectoryNode({ path: 'novel', name: 'novel', view: 'projects' })
  expect(node).toMatchObject({ kind: 'directory', path: 'novel', loaded: false, shown: 0 })
  expect(defaultWriterTreeExpanded('novel', undefined)).toBe(false)
  expect(defaultWriterTreeExpanded('novel', 'novel/正文/第001章.md')).toBe(true)
  expect(defaultWriterTreeExpanded('other', 'novel/正文/第001章.md')).toBe(false)
})
