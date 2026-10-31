/**
 * Deterministic Markdown views derived from the tracking state.
 *
 * Port of the rendering half of `tests/reference/tracking_commit.py`. Every view is a
 * pure function of the state and renders byte-for-byte like the Python
 * reference; the store writes them beside `_tracking-state.json`.
 */
import { paddedChapterNumber } from '../chapter-names.ts'
import {
  CONTEXT_HEADINGS, CONTEXT_MAX_BYTES, CONTEXT_TARGET_BYTES, DELTA_MAX_BYTES, DELTA_TARGET_BYTES,
  FORESHADOW_IMPORTANCE, SNAPSHOT_MAX_BYTES, SNAPSHOT_TARGET_BYTES, byteSize, require,
  type CharacterSnapshot, type ForeshadowRow, type TimelineRow, type TrackingDelta, type TrackingState,
} from './schema.ts'

/** Relative view paths under `追踪/` mapped to their rendered text, hot context first. */
export type TrackingViews = Record<string, string>

function chapterLabel(chapter: number | null): string {
  return chapter === null ? '—' : `第${String(chapter)}章`
}

/**
 * Render one character's current-state card.
 * @param name - the character name.
 * @param snapshot - the current snapshot.
 * @param throughChapter - the last committed chapter.
 * @param revision - the state revision.
 * @returns the Markdown card.
 */
export function renderSnapshot(name: string, snapshot: CharacterSnapshot, throughChapter: number, revision: number): string {
  const section = (title: string, values: readonly string[]): string[] =>
    [`## ${title}`, ...(values.length > 0 ? values : ['无']).map(item => `- ${item}`), '']
  const lines = [
    `# ${name}｜当前状态`,
    '',
    `- 状态修订：${String(revision)}`,
    `- 截至章节：第${String(throughChapter)}章`,
    `- 身份：${snapshot.identity}`,
    `- 位置：${snapshot.location}`,
    `- 当前目标：${snapshot.goal}`,
    `- 身心状态：${snapshot.state}`,
    '',
    ...section('能力与资源', snapshot.abilities_resources),
    ...section('关键关系', snapshot.relationships),
    ...section('已知信息', snapshot.knowledge),
    ...section('未结事项', snapshot.open_threads),
  ]
  const payload = `${lines.join('\n').trimEnd()}\n`
  require(byteSize(payload) <= SNAPSHOT_MAX_BYTES, `character snapshot ${name} exceeds hard cap of ${String(SNAPSHOT_MAX_BYTES)} bytes`)
  return payload
}

/**
 * Render the foreshadow table.
 * @param rows - foreshadow rows keyed by ID.
 * @param revision - the state revision.
 * @returns the Markdown table.
 */
