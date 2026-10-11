import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { stateSchema, type StudyState } from './schema.ts'
import { curriculumView, insightSummary, studyInsight, studyStatus, updateStudy } from './learning.ts'

const MAX_BYTES = 8_388_608

/**
 * Read or update .study/state.json in the calling Session's filesystem.
 * Reads preserve absence; writes require the observed version and current sandbox policy.
 * A competing writer causes an error, never an automatic replay of learning evidence.
 */
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
    const bytes = await fs.readBytes(target, exec.signal, MAX_BYTES)
    const after = await fs.stat(target, exec.signal)
    if (after?.version !== before.version) throw new Error('学习档案已更新，请查询最新状态后重试。')
    state = stateSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
  }
  if (command === undefined) return state
  if (expectedRevision !== undefined && expectedRevision !== (state?.revision ?? 0)) throw new StudyConflict()
  const next = updateStudy(state, command, Date.now())
  if (next === state) return state
  const content = `${JSON.stringify(next, null, 2)}\n`
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('本学期学习档案已达到 8 MiB 限制，请备份并使用新工作区。')
  await fs.writeText(target, content, before ? { kind: 'replaceIfVersion', version: before.version } : { kind: 'createIfAbsent' }, exec.signal, policy.resolve({ session: agent.session }))
  return next
}

/**
 * Bounded history and status queries. Offset pagination applies to every collection.
 * @param state - current durable learning state, or undefined before setup.
 * @param kind - record collection or projection to read.
 * @param offset - zero-based collection offset.
 * @param options - optional exact record ID, subject filter, and grade/term for browsing another knowledge map.
 * @returns the projection or one page of records.
 */
export function queryStudy(state: StudyState | undefined, kind: string, offset: number, options: { id?: string; subject?: 'chinese' | 'math' | 'english'; grade?: number; term?: 'first' | 'second' } = {}) {
  if (!state) return { phase: 'setup-required', path: '.study/state.json' }
  const { id, subject } = options
  const now = Date.now()
  if (kind === 'status') {
    const summary = studyStatus(state, now)
    return { ...summary, ...insightSummary(studyInsight(state, now)),
      progress: summary.progress.slice(0, 20), progressCount: summary.progress.length,
      dueMistakes: summary.dueMistakes.slice(0, 20), dueMistakeCount: summary.dueMistakes.length,
      pendingMistakes: summary.pendingMistakes.slice(0, 20), pendingMistakeCount: summary.pendingMistakes.length,
      more: 'Use study_status kind=progress, due, weak or curriculum with offset for more records.',
    }
  }
  if (kind === 'curriculum') {
    if (!subject) throw new Error('知识地图查询需要指定科目（subject）。')
    const scope = options.grade !== undefined || options.term !== undefined ? { grade: options.grade ?? state.profile.grade, term: options.term ?? state.profile.term } : undefined
    return { revision: state.revision, curriculum: curriculumView(state, subject, studyInsight(state, now), scope) }
  }
  if (kind === 'diagnose') {
    const insight = studyInsight(state, now)
    return { revision: state.revision, diagnostics: subject ? insight.diagnostics.filter(plan => plan.subject === subject) : insight.diagnostics,
      more: 'Start a diagnose block for the subject, ask one short task per sampled objective with objectiveId, record each answer, then study_status kind=weak shows what to strengthen.' }
  }
  if (kind === 'weak') {
    const insight = studyInsight(state, now)
    return { revision: state.revision, ...insightSummary(insight),
      weakPoints: insight.weakPoints.map(item => ({ id: item.id, subject: item.subject, title: item.title, goal: item.goal, level: item.level, priority: item.priority, reasons: item.reasons })),
      practised: insight.objectives.filter(item => item.attempts > 0 || item.activeMistakes > 0).map(item => ({ id: item.id, subject: item.subject, title: item.title, level: item.level, independentDays: item.independentDays, attempts: item.attempts, helpedOrWrong: item.helpedOrWrong, activeMistakes: item.activeMistakes, dueMistakes: item.dueMistakes })),
      more: 'Use study_status kind=curriculum with a subject for units, knowledge points, objectives and relations.',
    }
  }
  const records = kind === 'due' ? state.mistakes.filter(item => item.dueAt !== undefined && item.dueAt <= now)
    : kind === 'pending' ? state.mistakes.filter(item => item.confirmedAt === undefined)
    : kind === 'progress' ? studyStatus(state, now).progress
    : kind === 'concepts' ? state.concepts : kind === 'objectives' ? state.objectives
      : kind === 'relations' ? state.relations : kind === 'worksheets' ? state.worksheets
        : kind === 'paper-results' ? state.paperResults
    : kind === 'materials' ? state.materials : kind === 'mistakes' ? state.mistakes
      : kind === 'sessions' ? state.sessions : state.attempts
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
