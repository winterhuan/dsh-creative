/**
 * Character cards, power-system limits, and relationship ceilings.
 *
 * Realm and ability values stay in the fact ledger (`kind` 能力). This module
 * only reads those rows and the card headers. It does not change tracking state.
 *
 * Body names are a local heuristic: two or three Han characters before a speech
 * or glance marker, `叫` plus a name, or a short honorific. There is no model
 * call. Bare `道` is not a marker, because it collides with words such as
 * `知道`. Names longer than three characters, and names that never sit in those
 * slots, are missed. A one-character name such as `甲` is missed unless it
 * carries an honorific. A stop list drops a few common words; other ordinary
 * words can still be reported. `设定/写作检查.json` key `cast_body_names` is
 * `hint` when absent, `off` to skip, or `blocking`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { loadFacts, type FactEntry, effectiveAttrs } from './facts.ts'
import { fieldValue, firstTable, sectionRange, textLines } from './markdown-scan.ts'
import { declaredAliases } from './settings-lookup.ts'
import { castBodyNamesMode } from './writing-check.ts'
import { findChapterFile } from './wordcount.ts'

/** Schema of {@link checkCast}. */
export const CAST_SCHEMA = 'story-cast-check/v1'
/** A name without a card is reported after this many chapter files mention it. */
export const CAST_APPEARANCE_THRESHOLD = 3

/** One cast, power, or relationship finding. */
export interface CastFinding {
  readonly severity: 'blocking' | 'hint'
  readonly category: string
  readonly message: string
  readonly evidence?: string
}

interface RealmRow {
  readonly name: string
  readonly rank: number
  readonly allowed: readonly string[]
  readonly denied: readonly string[]
  readonly cap: boolean
}

/**
 * Compare tracking names, repeated appearances, ability facts, and relationship ceilings with the cards.
 * @param project - the book directory.
 * @param options - optional chapter window for appearance counts. The default scans every numbered chapter file.
 */
export function checkCast(project: string, options: { readonly from?: number; readonly to?: number } = {}): {
  schema: typeof CAST_SCHEMA
  applicable: boolean
  ok: boolean
  findings: readonly CastFinding[]
} {
  const cards = cardIndex(project)
  const findings: CastFinding[] = []
  const stateNames = trackingNames(project)
  for (const name of stateNames) {
    if (!cards.has(name)) findings.push({ severity: 'hint', category: 'missing-card', message: `追踪有角色快照「${name}」，设定/角色/ 没有同名或别名卡`, evidence: name })
  }
  const appearances = appearanceCounts(project, options.from, options.to)
  let repeated = false
  for (const [name, count] of appearances) {
    if (count < CAST_APPEARANCE_THRESHOLD || cards.has(name)) continue
    repeated = true
    findings.push({ severity: 'hint', category: 'appearance', message: `「${name}」在范围内至少 ${String(count)} 章出场，没有角色卡`, evidence: name })
  }
  const realms = powerTable(project)
  const abilities = abilityFacts(project)
  if (realms.length > 0) {
    const cap = Math.max(...realms.filter(row => row.cap).map(row => row.rank), -1)
    for (const entry of abilities) findings.push(...abilityFindings(entry, realms, cap))
  }
  const relationships = relationshipFindings(project, options.from, options.to)
  findings.push(...relationships)
  const listed = outlineCastNames(project, options.from, options.to)
  let listedWithoutCard = false
  for (const name of listed) {
    if (cards.has(name)) continue
    listedWithoutCard = true
    findings.push({ severity: 'hint', category: 'outline-cast', message: `细纲出场名单有「${name}」，没有同名或别名角色卡`, evidence: name })
  }
  const bodyMode = castBodyNamesMode(project)
  const known = new Set(listed)
  let bodyNamed = false
  if (bodyMode !== 'off') {
    for (const name of bodyPersonNames(chapterProse(project, options.from, options.to))) {
      if (cards.has(name) || known.has(name)) continue
      bodyNamed = true
      findings.push({ severity: bodyMode, category: 'body-name', message: `正文里像人名的「${name}」不在角色卡、别名或细纲出场名单`, evidence: name })
    }
  }
  const applicable = stateNames.length > 0 || realms.length > 0 || relationships.length > 0 || repeated || cards.header || listedWithoutCard || bodyNamed
  return {
    schema: CAST_SCHEMA,
    applicable,
    ok: findings.every(item => item.severity !== 'blocking'),
    findings,
  }
}

