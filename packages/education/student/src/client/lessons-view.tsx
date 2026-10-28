import { useState } from 'react'
import type { Dashboard } from '../dashboard.ts'
import type { Translate } from './locales.ts'

type Lesson = Dashboard['interactiveLessons']['lessons'][number]
const statusKey = { generating: 'openmaicGenerating', ready: 'openmaicReady', failed: 'openmaicFailed' } as const

/**
 * Open a classroom URL in another browser tab.
 * The desk does not embed the classroom: a cross-origin frame would not carry the OpenMAIC cookie,
 * and a static export player is intentionally absent.
 */
/** http(s) URL without credentials, or undefined when the desk must not offer it. */
function httpUrl(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined
  let parsed: URL
  try { parsed = new URL(value) } catch { return undefined }
  if (parsed.username !== '' || parsed.password !== '' || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return undefined
  return parsed.href
}

function openLesson(url: string) {
  // TODO: do not add a sidebar iframe or a static export player. Playback stays in the system browser.
  const href = httpUrl(url)
  if (href === undefined) return
  window.open(href, '_blank', 'noopener,noreferrer')
}

/** Recent OpenMAIC lessons: open or copy the URL, and ask the tutor to generate, retry or review. */
export function LessonsPanel({ lessons, error, disabled, running, t, onGenerate, onRetry, onReview }: {
  lessons: Lesson[]
  error?: string
  disabled: boolean
  running: boolean
  t: Translate
  onGenerate: () => void
  onRetry: (runId: string) => void
  onReview: (classroomId: string) => void
}) {
  const [copiedId, setCopiedId] = useState('')
  const busy = disabled || running
  return <section aria-label={t('openmaicTitle')}>
    <h3>{t('openmaicTitle')}</h3>
    <p className="student-muted">{t('openmaicHelp')}</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={onGenerate}>{t('openmaicGenerate')}</button>
    {lessons.length === 0 ? <p>{t('openmaicEmpty')}</p> : lessons.map((lesson, index) => <details key={lesson.id} open={index === 0}>
      <summary>{lesson.title} · {t(statusKey[lesson.status])}</summary>
      <p className="student-muted">{lesson.requirement}</p>
      {lesson.warning && <p>{t('openmaicWarning')}: {lesson.warning}</p>}
      {lesson.error && <p role="alert">{lesson.error}</p>}
      {httpUrl(lesson.url) && <>
        <p className="student-url">{httpUrl(lesson.url)}</p>
        <div className="student-segments">
          <button type="button" onClick={() => openLesson(lesson.url ?? '')}>{t('openmaicOpen')}</button>
          <button type="button" onClick={() => {
            const url = httpUrl(lesson.url)
            if (url === undefined) return
            void navigator.clipboard?.writeText(url).then(() => setCopiedId(lesson.id)).catch(() => setCopiedId(''))
          }}>{copiedId === lesson.id ? t('openmaicCopied') : t('openmaicCopy')}</button>
        </div>
      </>}
      {lesson.status === 'failed' && lesson.retryable === true && lesson.runId && <button type="button" disabled={busy} onClick={() => onRetry(lesson.runId ?? '')}>{t('openmaicRetry')}</button>}
      {lesson.status === 'ready' && lesson.classroomId && <button type="button" disabled={busy} onClick={() => onReview(lesson.classroomId ?? '')}>{t('openmaicReview')}</button>}
      {lesson.summary && <div>
        <p>{t('openmaicOutline')}</p>
        <p>{lesson.summary.outline}</p>
        {lesson.summary.scenes.map((scene, sceneIndex) => <p key={`${scene.title}-${sceneIndex}`} className="student-muted">{scene.title}{scene.summary ? ` · ${scene.summary}` : ''}</p>)}
      </div>}
    </details>)}
  </section>
}
