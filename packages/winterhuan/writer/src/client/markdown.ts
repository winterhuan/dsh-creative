/** Safe Markdown → HTML for the writing preview (Dashboard-aligned, no deps). */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function inlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/gu, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/gu, '<strong>$1</strong>')
    .replace(/__([^_]+)__/gu, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu, '<em>$1</em>')
}

/**
 * Convert Markdown to escaped HTML suitable for `dangerouslySetInnerHTML`.
 * Mirrors oh-story Dashboard `markdownToSafeHtml` (headings, lists, code, hr, quote).
 * @param markdown - editor text (LF).
 * @returns HTML string with no unescaped user markup.
 */
export function markdownToSafeHtml(markdown: string): string {
  const lines = escapeHtml(markdown).replaceAll('\r\n', '\n').split('\n')
  const output: string[] = []
  let inCode = false
  const codeLines: string[] = []
  let codeStartLine = 1
  let listType: 'ul' | 'ol' | null = null

  const closeList = (): void => {
    if (listType !== null) output.push(`</${listType}>`)
    listType = null
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const lineNum = i + 1
    if (line.trim().startsWith('```')) {
      closeList()
      if (inCode) {
        output.push(`<div class="writer-preview-code" data-line="${String(codeStartLine)}"><pre><code>${codeLines.join('\n')}</code></pre></div>`)
        codeLines.length = 0
      } else {
        codeStartLine = lineNum
      }
      inCode = !inCode
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }

    const heading = /^(#{1,4})\s+(.+)$/u.exec(line)
    const unordered = /^\s*[-*+]\s+(.+)$/u.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.+)$/u.exec(line)
    if (heading !== null) {
      closeList()
      const level = heading[1]?.length ?? 1
      output.push(`<h${String(level)} data-line="${String(lineNum)}">${inlineMarkdown(heading[2] ?? '')}</h${String(level)}>`)
    } else if (unordered !== null || ordered !== null) {
      const nextType = unordered !== null ? 'ul' : 'ol'
      if (listType !== nextType) {
        closeList()
        listType = nextType
        output.push(`<${listType}>`)
      }
      const body = (unordered ?? ordered)?.[1] ?? ''
      output.push(`<li data-line="${String(lineNum)}">${inlineMarkdown(body)}</li>`)
    } else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/u.test(line)) {
      closeList()
      output.push(`<hr data-line="${String(lineNum)}">`)
    } else if (line.startsWith('&gt; ')) {
      closeList()
      output.push(`<blockquote data-line="${String(lineNum)}">${inlineMarkdown(line.slice(5))}</blockquote>`)
    } else if (line.trim() !== '') {
      closeList()
      output.push(`<p data-line="${String(lineNum)}">${inlineMarkdown(line)}</p>`)
    } else {
      closeList()
    }
  }
  if (inCode) {
    output.push(`<div class="writer-preview-code" data-line="${String(codeStartLine)}"><pre><code>${codeLines.join('\n')}</code></pre></div>`)
  }
  closeList()
  return output.join('')
}
