/** Read and write this book's rule_audit and facts_diff gates. */
import { useState } from 'react'
import { projectPath } from '../project-path.ts'
import type { CreativeTranslate } from './locales/index.ts'
import { endpoint } from './workbench-ui.ts'

const GATES = ['rule_audit', 'facts_diff'] as const
type GateKey = typeof GATES[number]
type GateMode = 'off' | 'required'

interface Pending {
  readonly key: GateKey
  readonly mode: GateMode
}

/**
 * Merge one gate into a writing-check object. Other keys stay as they are.
 * @param content - current file text, or undefined when the file is absent.
 * @param key - the gate to set.
 * @param mode - `required` or `off`.
 * @returns pretty JSON for the book file.
 */
export function writingCheckWithGate(content: string | undefined, key: GateKey, mode: GateMode): string {
  let record: Record<string, unknown> = {}
  if (content !== undefined && content.trim() !== '') {
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid')
    record = { ...(parsed as Record<string, unknown>) }
  }
  record[key] = mode
  return `${JSON.stringify(record, null, 2)}\n`
}

function explicitMode(value: unknown): GateMode | undefined {
  return value === 'off' || value === 'required' ? value : undefined
}

/**
 * Overview control for one book's writing gates.
 * @param props - the selected book and the session that owns its files.
 * @returns a closed disclosure until the author opens it.
 */
export function StoryGatesCard({ sessionId, root, t }: { readonly sessionId: string; readonly root: string; readonly t: CreativeTranslate }) {
  const path = projectPath(root, '设定/写作检查.json')
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<string | undefined>()
  const [version, setVersion] = useState<string | undefined>()
  const [missing, setMissing] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [pending, setPending] = useState<Pending | undefined>()
  const [notice, setNotice] = useState<'saved' | 'error' | undefined>()
  const [busy, setBusy] = useState(false)

  const load = async (): Promise<void> => {
    setBusy(true)
    setNotice(undefined)
    try {
      const response = await fetch(endpoint('file', sessionId, path))
      if (response.status === 404) {
        setContent(undefined)
        setVersion(undefined)
        setMissing(true)
        setInvalid(false)
        return
      }
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      const file = await response.json() as { content?: unknown; version?: unknown }
      if (typeof file.content !== 'string' || typeof file.version !== 'string') throw new Error('shape')
      const parsed: unknown = JSON.parse(file.content)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape')
      for (const key of GATES) {
        const item = (parsed as Record<string, unknown>)[key]
        if (item !== undefined && item !== 'off' && item !== 'required') throw new Error('mode')
      }
      setContent(file.content)
      setVersion(file.version)
      setMissing(false)
      setInvalid(false)
    } catch {
      setInvalid(true)
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (pending === undefined || invalid) return
    setBusy(true)
    try {
      const next = writingCheckWithGate(content, pending.key, pending.mode)
      const response = await fetch(endpoint('file', sessionId, path), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(version === undefined ? { content: next, intent: 'create' } : { content: next, baseVersion: version }),
      })
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      const file = await response.json() as { content?: unknown; version?: unknown }
      setContent(typeof file.content === 'string' ? file.content : next)
      setVersion(typeof file.version === 'string' ? file.version : version)
      setMissing(false)
      setPending(undefined)
      setNotice('saved')
    } catch {
      setNotice('error')
    } finally {
      setBusy(false)
    }
  }

  let parsed: Record<string, unknown> | undefined
  if (!invalid && content !== undefined) {
    try {
      const value: unknown = JSON.parse(content)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) parsed = value as Record<string, unknown>
      else parsed = undefined
    } catch {
      parsed = undefined
    }
  }

  return <section className="story-dashboard-card" aria-label={t('dashboard.gates.title')}>
    <button type="button" aria-expanded={open} onClick={() => {
      const next = !open
      setOpen(next)
      if (next) void load()
    }}>{t('dashboard.gates.title')}</button>
    {open && <>
      <p className="story-dashboard-muted">{t('dashboard.gates.book')}</p>
      {missing && <p className="story-dashboard-muted">{t('dashboard.gates.missing')}</p>}
      {invalid && <p role="alert">{t('dashboard.gates.invalid')}</p>}
      {notice === 'saved' && <p>{t('dashboard.gates.saved')}</p>}
      {notice === 'error' && <p role="alert">{t('dashboard.gates.error')}</p>}
      {GATES.map(key => {
        const explicit = explicitMode(parsed?.[key])
        const effective = explicit ?? 'required'
        return <div key={key} className="story-dashboard-heading">
          <span>{t(key === 'rule_audit' ? 'dashboard.gates.ruleAudit' : 'dashboard.gates.factsDiff')}</span>
          <span>{t(effective === 'off' ? 'dashboard.gates.off' : 'dashboard.gates.required')}</span>
          <button type="button" disabled={busy || invalid || explicit === 'required'} onClick={() => { setPending({ key, mode: 'required' }); setNotice(undefined) }}>{t('dashboard.gates.setRequired')}</button>
          <button type="button" disabled={busy || invalid || explicit === 'off'} onClick={() => { setPending({ key, mode: 'off' }); setNotice(undefined) }}>{t('dashboard.gates.setOff')}</button>
        </div>
      })}
      {pending !== undefined && <div>
        <p>{t('dashboard.gates.book')}</p>
        <button type="button" disabled={busy} onClick={() => { void save() }}>{t('dashboard.gates.confirm')}</button>
        <button type="button" disabled={busy} onClick={() => setPending(undefined)}>{t('dashboard.gates.cancel')}</button>
      </div>}
    </>}
  </section>
}
