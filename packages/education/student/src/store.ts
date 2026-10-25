import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { stateSchema, type StudyState } from './schema.ts'
import { taughtUnit } from './learning/shared.ts'
import { scheduleMistakes } from './learning/schedule.ts'
import { diagnosticFor, insightSummary, studyInsight } from './learning/mastery.ts'
import { studyStatus } from './learning/status.ts'
import { checkInHistory, curriculumView, objectiveElements, reviewPlan } from './learning/view.ts'
import { updateStudy } from './learning/update/index.ts'
import { curriculumFor, subjectIdeas } from './curriculum.ts'

const MAX_BYTES = 8_388_608

/**
 * One-time fix for worksheets saved before the place-value rule split borrowing from crossing.
 * A figure that mixed `regroup: 'yes'` with crossed dots had its crosses dropped; the subtraction
 * the author intended stays answerable because the prompt and answer are unchanged.
 */
function migrateLegacyFigures(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return parsed
  const worksheets = (parsed as { worksheets?: unknown }).worksheets
  if (!Array.isArray(worksheets)) return parsed
  for (const worksheet of worksheets) {
    const items = (worksheet as { items?: unknown }).items
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const figure = (item as { figure?: { kind?: string; regroup?: string; crossTens?: number; crossOnes?: number } }).figure
      if (figure?.kind === 'place-value' && figure.regroup === 'yes' && ((figure.crossTens ?? 0) > 0 || (figure.crossOnes ?? 0) > 0)) {
        figure.crossTens = 0
        figure.crossOnes = 0
      }
    }
  }
  return parsed
}

/**
 * Turn a saved hint flag into a hint level before parsing.
 * Missing workbook drafts and the teaching queue are filled by the state schema defaults.
 */
export function migrateStudyFile(parsed: unknown): unknown {
  const next = migrateLegacyFigures(parsed)
  if (typeof next !== 'object' || next === null) return next
  const task = (next as { task?: unknown }).task
  if (typeof task === 'object' && task !== null) {
    const record = task as { hintRequested?: unknown; hintLevel?: unknown }
    if (typeof record.hintLevel !== 'number') record.hintLevel = record.hintRequested === true ? 1 : 0
    delete record.hintRequested
  }
  return next
}

/**
 * Read or update .study/state.json in the calling Session's filesystem.
 * Reads preserve absence; writes require the observed version and current sandbox policy.
 * A competing writer causes an error, never an automatic replay of learning evidence.
 * Parsed states are cached per observed file version, so unchanged reads skip re-reading
 * and re-validating the file; any write or external change drops the cache entry.
 */
const stateCache = new Map<unknown, { version: unknown; state: StudyState }>()

export async function studyStore(exec: Pick<ToolExecution, 'agent' | 'signal'>, command?: unknown, expectedRevision?: number): Promise<StudyState | undefined> {
  const agent = exec.agent
  if (!agent?.session.header.cwd) throw new Error('请先在 DSH 中打开学习工作区。')
  exec.signal.throwIfAborted()
  const fs = agent.ctx.get('fs')
  const policy = agent.ctx.get('sandboxPolicy')
  if (!fs || !policy) throw new Error('学生插件需要 DSH 文件系统和沙箱策略服务。')
  const cwd = agent.session.header.cwd
  const root = await fs.resolve(cwd, { signal: exec.signal })
  const target = await fs.resolve('.study/state.json', { cwd, signal: exec.signal })
  if (!fs.contains(root, target)) throw new Error('学习档案必须位于当前工作区内。')
  const before = await fs.stat(target, exec.signal)
  let state: StudyState | undefined
  if (before) {
    if (before.type !== 'file') throw new Error('.study/state.json 必须是普通文件。')
    const cached = stateCache.get(target)
    if (cached && cached.version === before.version) {
      state = cached.state
    } else {
      const bytes = await fs.readBytes(target, exec.signal, MAX_BYTES)
      const after = await fs.stat(target, exec.signal)
      if (after?.version !== before.version) throw new Error('学习档案已更新，请查询最新状态后重试。')
      state = scheduleMistakes(stateSchema.parse(migrateStudyFile(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))))
      if (stateCache.size >= 8) stateCache.clear()
      stateCache.set(target, { version: after?.version ?? before.version, state })
    }
  }
  if (command === undefined) return state
  if (expectedRevision !== undefined && expectedRevision !== (state?.revision ?? 0)) throw new StudyConflict()
  const next = updateStudy(state, command, Date.now())
  if (next === state) return state
  const content = `${JSON.stringify(next, null, 2)}\n`
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('本学期学习档案已达到 8 MiB 限制，请备份并使用新工作区。')
  await fs.writeText(target, content, before ? { kind: 'replaceIfVersion', version: before.version } : { kind: 'createIfAbsent' }, exec.signal, policy.resolve({ session: agent.session }))
  stateCache.delete(target)
  return next
}