function abilityFindings(entry: FactEntry, realms: readonly RealmRow[], cap: number): CastFinding[] {
  const attrs = effectiveAttrs(entry)
  const realmName = typeof attrs['境界'] === 'string' ? attrs['境界'] : undefined
  const means = typeof attrs['手段'] === 'string' ? attrs['手段'].split(/[、，,]/u).map(item => item.trim()).filter(item => item !== '') : []
  const findings: CastFinding[] = []
  const realm = realmName === undefined ? undefined : realms.find(row => row.name === realmName)
  if (realmName !== undefined && realm === undefined) {
    findings.push({ severity: 'blocking', category: 'realm', message: `${entry.id} 的境界「${realmName}」不在力量体系表`, evidence: entry.id })
  }
  if (realm !== undefined && cap >= 0 && realm.rank > cap) {
    findings.push({ severity: 'blocking', category: 'realm-cap', message: `${entry.id} 的境界「${realm.name}」超过本卷上限`, evidence: entry.id })
  }
  const denied = new Set((realm === undefined ? realms.filter(row => cap < 0 || row.rank <= cap) : [realm]).flatMap(row => row.denied))
  for (const mean of means) {
    if (!denied.has(mean)) continue
    findings.push({ severity: 'blocking', category: 'forbidden-means', message: `${entry.id} 使用了本卷禁用手段「${mean}」`, evidence: entry.id })
  }
  return findings
}

