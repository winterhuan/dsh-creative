/** Video selections persist separately for the standalone sidebar. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** Video-owned fields; the combined workbench retains these persisted field names. */
export interface VideoMemory {
  videoTab: 'preview' | 'artifacts'
  videoProjectId: string | undefined
}

type VideoActions = {
  setVideoTab: (draft: VideoMemory, tab: VideoMemory['videoTab']) => void
  setVideoProjectId: (draft: VideoMemory, id: string) => void
}

/**
 * Create a session-owned video store without editor or production state.
 * @returns the standalone sidebar's persistent store declaration.
 */
export function createVideoStore(): EngineStoreHandle<VideoMemory, VideoActions> {
  return defineStore({
    persist: 'creative.video.v1',
    init: (): VideoMemory => ({ videoTab: 'preview', videoProjectId: undefined }),
    actions: {
      setVideoTab: (draft, tab: VideoMemory['videoTab']) => { draft.videoTab = tab },
      setVideoProjectId: (draft, id: string) => { draft.videoProjectId = id },
    },
  })
}
