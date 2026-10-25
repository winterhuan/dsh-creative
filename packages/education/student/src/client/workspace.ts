import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dashboard, MistakeStatus } from '../dashboard.ts'
import type { TimeStatus } from '../learning/status.ts'
import type { Command } from '../schema.ts'

/** Query identity for one visible workbench: the open tab, notebook page, subject, notebook filter, an optional knowledge-map scope and an optional check-in scope. */
export interface StudyQuery { tab: 'today' | 'map' | 'mistakes' | 'parent'; offset: number; subject: 'chinese' | 'math' | 'english'; status: MistakeStatus; mapGrade?: number; mapTerm?: 'first' | 'second'; diagGrade?: number; diagTerm?: 'first' | 'second'; diagUnit?: string }

/** One conditional poll response: evidence unchanged, only the time-derived state moved. */
type PollResponse = Dashboard & { error?: string; unchanged?: boolean; time?: TimeStatus }

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
  // What the currently displayed payload was fetched with; a poll may go conditional only when both match.
  const seenSignature = useRef('')
  const seenRevision = useRef<number | undefined>(undefined)
  const signature = `${query.tab}:${query.offset}:${query.subject}:${query.status}:${query.mapGrade ?? ''}:${query.mapTerm ?? ''}:${query.diagGrade ?? ''}:${query.diagTerm ?? ''}:${query.diagUnit ?? ''}`
  const request = useCallback(async (change?: Command, revision?: number, conditional?: number) => {
    const sequence = ++latest.current
    const controller = new AbortController()
    controllers.current.add(controller)
    try {
      const scope = `${query.mapGrade !== undefined ? `&mapGrade=${query.mapGrade}` : ''}${query.mapTerm !== undefined ? `&mapTerm=${query.mapTerm}` : ''}${query.diagGrade !== undefined ? `&diagGrade=${query.diagGrade}` : ''}${query.diagTerm !== undefined ? `&diagTerm=${query.diagTerm}` : ''}${query.diagUnit !== undefined && query.diagUnit !== '' ? `&diagUnit=${encodeURIComponent(query.diagUnit)}` : ''}`
      const response = await fetch(`/student/workspace?sessionId=${encodeURIComponent(sessionId)}&tab=${query.tab}&mistakeOffset=${query.offset}&subject=${query.subject}&mistakeStatus=${query.status}${scope}${conditional !== undefined ? `&revision=${conditional}` : ''}`, {
        signal: controller.signal, ...(change ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ revision, change }) } : {}),
      })
      const value = await response.json() as PollResponse
      if (!response.ok) throw new Error(value.error ?? networkError)
      if (alive.current && sequence === latest.current) {
        offset.current = value.serverNow - Date.now()
        if (value.unchanged === true && value.time !== undefined) {
          setData(previous => previous && previous.study ? { ...previous, serverNow: value.serverNow, study: { ...previous.study, ...value.time } } : previous)
        } else {
          seenSignature.current = signature
          seenRevision.current = value.revision
          setData(value)
        }
        setError('')
      }
      return value
    } catch (reason) {
      if (alive.current && !controller.signal.aborted && sequence === latest.current) setError(reason instanceof Error ? reason.message : networkError)
      throw reason
    } finally { controllers.current.delete(controller) }
  }, [sessionId, networkError, query.tab, query.offset, query.subject, query.status, query.mapGrade, query.mapTerm, query.diagGrade, query.diagTerm, query.diagUnit, signature])
  const reload = useCallback(async () => {
    if (writing.current) return
    await request(undefined, undefined, seenSignature.current === signature ? seenRevision.current : undefined).catch(() => {})
  }, [request, signature])
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
