/**
 * Model-degeneration fingerprints a degrading model cannot self-report:
 * verbatim repetition (复读/打转), mid-sentence truncation (截断),
 * placeholder/refusal/meta leakage (元信息泄漏) and engineering-word leakage
 * (工程词泄漏).
 *
 * Port of `tests/reference/check-degeneration.js`. Report-only: the safe response is to
 * regenerate the affected unit with the finding fed back as a constraint.
 * Blocking findings (复读/截断/占位拒绝语/tier1 纯工程词) are never legal in
 * prose; advisory findings (tier2 章节/歧义词、对话行里的工程词) are left to a
 * human or model judgement. Popular web fiction deliberately repeats lines for
 * rhythm, so short and dialogue repetition is exempt.
 */
import type { CheckFinding } from './findings.ts'

// 复读：长句（可见字数 ≥ REPEAT_MIN_LEN）出现 ≥ REPEAT_MIN_COUNT 次判为打转；
// 紧邻整行重复（可见字数 ≥ ADJACENT_MIN_LEN）判为即时循环。短句/弹幕/对话刷屏豁免。
const REPEAT_MIN_LEN = 12
const REPEAT_MIN_COUNT = 3
const ADJACENT_MIN_LEN = 8

interface PlaceholderPattern {
  readonly re: RegExp
  readonly label: string
  /** hard = 任何行都判（正文里永不合法）；soft = 只在「非对话」叙述行判。 */
  readonly hard: boolean
}

// 「作为AI」需在自指位置（其后是断句/我/无法… 或句末），避免误报「人工智能时代的产物」这类
// 复合名词；并对对话行豁免（系统流/AI 伴侣题材里 AI 角色台词「作为AI，我会保护你」是合法对话）。
// 型号后缀（AI语言模型/AI助手/人工智能语言模型/AI模型/AI大模型）必须可选吃掉：否则前视断言紧跟
// 在「AI」后面看到的是「语」/「助」/「模」，最典型的退化开场整类漏检。
const PLACEHOLDER_PATTERNS: readonly PlaceholderPattern[] = [
  { re: /作为(一个)?(AI|人工智能|大?语言模型|智能助手|聊天助手)(?:语言模型|大?模型|助手|机器人)?(?=[，,。、；;：:！!？?\s）)」』"】]|我|无法|不能|没法|$)/, label: '元信息泄漏（AI 自指）', hard: false },
  { re: /�/, label: '乱码（替换字符 �）', hard: true },
  { re: /^(Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize))/, label: '元信息泄漏（英文 AI 腔）', hard: true },
  { re: /[（(](此处|以下|这里|下文|后续)?\s*(省略|略)(去|过)?[^）)]{0,10}[）)]/, label: '占位符（括号省略）', hard: true },
  { re: /(未完待续|TODO|占位符|placeholder)/, label: '占位符', hard: true },
  { re: /我(无法|不能)(继续(写|创作|生成|下去)|生成(内容|文本|正文)?|创作|续写|完成(这个|本)?(章|篇|创作|请求))/, label: '元信息泄漏（生成拒绝语）', hard: false },
]

// 工程词泄漏：tier1 = 纯写作流水线术语，正文里几乎永不合法；tier2 = 章节结构/歧义词，
// 角色在故事内真实阅读/讨论「第X章」或故事内系统/界面用语时属例外（report-only，交人/LLM 判）。
const META_TIER1_RE = /细纲|情节点|卷纲|功能标签|目标情绪|字数目标|章首钩子|章尾钩子/
const META_TIER2_RE = /第[一二三四五六七八九十百千万两0-9]+章|本章|这一章|上一章|下一章|上章|下章|前一章|后一章|前文|后文|伏笔|读者|任务描述/

interface ContentLine {
  readonly text: string
  readonly trimmed: string
  readonly lineNo: number
}

/**
 * Scan one chapter for degeneration fingerprints.
 * @param input - the chapter text.
 * @returns findings sorted by position; never rewrites the text.
 */