export function renderForeshadow(rows: Readonly<Record<string, ForeshadowRow>>, revision: number): string {
  const lines = [
    '# 伏笔当前状态',
    '',
    `> 状态修订：${String(revision)}。每个 ID 只保留一行当前状态；历史变化见 \`逐章记录/\`。`,
    '',
    '| ID | 内容 | 埋设章 | 计划回收章 | 状态 | 重要度 | 最近变更章 |',
    '|---|---|---:|---:|---|---|---:|',
  ]
  for (const identifier of Object.keys(rows).sort()) {
    const row = rows[identifier]
    if (row === undefined) continue
    lines.push(`| ${identifier} | ${row.summary} | 第${String(row.planted_chapter)}章 | ${chapterLabel(row.planned_resolution_chapter)} | `
      + `${row.status} | ${row.importance} | 第${String(row.updated_chapter)}章 |`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * Render the author-truth and reader-knowledge timelines.
 * @param events - timeline rows keyed by ID.
 * @param revision - the state revision.
 * @returns the author view and the reader view.
 */
export function renderTimelineViews(events: Readonly<Record<string, TimelineRow>>, revision: number): { readonly author: string; readonly reader: string } {
  const authorLines = [
    '# 作者真相时间线',
    '',
    `> 状态修订：${String(revision)}。客观事实与读者认知的权威对照；未来揭示计划仍留在大纲。`,
    '',
    '| ID | 首次登记章 | 故事时间 | 客观事实 | 读者当前认知 | 揭示状态 | 实际揭示章 |',
    '|---|---:|---|---|---|---|---:|',
  ]
  const readerLines = [
    '# 读者已知时间线',
    '',
    `> 状态修订：${String(revision)}。只呈现读者截至当前章节已经知道或相信的内容，不泄露作者侧客观真相。`,
    '',
    '| ID | 读者当前认知 | 认知截至章 |',
    '|---|---|---:|',
  ]
  for (const identifier of Object.keys(events).sort()) {
    const event = events[identifier]
    if (event === undefined) continue
    const characters = event.characters.join('、')
    const objective = event.objective_fact + (characters !== '' ? `（涉及：${characters}）` : '')
    authorLines.push(`| ${identifier} | 第${String(event.first_recorded_chapter)}章 | ${event.story_time} | ${objective} | `
      + `${event.reader_knowledge} | ${event.reveal_status} | ${chapterLabel(event.reveal_chapter)} |`)
    readerLines.push(`| ${identifier} | ${event.reader_knowledge} | 第${String(event.updated_chapter)}章 |`)
  }
  return { author: `${authorLines.join('\n')}\n`, reader: `${readerLines.join('\n')}\n` }
}

function activeForeshadowLines(rows: Readonly<Record<string, ForeshadowRow>>): string[] {
  const importance = new Map(FORESHADOW_IMPORTANCE.map((value, index) => [value, index]))
  const candidates = Object.values(rows).filter(row => row.status === '已埋').sort((a, b) =>
    (importance.get(a.importance) ?? 0) - (importance.get(b.importance) ?? 0)
    || (a.planned_resolution_chapter ?? 1e12) - (b.planned_resolution_chapter ?? 1e12)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return candidates.slice(0, 8).map((row) => {
    const planned = row.planned_resolution_chapter === null ? '回收章未定' : `第${String(row.planned_resolution_chapter)}章`
    return `${row.id}｜${row.summary}｜埋第${String(row.planted_chapter)}章｜${planned}｜${row.importance}`
  })
}

/**
 * Render the hot continuity card (`上下文.md`).
 * @param state - the tracking state.
 * @returns the Markdown card.
 */
export function renderContext(state: TrackingState): string {
  const context = state.context
  const position = context.position
  const currentChapter = state.last_committed_chapter === 0 ? '尚未开篇' : `第${String(state.last_committed_chapter)}章`
  const characterLines = context.active_character_names.map((name) => {
    const snapshot = state.characters[name]
    return `${name}｜${snapshot?.identity ?? ''}｜${snapshot?.state ?? ''}｜目标：${snapshot?.goal ?? ''}`
  })
  const sections: readonly (readonly [string, readonly string[]])[] = [
    ['## 当前位置', [
      `当前章：${currentChapter}`,
      `卷：${position.volume}（始于第${String(position.volume_start_chapter)}章）`,
      `故事时间：${position.story_time}`,
      `场景：${position.scene}`,
    ]],
    ['## 长期约束', context.long_term_constraints],
    ['## 核心角色状态', characterLines],
    ['## 活跃伏笔', activeForeshadowLines(state.foreshadow)],
    ['## 近三章速记', context.recent_chapters.map(item => `第${String(item.chapter)}章｜${item.summary}`)],
    ['## 下一章承诺', context.next_chapter_commitments],
    ['## 连贯性风险', context.continuity_risks],
  ]
  const lines = [
    `# 写作连续性上下文 — ${state.book_title}`,
    '',
    `> 状态修订：${String(state.state_revision)}。截至当前章的续写状态卡，只放下一章真正需要的连续性状态。`,
    '',
  ]
  for (const [heading, values] of sections) {
    lines.push(heading)
    lines.push(...(values.length > 0 ? values : ['无']).map(value => `- ${value}`))
    lines.push('')
  }
  const payload = `${lines.join('\n').trimEnd()}\n`
  const headings = payload.split('\n').filter(line => line.startsWith('## '))
  require(headings.length === CONTEXT_HEADINGS.length && headings.every((line, index) => line === CONTEXT_HEADINGS[index]),
    'generated context headings do not match the seven-section schema')
  require(byteSize(payload) <= CONTEXT_MAX_BYTES, `hot context exceeds ${String(CONTEXT_MAX_BYTES)} bytes`)
  return payload
}

/**
 * Render one chapter's record (`逐章记录/第NNN章.md`).
 * @param chapter - the chapter number.
 * @param title - the chapter title.
 * @param delta - the validated delta.
 * @param coreNames - names that are core characters after this chapter, plus those retired by it.
 * @param acceptedFindings - author-accepted rule exceptions. An empty list leaves the record unchanged.
 * @returns the Markdown record.
 */
export function renderDelta(
  chapter: number,
  title: string,
  delta: TrackingDelta,
  coreNames: ReadonlySet<string>,
  acceptedFindings: readonly { readonly rule_id: string; readonly reason: string }[] = [],
): string {
  const lines = [
    `# 第${paddedChapterNumber(chapter)}章 · ${title}`,
    `- 结果：${delta.result}`,
    `- 下一章承诺：${delta.next_chapter_commitments.join('；') || '无'}`,
    '',
    '## 角色变化',
    ...delta.character_changes.map(item => `- ${item.name}｜${coreNames.has(item.name) ? '核心' : '临时'}｜${item.change}`),
  ]
  if (delta.character_changes.length === 0) lines.push('- 无')
  lines.push('', '## 伏笔变化')
  for (const item of delta.foreshadow_changes) {
    if (item.action === 'delete') lines.push(`- ${item.id}｜删除当前登记`)
    else {
      const planned = item.planned_resolution_chapter === null ? '未定' : `第${String(item.planned_resolution_chapter)}章`
      lines.push(`- ${item.id}｜${item.status}｜${item.summary}｜回收${planned}`)
    }
  }
  if (delta.foreshadow_changes.length === 0) lines.push('- 无')
  lines.push('', '## 时间与揭示')
  for (const item of delta.timeline_events) {
    if (item.action === 'delete') lines.push(`- ${item.id}｜删除当前登记`)
    else lines.push(`- ${item.id}｜${item.story_time}｜事实：${item.objective_fact}｜读者：${item.reader_knowledge}｜${item.reveal_status}`)
  }
  if (delta.timeline_events.length === 0) lines.push('- 无')
  lines.push('', '## 连贯性约束', ...delta.constraints.map(item => `- ${item}`))
  if (delta.constraints.length === 0) lines.push('- 无')
  const retired = [...delta.retired_context_items, ...delta.retired_characters.map(name => `角色状态：${name}`)]
  if (retired.length > 0) {
    // 退役条目在此留档，续写状态卡收缩后仍可回查当初撤下了什么。
    lines.push('', '## 本章退役登记', ...retired.map(item => `- ${item}`))
  }
  if (acceptedFindings.length > 0) {
    lines.push('', '## 接受的规则例外', ...acceptedFindings.map(item => `- ${item.rule_id}｜${item.reason}`))
  }
  const payload = `${lines.join('\n')}\n`
  const size = byteSize(payload)
  require(size <= DELTA_MAX_BYTES, `chapter delta is ${String(size)} bytes; hard cap is ${String(DELTA_MAX_BYTES)}`)
  return payload
}

/**
 * Render every derived view of a state.
 * @param state - the tracking state.
 * @returns views keyed by their path under `追踪/`, hot context first.
 */
export function renderViews(state: TrackingState): TrackingViews {
  const revision = state.state_revision
  const timelines = renderTimelineViews(state.timeline, revision)
  const views: TrackingViews = {
    '上下文.md': renderContext(state),
    '伏笔.md': renderForeshadow(state.foreshadow, revision),
    '时间线/作者真相.md': timelines.author,
    '时间线/读者已知.md': timelines.reader,
  }
  for (const [name, snapshot] of Object.entries(state.characters)) {
    views[`角色状态/${name}.md`] = renderSnapshot(name, snapshot, state.last_committed_chapter, revision)
  }
  return views
}

/**
 * Report views that exceed their soft byte targets.
 * @param views - rendered views.
 * @param deltaPayload - the chapter record written with them, if any.
 * @returns warnings in the order the Python reference emitted them.
 */
export function sizeWarnings(views: TrackingViews, deltaPayload?: string): string[] {
  const warnings: string[] = []
  if (deltaPayload !== undefined && byteSize(deltaPayload) > DELTA_TARGET_BYTES) {
    warnings.push(`WARNING: chapter delta is ${String(byteSize(deltaPayload))} bytes; target is <= ${String(DELTA_TARGET_BYTES)}`)
  }
  const contextSize = byteSize(views['上下文.md'] ?? '')
  if (contextSize > CONTEXT_TARGET_BYTES) warnings.push(`WARNING: hot context is ${String(contextSize)} bytes; target is <= ${String(CONTEXT_TARGET_BYTES)}`)
  for (const [relative, payload] of Object.entries(views)) {
    if (!relative.startsWith('角色状态/')) continue
    const size = byteSize(payload)
    if (size > SNAPSHOT_TARGET_BYTES) {
      const stem = relative.slice('角色状态/'.length).replace(/\.md$/, '')
      warnings.push(`WARNING: character snapshot ${stem} is ${String(size)} bytes; target is <= ${String(SNAPSHOT_TARGET_BYTES)}`)
    }
  }
  return warnings
}
