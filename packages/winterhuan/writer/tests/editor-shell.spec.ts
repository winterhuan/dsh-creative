/** Editor-shell helpers for breadcrumbs, bytes, and loaded file counts. */
import { expect, it } from 'vitest'
import {
  breadcrumbSegments,
  countLoadedFiles,
  editorByteSize,
  fileExtensionLabel,
  formatBytes,
  loadedFilesLabel,
} from '../src/client/editor-shell.ts'
import type { WriterTreeNode } from '../src/client/library.ts'

it('formats bytes like Dashboard', () => {
  expect(formatBytes(0)).toBe('0 B')
  expect(formatBytes(1023)).toBe('1023 B')
  expect(formatBytes(1536)).toBe('1.5 KiB')
  expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MiB')
})

it('measures UTF-8 bytes with the file EOL', () => {
  expect(editorByteSize('a\nb', '\n')).toBe(3)
  expect(editorByteSize('a\nb', '\r\n')).toBe(4)
})

it('labels extensions and breadcrumb parts', () => {
  expect(fileExtensionLabel('novel/正文/第001章.md')).toBe('MD')
  expect(fileExtensionLabel('notes')).toBe('')
  expect(breadcrumbSegments('novel/设定/世界观.md')).toEqual(['novel', '设定', '世界观.md'])
  expect(breadcrumbSegments('')).toEqual([])
})

it('counts loaded files across lazy trees and formats the masthead label', () => {
  const nodes: WriterTreeNode[] = [
    {
      kind: 'directory',
      name: 'novel',
      path: 'novel',
      loaded: true,
      loading: false,
      shown: 2,
      truncated: false,
      children: [
        { kind: 'file', name: 'a.md', path: 'novel/a.md', editable: true },
        {
          kind: 'directory',
          name: '正文',
          path: 'novel/正文',
          loaded: true,
          loading: false,
          shown: 1,
          truncated: false,
          children: [
            { kind: 'file', name: 'b.md', path: 'novel/正文/b.md', editable: true },
          ],
        },
      ],
    },
  ]
  expect(countLoadedFiles(nodes)).toBe(2)
  expect(countLoadedFiles([])).toBe(0)
  expect(loadedFilesLabel(0, '按需', '{n}+')).toBe('按需')
  expect(loadedFilesLabel(2, '按需', '{n}+')).toBe('2+')
})
