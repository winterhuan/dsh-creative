/** Game selections persist separately for the standalone sidebar. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Game-owned fields; the combined workbench retains these persisted field names. */
export interface GameMemory {
  gameTab: 'preview' | 'design'
  gameProjectId: string | undefined
}

type GameActions = {
  setGameTab: (draft: GameMemory, tab: GameMemory['gameTab']) => void
  setGameProjectId: (draft: GameMemory, id: string) => void
}

/**
 * Create a session-owned game store without editor or production state.
 * @returns the standalone sidebar's persistent store declaration.
 */
export function createGameStore(): EngineStoreHandle<GameMemory, GameActions> {
  return defineStore({
    persist: 'creative.game.v1',
    init: (): GameMemory => ({ gameTab: 'preview', gameProjectId: undefined }),
    actions: {
      setGameTab: (draft, tab: GameMemory['gameTab']) => { draft.gameTab = tab },
      setGameProjectId: (draft, id: string) => { draft.gameProjectId = id },
    },
  })
}
