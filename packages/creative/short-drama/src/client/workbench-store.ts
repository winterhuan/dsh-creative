/** Persistent Creative drafts and production preparation, scoped by Session. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { DramaProductionSection } from './drama-production.ts'
import type { WorkbenchMode } from './file-activity.ts'
import type { CanvasPoint, ProductionRequest, ProductionSequenceItem } from './production-runtime.ts'
import type { FileBuffer } from './editor-buffer.ts'

/** Drafts and user selections retained when a Sidebar tab is unmounted. */
export interface WorkbenchMemory {
  buffers: Record<string, FileBuffer>
  editorMode: 'preview' | 'source' | 'production'
  expanded: Record<string, boolean>
  selected: string | undefined
  workbench: WorkbenchMode
  productionSection: DramaProductionSection
  productionSelectedIds: Record<string, string | undefined>
  productionRequests: Record<string, ProductionRequest[]>
  productionSelections: Record<string, Record<string, string>>
  productionReferences: Record<string, Record<string, string[]>>
  productionSequence: Record<string, ProductionSequenceItem[]>
  productionCanvas: Record<string, Record<string, CanvasPoint>>
  productionZoom: Record<string, number>
  /**
   * Highest Session sequence whose production result the workbench already
   * applied. Results above it are new navigation work; everything at or below
   * it was consumed once and must not replay after a tab remount.
   */
  productionIntentSeq: number
}

type Update<T> = T | ((current: T) => T)

type WorkbenchActions = {
} & {
  [Key in keyof WorkbenchMemory as `set${Capitalize<Key>}`]: (draft: WorkbenchMemory, update: Update<WorkbenchMemory[Key]>) => void
}

function applyUpdate<T>(current: T, update: Update<T>): T {
  return typeof update === 'function' ? (update as (value: T) => T)(current) : update
}

/**
 * Create Session-scoped editor and preparation state without live execution status.
 * @returns the slot-owned persistent store declaration.
 */
export function createWorkbenchStore(): EngineStoreHandle<WorkbenchMemory, WorkbenchActions> {
  const declaration = defineStore({
    persist: 'creative.drama.v1',
    init: (): WorkbenchMemory => ({
      buffers: {},
      editorMode: 'preview',
      expanded: {},
      selected: undefined,
      workbench: 'drama',
      productionSection: 'shots',
      productionSelectedIds: {},
      productionRequests: {},
      productionSelections: {},
      productionReferences: {},
      productionSequence: {},
      productionCanvas: {},
      productionZoom: {},
      productionIntentSeq: 0,
    }),
    actions: {
      setBuffers: (draft, update: Update<Record<string, FileBuffer>>) => {
        draft.buffers = applyUpdate(draft.buffers, update)
      },
      setEditorMode: (draft, update: Update<WorkbenchMemory['editorMode']>) => {
        draft.editorMode = applyUpdate(draft.editorMode, update)
      },
      setExpanded: (draft, update: Update<Record<string, boolean>>) => {
        draft.expanded = applyUpdate(draft.expanded, update)
      },
      setSelected: (draft, update: Update<string | undefined>) => {
        draft.selected = applyUpdate(draft.selected, update)
      },
      setWorkbench: (draft, update: Update<WorkbenchMode>) => {
        draft.workbench = applyUpdate(draft.workbench, update)
      },
      setProductionSection: (draft, update: Update<DramaProductionSection>) => {
        draft.productionSection = applyUpdate(draft.productionSection, update)
      },
      setProductionSelectedIds: (draft, update: Update<Record<string, string | undefined>>) => {
        draft.productionSelectedIds = applyUpdate(draft.productionSelectedIds, update)
      },
      setProductionRequests: (draft, update: Update<Record<string, ProductionRequest[]>>) => {
        draft.productionRequests = applyUpdate(draft.productionRequests, update)
      },
      setProductionSelections: (draft, update: Update<Record<string, Record<string, string>>>) => {
        draft.productionSelections = applyUpdate(draft.productionSelections, update)
      },
      setProductionReferences: (draft, update: Update<Record<string, Record<string, string[]>>>) => {
        draft.productionReferences = applyUpdate(draft.productionReferences, update)
      },
      setProductionSequence: (draft, update: Update<Record<string, ProductionSequenceItem[]>>) => {
        draft.productionSequence = applyUpdate(draft.productionSequence, update)
      },
      setProductionCanvas: (draft, update: Update<Record<string, Record<string, CanvasPoint>>>) => {
        draft.productionCanvas = applyUpdate(draft.productionCanvas, update)
      },
      setProductionZoom: (draft, update: Update<Record<string, number>>) => {
        draft.productionZoom = applyUpdate(draft.productionZoom, update)
      },
      setProductionIntentSeq: (draft, update: Update<number>) => {
        draft.productionIntentSeq = applyUpdate(draft.productionIntentSeq, update)
      },
    },
  })
  return declaration
}
