// @vitest-environment jsdom
import { useSyncExternalStore } from 'react'
import { GameStudio } from '../src/client/studio.tsx'
import { createGameStore } from '../src/client/state.ts'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

describe('Standalone game selections', () => {
  it('retains game selections across remounts with only game state', () => {
    const game = createGameStore().create()
    const t = makeTranslate(en)
    const games = ['one', 'two'].map(id => ({ id, root: `game-adaptations/${id}`, title: id, source: 'workspace' as const, previewReady: false, previewVersion: '' }))
    function View() {
      const memory = useSyncExternalStore(game.subscribe, game.getSnapshot)
      return <GameStudio t={t} sessionId="session" games={games} files={[]} building={false} selected={undefined}
        hidden={false} gameTab={memory.gameTab} gameProjectId={memory.gameProjectId}
        onGameTab={game.actions.setGameTab} onGameProject={game.actions.setGameProjectId} onSelect={vi.fn()} />
    }
    const first = render(<View />)
    fireEvent.change(first.getByRole('combobox'), { target: { value: 'two' } })
    fireEvent.click(first.getByRole('tab', { name: t('game.tab.files') }))
    first.unmount()
    const second = render(<View />)
    expect(second.getByRole('combobox')).toHaveProperty('value', 'two')
    expect(second.getByRole('tab', { name: t('game.tab.files') }).getAttribute('aria-selected')).toBe('true')
    expect(Object.keys(game.getSnapshot()).sort()).toEqual(['gameProjectId', 'gameTab'])
  })
})
