// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameDomain } from '../src/client/domains/game.tsx'
import { en, zh } from '../src/client/locales/index.ts'
import { createWorkbenchStore } from '../src/client/workbench-store.ts'

afterEach(cleanup)

describe('Game Studio without projects', () => {
  it.each([en, zh])('keeps workbench navigation available in an empty workspace', (dictionary) => {
    const store = createWorkbenchStore().create()
    const t = makeTranslate(dictionary)
    const onWorkbench = vi.fn()
    const Studio = gameDomain.Studio
    const view = render(<Studio
      t={t}
      sessionId="session"
      workspace={{ cwd: '/workspace', files: [], games: [], videos: [], projects: [], truncated: false, mode: 'dsh-session' }}
      building={false}
      selected={undefined}
      hidden={false}
      workbenches={['story', 'drama', 'game', 'video']}
      onWorkbench={onWorkbench}
      onSelect={vi.fn()}
      useStore={select => select(store.getSnapshot())}
      actions={store.actions}
    />)

    fireEvent.click(view.getByRole('tab', { name: t('workbench.video') }))
    expect(onWorkbench).toHaveBeenLastCalledWith('video')
    fireEvent.keyDown(view.getByRole('tab', { name: t('workbench.game') }), { key: 'ArrowLeft' })
    expect(onWorkbench).toHaveBeenLastCalledWith('drama')
    expect(view.getByText(t('game.preview.empty.title'))).toBeDefined()
    expect(view.queryByRole('combobox')).toBeNull()
  })
})
