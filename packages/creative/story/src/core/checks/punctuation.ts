/**
 * Deterministic 正文 punctuation normalization.
 *
 * Port of `tests/reference/normalize-punctuation.js`:
 *   - replace ellipses, em dashes and double hyphens outside quoted dialogue
 *   - remove markdown divider lines (`---`) from 正文
 *   - keep quote style by default; convert quotes only when explicitly requested
 *   - preserve pauses by default; the project policy comes from `设定/写作检查.json`
 *
 * `normalizePunctuation` is pure; `readProjectPunctuationPolicy` reads the
 * project policy file. Line endings are kept per line, so one stray CRLF
 * never rewrites the whole file.
 */
import { readWritingCheck } from '../writing-check.ts'

/** Whether narration pauses are rewritten or left alone. */
export type PunctuationPolicy = 'preserve' | 'normalize-narration'
/** Quote conversion; `keep` leaves every quote untouched. */
export type QuoteMode = 'keep' | 'ascii' | 'yan'

/** One punctuation diagnostic at a 1-based position of the original line. */
export interface PunctuationFinding {
  readonly line: number
  readonly column: number
  readonly type: string
  readonly message: string
}

/** The normalized text and every diagnostic that produced it. */
export interface PunctuationResult {
  readonly output: string
  readonly findings: readonly PunctuationFinding[]
}

type Span = readonly [number, number]

interface Fence {
  readonly marker: string
  readonly minimumLength: number
}

/**
 * Read the punctuation policy a book declares in `设定/写作检查.json`.
 * @param project - the book directory.
 * @returns the declared policy, or `undefined` when the file does not exist.
 * @throws WritingCheckError when the file is unreadable, not JSON, declares an unknown key, or sets an invalid punctuation value. A missing `punctuation` key means `preserve`.
 */
export function readProjectPunctuationPolicy(project: string): PunctuationPolicy | undefined {
  return readWritingCheck(project)?.punctuation
}

/**
 * Normalize one document's punctuation.
 * @param input - the document text with its original line endings.
 * @param options - the pause policy and quote conversion.
 * @returns the normalized text and diagnostics; the text is unchanged under `preserve` and `keep`.
 */
