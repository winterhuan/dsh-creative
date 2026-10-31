import { expect, it } from 'vitest'
import { markdownToSafeHtml } from '../src/client/markdown.ts'
import { applyEol, detectEol, eolLabel, normalizeEol } from '../src/client/eol.ts'

it('escapes HTML and renders headings, lists, and code', () => {
  const html = markdownToSafeHtml('# Title\n\n- a <b>x</b>\n\n```\ncode <em>\n```\n\n**bold** and *em*')
  expect(html).toContain('<h1 data-line="1">Title</h1>')
  expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  expect(html).toContain('<li data-line="3">')
  expect(html).toContain('<strong>bold</strong>')
  expect(html).toContain('<em>em</em>')
  expect(html).toContain('code &lt;em&gt;')
  expect(html).not.toContain('<b>x</b>')
})

it('detects and restores EOL styles', () => {
  expect(detectEol('a\r\nb\r\n')).toBe('\r\n')
  expect(detectEol('a\nb\n')).toBe('\n')
  expect(detectEol('a\rb\r')).toBe('\r')
  expect(normalizeEol('a\r\nb\rc')).toBe('a\nb\nc')
  expect(applyEol('a\nb', '\r\n')).toBe('a\r\nb')
  expect(eolLabel('\r\n')).toBe('CRLF')
  expect(eolLabel('\n')).toBe('LF')
})
