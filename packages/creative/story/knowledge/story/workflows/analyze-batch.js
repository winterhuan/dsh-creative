// Native workflow script body; load through read and submit unchanged to workflow.
const object = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false })
const string = { type: 'string' }
const plotTypes = ['转折点', '信息揭示', '冲突', '解决', '铺垫', '行动', '对话', '状态变化']
const tones = ['紧张', '轻松', '悲伤', '热血', '爽', '甜', '温馨', '恐怖', '压抑', '其他']
const importance = { type: 'string', enum: ['major', 'supporting', 'minor'] }
const turningPoint = object({
  title: string, type: { type: 'string', enum: plotTypes }, event: string,
  tone: { type: 'string', enum: tones }, locator: string,
}, ['title', 'type', 'event', 'tone', 'locator'])
const extractSchema = object({
  chapter: { type: 'integer' }, title: string, summary: string,
  key_events: { type: 'array', items: string, minItems: 3, maxItems: 5 },
  characters: { type: 'array', items: object({ name: string, importance }, ['name', 'importance']) },
  turning_points: { type: 'array', items: turningPoint, minItems: 3, maxItems: 8 },
}, ['chapter', 'title', 'summary', 'key_events', 'characters', 'turning_points'])
const writeSchema = object({
  written: string, bytes: { type: 'integer', minimum: 1 },
}, ['written', 'bytes'])

const absolute = value => typeof value === 'string' && /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(value)
for (const key of ['resource_base', 'source', 'output_dir']) {
  if (!absolute(args[key])) throw new Error(`${key} must be an absolute path`)
}
const chapterNumbers = (value, key) => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => !Number.isInteger(item) || item < 1)) {
    throw new Error(`${key} must be an array of chapter numbers`)
  }
  return value
}
const existing = new Set(chapterNumbers(args.existing, 'existing'))
const replace = new Set(chapterNumbers(args.replace, 'replace'))
if (!Array.isArray(args.chapters) || args.chapters.length < 1 || args.chapters.length > 4) {
  throw new Error('A batch accepts 1 to 4 chapters')
}
const seen = new Set()
for (const chapter of args.chapters) {
  if (typeof chapter !== 'object' || chapter === null ||
      !Number.isInteger(chapter.chapter) || chapter.chapter < 1 ||
      typeof chapter.title !== 'string' || !chapter.title.trim() ||
      !Number.isInteger(chapter.start_line) || chapter.start_line < 1 ||
      !Number.isInteger(chapter.end_line) || chapter.end_line < chapter.start_line) {
    throw new Error('Each chapter requires a positive chapter number, title, start_line and end_line')
  }
  if (seen.has(chapter.chapter)) throw new Error(`duplicate chapter ${chapter.chapter}`)
  seen.add(chapter.chapter)
}

const root = args.resource_base.replace(/[\\/]+$/, '')
const outputDir = args.output_dir.replace(/[\\/]+$/, '')
const chapterPath = chapter => `${outputDir}/章节/第${String(chapter).padStart(3, '0')}章_摘要.md`
const length = value => Array.from(value).length
const text = value => typeof value === 'string' && value.trim() ? value.trim() : ''
const cardError = (card, chapter) => {
  if (card === null || card === undefined) return 'extract returned no structured result'
  if (typeof card !== 'object' || card.chapter !== chapter.chapter || text(card.title).length === 0) {
    return 'extract returned an invalid chapter card'
  }
  const summary = text(card.summary)
  if (length(summary) < 100 || length(summary) > 300) return 'summary must be 100 to 300 characters'
  if (!Array.isArray(card.key_events) || card.key_events.length < 3 || card.key_events.length > 5 ||
      card.key_events.some(item => text(item).length === 0)) return 'key_events must contain 3 to 5 items'
  if (!Array.isArray(card.characters) || card.characters.some(item =>
    typeof item !== 'object' || item === null || text(item.name).length === 0 ||
    !['major', 'supporting', 'minor'].includes(item.importance))) return 'characters must name appearing people'
  if (!Array.isArray(card.turning_points) || card.turning_points.length < 3 || card.turning_points.length > 8) {
    return 'turning_points must contain 3 to 8 anchors'
  }
  for (const point of card.turning_points) {
    if (typeof point !== 'object' || point === null || text(point.title).length === 0 || length(text(point.title)) > 15 ||
        !plotTypes.includes(point.type) || text(point.event).length === 0 ||
        !tones.includes(point.tone) || text(point.locator).length === 0) {
      return 'a turning point needs a short title, plot type, event, tone and locator'
    }
  }
  return ''
}
const canonical = card => ({
  chapter: card.chapter,
  title: text(card.title),
  summary: text(card.summary),
  key_events: card.key_events.map(item => text(item)),
  characters: card.characters.map(item => ({ name: text(item.name), importance: item.importance })),
  turning_points: card.turning_points.map(point => ({
    title: text(point.title), type: point.type, event: text(point.event), tone: point.tone, locator: text(point.locator),
  })),
})