export function scanDegeneration(input: string): CheckFinding[] {
  const lines = input.split(/\r?\n/)
  const content: ContentLine[] = []
  let fence: string | null = null
  let inFrontMatter = hasYamlFrontMatter(lines)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()
    if (inFrontMatter) {
      if (index > 0 && trimmed === '---') inFrontMatter = false
      continue
    }
    const fenceMarker = /^(?:`{3,}|~{3,})/.exec(trimmed)
    if (fence !== null) {
      if (fenceMarker !== null && trimmed.charAt(0) === fence) fence = null
      continue
    }
    if (fenceMarker !== null) {
      fence = trimmed.charAt(0)
      continue
    }
    content.push({ text: line, trimmed, lineNo: index + 1 })
  }

  const findings: CheckFinding[] = []
  findings.push(...findRepetition(content))
  findings.push(...findTruncation(content))
  findings.push(...findPlaceholders(content))
  findings.push(...findMetaLeak(content))
  findings.sort((a, b) => a.line - b.line || a.column - b.column)
  return findings
}

function isContent(trimmed: string): boolean {
  return trimmed !== '' && !trimmed.startsWith('#') && !/^-{3,}$/.test(trimmed)
}

function isDialogueLike(trimmed: string): boolean {
  return /[“”"'‘’「」『』【】]/.test(trimmed)
}

// 去掉成对引号内的片段（台词/系统词/引用物件），只留引号外叙述。复读判定用：重复台词是体裁
// 手法（豁免），但「叙述 + 引号内物件/短台词」混合行里引号外叙述的复读仍是退化，不能整行豁免。
function stripQuoted(text: string): string {
  return text
    .replace(/「[^」]*」/g, '')
    .replace(/『[^』]*』/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/“[^”]*”/g, '')
    .replace(/‘[^’]*’/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
}

function visibleLength(text: string): number {
  const matched = text.match(/[一-鿿Ａ-ｚA-Za-z0-9]/g)
  return matched === null ? 0 : matched.length
}

function findRepetition(content: readonly ContentLine[]): CheckFinding[] {
  const findings: CheckFinding[] = []
  const body = content.filter(entry => isContent(entry.trimmed))

  // (1) back-to-back identical lines (immediate loop). 纯台词/弹幕复沓（引号外叙述很短）豁免；
  // 「叙述 + 引号内物件」混合行的整行复读仍判（去引号后叙述够长）。
  for (let index = 1; index < body.length; index += 1) {
    const current = body[index]
    const previous = body[index - 1]
    if (current === undefined || previous === undefined) continue
    if (current.trimmed === previous.trimmed && visibleLength(stripQuoted(current.trimmed)) >= ADJACENT_MIN_LEN) {
      findings.push({
        line: current.lineNo,
        column: 1,
        type: 'verbatim-repeat',
        severity: 'blocking',
        message: '逐行复读（紧邻整行重复）：疑似模型打转，重写本段、删掉重复。',
        excerpt: compact(current.trimmed),
      })
    }
  }

  // (2) any long sentence repeated >= REPEAT_MIN_COUNT times across the file.
  // 只豁免引号内台词（体裁手法），引号外叙述句仍参与复读计数（含「叙述+引号内物件」混合行）。
  const counts = new Map<string, number>()
  for (const { trimmed } of body) {
    for (const sentence of stripQuoted(trimmed).split(/[。！？!?]/)) {
      const text = sentence.trim()
      if (visibleLength(text) < REPEAT_MIN_LEN) continue
      counts.set(text, (counts.get(text) ?? 0) + 1)
    }
  }
  const flagged = new Set<string>()
  for (const [sentence, count] of counts) {
    if (count >= REPEAT_MIN_COUNT) flagged.add(sentence)
  }
  if (flagged.size > 0) {
    for (const { trimmed, lineNo } of body) {
      for (const sentence of stripQuoted(trimmed).split(/[。！？!?]/)) {
        const text = sentence.trim()
        if (!flagged.has(text)) continue
        findings.push({
          line: lineNo,
          column: 1,
          type: 'verbatim-repeat',
          severity: 'blocking',
          message: `长句复读（同句出现 ${String(counts.get(text) ?? 0)} 次）：疑似模型打转，重写、保留一处。`,
          excerpt: compact(text),
        })
        flagged.delete(text) // report each repeated sentence once, at its first occurrence
      }
    }
  }

  return findings
}

function findTruncation(content: readonly ContentLine[]): CheckFinding[] {
  const body = content.filter(entry => isContent(entry.trimmed))
  const last = body[body.length - 1]
  if (last === undefined) return []
  // a finished chapter ends on terminal/closing punctuation; otherwise it was cut off.
  if (/[。！？!?…”"』」）)】]$/.test(last.trimmed)) return []
  return [{
    line: last.lineNo,
    column: last.trimmed.length,
    type: 'truncated',
    severity: 'blocking',
    message: '疑似截断：正文末尾未以句末/收尾标点结束，可能被模型中途切断；补完结尾或重写收尾。',
    excerpt: compact(last.trimmed.slice(-24)),
  }]
}

function findPlaceholders(content: readonly ContentLine[]): CheckFinding[] {
  const findings: CheckFinding[] = []
  for (const { trimmed, lineNo } of content) {
    if (!isContent(trimmed)) continue
    const dialogue = isDialogueLike(trimmed)
    for (const { re, label, hard } of PLACEHOLDER_PATTERNS) {
      if (!hard && dialogue) continue // soft 拒绝语在对话行里可能是正常台词，豁免
      const match = re.exec(trimmed)
      if (match === null) continue
      const at = match.index
      findings.push({
        line: lineNo,
        column: at + 1,
        type: 'placeholder-leak',
        severity: 'blocking',
        message: `${label}：正文混入元信息/拒绝语/占位符，重写本段干净落地。`,
        excerpt: compact(trimmed.slice(Math.max(0, at - 4), at + 20)),
      })
      break // one finding per line is enough
    }
  }
  return findings
}

function findMetaLeak(content: readonly ContentLine[]): CheckFinding[] {
  const findings: CheckFinding[] = []
  let firstContentSeen = false
  for (const { trimmed, lineNo } of content) {
    if (!isContent(trimmed)) continue
    if (!firstContentSeen) {
      firstContentSeen = true
      // 标题行（第N章 章名，无 ## 前缀时也算）属「标题行以外的正文」之外，排除
      if (/^第[一二三四五六七八九十百千万两0-9]+章/.test(trimmed)) continue
    }
    const dialogue = isDialogueLike(trimmed)
    const tier1 = META_TIER1_RE.exec(trimmed)
    if (tier1 !== null) {
      // tier1 纯工程词正文里几乎永不合法→blocking；但写手/编剧题材里角色在故事内真讨论创作，
      // 台词（对话行）里可能合法，降级为 advisory（仍报告，交人/LLM 判，不强制回炉）。
      findings.push({
        line: lineNo,
        column: tier1.index + 1,
        type: 'meta-leak',
        severity: dialogue ? 'advisory' : 'blocking',
        message: `工程词泄漏：「${tier1[0]}」是写作流水线术语，正文里不该出现；改成角色/场景内表达。${dialogue ? '例外：角色为作者/编剧、在故事内真实讨论创作时，台词里可能合法。' : ''}`,
        excerpt: compact(trimmed.slice(Math.max(0, tier1.index - 6), tier1.index + 18)),
      })
      continue // tier1 命中即可，不再叠 tier2
    }
    const tier2 = META_TIER2_RE.exec(trimmed)
    if (tier2 !== null) {
      findings.push({
        line: lineNo,
        column: tier2.index + 1,
        type: 'meta-leak',
        severity: 'advisory',
        message: `元信息泄漏：「${tier2[0]}」疑似工程/章节结构词混入正文；改成角色当下可感知的事件锚点或相对时间。例外：角色在故事内真实阅读/讨论「第X章」、真身为作者/读者、或故事内系统/界面用语。`,
        excerpt: compact(trimmed.slice(Math.max(0, tier2.index - 6), tier2.index + 18)),
      })
    }
  }
  return findings
}

function hasYamlFrontMatter(lines: readonly string[]): boolean {
  if ((lines[0] ?? '').trim() !== '---' || lines[0] === undefined) return false
  let sawYamlField = false
  for (let index = 1; index < Math.min(lines.length, 40); index += 1) {
    const trimmed = (lines[index] ?? '').trim()
    if (trimmed === '---') return sawYamlField
    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) sawYamlField = true
  }
  return false
}

function compact(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized
}
