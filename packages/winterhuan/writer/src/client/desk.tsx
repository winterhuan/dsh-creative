/** Setting, outline, chapter list, and the prose editor. */
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { useEffect, useState } from 'react'
import { bookLabel, collectBookFiles, findBooks, type WriterFile, type WriterSection } from './library.ts'
import type { zh } from './locales.ts'
import { listWorkspace, readWorkspaceText, remoteMessage } from './read.ts'
import { saveWriterFile, type WriterSave } from './save.ts'

type Copy = (key: keyof typeof zh) => string

interface DeskProps {
  readonly sessionId: SessionId
  readonly cwd: string
  readonly remote: ClientRemote
  readonly t: Copy
  readonly visible: boolean
}

async function readDir(remote: ClientRemote, sessionId: SessionId, cwd: string, relative: string, signal: AbortSignal) {
  const path = relative === '' ? cwd : `${cwd.replace(/[/\\]+$/u, '')}/${relative}`
  const result = await listWorkspace(remote, sessionId, path, signal)
  if (!result.ok) throw new Error(remoteMessage(result.error, 'load'))
  return {
    entries: result.value.entries,
    truncated: result.value.truncated,
  }
}

/**
 * The writing sidebar body for one session.
 * @param props - session, workspace root, remote, and copy.
 * @returns the desk.
 */
export function WriterDesk({ sessionId, cwd, remote, t, visible }: DeskProps) {
  const [section, setSection] = useState<WriterSection>('chapter')
  const [books, setBooks] = useState<string[]>([])
  const [book, setBook] = useState('')
  const [files, setFiles] = useState<WriterFile[]>([])
  const [truncated, setTruncated] = useState(false)
  const [active, setActive] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState('')
  const [version, setVersion] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const shown = files.filter(file => file.section === section)
  const selected = shown.some(file => file.path === active) ? active : shown[0]?.path

  useEffect(() => {
    if (!visible) return undefined
    const controller = new AbortController()
    const signal = controller.signal
    setNotice(undefined)
    void (async () => {
      try {
        const found = await findBooks(relative => readDir(remote, sessionId, cwd, relative, signal).then(page => page.entries))
        if (signal.aborted) return
        setBooks(found)
        const nextBook = found.includes(book) ? book : found[0] ?? ''
        setBook(nextBook)
        let cut = false
        const listed = found.length === 0 ? [] : await collectBookFiles(async (relative) => {
          const page = await readDir(remote, sessionId, cwd, relative, signal)
          if (page.truncated) cut = true
          return page.entries
        }, nextBook)
        if (signal.aborted) return
        setFiles(listed)
        setTruncated(cut)
      } catch (error) {
        if (!signal.aborted) setNotice(error instanceof Error && error.message !== 'load' ? error.message : t('loadError'))
      }
    })()
    return () => { controller.abort() }
  }, [visible, sessionId, cwd, remote, reloadKey, book, t])

  useEffect(() => {
    if (!visible || selected === undefined) return undefined
    const controller = new AbortController()
    const path = `${cwd.replace(/[/\\]+$/u, '')}/${selected}`
    setConflict(false)
    setNotice(undefined)
    void readWorkspaceText(remote, sessionId, path, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (!result.ok) {
        setNotice(remoteMessage(result.error, t('loadError')))
        return
      }
      setDraft(result.value.text)
      setSaved(result.value.text)
      setVersion(result.value.version)
      setActive(selected)
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : t('loadError'))
    })
    return () => { controller.abort() }
  }, [visible, selected, sessionId, cwd, remote, reloadKey, t])

  const save = (): void => {
    if (selected === undefined || version === undefined || conflict || draft === saved || busy) return
    const path = selected
    const baseVersion = version
    const submitted = draft
    const controller = new AbortController()
    setBusy(true)
    void saveWriterFile(sessionId, path, submitted, baseVersion, controller.signal).then(async (response) => {
      const payload = await response.json() as WriterSave & { error?: string }
      if (response.status === 412) {
        setConflict(true)
        setNotice(payload.error ?? t('conflict'))
        return
      }
      if (!response.ok) {
        setNotice(payload.error ?? t('saveError'))
        return
      }
      setSaved(submitted)
      setVersion(payload.version)
      setNotice(t('saved'))
      setConflict(false)
    }).catch(() => {
      setNotice(t('saveError'))
    }).finally(() => { setBusy(false) })
  }

  const sections: readonly { id: WriterSection, label: string }[] = [
    { id: 'setting', label: t('setting') },
    { id: 'outline', label: t('outline') },
    { id: 'chapter', label: t('chapters') },
  ]
  return <div className="writer-desk" data-workbench="writer">
    <header className="writer-heading">
      <span>{t('title')}</span>
      {books.length > 1 && <label>{t('book')}<select aria-label={t('book')} value={book} onChange={event => { setBook(event.target.value); setActive(undefined) }}>{books.map(item => <option key={item || 'root'} value={item}>{bookLabel(item, t('workspaceBook'))}</option>)}</select></label>}
      <nav aria-label={t('description')}>
        {sections.map(item => <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)}>{item.label}</button>)}
      </nav>
      <button type="button" className="writer-reload" onClick={() => { setReloadKey(value => value + 1) }}>{t('reload')}</button>
    </header>
    <aside className="writer-list">
      {shown.length === 0 ? <p className="writer-empty">{t('empty')}</p> : <ul>{shown.map(file => <li key={file.path}><button type="button" aria-current={file.path === selected} onClick={() => { setActive(file.path) }}>{file.name}</button></li>)}</ul>}
      {truncated && <p className="writer-muted">{t('truncated')}</p>}
    </aside>
    <main className="writer-editor">
      {files.length === 0 && notice === undefined && <p className="writer-empty">{t('emptyHelp')}</p>}
      {notice !== undefined && <p role="alert" className="writer-alert">{notice}{conflict && <button type="button" onClick={() => { setReloadKey(value => value + 1) }}>{t('reloadDisk')}</button>}</p>}
      {selected !== undefined && <>
        <header>
          <span className="writer-path" title={selected}>{selected}</span>
          <button type="button" disabled={busy || conflict || version === undefined || draft === saved} onClick={save}>{t('save')}</button>
        </header>
        <textarea aria-label={selected} value={draft} onChange={event => { setDraft(event.target.value); setNotice(undefined) }} />
      </>}
    </main>
  </div>
}
