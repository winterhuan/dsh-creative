/**
 * 细纲照搬检测 — evidence that prose transcribes its outline instead of
 * writing the scene.
 *
 * Port of `tests/reference/check-outline-copy.js`. A run of more than 15 consecutive
 * characters (汉字 only, after stripping punctuation and markup) shared with the
 * same chapter's outline is reported with its position; the agent decides from
 * context whether it is transcription or a functional repeat (system panels,
 * oaths, case files, fixed names). Lines listed under the outline's 「复沓锚句」
 * field may land verbatim: only their exact spans are exempt, and the exempted
 * total is reported so abuse stays visible.
 *
 * `checkOutlineCopy` returns status 0 (clean, or no outline to compare) or 1
 * (overlaps to review) with the exact report text; read failures throw.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const MIN_RUN = 16 // 判定阈值：连续重合 >15 字，即 >=16
const REPORT_TOP = 8 // 最多列出的片段数

/** Outcome of one prose file's comparison with its outline. */
export interface OutlineCopyResult {
  /** 0 = clean or no outline found; 1 = overlaps to review. */
  readonly status: 0 | 1
  /** The report text the CLI prints; empty when silent. */
  readonly output: string
}

function read(filename: string): string {
  return readFileSync(filename, 'utf8').replace(/^﻿/, '')
}

/** 只留汉字——剥掉标点/加粗/【】后比对，防止细纲标注造成假阴性 */
function hanOnly(text: string): string {
  return text.replace(/[^一-鿿]/g, '')
}

/**
 * 抽出细纲「复沓锚句」字段下的原话，一行一条。
 * 只认这一个字段，不扫情节点序列——锚句集中在固定区块，情节点保持只写「要发生什么」。
 * 区块终止于行首无缩进的下一个字段（`- xxx`）或下一个小节标题，因此条目本身
 * 用 `1.` 编号、缩进 `-` 列表或纯文本都能正确提取，不必额外标记。
 */
