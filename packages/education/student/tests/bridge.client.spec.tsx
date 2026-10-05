// @vitest-environment jsdom
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { tutorBridge, type StudyPhoto } from '../src/client/bridge.ts'

describe('native tutoring submission', () => {
  it('submits image base64 and preview together without touching the composer', async () => {
    type Session = NonNullable<ReturnType<Context['sessions']['binding']>>['session']
    const abandon = vi.fn()
    const submission: ReturnType<Session['beginSubmission']> = { requestId: 'study-request' as ReturnType<Session['beginSubmission']>['requestId'], abandon }
    const beginSubmission = vi.fn<Session['beginSubmission']>(() => submission)
    const prompt = vi.fn<Session['prompt']>().mockResolvedValue({ ok: true, value: { accepted: true } })
    const session: Pick<Session, 'beginSubmission' | 'prompt'> = { beginSubmission, prompt }
    const fake: { sessions: { binding(id: SessionId): { session: typeof session } | undefined } } = { sessions: { binding: () => ({ session }) } }
    const photo: StudyPhoto = { mediaType: 'image/png', data: 'AQ==', preview: 'data:image/png;base64,AQ==', name: 'question.png' }
    await tutorBridge(fake as Context, 'student-session' as SessionId, 'No session', 'Failed')('Read the photo', photo)
    expect(beginSubmission).toHaveBeenCalledWith({ mode: 'queue', text: 'Read the photo', attachments: [{ type: 'image', value: { previewUrl: photo.preview, name: photo.name } }] })
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'Read the photo' }, { type: 'image', mediaType: photo.mediaType, data: photo.data, name: photo.name }], 'queue', undefined, submission.requestId)
    expect(abandon).not.toHaveBeenCalled()
    prompt.mockRejectedValueOnce(new Error('Network interrupted'))
    await expect(tutorBridge(fake as Context, 'student-session' as SessionId, 'No session', 'Failed')('Try again')).rejects.toThrow('Network interrupted')
    expect(abandon).toHaveBeenCalledOnce()
  })
})
