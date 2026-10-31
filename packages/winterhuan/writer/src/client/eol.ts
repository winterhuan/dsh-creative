/** EOL helpers so textarea stays LF while disk keeps its style. */

export type WriterEol = '\n' | '\r\n' | '\r'

/**
 * Detect the dominant line ending in file text.
 * @param content - raw file bytes decoded as text.
 * @returns CRLF when it outnumbers LF; else LF when present; else CR; else LF.
 */
export function detectEol(content: string): WriterEol {
  let crlf = 0
  let lf = 0
  let cr = 0
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\r') {
      if (content[index + 1] === '\n') {
        crlf += 1
        index += 1
      } else {
        cr += 1
      }
    } else if (content[index] === '\n') {
      lf += 1
    }
  }
  if (crlf > lf) return '\r\n'
  if (lf > 0) return '\n'
  if (cr > 0) return '\r'
  return '\n'
}

/**
 * Normalize disk text to LF for the editor.
 * @param content - raw text.
 * @returns LF-only text.
 */
export function normalizeEol(content: string): string {
  return content.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

/**
 * Restore the original EOL before writing to disk.
 * @param content - LF editor text.
 * @param eol - style from {@link detectEol}.
 * @returns text ready to save.
 */
export function applyEol(content: string, eol: WriterEol): string {
  return eol === '\n' ? content : content.replaceAll('\n', eol)
}

/**
 * Short label for the status bar.
 * @param eol - detected style.
 * @returns `LF` / `CRLF` / `CR`.
 */
export function eolLabel(eol: WriterEol): string {
  if (eol === '\r\n') return 'CRLF'
  if (eol === '\r') return 'CR'
  return 'LF'
}
