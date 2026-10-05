import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { stateSchema, type StudyState } from './schema.ts'
import { studyStatus, updateStudy } from './learning.ts'

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

/** Bounded history and status queries. Offset pagination applies to every collection. */
export function queryStudy(state: StudyState | undefined, kind: string, offset: number, id?: string) {
  if (!state) return { phase: 'setup-required', path: '.study/state.json' }
  if (kind === 'status') {
    const summary = studyStatus(state, Date.now())
    return { ...summary,
      progress: summary.progress.slice(0, 20), progressCount: summary.progress.length,
      dueMistakes: summary.dueMistakes.slice(0, 20), dueMistakeCount: summary.dueMistakes.length,
      pendingMistakes: summary.pendingMistakes.slice(0, 20), pendingMistakeCount: summary.pendingMistakes.length,
      more: 'Use study_status kind=progress, due or pending with offset for more records.',
    }
  }
  const records = kind === 'due' ? state.mistakes.filter(item => item.dueAt !== undefined && item.dueAt <= Date.now())
    : kind === 'pending' ? state.mistakes.filter(item => item.confirmedAt === undefined)
    : kind === 'progress' ? studyStatus(state, Date.now()).progress
    : kind === 'materials' ? state.materials : kind === 'mistakes' ? state.mistakes
      : kind === 'sessions' ? state.sessions : state.attempts
  const selected = id ? records.filter(item => 'id' in item && item.id === id) : records
  return { revision: state.revision, total: selected.length, items: selected.slice(offset, offset + 20), nextOffset: offset + 20 < selected.length ? offset + 20 : null }
}

/** A stale sidebar must reload before it can change learning evidence. */
export class StudyConflict extends Error { constructor() { super('学习档案已更新，请刷新后核对再保存。') } }