const runChapter = async chapter => {
  const path = chapterPath(chapter.chapter)
  try {
    if (existing.has(chapter.chapter) && !replace.has(chapter.chapter)) {
      return { status: 'skipped', chapter: chapter.chapter, path, reason: 'existing file is not in replace' }
    }
    phase(`Extract ${chapter.chapter}`)
    const extracted = await agent(`You are the chapter-extractor for this one chapter. Read ${root}/../creative/roles/chapter-extractor.md.
Read only lines ${chapter.start_line}-${chapter.end_line} of ${args.source} with native read. Chapter ${chapter.chapter}: ${chapter.title}.
Do not write files, delegate, or start a workflow. Do not read or analyze any other chapter.
Finish by calling structured_output with the short card. Plain text or JSON in a message does not return a workflow result.`, {
      label: `Extract ${chapter.chapter}`, schema: extractSchema,
    })
    const problem = cardError(extracted, chapter)
    if (problem) return { status: 'failed', chapter: chapter.chapter, path, reason: problem }
    const card = canonical(extracted)
    phase(`Write ${chapter.chapter}`)
    const overwrite = replace.has(chapter.chapter)
    const written = await agent(`Render this one chapter card to exactly this file: ${path}
${overwrite ? 'This chapter is listed in replace, so overwrite the file if it exists.' : 'The parent did not list this chapter in existing. Create the file.'}
Do not read or write any other chapter. Do not extract. This card JSON is the only source:
${JSON.stringify(card)}
Use this markdown shape and no other chapter:
## 第${chapter.chapter}章 ${card.title}
**概要**：the summary as one paragraph
**关键事件**：a numbered list of key_events
**出场人物**：one "- name（importance）" line per character
**转折锚点**：one numbered line per turning point: **title**：类型type | event | 基调：tone | 原文定位：locator
Return written as the exact path above and bytes as the UTF-8 size of that file.`, {
      label: `Write ${chapter.chapter}`, schema: writeSchema,
    })
    if (written === null || written === undefined) {
      return { status: 'failed', chapter: chapter.chapter, path, reason: 'writer returned no structured result' }
    }
    if (typeof written !== 'object' || !Number.isInteger(written.bytes) || written.bytes <= 0) {
      return { status: 'failed', chapter: chapter.chapter, path, reason: 'writer returned 0 bytes' }
    }
    if (written.written !== path) {
      return { status: 'failed', chapter: chapter.chapter, path, reason: 'writer path mismatch' }
    }
    return { status: 'written', chapter: chapter.chapter, path, bytes: written.bytes }
  } catch (error) {
    const reason = typeof error === 'object' && error !== null && typeof error.message === 'string'
      ? error.message
      : String(error)
    return { status: 'failed', chapter: chapter.chapter, path, reason }
  }
}

phase('Analyze batch')
const results = await parallel(args.chapters.map(chapter => () => runChapter(chapter)))
if (!Array.isArray(results) || results.length !== args.chapters.length) {
  throw new Error('parallel did not return one result per chapter')
}
const ordered = [...results].sort((left, right) => left.chapter - right.chapter)
return {
  written: ordered.filter(item => item.status === 'written').map(({ chapter, path, bytes }) => ({ chapter, path, bytes })),
  failed: ordered.filter(item => item.status === 'failed').map(({ chapter, path, reason }) => ({ chapter, path, reason })),
  skipped: ordered.filter(item => item.status === 'skipped').map(({ chapter, path, reason }) => ({ chapter, path, reason })),
}
