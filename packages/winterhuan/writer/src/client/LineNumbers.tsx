/** Toggleable line-number gutter synced to the prose textarea (Dashboard-aligned). */
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'

export interface WriterLineNumbersProps {
  readonly text: string
  readonly caret: number
  readonly show: boolean
  readonly textareaRef: RefObject<HTMLTextAreaElement | null>
}

/**
 * Render a scroll-synced gutter with wrap-aware row heights and an active line.
 * @param props - editor text, caret, visibility, and the paired textarea.
 * @returns the gutter, or null when hidden.
 */
export function WriterLineNumbers({
  text,
  caret,
  show,
  textareaRef,
}: WriterLineNumbersProps): ReactNode {
  const gutterRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (!show) return undefined
    const input = textareaRef.current
    const gutter = gutterRef.current
    if (input === null || gutter === null) return undefined

    const ensureMirror = (): HTMLDivElement => {
      if (mirrorRef.current !== null) return mirrorRef.current
      const mirror = document.createElement('div')
      mirror.className = 'writer-line-mirror'
      mirror.setAttribute('aria-hidden', 'true')
      document.body.appendChild(mirror)
      mirrorRef.current = mirror
      return mirror
    }

    const paint = (): void => {
      const live = textareaRef.current
      const liveGutter = gutterRef.current
      if (live === null || liveGutter === null) return
      const style = window.getComputedStyle(live)
      const mirror = ensureMirror()
      mirror.style.fontFamily = style.fontFamily
      mirror.style.fontSize = style.fontSize
      mirror.style.fontWeight = style.fontWeight
      mirror.style.fontStyle = style.fontStyle
      const fontSize = Number.parseFloat(style.fontSize) || 13
      const lineHeightPx = Number.parseFloat(style.lineHeight)
      mirror.style.lineHeight = Number.isFinite(lineHeightPx)
        ? String(lineHeightPx / fontSize)
        : style.lineHeight
      mirror.style.letterSpacing = style.letterSpacing
      mirror.style.wordSpacing = style.wordSpacing
      mirror.style.textTransform = style.textTransform
      mirror.style.textIndent = style.textIndent
      mirror.style.whiteSpace = 'pre-wrap'
      mirror.style.wordBreak = style.wordBreak
      mirror.style.overflowWrap = 'break-word'
      mirror.style.tabSize = style.tabSize || '4'

      const padLeft = Number.parseFloat(style.paddingLeft) || 0
      const padRight = Number.parseFloat(style.paddingRight) || 0
      const innerWidth = live.clientWidth - padLeft - padRight
      if (innerWidth <= 0) return
      mirror.style.width = `${String(innerWidth)}px`

      const lines = text.split('\n')
      mirror.innerHTML = lines
        .map(line => `<div>${escapeHtml(line) || '&#8203;'}</div>`)
        .join('')

      const beforeCaret = text.slice(0, Math.max(0, Math.min(caret, text.length)))
      const activeIndex = beforeCaret.split('\n').length - 1

      liveGutter.style.paddingTop = style.paddingTop
      liveGutter.style.paddingBottom = style.paddingBottom
      liveGutter.style.lineHeight = style.lineHeight

      const children = mirror.children
      const rows = document.createDocumentFragment()
      for (let index = 0; index < lines.length; index += 1) {
        const row = document.createElement('div')
        row.className = index === activeIndex ? 'writer-gutter-line active' : 'writer-gutter-line'
        row.dataset.line = String(index + 1)
        row.textContent = String(index + 1)
        const measured = children[index]
        if (measured !== undefined) {
          row.style.height = `${String(measured.getBoundingClientRect().height)}px`
        }
        rows.append(row)
      }
      liveGutter.replaceChildren(rows)
      liveGutter.scrollTop = live.scrollTop
    }

    const schedule = (): void => {
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null
        paint()
      })
    }

    paint()
    const onScroll = (): void => {
      const liveGutter = gutterRef.current
      if (liveGutter !== null && textareaRef.current !== null) {
        liveGutter.scrollTop = textareaRef.current.scrollTop
      }
    }
    input.addEventListener('scroll', onScroll, { passive: true })
    const observer = typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => { schedule() })
    observer?.observe(input)
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    void fonts?.ready?.then(() => { schedule() })
    return () => {
      input.removeEventListener('scroll', onScroll)
      observer?.disconnect()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [text, caret, show, textareaRef])

  useLayoutEffect(() => () => {
    mirrorRef.current?.remove()
    mirrorRef.current = null
  }, [])

  if (!show) return null
  const style: CSSProperties = {}
  return <div
    ref={gutterRef}
    className="writer-line-gutter"
    aria-hidden="true"
    style={style}
  />
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
