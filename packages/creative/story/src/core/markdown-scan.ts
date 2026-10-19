/**
 * Small Markdown readers shared by the fact, plan, rhythm, cast and reference checks.
 *
 * These readers accept the headings and tables those checks document. They do
 * not write, and a missing heading is absence rather than a failure.
 */
export interface TextLine {
  readonly number: number
  readonly text: string
}

export interface TableScan {
  readonly headers: readonly string[]
  readonly rows: readonly { readonly cells: readonly string[]; readonly line: number }[]
}

/** Split text into 1-based lines without trailing CR. */
export function textLines(text: string): TextLine[] {
  return text.split(/\n/u).map((part, index) => ({ number: index + 1, text: part.replace(/\r$/u, '') }))
}

/** Drop bold markers. */
export function stripMarks(value: string): string {
  return value.replace(/\*\*/gu, '').trim()
}

/** An ATX heading, or `undefined` when the line is not one. */
export function markdownHeading(line: string): { level: number; text: string } | undefined {
  const matched = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line.trim())
  if (matched?.[1] === undefined || matched[2] === undefined) return undefined
  return { level: matched[1].length, text: stripMarks(matched[2]) }
}

/**
 * Content lines under the first heading whose text equals `heading`.
 * @returns indexes `[start, end)` into `lines`, excluding the heading itself.
 */
export function sectionRange(lines: readonly TextLine[], heading: string): { start: number; end: number; line: number } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const title = markdownHeading(lines[index]?.text ?? '')
    if (title?.text !== heading) continue
    let end = lines.length
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = markdownHeading(lines[cursor]?.text ?? '')
      if (next !== undefined && next.level <= title.level) {
        end = cursor
        break
      }
    }
    return { start: index + 1, end, line: lines[index]?.number ?? index + 1 }
  }
  return undefined
}

/** The first `name：value` field in a line window. */
export function fieldValue(lines: readonly TextLine[], name: string, start = 0, end = lines.length): { value: string; line: number } | undefined {
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*[:：]\\s*(.*)$`, 'u')
  for (const line of lines.slice(start, end)) {
    const text = stripMarks(line.text.trim().replace(/^[-*+]\s+/u, ''))
    const matched = pattern.exec(text)
    const value = matched?.[1]?.trim()
    if (value === undefined) continue
    return { value, line: line.number }
  }
  return undefined
}

/** The first GitHub-style table in a line window. */
export function firstTable(lines: readonly TextLine[], start = 0, end = lines.length): TableScan | undefined {
  for (let index = start; index < end; index += 1) {
    const header = lines[index]
    const separator = lines[index + 1]
    if (header === undefined || separator === undefined || !header.text.includes('|')) continue
    if (!/^\s*\|?\s*:?-{3,}/u.test(separator.text)) continue
    const rows: { cells: string[]; line: number }[] = []
    for (let row = index + 2; row < end; row += 1) {
      const line = lines[row]
      if (line === undefined || !line.text.trim().startsWith('|')) break
      rows.push({ cells: cellsOf(line.text), line: line.number })
    }
    return { headers: cellsOf(header.text), rows }
  }
  return undefined
}

/** Numbered list items `1. text` or `1、text` inside a window. */
export function numberedItems(lines: readonly TextLine[], start: number, end: number): { number: number; text: string; line: number }[] {
  const items: { number: number; text: string; line: number }[] = []
  for (const line of lines.slice(start, end)) {
    const matched = /^\s*(\d+)\s*[、.．]\s+(.+)$/u.exec(line.text)
    const text = matched?.[2]
    if (matched?.[1] === undefined || text === undefined || text.trim() === '') continue
    items.push({ number: Number(matched[1]), text: stripMarks(text), line: line.number })
  }
  return items
}

function cellsOf(line: string): string[] {
  return line.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|').map(cell => stripMarks(cell))
}