function relationshipFindings(project: string, from: number | undefined, to: number | undefined): CastFinding[] {
  const directory = join(project, '设定', '角色')
  if (!existsSync(directory)) return []
  const findings: CastFinding[] = []
  const haystack = chapterText(project, from, to)
  for (const name of readdirSync(directory).filter(item => item.endsWith('.md')).sort((left, right) => left.localeCompare(right, 'zh'))) {
    const text = readFileSync(join(directory, name), 'utf8')
    const lines = textLines(text)
    const stage = fieldValue(lines, '关系阶段')
    const order = fieldValue(lines, '阶段序')
    if (stage === undefined || order === undefined) continue
    const stages = order.value.split(/[、，,]/u).map(item => item.trim()).filter(item => item !== '')
    const matched = /(.+?)＝([^（(]+)/u.exec(stage.value)
    const person = matched?.[1]?.trim()
    const current = matched?.[2]?.trim()
    if (person === undefined || current === undefined) continue
    const ceiling = stages.indexOf(current)
    if (ceiling < 0) continue
    for (const later of stages.slice(ceiling + 1)) {
      if (!haystack.includes(`${person}＝${later}`)) continue
      findings.push({ severity: 'hint', category: 'relationship', message: `${person} 的关系阶段超过卡片上限「${current}」，正文或细纲写了「${later}」`, evidence: person })
    }
  }
  return findings
}

function powerTable(project: string): RealmRow[] {
  const path = join(project, '设定', '世界观', '力量体系.md')
  if (!existsSync(path)) return []
  const lines = textLines(readFileSync(path, 'utf8'))
  const section = sectionRange(lines, '境界') ?? { start: 0, end: lines.length, line: 1 }
  const table = firstTable(lines, section.start, section.end)
  if (table === undefined) return []
  const column = (name: string): number => table.headers.findIndex(header => header.includes(name))
  const name = column('境界')
  const rank = column('序号')
  const allowed = column('可用')
  const denied = column('禁用')
  const cap = column('上限')
  if (name < 0 || rank < 0) return []
  const rows: RealmRow[] = []
  for (const row of table.rows) {
    const label = row.cells[name]?.trim() ?? ''
    const order = Number(row.cells[rank] ?? '')
    if (label === '' || !Number.isInteger(order)) continue
    rows.push({
      name: label,
      rank: order,
      allowed: splitCell(row.cells[allowed] ?? ''),
      denied: splitCell(row.cells[denied] ?? ''),
      cap: (row.cells[cap] ?? '').includes('是'),
    })
  }
  return rows
}

function splitCell(value: string): string[] {
  return value.split(/[、，,]/u).map(item => item.trim()).filter(item => item !== '' && item !== '无')
}

function abilityFacts(project: string): FactEntry[] {
  try {
    return loadFacts(project).entries.filter(entry => entry.kind === '能力')
  } catch {
    return []
  }
}

function trackingNames(project: string): string[] {
  const path = join(project, '追踪', '_tracking-state.json')
  if (!existsSync(path)) return []
  try {
    const state = JSON.parse(readFileSync(path, 'utf8')) as { characters?: Record<string, unknown> }
    return Object.keys(state.characters ?? {}).sort((left, right) => left.localeCompare(right, 'zh'))
  } catch {
    return []
  }
}

interface CardIndex {
  has(name: string): boolean
  readonly header: boolean
}

function cardIndex(project: string): CardIndex {
  const names = new Set<string>()
  let header = false
  const directory = join(project, '设定', '角色')
  const info = statSync(directory, { throwIfNoEntry: false })
  if (info === undefined || !info.isDirectory()) return { has: name => names.has(name), header }
  for (const fileName of readdirSync(directory).filter(item => item.endsWith('.md'))) {
    const text = readFileSync(join(directory, fileName), 'utf8')
    names.add(basename(fileName, '.md'))
    for (const alias of declaredAliases(text)) names.add(alias)
    if (fieldValue(textLines(text), '定位') !== undefined) header = true
  }
  return { has: name => names.has(name), header }
}

function appearanceCounts(project: string, from: number | undefined, to: number | undefined): Map<string, number> {
  const watched = new Set<string>([...trackingNames(project), ...looseNames(project)])
  const counts = new Map<string, number>()
  const texts = chapterBodies(project, from, to)
  for (const name of watched) {
    if (name.length < 2) continue
    const count = texts.filter(text => text.includes(name)).length
    if (count > 0) counts.set(name, count)
  }
  return counts
}

function outlineCastNames(project: string, from: number | undefined, to: number | undefined): string[] {
  const names = new Set<string>()
  const start = from ?? 1
  const end = to ?? 200
  let misses = 0
  for (let chapter = start; chapter <= end; chapter += 1) {
    let path: string
    try {
      path = findChapterFile(join(project, '大纲'), chapter, { outline: true, allowMissing: true })
    } catch {
      misses += 1
      if (to === undefined && misses >= 15) break
      continue
    }
    if (!existsSync(path)) {
      misses += 1
      if (to === undefined && misses >= 15) break
      continue
    }
    misses = 0
    const field = fieldValue(textLines(readFileSync(path, 'utf8')), '出场顺序')
    if (field === undefined || field.value.trim() === '' || field.value.trim() === '无' || field.value.includes('待补充')) continue
    for (const token of castListTokens(field.value)) names.add(token)
  }
  return [...names].sort((left, right) => left.localeCompare(right, 'zh'))
}

/** Same separators as the outline cast list: ideographic comma, semicolon, arrows, 与, and 和. */
function castListTokens(text: string): string[] {
  const stripped = text.replace(/（[^）]*）/gu, ' ').replace(/\([^)]*\)/gu, ' ')
  return stripped.split(/->|[、，,；;／/|·→与和\s]+/u).map(part => part.trim()).filter(part => part.length >= 2)
}

function looseNames(project: string): string[] {
  const directory = join(project, '设定', '角色')
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter(name => name.endsWith('.md')).map(name => basename(name, '.md'))
}