export function normalizePunctuation(input: string, options: { readonly policy: PunctuationPolicy; readonly quoteMode: QuoteMode }): PunctuationResult {
  const { lines, endings } = splitLinesKeepingEndings(input)

  const findings: PunctuationFinding[] = []
  const outputLines: string[] = []
  let fence: Fence | null = null
  let inFrontMatter = hasYamlFrontMatter(lines)
  let quoteOpen = false
  let pauseQuoteStack: string[] = []
  let commentOpen = false
  let commentStart: { readonly line: number; readonly column: number } | null = null
  const commentCloseAhead: boolean[] = new Array<boolean>(lines.length + 1).fill(false)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    commentCloseAhead[index] = (lines[index] ?? '').includes('-->') || (commentCloseAhead[index + 1] ?? false)
  }

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1
    const ending = endings[index] ?? ''
    let line = lines[index] ?? ''
    const trimmed = line.trim()

    // 未闭合的 `<!--` 不能把余下整篇伪装成注释。确认 EOF 前已无 `-->` 时，
    // 在起始位置具名报错，并从当前行恢复正文扫描；起始符所在行仍原样保护。
    if (commentOpen && !(commentCloseAhead[index] ?? false)) {
      findings.push({
        line: commentStart?.line ?? lineNo,
        column: commentStart?.column ?? 1,
        type: 'html-comment-unclosed',
        message: 'HTML 注释未闭合；后续内容仍按正文检查。',
      })
      commentOpen = false
      commentStart = null
    }

    if (inFrontMatter) {
      outputLines.push(line + ending)
      if (index > 0 && trimmed === '---') inFrontMatter = false
      continue
    }

    if (fence !== null) {
      outputLines.push(line + ending)
      if (isClosingFence(line, fence)) fence = null
      continue
    }

    const openingFence = parseOpeningFence(line)
    if (openingFence !== null) {
      fence = openingFence
      outputLines.push(line + ending)
      continue
    }

    // 跨行 HTML 注释里的 `---` 是注释内容，不是正文分隔线。
    if (trimmed === '---' && !commentOpen && pauseQuoteStack.length === 0) {
      findings.push({
        line: lineNo,
        column: line.indexOf('-') + 1,
        type: 'markdown-divider',
        message: '正文中不要使用 markdown 分隔线；建议移除该行。',
      })
      continue
    }

    const commentOpenBefore = commentOpen
    const punctuationResult = normalizePausePunctuation(line, lineNo, commentOpen, pauseQuoteStack, options.policy)
    findings.push(...punctuationResult.findings)
    line = punctuationResult.line
    commentOpen = punctuationResult.commentOpen
    pauseQuoteStack = punctuationResult.quoteStack
    if (!commentOpenBefore && commentOpen) {
      commentStart = { line: lineNo, column: Math.max(1, line.lastIndexOf('<!--') + 1) }
    } else if (!commentOpen) {
      commentStart = null
    }

    const quoteResult = normalizeQuotes(line, options.quoteMode, quoteOpen, lineNo)
    findings.push(...quoteResult.findings)
    line = quoteResult.line
    quoteOpen = quoteResult.quoteOpen

    outputLines.push(line + ending)
  }

  if (commentOpen) {
    findings.push({
      line: commentStart?.line ?? lines.length,
      column: commentStart?.column ?? 1,
      type: 'html-comment-unclosed',
      message: 'HTML 注释未闭合；后续内容仍按正文检查。',
    })
  }

  return { output: outputLines.join(''), findings }
}

// 逐行记住原始行尾。整篇按「文件里出现过 \r\n」统一行尾会让一个孤立 CRLF 把全文
// 行尾都翻成 CRLF——那是一次没人要求的全文件 diff，而 --check 对行尾一个 finding
// 都不报，只改标点的这一步不该动它。
function splitLinesKeepingEndings(input: string): { lines: string[]; endings: string[] } {
  const lines: string[] = []
  const endings: string[] = []
  let cursor = 0

  while (cursor < input.length) {
    const newlineIndex = input.indexOf('\n', cursor)
    if (newlineIndex === -1) {
      lines.push(input.slice(cursor))
      endings.push('')
      break
    }
    const crlf = newlineIndex > cursor && input[newlineIndex - 1] === '\r'
    lines.push(input.slice(cursor, crlf ? newlineIndex - 1 : newlineIndex))
    endings.push(crlf ? '\r\n' : '\n')
    cursor = newlineIndex + 1
  }

  return { lines, endings }
}

function parseOpeningFence(line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
  if (match === null) return null

  const marker = match[1] ?? ''
  const rest = match[2] ?? ''
  if (marker.charAt(0) === '`' && rest.includes('`')) return null

  return { marker: marker.charAt(0), minimumLength: marker.length }
}

function isClosingFence(line: string, fence: Fence): boolean {
  const marker = fence.marker === '`' ? '`' : '~'
  const match = line.match(new RegExp(`^ {0,3}(${marker}{3,})[\\t ]*$`))
  return match !== null && (match[1] ?? '').length >= fence.minimumLength
}

