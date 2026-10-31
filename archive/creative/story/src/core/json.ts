/**
 * JSON serialization that matches Python's `json.dumps(..., ensure_ascii=False)`
 * for the separator styles the runtime used, so byte budgets, digests and
 * stored files stay identical across the migration.
 */

/** Separator style: Python defaults (`, ` and `: `), compact (`,` and `:`), or two-space indent. */
export type PythonJsonStyle = 'default' | 'compact' | 'indent2'

function render(value: unknown, style: PythonJsonStyle, sortKeys: boolean, depth: number): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  const itemSeparator = style === 'compact' ? ',' : style === 'default' ? ', ' : `,\n${'  '.repeat(depth + 1)}`
  const keySeparator = style === 'compact' ? ':' : ': '
  const open = (bracket: string): string => style === 'indent2' ? `${bracket}\n${'  '.repeat(depth + 1)}` : bracket
  const close = (bracket: string): string => style === 'indent2' ? `\n${'  '.repeat(depth)}${bracket}` : bracket
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `${open('[')}${value.map(item => render(item, style, sortKeys, depth + 1)).join(itemSeparator)}${close(']')}`
  }
  const record = value as Readonly<Record<string, unknown>>
  const keys = sortKeys ? Object.keys(record).sort() : Object.keys(record)
  if (keys.length === 0) return '{}'
  return `${open('{')}${keys.map(key => `${JSON.stringify(key)}${keySeparator}${render(record[key], style, sortKeys, depth + 1)}`).join(itemSeparator)}${close('}')}`
}

/**
 * Serialize in one of Python's separator styles; no trailing newline.
 * @param value - the JSON value.
 * @param style - the separator style.
 * @param sortKeys - sort object keys (`sort_keys=True`); insertion order otherwise.
 * @returns the JSON text.
 */
export function pythonJson(value: unknown, style: PythonJsonStyle, sortKeys = true): string {
  return render(value, style, sortKeys, 0)
}