/**
 * Bounded history and status queries. Offset pagination applies to every collection.
 * @param state - current durable learning state, or undefined before setup.
 * @param kind - record collection or projection to read.
 * @param offset - zero-based collection offset.
 * @param options - optional exact record ID, subject and unit filters, grade/term for browsing another knowledge map or a cross-grade check-in plan.
 * @returns the projection or one page of records.
 */
export function queryStudy(state: StudyState | undefined, kind: string, offset: number, options: { id?: string; subject?: 'chinese' | 'math' | 'english'; unit?: string; grade?: number; term?: 'first' | 'second' } = {}) {
  if (!state) return { phase: 'setup-required', path: '.study/state.json' }
  const { id, subject, unit } = options
  const now = Date.now()
  if (kind === 'status') {
    const summary = studyStatus(state, now)
    return { ...summary, ...insightSummary(studyInsight(state, now)),
      progress: summary.progress.slice(0, 20), progressCount: summary.progress.length,
      dueMistakes: summary.dueMistakes.slice(0, 20), dueMistakeCount: summary.dueMistakes.length,
      pendingMistakes: summary.pendingMistakes.slice(0, 20), pendingMistakeCount: summary.pendingMistakes.length,
      teachingQueue: state.teachingQueue.slice(0, 20), teachingQueueCount: state.teachingQueue.length,
      workbookDrafts: state.workbookDrafts.slice(0, 20), workbookDraftCount: state.workbookDrafts.length,
      more: 'The study skill owns what to do next; kind=progress, due, weak or curriculum with offset pages more records.',
    }
  }
  if (kind === 'curriculum') {
    if (!subject) throw new Error('知识地图查询需要指定科目（subject）。')
    const scope = options.grade !== undefined || options.term !== undefined ? { grade: options.grade ?? state.profile.grade, term: options.term ?? state.profile.term } : undefined
    return { revision: state.revision, curriculum: curriculumView(state, subject, studyInsight(state, now), scope) }
  }
  if (kind === 'elements') {
    if (!subject) throw new Error('知识要素查询需要指定科目（subject）。')
    if (options.grade !== undefined || options.term !== undefined) throw new Error('知识要素只支持当前学期的知识地图。')
    const file = curriculumFor(state.profile, subject)
    if (!file) throw new Error('当前档案没有该科知识地图。')
    const page = file.objectives
      .filter(objective => {
        const unitId = file.concepts.find(concept => concept.id === objective.conceptIds[0])?.unit ?? ''
        if (!taughtUnit(state, subject, unitId)) return false
        if (unit !== undefined && unitId !== unit) return false
        return id === undefined || objective.id === id
      })
      .map(objective => {
        const elements = objectiveElements(state, objective.id)
        const unitId = file.concepts.find(concept => concept.id === objective.conceptIds[0])?.unit ?? ''
        return {
          id: objective.id, title: objective.title, goal: objective.goal, method: objective.method, unit: unitId,
          errorTypes: elements?.errorTypes ?? [], questionPoints: elements?.questionPoints ?? [], variationAxes: elements?.variationAxes ?? [],
          misconceptions: elements?.misconceptions ?? [], examples: elements?.examples ?? [], hintLadder: elements?.hintLadder ?? ['', '', ''],
          knowledgePoints: file.concepts.filter(concept => objective.conceptIds.includes(concept.id)).map(concept => ({
            id: concept.id, name: concept.name, definition: concept.definition, example: concept.example,
            ...((concept.ideaIds?.length ?? 0) > 0 ? { ideas: subjectIdeas(subject).filter(idea => concept.ideaIds?.includes(idea.id)).map(idea => ({ id: idea.id, name: idea.name, definition: idea.definition, example: idea.example })) } : {}),
            ...(concept.facts !== undefined ? { facts: concept.facts } : {}),
            ...(concept.misconceptions !== undefined ? { misconceptions: concept.misconceptions } : {}),
            ...(concept.examples !== undefined ? { examples: concept.examples } : {}),
          })),
        }
      })
    return {
      revision: state.revision, subject, objectives: page.slice(offset, offset + 20),
      nextOffset: offset + 20 < page.length ? offset + 20 : null,
      more: 'Write questions and hints from these elements and the hint ladder; the full rules live in the study skill.',
    }
  }
  if (kind === 'review-sheet') {
    if (!subject) throw new Error('巩固卷查询需要指定科目（subject）。')
    return { revision: state.revision, ...reviewPlan(state, subject, now),
      more: 'Write one new question per pick and one per objectiveFill; variant distance and reuse limits are schema-enforced and explained in the study skill.', }
  }
  if (kind === 'diagnose') {
    const scope = options.grade !== undefined || options.term !== undefined
      ? { grade: options.grade ?? state.profile.grade, term: options.term ?? state.profile.term, ...(options.unit !== undefined ? { units: [options.unit] } : {}) }
      : undefined
    if (scope && !subject) throw new Error('跨年级摸底计划需要指定科目（subject）。')
    const diagnostics = scope && subject ? [diagnosticFor(state, subject, now, scope)] : studyInsight(state, now).diagnostics
    return { revision: state.revision, diagnostics: subject ? diagnostics.filter(plan => plan.subject === subject) : diagnostics,
      history: checkInHistory(state).filter(item => !subject || item.subject === subject),
      more: 'Ask one short task per sampled objective and record each answer; the study skill describes the flow and intensities, and grade/term narrows the scope.', }
  }
  if (kind === 'weak') {
    const insight = studyInsight(state, now)
    return { revision: state.revision, ...insightSummary(insight),
      weakPoints: insight.weakPoints.map(item => ({ id: item.id, subject: item.subject, title: item.title, goal: item.goal, level: item.level, priority: item.priority, reasons: item.reasons })),
      practised: insight.objectives.filter(item => item.attempts > 0 || item.activeMistakes > 0).map(item => ({ id: item.id, subject: item.subject, title: item.title, level: item.level, independentDays: item.independentDays, attempts: item.attempts, helpedOrWrong: item.helpedOrWrong, activeMistakes: item.activeMistakes, dueMistakes: item.dueMistakes })),
      more: 'Use kind=curriculum with a subject for the map behind these weak points.',
    }
  }
  type CollectionItem = (StudyState['mistakes'] | StudyState['concepts'] | StudyState['objectives'] | StudyState['relations'] | StudyState['worksheets'] | StudyState['paperResults'] | StudyState['materials'] | StudyState['sessions'] | StudyState['attempts'] | ReturnType<typeof studyStatus>['progress'])[number]
  const collections: Record<string, CollectionItem[]> = {
    due: state.mistakes.filter(item => item.dueAt !== undefined && item.dueAt <= now),
    pending: state.mistakes.filter(item => item.confirmedAt === undefined),
    progress: studyStatus(state, now).progress,
    concepts: state.concepts, objectives: state.objectives, relations: state.relations,
    worksheets: state.worksheets.map(sheet => ({ ...sheet, drafts: state.paperDrafts.filter(draft => draft.worksheetId === sheet.id) })),
    'paper-results': state.paperResults, materials: state.materials, mistakes: state.mistakes,
    sessions: state.sessions, attempts: state.attempts,
  }
  const chosen: CollectionItem[] | undefined = Object.hasOwn(collections, kind) ? collections[kind] : undefined
  if (chosen === undefined) throw new Error(`未知的查询类型：${kind}。可用的类型见 study_status 工具说明。`)
  const records = chosen
  const selected = records.filter(item => {
    if (id && (!('id' in item) || item.id !== id)) return false
    if (!subject) return true
    if ('subject' in item) return item.subject === subject
    if ('fromId' in item) return state.concepts.some(concept => concept.id === item.fromId && concept.subject === subject)
    if ('worksheetId' in item) return state.worksheets.some(sheet => sheet.id === item.worksheetId && sheet.subject === subject)
    return true
  })
  return { revision: state.revision, total: selected.length, items: selected.slice(offset, offset + 20), nextOffset: offset + 20 < selected.length ? offset + 20 : null }
}

/** A stale sidebar must reload before it can change learning evidence. */
export class StudyConflict extends Error { constructor() { super('学习档案已更新，请刷新后核对再保存。') } }