// 删空停顿符会把两侧的半角点/连字符粘成新的 `...`/`--`（`他.……..说` → `他...说`），
// 一遍归一化留不干净，再跑一遍还会改已定稿的正文；所以反复归一化到不动点。
// 每遍至少把一个 `…/./—/-` 换成非停顿字符，字符数严格递减，必然收敛。
// findings 只留第一遍：同一处不重复计数，column 也仍然是原行的偏移。
function normalizePausePunctuation(
  line: string, lineNo: number, commentOpen: boolean, quoteStack: readonly string[], policy: PunctuationPolicy,
): { line: string; findings: PunctuationFinding[]; commentOpen: boolean; quoteStack: string[] } {
  if (policy === 'preserve') {
    const comments = htmlCommentSpans(line, commentOpen)
    return { line, findings: [], commentOpen: comments.open, quoteStack: quotedSpans(line, quoteStack, comments.spans).stack }
  }
  let current = line
  let findings: PunctuationFinding[] | null = null
  let commentOpenAfter = commentOpen
  let quoteStackAfter: string[] = [...quoteStack]

  for (;;) {
    const comments = htmlCommentSpans(current, commentOpen)
    const quotes = quotedSpans(current, quoteStack, comments.spans)
    commentOpenAfter = comments.open
    quoteStackAfter = quotes.stack
    const pass = normalizePausePunctuationPass(current, lineNo, [...comments.spans, ...quotes.spans])
    if (findings === null) findings = pass.findings
    if (pass.line === current) break
    current = pass.line
  }

  return { line: current, findings: findings ?? [], commentOpen: commentOpenAfter, quoteStack: quoteStackAfter }
}

function normalizePausePunctuationPass(line: string, lineNo: number, protectedSpans: readonly Span[]): { line: string; findings: PunctuationFinding[] } {
  const findings: PunctuationFinding[] = []
  const original = line
  const pattern = /…+|\.{3,}|——|—|--+/g
  let output = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(original)) !== null) {
    const token = match[0]
    // HTML 注释是正文里的元信息（如 `<!-- 去味:跳过 -->` 豁免标记）：`<!--`/`-->` 里的
    // `--` 不是停顿标点，改掉它注释就散了，标记会变成读者看得见的正文。
    if (insideSpans(match.index, match.index + token.length, protectedSpans)) continue
    output += original.slice(lastIndex, match.index)
    const replacement = choosePauseReplacement(original, match.index, token.length)
    output += replacement
    findings.push({
      line: lineNo,
      column: match.index + 1,
      type: getPauseType(token),
      message: replacement !== '' ? `替换为「${replacement}」。` : '移除重复标点。',
    })
    lastIndex = match.index + token.length
  }

  output += original.slice(lastIndex)
  return { line: output, findings }
}

// 行内 HTML 注释区间（含 `<!--`、`-->` 本身）；注释可跨行，未闭合时把状态交给下一行。
function htmlCommentSpans(line: string, openBefore: boolean): { spans: Span[]; open: boolean } {
  const spans: Span[] = []
  let open = openBefore
  let cursor = 0

  while (cursor < line.length) {
    if (open) {
      const close = line.indexOf('-->', cursor)
      if (close === -1) {
        spans.push([cursor, line.length])
        return { spans, open: true }
      }
      spans.push([cursor, close + 3])
      cursor = close + 3
      open = false
      continue
    }

    const start = line.indexOf('<!--', cursor)
    if (start === -1) break
    cursor = start
    open = true
  }

  return { spans, open }
}

function quotedSpans(line: string, stackBefore: readonly string[], commentSpans: readonly Span[]): { spans: Span[]; stack: string[] } {
  const pairs: Readonly<Record<string, string>> = { '‘': '’', '“': '”', '「': '」', '『': '』', '"': '"' }
  const closing = new Set(Object.values(pairs))
  const stack = [...stackBefore]
  const spans: Span[] = []
  let start: number | null = stack.length > 0 ? 0 : null

  for (let index = 0; index < line.length; index += 1) {
    if (insideSpans(index, index + 1, commentSpans)) continue
    const character = line[index] ?? ''
    if (stack.length > 0 && character === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0 && start !== null) {
        spans.push([start, index + 1])
        start = null
      }
      continue
    }
    if (Object.hasOwn(pairs, character) && !closing.has(character)) {
      if (stack.length === 0) start = index
      stack.push(pairs[character] ?? '')
      continue
    }
    if (character === '"' && stack.length === 0) {
      start = index
      stack.push('"')
    }
  }
  if (start !== null) spans.push([start, line.length])
  return { spans, stack }
}

