// @vitest-environment jsdom
/** Chat file claims use the same project depth as the story workspace API. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { describe, expect, it } from 'vitest'
import { registerFileRedirect } from '../src/client/file-redirect.tsx'

describe('story file redirects', () => {
  it('claims immediate-child novels and the shared library, excluding workspace prose and deeper books', () => {
    let registration: Parameters<Context['sidebarRightTabs']['register']>[0] | undefined
    const context = {
      effect: (effect: () => () => void) => effect(),
      sessions: { list: { getSnapshot: () => ({ byId: { session: { cwd: '/ws' } } }) } },
      sidebarRightTabs: { register: (value: typeof registration) => { registration = value; return () => {} } },
      slots: { inject: () => () => {} },
    } as Context
    registerFileRedirect(context, 'story')
    const claim = (path: string) => registration?.canOpen?.(`dsh-resource://file/session/session/${path}`)
    for (const path of ['神机诸天录/正文/chapter.md', '书乙/正文.md', '短篇/正文.md', '拆文库/参考书/概要.md']) {
      expect(claim(path), path).toBe(true)
    }
    for (const path of ['正文/chapter.md', '正文.md', 'archive/book/正文/chapter.md', '长篇/book/正文/chapter.md', 'book/剧集/EP001/剧本.md', 'book/notes.md', '正文/poster.png', 'book/正文/poster.png']) {
      expect(claim(path), path).toBe(false)
    }
  })
})
