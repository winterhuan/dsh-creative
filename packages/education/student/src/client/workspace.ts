import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dashboard, MistakeStatus } from '../dashboard.ts'
import type { Command } from '../schema.ts'

/** Query identity for one visible workbench: notebook page, subject, notebook filter, an optional knowledge-map scope and an optional check-in scope. */
export interface StudyQuery { offset: number; subject: 'chinese' | 'math' | 'english'; status: MistakeStatus; mapGrade?: number; mapTerm?: 'first' | 'second'; diagGrade?: number; diagTerm?: 'first' | 'second'; diagUnit?: string }

/** Poll visible workbenches; preserve data on failure and discard obsolete responses. */
export function useStudy(sessionId: string, visible: boolean, networkError: string, query: StudyQuery) {
  const [data, setData] = useState<Dashboard>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const latest = useRef(0)
  const alive = useRef(true)
  const writing = useRef(false)
  const offset = useRef(0)
  const controllers = useRef(new Set<AbortController>())
  const request = useCallback(async (change?: Command, revision?: number) => {
    const sequence = ++latest.current
    const controller = new AbortController()
    controllers.current.add(controller)
    try {
      const scope = `${query.mapGrade !== undefined ? `&mapGrade=${query.mapGrade}` : ''}${query.mapTerm !== undefined ? `&mapTerm=${query.mapTerm}` : ''}${query.diagGrade !== undefined ? `&diagGrade=${query.diagGrade}` : ''}${query.diagTerm !== undefined ? `&diagTerm=${query.diagTerm}` : ''}${query.diagUnit !== undefined && query.diagUnit !== '' ? `&diagUnit=${encodeURIComponent(query.diagUnit)}` : ''}`
      const response = await fetch(`/student/workspace?sessionId=${encodeURIComponent(sessionId)}&mistakeOffset=${query.offset}&subject=${query.subject}&mistakeStatus=${query.status}${scope}`, {
        signal: controller.signal, ...(change ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision, change }) } : {}),
      })
      const value = await response.json() as Dashboard & { error?: string }
      if (!response.ok) throw new Error(value.error ?? networkError)
      if (alive.current && sequence === latest.current) {
        offset.current = value.serverNow - Date.now()
        setData(value)
        setError('')
      }
      return value
    } catch (reason) {
      if (alive.current && !controller.signal.aborted && sequence === latest.current) setError(reason instanceof Error ? reason.message : networkError)
      throw reason
    } finally { controllers.current.delete(controller) }
  }, [sessionId, networkError, query.offset, query.subject, query.status, query.mapGrade, query.mapTerm, query.diagGrade, query.diagTerm, query.diagUnit])
  const reload = useCallback(async () => { if (!writing.current) await request().catch(() => {}) }, [request])
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; latest.current++; for (const controller of controllers.current) controller.abort() }
  }, [])
  useEffect(() => {
    if (!visible) return
    void reload()
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') void reload() }, 3000)
    return () => window.clearInterval(timer)
  }, [visible, reload])
  const change = useCallback(async (command: Command, revision = data?.revision ?? 0) => {
    if (writing.current) throw new Error(networkError)
    writing.current = true
    setBusy(true)
    try { return await request(command, revision) }
    finally { writing.current = false; if (alive.current) setBusy(false) }
  }, [request, data?.revision, networkError])
  return { data, error, busy, reload, change, offset }
}