function insideSpans(start: number, end: number, spans: readonly Span[]): boolean {
  return spans.some(([spanStart, spanEnd]) => start < spanEnd && end > spanStart)
}

function hasYamlFrontMatter(lines: readonly string[]): boolean {
  if (lines[0] === undefined || lines[0].trim() !== '---') return false
  let sawYamlField = false
  for (let index = 1; index < Math.min(lines.length, 40); index += 1) {
    const trimmed = (lines[index] ?? '').trim()
    if (trimmed === '---') return sawYamlField
    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) sawYamlField = true
  }
  return false
}

function getPauseType(token: string): string {
  if (token.startsWith('-')) return 'double-hyphen'
  if (token.includes('—')) return 'em-dash'
  return 'ellipsis'
}

function choosePauseReplacement(text: string, start: number, length: number): string {
  const before = previousNonSpace(text, start - 1)
  const after = nextNonSpace(text, start + length)
  const rest = text.slice(start + length).trimStart()

  // 引号内停顿由 quotedSpans 保留；这里只处理叙述层和数字区间。
  if (before === '') return ''
  // 紧跟开引号/开括号的停顿符号属于句首边界，删空即可，避免产出 `「，…」` 或 `「。」`。
  if (isOpeningDelimiter(before)) return ''
  if (/\d/.test(before) && /\d/.test(after)) return '到'
  if (isClosingQuote(after)) return isSentencePunctuation(before) ? '' : '。'

  if (after === '') return isSentencePunctuation(before) ? '' : '。'
  if (isSentencePunctuation(before) || isPunctuation(after)) return ''
  if (/^(因为|原来|这是|那是|也就是|换句话|说白了|所谓|答案|原因|结果|真相|问题在于)/.test(rest)) return '：'
  if (/(原因|答案|真相|结果|结论|问题|选择|意思)$/.test(text.slice(0, start).trim())) return '：'
  return '，'
}

function previousNonSpace(text: string, index: number): string {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const character = text[cursor] ?? ''
    if (!/\s/.test(character)) return character
  }
  return ''
}

function nextNonSpace(text: string, index: number): string {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const character = text[cursor] ?? ''
    if (!/\s/.test(character)) return character
  }
  return ''
}

function isSentencePunctuation(character: string): boolean {
  return /[，,。.!！?？;；:：…]$/.test(character)
}

function isPunctuation(character: string): boolean {
  return /[，,。.!！?？;；:：、…"“”'‘’」』）)]/.test(character)
}

function isClosingQuote(character: string): boolean {
  return /["”」』]/.test(character)
}

function isOpeningDelimiter(character: string): boolean {
  return /[「『（(“‘]/.test(character)
}

function normalizeQuotes(line: string, quoteMode: QuoteMode, quoteOpenBefore: boolean, lineNo: number): { line: string; findings: PunctuationFinding[]; quoteOpen: boolean } {
  if (quoteMode === 'keep') {
    return { line, findings: [], quoteOpen: quoteOpenBefore }
  }

  const findings: PunctuationFinding[] = []
  let quoteOpen = quoteOpenBefore
  let output = ''

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? ''
    if (quoteMode === 'ascii' && /[「」『』“”]/.test(character)) {
      output += '"'
      findings.push({ line: lineNo, column: index + 1, type: 'quote-style', message: '按显式 quote-mode 转为半角双引号。' })
      continue
    }
    if (quoteMode === 'yan' && (character === '"' || character === '“' || character === '”')) {
      const replacement = quoteOpen || character === '”' ? '」' : '「'
      output += replacement
      quoteOpen = replacement === '「'
      findings.push({ line: lineNo, column: index + 1, type: 'quote-style', message: '按显式 quote-mode 转为盐言引号。' })
      continue
    }
    output += character
  }

  return { line: output, findings, quoteOpen }
}