function extractAnchors(outline: string): string[] {
  const match = outline.match(/复沓锚句[^：:\n]*[：:]([\s\S]*?)(?=\n[-*+]\s|\n#{1,6}\s|$)/)
  if (match === null) return []
  return (match[1] ?? '')
    .split('\n')
    // 去掉列表符号与「点N：」这类落点前缀，只留原话本身
    .map(line => line.replace(/^\s*[-*+]?\s*(?:\d+[.、)]\s*)?(?:点\s*\d+\s*[：:])?/, ''))
    .map(line => hanOnly(line))
    .filter(anchor => anchor.length >= 2)
}

/**
 * 在片段里定位锚句的精确出现区间，挖掉后返回剩余子段与豁免字数。
 * 不能只判「片段包含锚句」就整段放行——贪心扫描求的是最长延伸，锚句嵌在中间时
 * 会连同紧挨着它的未授权重合一起赦免。
 */
function splitByAnchors(fragment: string, anchors: readonly string[]): { rest: string[]; anchoredLen: number } {
  // 片段完全落在某条锚句内：整段豁免（抄了锚句的一部分，仍在授权范围）
  if (anchors.some(anchor => anchor.includes(fragment))) return { rest: [], anchoredLen: fragment.length }

  const spans: [number, number][] = []
  for (const anchor of anchors) {
    for (let from = 0; from + anchor.length <= fragment.length;) {
      const at = fragment.indexOf(anchor, from)
      if (at < 0) break
      spans.push([at, at + anchor.length])
      from = at + 1 // 同一锚句重复出现要逐次记录
    }
  }
  if (spans.length === 0) return { rest: [fragment], anchoredLen: 0 }

  spans.sort((x, y) => x[0] - y[0])
  const merged: [number, number][] = [spans[0] ?? [0, 0]] // 多锚句重叠/相邻时并成一段，避免重复计数
  for (const [start, end] of spans.slice(1)) {
    const last = merged[merged.length - 1]
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }

  const rest: string[] = []
  let cursor = 0
  let anchoredLen = 0
  for (const [start, end] of merged) {
    if (start > cursor) rest.push(fragment.slice(cursor, start))
    anchoredLen += end - start
    cursor = end
  }
  if (cursor < fragment.length) rest.push(fragment.slice(cursor))
  return { rest, anchoredLen }
}

/** 定位同章细纲：遍历 大纲/ 按章号正则匹配，支持带后缀的文件名 */
function findOutline(proseFile: string): string | null {
  const base = basename(proseFile)
  // 短篇没有章号：正文.md 与 小节大纲.md 在同目录平铺
  if (base === '正文.md') {
    const sibling = join(dirname(proseFile), '小节大纲.md')
    return existsSync(sibling) ? sibling : null
  }
  const match = base.match(/^第\s*0*(\d+)\s*章/)
  if (match === null) return null
  const chapter = match[1]
  const directory = join(dirname(dirname(proseFile)), '大纲')
  let entries: string[]
  try { entries = readdirSync(directory) }
  catch { return null } // No 大纲 directory: there is no outline to compare against.
  for (const file of entries) {
    const found = file.match(/^细纲_第0*(\d+)章.*\.md$/)
    if (found !== null && found[1] === chapter) return join(directory, file)
  }
  return null
}

/**
 * Compare one prose file with its outline.
 * @param proseFile - the chapter or short-story body.
 * @param explicitOutline - the outline to compare; omitted to find the same chapter's outline.
 * @returns the status and report text.
 * @throws when the prose or an explicitly named outline cannot be read.
 */
export function checkOutlineCopy(proseFile: string, explicitOutline?: string): OutlineCopyResult {
  const prose = read(proseFile)

  const outlineFile = explicitOutline ?? findOutline(proseFile)
  if (outlineFile === null) return { status: 0, output: '' }
  const outline = read(outlineFile)

  // 正文去掉标题行后比对
  const body = hanOnly(prose.replace(/^#.*$/gm, ''))
  const source = hanOnly(outline)
  if (body.length < MIN_RUN || source.length < MIN_RUN) return { status: 0, output: '' }

  // 复沓锚句列出的原话允许逐字落地，命中后计入豁免、不判誊抄
  const anchors = extractAnchors(outline)

  // 贪心扫描：每个起点二分求「仍是细纲子串」的最长延伸，命中区间不重叠
  const hits: { frag: string; len: number }[] = []
  let copied = 0
  let anchored = 0
  let anchoredCount = 0
  let index = 0
  while (index < body.length) {
    let best = 0
    if (index + MIN_RUN <= body.length && source.includes(body.slice(index, index + MIN_RUN))) {
      best = MIN_RUN
      let low = MIN_RUN
      let high = Math.min(body.length - index, 200)
      while (low <= high) {
        const middle = (low + high) >> 1
        if (source.includes(body.slice(index, index + middle))) {
          best = middle
          low = middle + 1
        } else high = middle - 1
      }
    }
    if (best > 0) {
      const fragment = body.slice(index, index + best)
      const { rest, anchoredLen } = splitByAnchors(fragment, anchors)
      if (anchoredLen > 0) {
        anchored += anchoredLen
        anchoredCount += 1
      }
      // 挖掉锚句后的剩余子段仍是细纲子串，只需按阈值重判
      for (const segment of rest) {
        if (segment.length >= MIN_RUN) {
          hits.push({ frag: segment, len: segment.length })
          copied += segment.length
        }
      }
      index += best
    } else index += 1
  }
  if (hits.length === 0) {
    // 全部命中都是锚句豁免：静默放行，但把豁免量报出来供人工复核滥用
    if (anchoredCount > 0) {
      return {
        status: 0,
        output: `细纲照搬检测（${basename(proseFile)}）：无未授权誊抄；`
          + `另有 ${String(anchoredCount)} 处 ${String(anchored)} 字为复沓锚句的逐字落地。\n`,
      }
    }
    return { status: 0, output: '' }
  }

  const rate = ((copied * 100) / body.length).toFixed(1)
  const out = [
    `=== 细纲照搬检测（${basename(proseFile)}）===`,
    `正文 ${String(body.length)} 字，与 ${basename(outlineFile)} 连续重合 >${String(MIN_RUN - 1)} 字的片段 ${String(hits.length)} 处，共 ${String(copied)} 字（${rate}%）。`,
    '逐条对照原文判断：确属把细纲叙述搬进正文就重写——细纲只锁功能与结果，句子在正文现场写；系统面板、誓词、案卷原话、固定专名等功能性重合可保留。每条都要有结论，不为归零机械改写。保留项由主会话补进细纲「复沓锚句」——子代理只重写正文或标 `[需复核]` 交回，不改大纲细纲。',
  ]
  for (const hit of [...hits].sort((a, b) => b.len - a.len).slice(0, REPORT_TOP)) {
    out.push(`  · ${String(hit.len)} 字「${hit.frag}」`)
  }
  if (hits.length > REPORT_TOP) out.push(`  · …另有 ${String(hits.length - REPORT_TOP)} 处`)
  if (anchoredCount > 0) out.push(`（另有 ${String(anchoredCount)} 处 ${String(anchored)} 字为复沓锚句的逐字落地，不计入誊抄）`)
  return { status: 1, output: `${out.join('\n')}\n` }
}
