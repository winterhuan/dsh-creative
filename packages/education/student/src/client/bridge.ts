import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Browser image payload follows DSH's native attachment admission path. */
export interface StudyPhoto { mediaType: 'image/png' | 'image/jpeg' | 'image/webp'; data: string; preview: string; name: string }
export type AskTutor = (text: string, photo?: StudyPhoto) => Promise<void>

/** Register the native submission echo without changing the user's composer draft. */
export function tutorBridge(context: Context, sessionId: SessionId, unavailable: string, failed: string): AskTutor {
  return async (text, photo) => {
    const session = context.sessions.binding(sessionId)?.session
    if (!session) throw new Error(unavailable)
    const submission = session.beginSubmission({ mode: 'queue', text, attachments: photo ? [{ type: 'image', value: { previewUrl: photo.preview, name: photo.name } }] : [] })
    try {
      const result = await session.prompt([{ type: 'text', text }, ...(photo ? [{ type: 'image' as const, mediaType: photo.mediaType, data: photo.data, name: photo.name }] : [])], 'queue', undefined, submission.requestId)
      if (!result.ok) throw new Error(result.error.message || failed)
    } catch (error) { submission.abandon(); throw error }
  }
}