function chapterBodies(project: string, from: number | undefined, to: number | undefined): string[] {
  const texts: string[] = []
  const start = from ?? 1
  const end = to ?? 200
  let misses = 0
  for (let chapter = start; chapter <= end; chapter += 1) {
    let chapterText = ''
    for (const outline of [true, false]) {
      try {
        const path = findChapterFile(join(project, outline ? '大纲' : '正文'), chapter, { outline, allowMissing: true })
        if (!existsSync(path)) continue
        chapterText += `${readFileSync(path, 'utf8')}\n`
      } catch {
        // A missing directory does not stop the other chapter files.
      }
    }
    if (chapterText !== '') texts.push(chapterText)
    misses = chapterText === '' ? misses + 1 : 0
    if (to === undefined && misses >= 15) break
  }
  return texts
}

function chapterText(project: string, from: number | undefined, to: number | undefined): string {
  return chapterBodies(project, from, to).join('\n')
}

const BODY_NAME_STOP = new Set([
  '什么', '怎么', '这个', '那个', '一个', '他们', '她们', '我们', '你们', '自己', '别人', '大家',
  '这里', '那里', '然后', '于是', '突然', '忽然', '已经', '可是', '但是', '因为', '所以', '如果',
  '虽然', '不过', '还有', '没有', '不是', '就是', '只是', '还是', '或者', '以及', '时候', '地方',
  '东西', '事情', '声音', '眼神', '目光', '心里', '手里', '身边', '面前', '身后', '门口', '屋里',
  '外面', '里面', '知道', '觉得', '看到', '听到', '有人', '无人', '为何', '如何', '这位', '那位',
  '哪位', '谁也', '回来', '过去', '出来', '进去',
])

/**
 * Possible person tokens in chapter prose.
 * @param text - concatenated chapter bodies, not outlines.
 */
function bodyPersonNames(text: string): string[] {
  const found = new Set<string>()
  const take = (name: string | undefined): void => {
    if (name === undefined || name.length < 2 || BODY_NAME_STOP.has(name)) return
    found.add(name)
  }
  for (const match of text.matchAll(/(?:^|[^\u4e00-\u9fff])([\u4e00-\u9fff]{2,3})(?:说道|看向|问道|笑道|喊道)/gu)) take(match[1])
  for (const match of text.matchAll(/(?:^|[^\u4e00-\u9fff])([\u4e00-\u9fff]{2,3})([说问笑喊道])(?=[：:「“"'])/gu)) {
    const name = match[1]
    if (match[2] === '道' && name !== undefined && /[说问笑喊知报味门]$/u.test(name)) continue
    take(name)
  }
  for (const match of text.matchAll(/(?:^|[^\u4e00-\u9fff])叫(?!做|作|了|一声|着)([\u4e00-\u9fff]{2,3})(?![\u4e00-\u9fff])/gu)) take(match[1])
  for (const match of text.matchAll(/(?:^|[^\u4e00-\u9fff])([\u4e00-\u9fff]{1,2})(先生|小姐|姑娘|公子|大人|师父|师傅)/gu)) {
    take(`${match[1] ?? ''}${match[2] ?? ''}`)
  }
  return [...found].sort((left, right) => left.localeCompare(right, 'zh'))
}

function chapterProse(project: string, from: number | undefined, to: number | undefined): string {
  const texts: string[] = []
  const start = from ?? 1
  const end = to ?? 200
  let misses = 0
  for (let chapter = start; chapter <= end; chapter += 1) {
    let path: string
    try {
      path = findChapterFile(join(project, '正文'), chapter, { outline: false, allowMissing: true })
    } catch {
      misses += 1
      if (to === undefined && misses >= 15) break
      continue
    }
    if (!existsSync(path)) {
      misses += 1
      if (to === undefined && misses >= 15) break
      continue
    }
    misses = 0
    texts.push(readFileSync(path, 'utf8'))
  }
  return texts.join('\n')
}
