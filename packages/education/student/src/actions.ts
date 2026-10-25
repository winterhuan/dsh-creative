import type { Command } from './schema.ts'

/** Per-action metadata: the surfaces that may submit the action and the update family that owns its handler. */
export interface ActionMeta {
  /** Whether the workbench panel may submit this action through the workspace API. */
  panel: boolean
  /** The update handler family that owns this action. */
  group: 'profile' | 'session' | 'mistakes' | 'paper'
}

/** Every study action with its submission surface and owning handler family; keyed exhaustively by the command schema. */
export const actionMeta: Record<Command['action'], ActionMeta> = {
  setup: { panel: true, group: 'profile' },
  limits: { panel: true, group: 'profile' },
  material: { panel: false, group: 'profile' },
  course: { panel: false, group: 'profile' },
  'configure-course': { panel: true, group: 'profile' },
  'school-progress': { panel: true, group: 'profile' },
  start: { panel: true, group: 'session' },
  task: { panel: false, group: 'session' },
  answer: { panel: true, group: 'session' },
  hint: { panel: true, group: 'session' },
  stuck: { panel: true, group: 'session' },
  record: { panel: false, group: 'session' },
  stop: { panel: true, group: 'session' },
  mistake: { panel: false, group: 'mistakes' },
  'confirm-mistake': { panel: true, group: 'mistakes' },
  concept: { panel: false, group: 'mistakes' },
  'confirm-concept': { panel: true, group: 'mistakes' },
  objective: { panel: false, group: 'mistakes' },
  relation: { panel: false, group: 'mistakes' },
  'link-mistake': { panel: true, group: 'mistakes' },
  'classify-mistake': { panel: true, group: 'mistakes' },
  worksheet: { panel: false, group: 'paper' },
  'paper-draft': { panel: false, group: 'paper' },
  'grade-sheet': { panel: true, group: 'paper' },
  'confirm-paper': { panel: true, group: 'paper' },
  'discard-sheet': { panel: true, group: 'paper' },
  'workbook-draft': { panel: false, group: 'paper' },
  'confirm-workbook': { panel: true, group: 'paper' },
  'dismiss-teaching': { panel: true, group: 'paper' },
}

/** Actions the workbench panel may submit directly; tutor assessment and rewards stay with the model tools. */
export const panelActions: ReadonlySet<Command['action']> = new Set(Object.entries(actionMeta).filter(([, meta]) => meta.panel).map(([action]) => action as Command['action']))
